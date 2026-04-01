/**
 * context_manage Tool - Session Context Management
 *
 * Manages session-level state including summaries and status.
 * - summary: Generate session summary via LLM and update session title
 * - status: View current session context state and staleness
 */

import { tool, type ToolDefinition, type ToolContext } from "@opencode-ai/plugin";
import type { DistillLLMClient } from "../memory/llm-client.js";
import { loadSessionContext, saveSessionContext, type SessionContext } from "../memory/session-context.js";
import type { SessionMessage } from "../types.js";
import { createDebugLog } from "../debug.js";

const debugLog = createDebugLog("[wopal-memory]", "memory");

// Staleness threshold: number of new messages before summary is considered stale
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
  client: any
): ToolDefinition {
  return tool({
    description:
      "管理会话上下文状态。子命令: summary（生成摘要 + 更新 session title）, status（查看状态 + 过时判断）。" +
      "summary 会调用 LLM 分析用户消息并生成不超过 50 字的会话核心意图摘要。" +
      "status 显示当前摘要内容、title、以及是否过时（超过 20 条新消息则提示重新生成）。",
    args: {
      action: tool.schema
        .enum(["summary", "status"])
        .describe("子命令: 'summary' 生成摘要并更新 title, 'status' 查看当前状态"),
    },
    execute: async (
      args: { action: "summary" | "status" },
      context: ToolContext
    ): Promise<string> => {
      const sessionID = context.sessionID;

      debugLog(`[context_manage] ========== TOOL INVOKED ==========`);
      debugLog(`[context_manage] Action: ${args.action}`);
      debugLog(`[context_manage] Session: ${sessionID ?? "N/A"}`);

      if (!sessionID) {
        debugLog(`[context_manage] ERROR: No session ID`);
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

/**
 * Handle summary action:
 * 1. Fetch session messages
 * 2. Filter user message texts
 * 3. Call LLM for summary
 * 4. Save to SessionContext
 * 5. Update session title
 */
async function handleSummary(
  sessionID: string,
  distillLLM: DistillLLMClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any
): Promise<string> {
  debugLog(`[context_manage.summary] Starting...`);

  // Fetch session messages
  if (typeof client?.session?.messages !== "function") {
    debugLog(`[context_manage.summary] ERROR: session.messages API unavailable`);
    return "Failed: session.messages API is unavailable.";
  }

  try {
    const fetchStart = Date.now();
    const result = await client.session.messages({
      path: { id: sessionID },
    });
    debugLog(`[context_manage.summary] Fetched messages in ${Date.now() - fetchStart}ms`);

    const messages: SessionMessage[] = result?.data ?? [];
    debugLog(`[context_manage.summary] Message count: ${messages.length}`);

    if (messages.length === 0) {
      return "No messages in current session to summarize.";
    }

    // Filter user message texts
    const userTexts: string[] = [];
    for (const msg of messages) {
      const role = msg.info?.role;
      if (role !== "user") continue;

      // Extract text from parts
      if (msg.parts) {
        for (const part of msg.parts) {
          if (part.type === "text" && part.text) {
            userTexts.push(part.text);
          }
        }
      }
    }

    debugLog(`[context_manage.summary] User texts extracted: ${userTexts.length}`);
    if (userTexts.length === 0) {
      return "No user messages found to summarize.";
    }

    // Build prompt for LLM
    const combinedText = userTexts.join("\n\n---\n\n");
    const prompt = `根据以下用户消息，用一句话概括本次会话的核心意图，不超过 50 字。

用户消息：
${combinedText.slice(0, 3000)}

要求：
- 用简洁的一句话描述用户想要做什么
- 不超过 50 个汉字
- 只输出摘要内容，不要其他解释`;

    debugLog(`[context_manage.summary] Calling LLM...`);
    const llmStart = Date.now();
    const summaryText = await distillLLM.complete(prompt);
    debugLog(`[context_manage.summary] LLM response in ${Date.now() - llmStart}ms: ${summaryText.slice(0, 100)}`);

    // Clean summary (remove quotes, extra whitespace)
    const cleanedSummary = summaryText.trim().replace(/^["「『]|["」』]$]/g, "").slice(0, 80);

    // Load existing context or create new
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

    // Save to disk
    saveSessionContext(newCtx);
    debugLog(`[context_manage.summary] Saved SessionContext`);

    // Update session title
    if (typeof client?.session?.update === "function") {
      try {
        debugLog(`[context_manage.summary] Updating session title: ${cleanedSummary}`);
        await client.session.update({
          path: { id: sessionID },
          body: { title: cleanedSummary },
        });
        debugLog(`[context_manage.summary] Session title updated`);
        newCtx.title = cleanedSummary;
        saveSessionContext(newCtx);
      } catch (error) {
        debugLog(`[context_manage.summary] Failed to update session title: ${error}`);
        // Continue even if title update fails
      }
    }

    const lines: string[] = [
      "## 📝 Session Summary Generated",
      "",
      `**Summary:** ${cleanedSummary}`,
      `**Message Count:** ${messages.length}`,
      `**Generated At:** ${new Date().toISOString()}`,
      "",
      "> This summary will be used to enrich memory retrieval queries.",
    ];

    return lines.join("\n");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    debugLog(`[context_manage.summary] ERROR: ${message}`);
    return `Failed to generate summary: ${message}`;
  }
}

/**
 * Handle status action:
 * 1. Load SessionContext
 * 2. Display summary, title, distill info
 * 3. Check staleness
 */
async function handleStatus(
  sessionID: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any
): Promise<string> {
  debugLog(`[context_manage.status] Loading context...`);

  const ctx = loadSessionContext(sessionID);

  if (!ctx) {
    return "No session context found. Run `context_manage action=summary` to generate a summary.";
  }

  // Get current message count for staleness check
  let currentMessageCount = 0;
  try {
    if (typeof client?.session?.messages === "function") {
      const result = await client.session.messages({
        path: { id: sessionID },
      });
      currentMessageCount = result?.data?.length ?? 0;
    }
  } catch (error) {
    debugLog(`[context_manage.status] Failed to get message count: ${error}`);
    // Continue without staleness check
  }

  const lines: string[] = [
    "## 📊 Session Context Status",
    "",
    `**Session ID:** ${sessionID}`,
    `**Title:** ${ctx.title ?? "(未设置)"}`,
  ];

  // Summary section
  if (ctx.summary) {
    lines.push("");
    lines.push("### Summary");
    lines.push(`- **Text:** ${ctx.summary.text}`);
    lines.push(`- **Messages at generation:** ${ctx.summary.messageCount}`);
    lines.push(`- **Generated at:** ${ctx.summary.generatedAt}`);

    // Staleness check
    const newMessages = currentMessageCount - ctx.summary.messageCount;
    if (currentMessageCount > 0 && newMessages > STALENESS_THRESHOLD) {
      lines.push("");
      lines.push(`> ⚠️ **Summary may be stale:** ${newMessages} new messages since last summary (threshold: ${STALENESS_THRESHOLD})`);
      lines.push("> Consider running `context_manage action=summary` to regenerate.");
    } else if (newMessages > 0) {
      lines.push(`- **New messages:** ${newMessages} (within threshold)`);
    }
  } else {
    lines.push("");
    lines.push("### Summary");
    lines.push("> No summary generated yet. Run `context_manage action=summary` to create one.");
  }

  // Distill section
  if (ctx.distill) {
    lines.push("");
    lines.push("### Distill State");
    lines.push(`- **Messages at extraction:** ${ctx.distill.messageCount}`);
    lines.push(`- **Depth:** ${ctx.distill.depth}`);
    lines.push(`- **Extracted at:** ${ctx.distill.extractedAt}`);
  }

  return lines.join("\n");
}