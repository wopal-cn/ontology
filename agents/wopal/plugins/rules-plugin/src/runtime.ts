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
import type { IdleDiagnostic } from "./idle-diagnostic.js";
import type { WopalTask } from "./types.js";

interface MessagesTransformOutput {
  messages: MessageWithInfo[];
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

  constructor(opts: OpenCodeRulesRuntimeOptions) {
    this.client = opts.client;
    this.directory = opts.directory;
    this.projectDirectory = opts.projectDirectory;
    this.ruleFiles = opts.ruleFiles;
    this.sessionStore = opts.sessionStore;
    this.debugLog = opts.debugLog ?? createDebugLog();
    this.taskDebugLog = createDebugLog("[wopal-task]", "task");
    this.now = opts.now ?? (() => Date.now());
    this.taskManager = opts.taskManager ?? undefined;
  }

  createHooks(): Record<string, unknown> {
    return {
      "tool.execute.before": this.onToolExecuteBefore.bind(this),
      "experimental.chat.messages.transform":
        this.onMessagesTransform.bind(this),
      "chat.message": this.onChatMessage.bind(this),
      "experimental.chat.system.transform": this.onSystemTransform.bind(this),
      "experimental.session.compacting": this.onSessionCompacting.bind(this),
      "event": this.onEvent.bind(this),
    };
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

    this.sessionStore.upsert(sessionID, (state) => {
      for (const p of contextPaths) {
        state.contextPaths.add(normalizeContextPath(p, this.projectDirectory));
      }
      if (userPrompt && !state.lastUserPrompt) {
        state.lastUserPrompt = userPrompt;
      }
      state.seededFromHistory = true;
      state.seedCount = (state.seedCount ?? 0) + 1;
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

    if (!formattedRules) {
      this.debugLog("No applicable rules for current context");
      return output ?? { system: [] };
    }

    this.debugLog("Injecting rules into system prompt");

    if (!output) {
      return { system: [formattedRules] };
    }

    if (!output.system) {
      output.system = [];
    }

    output.system.push(formattedRules);
    return output;
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
