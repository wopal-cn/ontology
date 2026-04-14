import {
  readAndFormatRules,
  type DiscoveredRule,
} from "../rules/index.js";
import { extractConnectedMcpCapabilityIDs } from "./mcp-tools.js";
import type { SessionStore } from "../session-store.js";
import type { MemoryInjector } from "../memory/index.js";
import type { DebugLog } from "../debug.js";
import type { Model } from "@opencode-ai/sdk";
import { loadSessionContext } from "../memory/session-context.js";
import type { MessageWithInfo } from "./message-context.js";

interface SystemTransformInput {
  sessionID?: string;
  model: Model;
}

interface SystemTransformOutput {
  system: string[];
}

/** 
 * 为 Embedding 清洗并截断嘈杂文本
 * 抛弃代码块、系统日志，并掐头去尾压缩到指定长度。
 */
function cleanAndTruncateForEmbedding(text: string, maxLen = 300): string {
  // 1. 无脑移除 Markdown 代码块
  let result = text.replace(/```[\s\S]*?```/g, "<code_omitted>");
  
  // 2. 移除典型的日志干扰行 (如 [WARN]..., [INFO]..., [Pasted...])
  result = result.replace(/^\[(WARN|INFO|DEBUG|ERROR|Pasted).*?\][^\n]*/gm, "");

  // 3. 压缩多余的换行
  result = result.replace(/\n{3,}/g, "\n\n").trim();

  // 4. 掐头去尾保留核心信息
  if (result.length > maxLen) {
    const half = Math.floor(maxLen / 2);
    return `${result.slice(0, half)}\n...<omitted>...\n${result.slice(-half)}`;
  }
  
  return result;
}

export interface SystemTransformHookContext {
  client: unknown;
  directory: string;
  projectDirectory: string;
  ruleFiles: DiscoveredRule[];
  sessionStore: SessionStore;
  debugLog: DebugLog;
  injectDebugLog: DebugLog;
  now: () => number;
  memoryInjector: MemoryInjector | undefined;
  childSessionCache: Map<string, boolean>;
  taskManager: { findBySession: (sessionID: string) => unknown } | undefined;
}

export function createSystemTransformHooks(ctx: SystemTransformHookContext) {
  /**
   * Check if a session is a child session (has parentID).
   * Two checks: taskManager (wopal_task) + OpenCode session API (built-in task tool).
   */
  async function isChildSession(sessionID: string): Promise<boolean> {
    const cached = ctx.childSessionCache.get(sessionID);
    if (cached !== undefined) return cached;

    // Check 1: wopal_task tracked sessions
    if (ctx.taskManager?.findBySession(sessionID)) {
      ctx.childSessionCache.set(sessionID, true);
      return true;
    }

    // Check 2: OpenCode session API — parentID means child session
    try {
      const client = ctx.client as Record<string, unknown>;
      const sessionApi = client?.session as Record<string, unknown> | undefined;
      if (sessionApi?.get && typeof sessionApi.get === "function") {
        const result = await (sessionApi.get as (...args: unknown[]) => Promise<unknown>)({ path: { id: sessionID } });
        const data = (result as Record<string, unknown>)?.data as
          | Record<string, unknown>
          | undefined;
        const hasParent = !!data?.parentID;
        ctx.childSessionCache.set(sessionID, hasParent);
        if (hasParent) {
          ctx.debugLog(
            `Session ${sessionID} is a child session (parentID=${data.parentID}), skipping memory injection`,
          );
        }
        return hasParent;
      }
    } catch {
      // API not available or failed — fall through to not-a-child
    }

    ctx.childSessionCache.set(sessionID, false);
    return false;
  }

  async function onSystemTransform(
    hookInput: SystemTransformInput,
    output: SystemTransformOutput | null,
  ): Promise<SystemTransformOutput> {
    const sessionID = hookInput?.sessionID;
    const sessionState = sessionID
      ? ctx.sessionStore.get(sessionID)
      : undefined;

    if (sessionID) {
      const skip = ctx.sessionStore.shouldSkipInjection(sessionID);
      if (skip) {
        ctx.debugLog(
          `Session ${sessionID} is compacting - skipping rule injection`,
        );
        return output ?? { system: [] };
      }
    }

    if (!output) {
      output = { system: [] };
    }
    if (!output.system) {
      output.system = [];
    }

    const skillsToReload = sessionID
      ? ctx.sessionStore.consumeSkillReload(sessionID)
      : null;
    if (skillsToReload) {
      output.system.push(
        `[系统提醒] 上下文已被压缩，之前加载的技能 [${skillsToReload.join(", ")}] 内容已丢失。` +
        `请重新加载这些技能以恢复完整的指令和工具链。`
      );
    }

    // Rule injection
    const contextPaths = sessionState
      ? Array.from(sessionState.contextPaths).sort()
      : [];
    const userPrompt = sessionState?.lastUserPrompt;

    const availableToolIDs = await queryAvailableToolIDs();

    const formattedRules = await readAndFormatRules(
      ctx.ruleFiles,
      contextPaths,
      userPrompt,
      availableToolIDs,
    );

    if (formattedRules) {
      ctx.debugLog("Injecting rules into system prompt");
      output.system.push(formattedRules);
    } else {
      ctx.debugLog("No applicable rules for current context");
    }

    // Memory injection (after rules, into same system array)
    if (sessionID) {
      await injectMemoriesIntoSystem(sessionID, output);
    }

    return output;
  }

  /**
   * Inject relevant memories into system prompt.
   * All skip decisions (already injected, short/command, child session) are made here
   * so that repeated system.transform calls (e.g. after tool use) exit immediately.
   */
  async function injectMemoriesIntoSystem(
    sessionID: string,
    output: SystemTransformOutput,
  ): Promise<void> {
    if (!ctx.memoryInjector) return;

    const state = ctx.sessionStore.get(sessionID);

    // Gate: only proceed when flagged by chat.message or history seed
    if (!state?.needsMemoryInjection) {
      return;
    }

    // Consume the flag immediately — tool-use re-enters will skip entirely
    ctx.sessionStore.upsert(sessionID, (s) => {
      s.needsMemoryInjection = false;
    });

    // Skip child sessions — check early to avoid wasted retrieval work
    const isChild = await isChildSession(sessionID);
    if (isChild) {
      clearInjectedMemory(sessionID);
      ctx.injectDebugLog("Skipped memory injection for child session");
      return;
    }

    // Skip entirely if memory store is empty
    try {
      if (await ctx.memoryInjector.isEmpty()) {
        clearInjectedMemory(sessionID);
        return;
      }
    } catch {
      // Store not initialized yet, skip silently
      clearInjectedMemory(sessionID);
      return;
    }

    const userQuery = state.lastUserPrompt;
    if (!userQuery) {
      clearInjectedMemory(sessionID);
      ctx.injectDebugLog("Skipped memory injection (no user query)");
      return;
    }

    // Build enriched query — fetch full session messages for context
    let allMessages: MessageWithInfo[] = [];
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messages = await (ctx.client as any).session?.messages?.({ path: { id: sessionID } });
      if (Array.isArray(messages?.data)) {
        allMessages = messages.data;
      }
      ctx.injectDebugLog(`API returned ${allMessages.length} messages for context extraction`);
    } catch {
      // Fallback: no messages available
    }

    const enrichedQuery = buildEnrichedQuery(sessionID, userQuery, allMessages);
    if (!enrichedQuery) {
      clearInjectedMemory(sessionID);
      ctx.injectDebugLog(`Skipped memory injection for short/command input: "${userQuery}"`);
      return;
    }

    // Execute retrieval + injection with timeout guard
    try {
      let timedOut = false;
      const injectPromise = doInjectMemories(sessionID, output, enrichedQuery, () => timedOut);
      const timeoutPromise = new Promise<"timeout">((resolve) =>
        setTimeout(() => resolve("timeout"), 8_000)
      );
      const result = await Promise.race([injectPromise, timeoutPromise]);
      if (result === "timeout") {
        timedOut = true;
        clearInjectedMemory(sessionID);
        ctx.injectDebugLog("Memory injection timed out (8s), skipping");
      }
      // Suppress unhandled rejection from the loser of Promise.race
      injectPromise.catch(() => {});
    } catch (error) {
      clearInjectedMemory(sessionID);
      ctx.injectDebugLog(`Memory injection failed: ${error}`);
    }
  }

  /**
   * Build context-enriched query for memory retrieval.
   */
  function buildEnrichedQuery(
    sessionID: string,
    userQuery: string,
    messages: MessageWithInfo[],
  ): string | null {
    const trimmed = userQuery.trim();

    // Skip commands and shell shortcuts
    if (
      trimmed[0] === "/" ||
      trimmed[0] === "!" ||
      trimmed.startsWith("# /")
    ) {
      return null;
    }

    // Extract conversation context from message history
    const conversation = extractConversationContext(messages);

    // Load session summary
    const sessCtx = loadSessionContext(sessionID);
    const summaryText = sessCtx?.summary?.text
      ? `近期背景 (Session): ${sessCtx.summary.text}\n`
      : "";

    if (conversation) {
      const result = `当前意图: ${trimmed}\n---\n${summaryText}${conversation}`;
      ctx.injectDebugLog(`buildEnrichedQuery: conversation context found (${result.length} chars)`);
      return result;
    }

    // No conversation found — use summary + raw query or just raw query
    if (summaryText) {
      const result = `当前意图: ${trimmed}\n---\n${summaryText}`;
      ctx.injectDebugLog(`buildEnrichedQuery: no conversation, using summary + query (${result.length} chars)`);
      return result;
    }

    ctx.injectDebugLog(`buildEnrichedQuery: no context, using raw query (${trimmed.length} chars)`);
    return trimmed;
  }

  /**
   * Extract the most recent complete conversation turn from messages.
   */
  function extractConversationContext(
    messages: MessageWithInfo[],
  ): string | null {
    if (messages.length < 3) return null;

    // Find current user message (last user in the list)
    let currentUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      const role = messages[i]!.role || messages[i]!.info?.role;
      if (role === "user") {
        currentUserIdx = i;
        break;
      }
    }
    if (currentUserIdx < 0) return null;

    // Walk backwards from before current user to find: assistant → previous user
    let assistantText: string | null = null;
    let previousUserText: string | null = null;

    for (let i = currentUserIdx - 1; i >= 0; i--) {
      const msg = messages[i]!;
      const role = msg.role || msg.info?.role;
      const parts = msg.parts || [];

      if (role === "assistant") {
        // Extract all human-facing text parts, concatenated
        const textParts = parts
          .filter((p: { type?: string; text?: string; synthetic?: boolean; ignored?: boolean }) => p.type === "text" && p.text && !p.synthetic && !p.ignored)
          .map((p: { text?: string }) => p.text!.trim())
          .filter(Boolean);

        if (textParts.length > 0 && !assistantText) {
          assistantText = textParts.join("\n");
        }
        continue;
      }

      if (role === "user" && assistantText) {
        const userTexts = parts
          .filter((p: { type?: string; text?: string; synthetic?: boolean }) => p.type === "text" && p.text && !p.synthetic)
          .map((p: { text?: string }) => p.text!.trim())
          .filter(Boolean);

        if (userTexts.length > 0) {
          previousUserText = userTexts.join(" ");
          break;
        }
      }
    }

    if (assistantText && previousUserText) {
      const cleanUser = cleanAndTruncateForEmbedding(previousUserText, 250);
      const cleanAsst = cleanAndTruncateForEmbedding(assistantText, 250);
      return `上一轮 User: ${cleanUser}\n上一轮 Assistant: ${cleanAsst}`;
    }

    return null;
  }

  /**
   * Pure retrieval + injection. All skip decisions are made by the caller.
   */
  async function doInjectMemories(
    sessionID: string,
    output: SystemTransformOutput,
    enrichedQuery: string,
    isCancelled?: () => boolean,
  ): Promise<void> {
    const injector = ctx.memoryInjector;
    if (!injector) return;

    const memoryText = await injector.formatForSystem(enrichedQuery);
    if (!memoryText) {
      clearInjectedMemory(sessionID);
      ctx.injectDebugLog(`No relevant memories found`);
      return;
    }

    if (isCancelled?.()) {
      return;
    }

    if (!output.system) {
      output.system = [];
    }

    output.system.push(memoryText);

    ctx.sessionStore.upsert(sessionID, (state) => {
      state.injectedRawText = memoryText;
    });
  }

  function clearInjectedMemory(sessionID: string): void {
    ctx.sessionStore.upsert(sessionID, (state) => {
      state.injectedRawText = undefined;
    });
  }

  async function queryAvailableToolIDs(): Promise<string[]> {
    const ids = new Set<string>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = ctx.client as any;
    const query = { directory: ctx.directory };

    const [toolResult, mcpResult] = await Promise.allSettled([
      client.tool?.ids?.({ query }),
      client.mcp?.status?.({ query }),
    ]);

    if (
      toolResult.status === "fulfilled" &&
      Array.isArray(toolResult.value?.data)
    ) {
      for (const id of toolResult.value.data) {
        ids.add(id);
      }
      ctx.debugLog(
        `Built-in tools: ${toolResult.value.data.slice(0, 10).join(", ")}${toolResult.value.data.length > 10 ? "..." : ""} (${toolResult.value.data.length} total)`,
      );
    } else if (toolResult.status === "rejected") {
      const message =
        toolResult.reason instanceof Error
          ? toolResult.reason.message
          : String(toolResult.reason);
      ctx.debugLog(`Warning: Failed to query tool IDs: ${message}`);
    }

    if (mcpResult.status === "fulfilled" && mcpResult.value?.data) {
      const mcpIds = extractConnectedMcpCapabilityIDs(mcpResult.value.data);
      for (const id of mcpIds) {
        ids.add(id);
      }
      if (mcpIds.length > 0) {
        ctx.debugLog(`MCP capability IDs: ${mcpIds.join(", ")}`);
      }
    } else if (mcpResult.status === "rejected") {
      const message =
        mcpResult.reason instanceof Error
          ? mcpResult.reason.message
          : String(mcpResult.reason);
      ctx.debugLog(`Warning: Failed to query MCP status: ${message}`);
    }

    return Array.from(ids);
  }

  return {
    "experimental.chat.system.transform": onSystemTransform,
    // Expose internal methods for testing
    _queryAvailableToolIDs: queryAvailableToolIDs,
    _isChildSession: isChildSession,
    _onSystemTransform: onSystemTransform,
  };
}
