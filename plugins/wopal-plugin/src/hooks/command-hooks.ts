import { normalizeContextPath } from "./message-context.js";
import type { SessionStore } from "../session-store.js";
import type { DebugLog } from "../debug.js";

interface CommandExecuteBeforeInput {
  command: string;
  sessionID: string;
  arguments: string;
}

interface CommandExecuteBeforeOutput {
  parts: Array<{ type?: string; text?: string; synthetic?: boolean }>;
}

interface ToolExecuteBeforeInput {
  tool?: string;
  sessionID?: string;
  callID?: string;
}

interface ToolExecuteBeforeOutput {
  args?: Record<string, unknown>;
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

export interface CommandHookContext {
  sessionStore: SessionStore;
  debugLog: DebugLog;
  projectDirectory: string;
}

export function createCommandHooks(ctx: CommandHookContext) {
  async function onToolDefinition(
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

  async function onCommandExecuteBefore(
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

  async function onToolExecuteBefore(
    input: ToolExecuteBeforeInput,
    output: ToolExecuteBeforeOutput,
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
        ctx.sessionStore.recordSkillLoaded(sessionID, skillName);
        ctx.debugLog(`Recorded loaded skill: ${skillName} for session ${sessionID}`);
      }
    }

    if (filePath) {
      const normalized = normalizeContextPath(filePath, ctx.projectDirectory);
      ctx.sessionStore.upsert(sessionID, (state) => {
        state.contextPaths.add(normalized);
      });

      ctx.debugLog(
        `Recorded context path from tool ${toolName}: ${normalized}`,
      );
    }
  }

  async function onToolExecuteAfter(
    _input: ToolExecuteAfterInput,
    _output: ToolExecuteAfterOutput,
  ): Promise<void> {
    // No-op: memory_manage echo handled via tool return string
  }

  return {
    "command.execute.before": onCommandExecuteBefore,
    "tool.execute.before": onToolExecuteBefore,
    "tool.execute.after": onToolExecuteAfter,
    "tool.definition": onToolDefinition,
  };
}