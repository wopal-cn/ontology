import type { ToolDefinition } from "@opencode-ai/plugin"
import type { SimpleTaskManager } from "../simple-task-manager.js"
import type { MemoryStore } from "../memory/store.js"
import type { EmbeddingClient } from "../memory/embedder.js"
import type { SessionStore } from "../session-store.js"
import { createWopalTaskTool } from "./wopal-task.js"
import { createWopalOutputTool } from "./wopal-task-output.js"
import { createWopalCancelTool } from "./wopal-task-cancel.js"
import { createWopalReplyTool } from "./wopal-task-reply.js"
import { createWopalTaskDiffTool } from "./wopal-task-diff.js"
import { createMemoryManageTool } from "./memory-manage.js"

export function createWopalTools(manager: SimpleTaskManager, store?: MemoryStore, embedder?: EmbeddingClient, sessionStore?: SessionStore): Record<string, ToolDefinition> {
  const tools: Record<string, ToolDefinition> = {
    wopal_task: createWopalTaskTool(manager),
    wopal_task_output: createWopalOutputTool(manager),
    wopal_task_cancel: createWopalCancelTool(manager),
    wopal_task_reply: createWopalReplyTool(manager),
    wopal_task_diff: createWopalTaskDiffTool(manager),
  }

  if (store) {
    tools.memory_manage = createMemoryManageTool(store, embedder, sessionStore)
  }

  return tools
}

export { createWopalTaskTool, createWopalOutputTool, createWopalCancelTool, createWopalReplyTool, createWopalTaskDiffTool, createMemoryManageTool }
