/**
 * context_manage Tool - Session Context Management
 *
 * Manages session-level state including summaries and status.
 * - summary: Generate session summary via LLM and update session title
 * - status: View current session context state and staleness
 */

import { tool, type ToolDefinition, type ToolContext } from "@opencode-ai/plugin";
import type { DistillLLMClient } from "../memory/llm-client.js";
import {
  loadSessionContext,
  saveSessionContext,
  type SessionContext,
} from "../memory/session-context.js";
import type { SessionMessage } from "../types.js";
import { createDebugLog } from "../debug.js";

const debugLog = createDebugLog("[wopal-memory]", "memory");

const STALENESS_THRESHOLD = 20;

/**
 * Create context_manage tool
 *
 * @param distillLLM - Distill LLM client for summary generation
 * @param client - OpenCode client for session.messages() and session.update()
 */
export function createContextManageTool(
  distillLLM: DistillLLMClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
): ToolDefinition {
  return tool({
    description:
      "管理会话上下文状态。子命令: summary（生成摘要 + 更新 session title）, status（查看状态 + 过时判断）。summary 是内部基础设施：调用 LLM 生成 ≤50 字核心意图，用于 session title 管理和语义检索增强。不是会话回顾工具。status 显示当前摘要内容、title、以及是否过时（超过 20 条新消息则提示重新生成）。\n\n⚠️ Agent 禁止主动生成长格式会话摘要——那是 OpenCode compact 的职责，不是本工具的用途。",
    args: {
      action: tool.schema
        .enum(["summary", "status"] as const)
        .describe("子命令: 'summary' 生成摘要并更新 title, 'status' 查看当前状态"),
    },
    execute: async (args, context: ToolContext): Promise<string> => {
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

      return "Unknown action.";
    },
  });
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
      if (!msg.parts) continue;

      // Skip compaction messages
      if (msg.parts.some((p) => p.type === "compaction")) continue;

      for (const part of msg.parts) {
        if (part.type === "text" && part.text) {
          // Skip synthetic parts (system notifications injected as user text)
          if (part.synthetic) continue;
          userTexts.push(part.text);
        }
      }
    }

    if (userTexts.length === 0) {
      return "No user messages found to summarize.";
    }

    const combinedText = userTexts.join("\n\n---\n\n");
    const truncatedText = combinedText.length > 3000
      ? combinedText.slice(-3000)
      : combinedText;
    const prompt = `根据以下用户消息，用一句话概括本次会话的核心意图，不超过 50 字。

用户消息：
${truncatedText}

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