/**
 * context_manage Tool - Session Context Management & Memory Distillation
 *
 * Manages session-level state including summaries, status, and distillation.
 * - summary: Generate session summary via LLM and update session title
 * - status: View current session context state and staleness
 * - distill: Preview candidates for review (requires memory system)
 * - confirm: Write pending candidates to database (requires memory system)
 * - cancel: Discard pending candidates (requires memory system)
 */

import { tool, type ToolDefinition, type ToolContext } from "@opencode-ai/plugin";
import type { DistillEngine } from "../memory/distill.js";
import {
  clearExtractionState,
  getPendingConfirmation,
  setPendingConfirmation,
  clearPendingConfirmation,
} from "../memory/distill.js";
import type { DistillLLMClient } from "../memory/llm-client.js";
import type { MemoryStore } from "../memory/store.js";
import {
  loadSessionContext,
  saveSessionContext,
  type SessionContext,
} from "../memory/session-context.js";
import type { SessionMessage } from "../types.js";
import { createDebugLog } from "../debug.js";
import {
  formatPreviewReport,
  formatConfirmReportWithDedup,
} from "./distill-formatters.js";

const debugLog = createDebugLog("[wopal-memory]", "memory");

const confirmingSessions = new Set<string>();

const STALENESS_THRESHOLD = 20;

const ECHO_REMINDER = [
  "",
  "重要：调用本工具后，你必须将以上完整蒸馏结果逐字展示给用户。用户无法看到工具内部输出，依赖你主动展示。",
  "每条候选记忆必须完整展示所有字段（正文、分类、重要性、标签），严禁省略、摘要或概括。",
  "distill 后必须等用户确认才能执行 confirm，严禁跳过展示直接 confirm。",
].join("\n");

type ContextManageAction =
  | "summary"
  | "status"
  | "distill"
  | "confirm"
  | "cancel";

interface ContextManageArgs {
  action: ContextManageAction;
  force?: boolean;
  selectedIndices?: number[];
}

/**
 * Create context_manage tool
 *
 * @param distillLLM - Distill LLM client for summary generation
 * @param client - OpenCode client for session.messages() and session.update()
 * @param distillEngine - Distill engine instance (optional, for distill actions)
 * @param store - Memory store (optional, kept for API compatibility)
 */
export function createContextManageTool(
  distillLLM: DistillLLMClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  distillEngine?: DistillEngine,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _store?: MemoryStore,
): ToolDefinition {
  return tool({
    description:
      "管理会话上下文状态。子命令: summary（生成摘要 + 更新 session title）, status（查看状态 + 过时判断）。" +
      "summary 会调用 LLM 分析用户消息并生成不超过 50 字的会话核心意图摘要。" +
      "status 显示当前摘要内容、title、以及是否过时（超过 20 条新消息则提示重新生成）。" +
      "Distill current session: Step 1 - Preview candidates for review. Step 2 - Confirm to write. " +
      "Use action='distill' to extract without writing, action='confirm' to write pending candidates, action='cancel' to discard.",
    args: {
      action: tool.schema
        .enum(["summary", "status", "distill", "confirm", "cancel"] as const)
        .describe(
          "子命令: 'summary' 生成摘要并更新 title, 'status' 查看当前状态, 'distill' 提取候选记忆, 'confirm' 写入数据库, 'cancel' 丢弃候选",
        ),
      force: tool.schema
        .boolean()
        .optional()
        .describe("Force re-distillation even if already extracted (only for distill)"),
      selectedIndices: tool.schema
        .array(tool.schema.number())
        .optional()
        .describe("Optional: indices of candidates to write (0-based)"),
    },
    execute: async (args: ContextManageArgs, context: ToolContext): Promise<string> => {
      const sessionID = context.sessionID;

      debugLog(`[context_manage] Action: ${args.action}, Session: ${sessionID ?? "N/A"}`);

      if (!sessionID) {
        return "Failed: current session ID is unavailable.";
      }

      if (args.action === "summary") {
        return await handleSummary(sessionID, distillLLM, client);
      }

      if (args.action === "status") {
        return await handleStatus(sessionID, client);
      }

      if (args.action === "distill") {
        if (!distillEngine) {
          return "Memory system unavailable. Distillation requires the memory system to be initialized.";
        }
        return await handleDistill(sessionID, distillEngine, client, args.force);
      }

      if (args.action === "confirm") {
        if (!distillEngine) {
          return "Memory system unavailable. Distillation requires the memory system to be initialized.";
        }
        return await handleConfirm(sessionID, distillEngine, args.selectedIndices);
      }

      if (args.action === "cancel") {
        clearPendingConfirmation(sessionID);
        return "❌ Distillation cancelled. Candidates discarded.";
      }

      return "Unknown action.";
    },
  });
}

async function handleDistill(
  sessionID: string,
  distillEngine: DistillEngine,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  force?: boolean,
): Promise<string> {
  if (force) {
    clearExtractionState(sessionID);
    clearPendingConfirmation(sessionID);
  }

  if (typeof client?.session?.messages !== "function") {
    return "Failed: session.messages API is unavailable.";
  }

  try {
    const result = await client.session.messages({ path: { id: sessionID } });
    const messages: SessionMessage[] = result?.data ?? [];

    if (messages.length === 0) {
      return "No messages in current session to distill.";
    }

    const previewResult = await distillEngine.preview(sessionID, messages);

    if (previewResult.candidates.length === 0) {
      return "No memories extracted from this session. The conversation may be too short or contain no long-term valuable information.";
    }

    setPendingConfirmation(sessionID, previewResult);
    return (
      formatPreviewReport(
        previewResult.candidates,
        previewResult.title,
        messages.length,
      ) + ECHO_REMINDER
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Distillation preview failed: ${message}`;
  }
}

async function handleConfirm(
  sessionID: string,
  distillEngine: DistillEngine,
  selectedIndices?: number[],
): Promise<string> {
  if (confirmingSessions.has(sessionID)) {
    return "⚠️ Distillation confirm is already running for this session. Wait for it to finish.";
  }

  const pending = getPendingConfirmation(sessionID);
  if (!pending) {
    return "⚠️ No pending candidates to confirm. Run with action='distill' first.";
  }

  confirmingSessions.add(sessionID);
  clearPendingConfirmation(sessionID);

  try {
    let candidatesToWrite = pending.candidates;
    if (selectedIndices && selectedIndices.length > 0) {
      candidatesToWrite = selectedIndices
        .filter((i) => i >= 0 && i < pending.candidates.length)
        .map((i) => pending.candidates[i]);
      if (candidatesToWrite.length === 0) {
        setPendingConfirmation(sessionID, pending);
        return "⚠️ No valid candidates selected.";
      }
    }

    const result = await distillEngine.confirmCandidates(
      sessionID,
      candidatesToWrite,
      "wopal-space",
    );

    return (
      formatConfirmReportWithDedup(candidatesToWrite, pending.title, result) +
      ECHO_REMINDER
    );
  } catch (error) {
    setPendingConfirmation(sessionID, pending);
    const message = error instanceof Error ? error.message : String(error);
    return `Distillation confirm failed: ${message}`;
  } finally {
    confirmingSessions.delete(sessionID);
  }
}

async function handleSummary(
  sessionID: string,
  distillLLM: DistillLLMClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
): Promise<string> {
  if (typeof client?.session?.messages !== "function") {
    return "Failed: session.messages API is unavailable.";
  }

  try {
    const result = await client.session.messages({ path: { id: sessionID } });
    const messages: SessionMessage[] = result?.data ?? [];

    if (messages.length === 0) {
      return "No messages in current session to summarize.";
    }

    const userTexts: string[] = [];
    for (const msg of messages) {
      if (msg.info?.role !== "user") continue;
      if (msg.parts) {
        for (const part of msg.parts) {
          if (part.type === "text" && part.text) {
            userTexts.push(part.text);
          }
        }
      }
    }

    if (userTexts.length === 0) {
      return "No user messages found to summarize.";
    }

    const combinedText = userTexts.join("\n\n---\n\n");
    const prompt = `根据以下用户消息，用一句话概括本次会话的核心意图，不超过 50 字。

用户消息：
${combinedText.slice(0, 3000)}

要求：
- 用简洁的一句话描述用户想要做什么
- 不超过 50 个汉字
- 只输出摘要内容，不要其他解释`;

    const summaryText = await distillLLM.complete(prompt);
    const cleanedSummary = summaryText
      .trim()
      .replace(/^["「『]|["」』]$/g, "")
      .slice(0, 80);

    const existingCtx = loadSessionContext(sessionID);
    const newCtx: SessionContext = {
      sessionID,
      title: existingCtx?.title ?? null,
      ...existingCtx,
      summary: {
        text: cleanedSummary,
        messageCount: messages.length,
        generatedAt: new Date().toISOString(),
      },
    };

    if (typeof client?.session?.update === "function") {
      try {
        await client.session.update({
          path: { id: sessionID },
          body: { title: cleanedSummary },
        });
        newCtx.title = cleanedSummary;
      } catch (error) {
        debugLog(`[context_manage.summary] Failed to update session title: ${error}`);
      }
    }

    saveSessionContext(newCtx);

    return [
      "## 📝 Session Summary Generated",
      "",
      `**Summary:** ${cleanedSummary}`,
      `**Message Count:** ${messages.length}`,
      `**Generated At:** ${new Date().toISOString()}`,
      "",
      "> This summary will be used to enrich memory retrieval queries.",
    ].join("\n");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `Failed to generate summary: ${message}`;
  }
}

async function handleStatus(
  sessionID: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
): Promise<string> {
  const ctx = loadSessionContext(sessionID);

  if (!ctx) {
    return "No session context found. Run `context_manage action=summary` to generate a summary.";
  }

  let currentMessageCount = 0;
  try {
    if (typeof client?.session?.messages === "function") {
      const result = await client.session.messages({ path: { id: sessionID } });
      currentMessageCount = result?.data?.length ?? 0;
    }
  } catch (error) {
    debugLog(`[context_manage.status] Failed to get message count: ${error}`);
  }

  const lines: string[] = [
    "## 📊 Session Context Status",
    "",
    `**Session ID:** ${sessionID}`,
    `**Title:** ${ctx.title ?? "(未设置)"}`,
  ];

  if (ctx.summary) {
    lines.push("", "### Summary");
    lines.push(`- **Text:** ${ctx.summary.text}`);
    lines.push(`- **Messages at generation:** ${ctx.summary.messageCount}`);
    lines.push(`- **Generated at:** ${ctx.summary.generatedAt}`);

    const newMessages = currentMessageCount - ctx.summary.messageCount;
    if (currentMessageCount > 0 && newMessages > STALENESS_THRESHOLD) {
      lines.push("");
      lines.push(
        `> ⚠️ **Summary may be stale:** ${newMessages} new messages since last summary (threshold: ${STALENESS_THRESHOLD})`,
      );
      lines.push(
        "> Consider running `context_manage action=summary` to regenerate.",
      );
    } else if (newMessages > 0) {
      lines.push(`- **New messages:** ${newMessages} (within threshold)`);
    }
  } else {
    lines.push("", "### Summary");
    lines.push(
      "> No summary generated yet. Run `context_manage action=summary` to create one.",
    );
  }

  if (ctx.distill) {
    lines.push("", "### Distill State");
    lines.push(`- **Messages at extraction:** ${ctx.distill.messageCount}`);
    lines.push(`- **Depth:** ${ctx.distill.depth}`);
    lines.push(`- **Extracted at:** ${ctx.distill.extractedAt}`);
  }

  return lines.join("\n");
}
