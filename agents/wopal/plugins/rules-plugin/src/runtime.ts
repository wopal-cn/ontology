import {
  readAndFormatRules,
  extractFilePathsFromMessages,
  type DiscoveredRule,
} from "./utils.js";
import {
  extractLatestUserPrompt,
  extractSessionID,
  normalizeContextPath,
  sanitizePathForContext,
  toExtractableMessages,
  type MessageWithInfo,
} from "./message-context.js";
import { extractConnectedMcpCapabilityIDs } from "./mcp-tools.js";
import { createDebugLog, type DebugLog } from "./debug.js";
import type { SessionStore } from "./session-store.js";
import type { Model } from "@opencode-ai/sdk";
import type { SimpleTaskManager } from "./simple-task-manager.js";
import type { MemoryInjector } from "./memory/index.js";
import type { IdleDiagnostic } from "./idle-diagnostic.js";
import { trackActivity } from "./progress-tracker.js";
import { loadSessionContext } from "./memory/session-context.js";

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

/** Max recent messages to store for short-query context enrichment */
const MAX_RECENT_MESSAGES = 10;

interface MessagesTransformOutput {
  messages: MessageWithInfo[];
}

interface CommandExecuteBeforeInput {
  command: string;
  sessionID: string;
  arguments: string;
}

interface CommandExecuteBeforeOutput {
  parts: Array<{ type?: string; text?: string; synthetic?: boolean }>;
}

interface ToolExecuteAfterInput {
  tool: string;
  sessionID: string;
  callID: string;
  args: Record<string, unknown>;
}

interface ToolExecuteAfterOutput {
  title: string;
  output: string;
  metadata: unknown;
}

interface SystemTransformInput {
  sessionID?: string;
  model: Model;
}

interface SystemTransformOutput {
  system: string[];
}

export interface OpenCodeRulesRuntimeOptions {
  client: unknown;
  directory: string;
  projectDirectory: string;
  ruleFiles: DiscoveredRule[];
  sessionStore: SessionStore;
  debugLog?: DebugLog;
  now?: () => number;
  taskManager?: SimpleTaskManager;
  memoryInjector?: MemoryInjector | undefined;
}

export class OpenCodeRulesRuntime {
  private client: unknown;
  private directory: string;
  private projectDirectory: string;
  private ruleFiles: DiscoveredRule[];
  private sessionStore: SessionStore;
  private debugLog: DebugLog;
  private taskDebugLog: DebugLog;
  private now: () => number;
  private taskManager: SimpleTaskManager | undefined;
  private memoryInjector: MemoryInjector | undefined;
  private injectDebugLog: DebugLog;

  constructor(opts: OpenCodeRulesRuntimeOptions) {
    this.client = opts.client;
    this.directory = opts.directory;
    this.projectDirectory = opts.projectDirectory;
    this.ruleFiles = opts.ruleFiles;
    this.sessionStore = opts.sessionStore;
    this.debugLog = opts.debugLog ?? createDebugLog();
    this.taskDebugLog = createDebugLog("[wopal-task]", "task");
    this.injectDebugLog = createDebugLog("[wopal-memory]", "memory");
    this.now = opts.now ?? (() => Date.now());
    this.taskManager = opts.taskManager ?? undefined;
    this.memoryInjector = opts.memoryInjector;
  }

  createHooks(): Record<string, unknown> {
    return {
      "command.execute.before": this.onCommandExecuteBefore.bind(this),
      "tool.execute.before": this.onToolExecuteBefore.bind(this),
      "tool.execute.after": this.onToolExecuteAfter.bind(this),
      "tool.definition": this.onToolDefinition.bind(this),
      "experimental.chat.messages.transform":
        this.onMessagesTransform.bind(this),
      "chat.message": this.onChatMessage.bind(this),
      "experimental.chat.system.transform": this.onSystemTransform.bind(this),
      "experimental.session.compacting": this.onSessionCompacting.bind(this),
      "event": this.onEvent.bind(this),
    };
  }

  private async onToolDefinition(
    input: { toolID: string },
    output: { description: string; parameters: unknown },
  ): Promise<void> {
    if (input.toolID !== "memory_manage") {
      return;
    }

    output.description = [
      "管理 LanceDB 中的长期记忆。子命令: list, stats, search, delete。",
      "重要：调用本工具后，必须把 output 的完整文本逐字写入用户回复。",
      "严禁概括、严禁摘要、严禁省略任何一条结果。",
      "用户使用 list 的目的是逐条审查完整内容，以决定删除或调整哪一条记忆。",
    ].join(" ");
  }

  private async onCommandExecuteBefore(
    input: CommandExecuteBeforeInput,
    output: CommandExecuteBeforeOutput,
  ): Promise<void> {
    if (input.command !== "memory") {
      return;
    }

    const first = output.parts.find(
      (part) => part.type === "text" && typeof part.text === "string",
    );
    if (!first?.text) {
      return;
    }

    first.text = [
      "这是一个立即执行命令，不是规则阅读任务。",
      "你必须立刻调用 memory_manage 工具，不要解释命令，不要复述规则。",
      "如果是 list，默认使用 limit=100 一次拿完，除非用户显式指定 limit。",
      "tool 返回值对用户不可见。你必须把工具返回的完整文本逐字写入回复。",
      "严禁概括、严禁摘要、严禁只汇总结论、严禁省略任意一条记忆。",
      "因为用户需要逐条审查完整内容，决定删除或调整哪一条。",
      "如果你没有把完整结果写出来，这次命令就是失败的。",
      "",
      first.text,
    ].join("\n");
  }

  private async onToolExecuteBefore(
    input: { tool?: string; sessionID?: string; callID?: string },
    output: { args?: Record<string, unknown> },
  ): Promise<void> {
    const sessionID = input?.sessionID;
    const toolName = input?.tool;
    const args = output?.args;

    if (!sessionID || !toolName || !args) {
      return;
    }

    let filePath: string | undefined;

    if (["read", "edit", "write"].includes(toolName)) {
      const arg = args.filePath;
      if (typeof arg === "string" && arg.length > 0) {
        filePath = arg;
      }
    } else if (["glob", "grep"].includes(toolName)) {
      const arg = args.path;
      if (typeof arg === "string" && arg.length > 0) {
        filePath = arg;
      }
    } else if (toolName === "bash") {
      const arg = args.workdir;
      if (typeof arg === "string" && arg.length > 0) {
        filePath = arg;
      }
    }

    if (toolName === "skill") {
      const skillName = args.name;
      if (typeof skillName === "string" && skillName.length > 0) {
        this.sessionStore.recordSkillLoaded(sessionID, skillName);
        this.debugLog(`Recorded loaded skill: ${skillName} for session ${sessionID}`);
      }
    }

    if (filePath) {
      const normalized = normalizeContextPath(filePath, this.projectDirectory);
      this.sessionStore.upsert(sessionID, (state) => {
        state.contextPaths.add(normalized);
      });

      this.debugLog(
        `Recorded context path from tool ${toolName}: ${normalized}`,
      );
    }
  }

  private async onToolExecuteAfter(
    _input: ToolExecuteAfterInput,
    _output: ToolExecuteAfterOutput,
  ): Promise<void> {
    // No-op: memory_manage echo handled via tool return string
  }

  /**
   * Check if a session is a child session (has parentID).
   * Two checks: taskManager (wopal_task) + OpenCode session API (built-in task tool).
   */
  private childSessionCache = new Map<string, boolean>();

  private async isChildSession(sessionID: string): Promise<boolean> {
    const cached = this.childSessionCache.get(sessionID);
    if (cached !== undefined) return cached;

    // Check 1: wopal_task tracked sessions
    if (this.taskManager?.findBySession(sessionID)) {
      this.childSessionCache.set(sessionID, true);
      return true;
    }

    // Check 2: OpenCode session API — parentID means child session
    try {
      const client = this.client as Record<string, unknown>;
      const sessionApi = client?.session as Record<string, unknown> | undefined;
      if (sessionApi?.get && typeof sessionApi.get === "function") {
        const result = await (sessionApi.get as Function)({ path: { id: sessionID } });
        const data = (result as Record<string, unknown>)?.data as
          | Record<string, unknown>
          | undefined;
        const hasParent = !!data?.parentID;
        this.childSessionCache.set(sessionID, hasParent);
        if (hasParent) {
          this.debugLog(
            `Session ${sessionID} is a child session (parentID=${data.parentID}), skipping memory injection`,
          );
        }
        return hasParent;
      }
    } catch {
      // API not available or failed — fall through to not-a-child
    }

    this.childSessionCache.set(sessionID, false);
    return false;
  }

  private async onMessagesTransform(
    _input: Record<string, never>,
    output: MessagesTransformOutput,
  ): Promise<MessagesTransformOutput> {
    const sessionID = extractSessionID(output.messages);
    if (!sessionID) {
      this.debugLog("No sessionID found in messages");
      return output;
    }

    const existingState = this.sessionStore.get(sessionID);
    if (existingState && existingState.seededFromHistory) {
      this.debugLog(`Session ${sessionID} already seeded, skipping rescan`);
      return output;
    }

    const contextPaths = extractFilePathsFromMessages(
      toExtractableMessages(output.messages),
    );
    const userPrompt = extractLatestUserPrompt(output.messages);

    // Store recent messages for context enrichment (last N messages)
    const recentMessages = output.messages.slice(-MAX_RECENT_MESSAGES);

    this.sessionStore.upsert(sessionID, (state) => {
      for (const p of contextPaths) {
        state.contextPaths.add(normalizeContextPath(p, this.projectDirectory));
      }
      if (userPrompt && !state.lastUserPrompt) {
        state.lastUserPrompt = userPrompt;
      }
      state.needsMemoryInjection = true;
      state.seededFromHistory = true;
      state.seedCount = (state.seedCount ?? 0) + 1;
      state.recentMessages = recentMessages;
    });

    if (contextPaths.length > 0) {
      this.debugLog(
        `Seeded ${contextPaths.length} context path(s) for session ${sessionID}: ${contextPaths
          .slice(0, 5)
          .join(", ")}${contextPaths.length > 5 ? "..." : ""}`,
      );
    }

    if (userPrompt) {
      this.debugLog(
        `Seeded user prompt for session ${sessionID} (len=${userPrompt.length})`,
      );
    }

    return output;
  }

  private async onChatMessage(
    input: { sessionID?: string },
    output: {
      message?: { role?: string };
      parts?: Array<{ type?: string; text?: string; synthetic?: boolean }>;
    },
  ): Promise<void> {
    const sessionID = input?.sessionID;
    if (!sessionID) {
      this.debugLog("No sessionID in chat.message hook input");
      return;
    }

    if (output?.message?.role === "assistant") {
      return;
    }

    if (output?.message?.role !== "user") {
      return;
    }

    const textParts: string[] = [];
    if (output.parts) {
      for (const part of output.parts) {
        if (part.synthetic) continue;

        if (part.type === "text" && part.text) {
          textParts.push(part.text);
        } else if (typeof part.text === "string" && !part.type) {
          textParts.push(part.text);
        }
      }
    }

    if (textParts.length > 0) {
      const userPrompt = textParts
        .map((t) => t.trim())
        .filter(Boolean)
        .join(" ")
        .trim();

      if (userPrompt) {
        this.sessionStore.upsert(sessionID, (state) => {
          state.lastUserPrompt = userPrompt;
          state.needsMemoryInjection = true;
        });

        this.debugLog(
          `Updated lastUserPrompt for session ${sessionID} (len=${userPrompt.length}, parts=${textParts.length})`,
        );
      }
    }
  }

  private async onSystemTransform(
    hookInput: SystemTransformInput,
    output: SystemTransformOutput | null,
  ): Promise<SystemTransformOutput> {
    const sessionID = hookInput?.sessionID;
    const sessionState = sessionID
      ? this.sessionStore.get(sessionID)
      : undefined;

    if (sessionID) {
      const skip = this.sessionStore.shouldSkipInjection(sessionID);
      if (skip) {
        this.debugLog(
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
      ? this.sessionStore.consumeSkillReload(sessionID)
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

    const availableToolIDs = await this.queryAvailableToolIDs();

    const formattedRules = await readAndFormatRules(
      this.ruleFiles,
      contextPaths,
      userPrompt,
      availableToolIDs,
    );

    if (formattedRules) {
      this.debugLog("Injecting rules into system prompt");
      output.system.push(formattedRules);
    } else {
      this.debugLog("No applicable rules for current context");
    }

    // Memory injection (after rules, into same system array)
    if (sessionID) {
      await this.injectMemoriesIntoSystem(sessionID, output);
    }

    return output;
  }

  /**
   * Inject relevant memories into system prompt.
   * All skip decisions (already injected, short/command, child session) are made here
   * so that repeated system.transform calls (e.g. after tool use) exit immediately.
   */
  private async injectMemoriesIntoSystem(
    sessionID: string,
    output: SystemTransformOutput,
  ): Promise<void> {
    if (!this.memoryInjector) return;

    const state = this.sessionStore.get(sessionID);

    // Gate: only proceed when flagged by chat.message or history seed
    if (!state?.needsMemoryInjection) {
      return;
    }

    // Consume the flag immediately — tool-use re-enters will skip entirely
    this.sessionStore.upsert(sessionID, (s) => {
      s.needsMemoryInjection = false;
    });

    // Skip child sessions — check early to avoid wasted retrieval work
    const isChild = await this.isChildSession(sessionID);
    if (isChild) {
      this.clearInjectedMemory(sessionID);
      this.injectDebugLog("Skipped memory injection for child session");
      return;
    }

    // Skip entirely if memory store is empty
    try {
      if (await this.memoryInjector.isEmpty()) {
        this.clearInjectedMemory(sessionID);
        return;
      }
    } catch {
      // Store not initialized yet, skip silently
      this.clearInjectedMemory(sessionID);
      return;
    }

    const userQuery = state.lastUserPrompt;
    if (!userQuery) {
      this.clearInjectedMemory(sessionID);
      this.injectDebugLog("Skipped memory injection (no user query)");
      return;
    }

    // Build enriched query — fetch full session messages for context
    let allMessages: import("./message-context.js").MessageWithInfo[] = [];
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messages = await (this.client as any).session?.messages?.({ path: { id: sessionID } });
      if (Array.isArray(messages?.data)) {
        allMessages = messages.data;
      }
      this.injectDebugLog(`API returned ${allMessages.length} messages for context extraction`);
    } catch {
      // Fallback: no messages available
    }

    const enrichedQuery = this.buildEnrichedQuery(sessionID, userQuery, allMessages);
    if (!enrichedQuery) {
      this.clearInjectedMemory(sessionID);
      this.injectDebugLog(`Skipped memory injection for short/command input: "${userQuery}"`);
      return;
    }

    // Execute retrieval + injection with timeout guard
    try {
      let timedOut = false;
      const injectPromise = this.doInjectMemories(sessionID, output, enrichedQuery, () => timedOut);
      const timeoutPromise = new Promise<"timeout">((resolve) =>
        setTimeout(() => resolve("timeout"), 8_000)
      );
      const result = await Promise.race([injectPromise, timeoutPromise]);
      if (result === "timeout") {
        timedOut = true;
        this.clearInjectedMemory(sessionID);
        this.injectDebugLog("Memory injection timed out (8s), skipping");
      }
      // Suppress unhandled rejection from the loser of Promise.race
      injectPromise.catch(() => {});
    } catch (error) {
      this.clearInjectedMemory(sessionID);
      this.injectDebugLog(`Memory injection failed: ${error}`);
    }
  }

  /**
   * Build context-enriched query for memory retrieval.
   *
   * Strategy: Extract the most recent complete turn from session history
   * (user → assistant → current user), then prepend session summary.
   * Searches through ALL messages to find a complete conversation pattern.
   */
  private buildEnrichedQuery(
    sessionID: string,
    userQuery: string,
    messages: import("./message-context.js").MessageWithInfo[],
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
    const conversation = this.extractConversationContext(messages);

    // Load session summary
    const ctx = loadSessionContext(sessionID);
    const summaryText = ctx?.summary?.text
      ? `近期背景 (Session): ${ctx.summary.text}\n`
      : "";

    if (conversation) {
      const result = `当前意图: ${trimmed}\n---\n${summaryText}${conversation}`;
      this.injectDebugLog(`buildEnrichedQuery: conversation context found (${result.length} chars)`);
      return result;
    }

    // No conversation found — use summary + raw query or just raw query
    if (summaryText) {
      const result = `当前意图: ${trimmed}\n---\n${summaryText}`;
      this.injectDebugLog(`buildEnrichedQuery: no conversation, using summary + query (${result.length} chars)`);
      return result;
    }

    this.injectDebugLog(`buildEnrichedQuery: no context, using raw query (${trimmed.length} chars)`);
    return trimmed;
  }

  /**
   * Extract the most recent complete conversation turn from messages.
   * Searches backwards through all messages to find the pattern:
   *   previous user → assistant (human-facing text only) → current user
   *
   * For assistant messages, keeps only parts where:
   *   type === "text" && !synthetic && !ignored
   * These are the actual human-facing reply texts, concatenated together.
   *
   * Returns null if no complete turn found.
   */
  private extractConversationContext(
    messages: import("./message-context.js").MessageWithInfo[],
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
          .filter((p) => p.type === "text" && p.text && !p.synthetic && !p.ignored)
          .map((p) => p.text!.trim())
          .filter(Boolean);

        if (textParts.length > 0 && !assistantText) {
          assistantText = textParts.join("\n");
        }
        // Skip assistant messages with no human text (tool-only turns)
        // Keep searching for one with actual text
        continue;
      }

      if (role === "user" && assistantText) {
        // Found the user message before the assistant reply
        const userTexts = parts
          .filter((p) => p.type === "text" && p.text && !p.synthetic)
          .map((p) => p.text!.trim())
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
  private async doInjectMemories(
    sessionID: string,
    output: SystemTransformOutput,
    enrichedQuery: string,
    isCancelled?: () => boolean,
  ): Promise<void> {
    const injector = this.memoryInjector;
    if (!injector) return;

    const memoryText = await injector.formatForSystem(enrichedQuery);
    if (!memoryText) {
      this.clearInjectedMemory(sessionID);
      this.injectDebugLog(`No relevant memories found`);
      return;
    }

    if (isCancelled?.()) {
      return;
    }

    if (!output.system) {
      output.system = [];
    }

    output.system.push(memoryText);

    this.sessionStore.upsert(sessionID, (state) => {
      state.injectedRawText = memoryText;
    });
  }

  private clearInjectedMemory(sessionID: string): void {
    this.sessionStore.upsert(sessionID, (state) => {
      state.injectedRawText = undefined;
    });
  }

  private async queryAvailableToolIDs(): Promise<string[]> {
    const ids = new Set<string>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = this.client as any;
    const query = { directory: this.directory };

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
      this.debugLog(
        `Built-in tools: ${toolResult.value.data.slice(0, 10).join(", ")}${toolResult.value.data.length > 10 ? "..." : ""} (${toolResult.value.data.length} total)`,
      );
    } else if (toolResult.status === "rejected") {
      const message =
        toolResult.reason instanceof Error
          ? toolResult.reason.message
          : String(toolResult.reason);
      this.debugLog(`Warning: Failed to query tool IDs: ${message}`);
    }

    if (mcpResult.status === "fulfilled" && mcpResult.value?.data) {
      const mcpIds = extractConnectedMcpCapabilityIDs(mcpResult.value.data);
      for (const id of mcpIds) {
        ids.add(id);
      }
      if (mcpIds.length > 0) {
        this.debugLog(`MCP capability IDs: ${mcpIds.join(", ")}`);
      }
    } else if (mcpResult.status === "rejected") {
      const message =
        mcpResult.reason instanceof Error
          ? mcpResult.reason.message
          : String(mcpResult.reason);
      this.debugLog(`Warning: Failed to query MCP status: ${message}`);
    }

    return Array.from(ids);
  }

  private async onSessionCompacting(
    input: { sessionID: string },
    output: { context: string[]; prompt?: string },
  ): Promise<void> {
    const sessionID = input?.sessionID;
    if (!sessionID) {
      this.debugLog("No sessionID in compacting hook input");
      return;
    }

    const sessionState = this.sessionStore.get(sessionID);
    if (!sessionState || sessionState.contextPaths.size === 0) {
      this.debugLog(
        `No context paths for session ${sessionID} during compaction`,
      );
      return;
    }

    this.sessionStore.markCompacting(sessionID, this.now());

    const sortedPaths = Array.from(sessionState.contextPaths).sort();
    const maxPaths = 20;
    const pathsToInclude = sortedPaths.slice(0, maxPaths);

    const contextString = [
      "OpenCode Rules: Working context",
      "Current file paths in context:",
      ...pathsToInclude.map((p) => `  - ${sanitizePathForContext(p)}`),
      ...(sortedPaths.length > maxPaths
        ? [`  ... and ${sortedPaths.length - maxPaths} more paths`]
        : []),
    ].join("\n");

    output.context.push(contextString);

    this.debugLog(
      `Added ${pathsToInclude.length} context path(s) to compaction for session ${sessionID}`,
    );
  }

  private async onEvent(
    input: { event: { type: string; properties?: Record<string, unknown> } },
  ): Promise<void> {
    if (!this.taskManager) return

    const eventType = input.event.type
    const props = input.event.properties

    const ACTIONABLE_EVENTS = new Set(["session.idle"])
    if (ACTIONABLE_EVENTS.has(eventType)) {
      const eventSessionID = props?.sessionID as string | undefined
      this.taskDebugLog(`[onEvent] received event: ${eventType}${eventSessionID ? ` session=${eventSessionID}` : ''}`)
    }

    // Track meaningful activity from streaming events for stuck detection
    if (eventType === "message.part.delta") {
      const sessionID = props?.sessionID as string | undefined
      if (sessionID) {
        const task = this.taskManager?.findBySession(sessionID)
        if (task && task.status === "running") {
          trackActivity(task, "text")
        }
      }
    } else if (eventType === "message.part.updated") {
      const sessionID = props?.sessionID as string | undefined
      const part = (props as any)?.part as { type?: string } | undefined
      if (sessionID) {
        const task = this.taskManager?.findBySession(sessionID)
        if (task && task.status === "running") {
          trackActivity(task, part?.type)
        }
      }
    }

    if (eventType === "session.idle") {
      const sessionID = props?.sessionID as string | undefined
      if (!sessionID) return

      // 检查是否是 wopal_task 子会话
      const task = this.taskManager?.findBySession(sessionID)
      if (!task) return

      // 拉取消息并诊断
      const diagnostic = await this.diagnoseIdleSession(sessionID)

      // Phase 3: 所有 idle 统一走 idleNotified 路径，判断权交给 Wopal
      if (!task.idleNotified && task.status === 'running') {
        task.idleNotified = true
        // Release concurrency slot so new tasks can launch
        if (task.concurrencyKey) {
          this.taskManager.releaseConcurrencySlot(task)
          task.waitingConcurrencyKey = task.concurrencyKey
          task.concurrencyKey = undefined
        }
        this.taskDebugLog(`task ${task.id} idle: verdict=${diagnostic.verdict}, reason=${diagnostic.reason}`)
        this.taskManager.notifyParent(task.id).catch(() => {})
      }
    }

    if (eventType === "session.compacted") {
      const sessionID = props?.sessionID as string | undefined;
      if (sessionID) {
        this.sessionStore.markCompacted(sessionID);
        this.debugLog(`Session ${sessionID} compact completed (event-driven)`);
      }
    }

    if (eventType === "session.error") {
      const sessionID = props?.sessionID as string | undefined
      const error = this.stringifyEventError(props?.error)

      if (sessionID) {
        const task = this.taskManager.markTaskErrorBySession(sessionID, error)
        if (task) {
          this.taskDebugLog(`task ${task.id} error: ${error}`)
          this.taskManager.notifyParent(task.id).catch(() => {})
        }
      }
    }

    // 权限请求事件
    if (eventType === "permission.asked") {
      const sessionID = props?.sessionID as string | undefined
      const requestID = props?.id as string | undefined // OpenCode uses 'id', not 'requestID'
      const permission = props?.permission as string | undefined

      this.taskDebugLog(`[permission.asked] event received: sessionID=${sessionID} id=${requestID} permission=${permission}`)

      if (sessionID && requestID && permission) {
        const { handlePermissionAsked } = await import("./permission-proxy.js")
        const patterns = props?.patterns as string[] | undefined
        await handlePermissionAsked(
          { sessionID, requestID, permission, ...(patterns ? { patterns } : {}) },
          this.taskManager!,
          this.client,
          this.taskDebugLog
        )
      }
    }

    // 问题请求事件
    if (eventType === "question.asked") {
      const sessionID = props?.sessionID as string | undefined
      const requestID = props?.id as string | undefined

      if (sessionID && requestID && props?.questions) {
        const { handleQuestionAsked } = await import("./question-relay.js")
        const questions = props.questions as Array<{ header?: string; question?: string; options?: Array<{ label: string; description: string }> }>
        const firstQuestion = questions[0]
        if (firstQuestion) {
          await handleQuestionAsked(
            { sessionID, requestID: requestID!, question: firstQuestion },
            this.taskManager!,
            this.taskDebugLog
          )
        }
      }
    }
  }

  private stringifyEventError(error: unknown): string {
    if (typeof error === "string" && error.length > 0) {
      return error
    }

    if (error instanceof Error && error.message) {
      return error.message
    }

    try {
      const serialized = JSON.stringify(error)
      if (serialized && serialized !== "{}") {
        return serialized
      }
    } catch {
      // Ignore JSON serialization failures and fall back to String().
    }

    return String(error)
  }

  private async diagnoseIdleSession(sessionID: string): Promise<IdleDiagnostic> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = this.client as any
      if (typeof client?.session?.messages !== "function") {
        return { verdict: 'error', reason: 'no_message_access' }
      }

      const result = await client.session.messages({ path: { id: sessionID } })
      const messages = result?.data ?? []

      const { diagnoseIdle } = await import("./idle-diagnostic.js")
      return diagnoseIdle(messages)
    } catch (err) {
      this.taskDebugLog(`diagnoseIdleSession error: ${err}`)
      return { verdict: 'error', reason: 'diagnostic_failed' }
    }
  }
}
