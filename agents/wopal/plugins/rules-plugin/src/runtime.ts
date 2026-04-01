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
import type { WopalTask } from "./types.js"
import { trackActivity } from "./progress-tracker.js";

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
        const result = await (sessionApi.get as Function)({ sessionID });
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
      const skip = this.sessionStore.shouldSkipInjection(
        sessionID,
        this.now(),
        30_000,
      );
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

    // Skip entirely if memory store is empty
    try {
      if (await this.memoryInjector.isEmpty()) return;
    } catch {
      // Store not initialized yet, skip silently
      return;
    }

    const state = this.sessionStore.get(sessionID);

    const userQuery = state?.lastUserPrompt;
    if (!userQuery) {
      this.injectDebugLog("Skipped memory injection (no user query)");
      return;
    }

    // Build enriched query — always fetch recent messages for context
    let recentMessages: import("./message-context.js").MessageWithInfo[] = [];
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messages = await (this.client as any).session?.messages?.({ path: { id: sessionID } });
      if (Array.isArray(messages?.data)) {
        recentMessages = messages.data.slice(-10);
      }
      this.injectDebugLog(`API returned ${Array.isArray(messages?.data) ? messages.data.length : 0} msgs, using last ${recentMessages.length}`);
      const roles = recentMessages.map((m, i) => {
        const role = m.role || m.info?.role;
        const partTypes = (m.parts || []).map((p) => p.type).join(",");
        return `${i}:${role}[${partTypes}]`;
      });
      this.injectDebugLog(`Last 10 roles: ${roles.join(" | ")}`);
    } catch {
      // Fallback: no recent messages available
    }

    const enrichedQuery = this.buildEnrichedQuery(userQuery, recentMessages);
    if (!enrichedQuery) {
      this.injectDebugLog(`Skipped memory injection for short/command input: "${userQuery}"`);
      return;
    }

    // Skip if same query already injected this turn
    if (state?.lastInjectedQuery === enrichedQuery) {
      this.injectDebugLog("Skipped memory injection (already injected this turn)");
      return;
    }

    // Skip child sessions
    const isChildSession = await this.isChildSession(sessionID);
    if (isChildSession) {
      this.injectDebugLog("Skipped memory injection for child session");
      return;
    }

    // Execute retrieval + injection with timeout guard
    try {
      const injectPromise = this.doInjectMemories(sessionID, output, enrichedQuery);
      const timeoutPromise = new Promise<"timeout">((resolve) =>
        setTimeout(() => resolve("timeout"), 8_000)
      );
      const result = await Promise.race([injectPromise, timeoutPromise]);
      if (result === "timeout") {
        this.injectDebugLog("Memory injection timed out (8s), skipping");
      }
      // Suppress unhandled rejection from the loser of Promise.race
      injectPromise.catch(() => {});
    } catch (error) {
      this.injectDebugLog(`Memory injection failed: ${error}`);
    }
  }

  /**
   * Build context-enriched query for short inputs.
   * If userQuery is short (< 10 chars), try to enrich with recent message context.
   * Returns null if query should be skipped (no semantic value).
   */
  private buildEnrichedQuery(
    userQuery: string,
    recentMessages: import("./message-context.js").MessageWithInfo[],
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

    // Skip common command-like inputs (covers known short commands like "ok")
    const skipPatterns = /^(ok|compact|continue|exit|好的|继续|退出)$/i;
    if (skipPatterns.test(trimmed)) {
      return null;
    }

    // Always try to get the most recent complete turn (previous user + assistant)
    if (recentMessages.length > 0) {
      // Find the current user message index (last user message in the list)
      let currentUserIdx = -1;
      for (let i = recentMessages.length - 1; i >= 0; i--) {
        const msg = recentMessages[i];
        const role = msg.role || msg.info?.role;
        if (role === "user") {
          currentUserIdx = i;
          break;
        }
      }

      let foundAssistant = false;
      let foundPreviousUser = false;
      const contextParts: string[] = [];

      // Walk backwards from BEFORE current user to find: assistant → previous user
      for (let i = currentUserIdx - 1; i >= 0; i--) {
        const msg = recentMessages[i];
        const role = msg.role || msg.info?.role;
        const parts = msg.parts || [];

        // Extract clean text: skip synthetic, skip non-text parts
        const realTexts = parts
          .filter((p) => !p.synthetic && p.type === "text" && p.text)
          .map((p) => p.text!.trim())
          .filter(Boolean);
        if (realTexts.length === 0) continue;

        // For assistant: only use the LAST text part (the final reply to user)
        // For user: join all non-synthetic text parts
        const joined =
          role === "assistant"
            ? realTexts[realTexts.length - 1]!
            : realTexts.join(" ").trim();

        if (joined.length < 10) continue;

        if (!foundAssistant && role === "assistant") {
          foundAssistant = true;
          contextParts.unshift(joined.slice(0, 300));
          continue;
        }
        if (foundAssistant && role === "user") {
          foundPreviousUser = true;
          contextParts.unshift(joined.slice(0, 300));
          break;
        }
      }

      if (foundAssistant && foundPreviousUser) {
        return `User: ${contextParts[0]}\nAssistant: ${contextParts[1]}\nFollow-up: ${trimmed}`;
      }
    }

    // Fallback: return raw query if long enough
    return trimmed.length >= 10 ? trimmed : null;
  }

  /**
   * Pure retrieval + injection. All skip decisions are made by the caller.
   */
  private async doInjectMemories(
    sessionID: string,
    output: SystemTransformOutput,
    enrichedQuery: string,
  ): Promise<void> {
    const injector = this.memoryInjector;
    if (!injector) return;

    const memoryText = await injector.formatForSystem(enrichedQuery);
    if (!memoryText) {
      this.injectDebugLog(`No relevant memories found`);
      this.sessionStore.upsert(sessionID, (state) => {
        state.lastInjectedQuery = enrichedQuery;
        state.injectedRawText = undefined;
      });
      return;
    }

    if (!output.system) {
      output.system = [];
    }
    output.system.push(memoryText);

    this.sessionStore.upsert(sessionID, (state) => {
      state.lastInjectedQuery = enrichedQuery;
      state.injectedRawText = memoryText;
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

    const NOISY_EVENTS = new Set(["message.part.delta", "message.part.updated"])
    if (!NOISY_EVENTS.has(eventType)) {
      this.taskDebugLog(`[onEvent] received event: ${eventType}`)
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

      if (diagnostic.verdict === 'completed') {
        const completedTask = this.taskManager.markTaskCompletedBySession(sessionID)
        if (completedTask) {
          this.taskDebugLog(`task ${completedTask.id} completed via session.idle`)
          this.taskManager.notifyParent(completedTask.id).catch(() => {})
        }
      } else if (diagnostic.verdict === 'waiting') {
        const waitingTask = this.taskManager.markTaskWaitingBySession(sessionID, diagnostic)
        if (waitingTask) {
          this.taskDebugLog(`task ${waitingTask.id} waiting: ${diagnostic.reason}`)
          this.notifyParentWaiting(waitingTask, diagnostic).catch(() => {})
        }
      } else {
        // error
        const errorTask = this.taskManager.markTaskErrorBySession(sessionID, diagnostic.reason)
        if (errorTask) {
          this.taskDebugLog(`task ${errorTask.id} error: ${diagnostic.reason}`)
          this.taskManager.notifyParent(errorTask.id).catch(() => {})
        }
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

      if (sessionID && props?.question) {
        const { handleQuestionAsked } = await import("./question-relay.js")
        await handleQuestionAsked(
          { sessionID, question: props.question as { header?: string; options?: Array<{ label: string; value: string }> } },
          this.taskManager!,
          this.taskDebugLog
        )
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

  private async notifyParentWaiting(task: WopalTask, diagnostic: IdleDiagnostic): Promise<void> {
    const notification = `<system-reminder>
[WOPAL TASK WAITING]
**Task ID:** \`${task.id}\`
**Description:** ${task.description}
**Reason:** ${diagnostic.reason}
${diagnostic.lastMessage ? `**Last Message:**\n${diagnostic.lastMessage.slice(0, 500)}` : ''}

The background task is waiting for your response. Use \`wopal_reply\` to continue.
</system-reminder>`

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = this.client as any

    if (typeof client?.session?.promptAsync !== "function") return

    try {
      await client.session.promptAsync({
        path: { id: task.parentSessionID },
        body: {
          noReply: true,
          parts: [{ type: "text", text: notification, synthetic: true }],
        },
      })
    } catch (err) {
      this.taskDebugLog(`notifyParentWaiting error: ${err}`)
    }
  }
}
