import type { ToolDefinition } from "@opencode-ai/plugin"
import type { SimpleTaskManager } from "../simple-task-manager.js"
import type { MemoryStore } from "../memory/store.js"
import type { EmbeddingClient } from "../memory/embedder.js"
import { createWopalTaskTool } from "./wopal-task.js"
import { createWopalOutputTool } from "./wopal-output.js"
import { createWopalCancelTool } from "./wopal-cancel.js"
import { createWopalReplyTool } from "./wopal-reply.js"
import { createMemoryManageTool } from "./memory-manage.js"

export function createWopalTools(manager: SimpleTaskManager, store?: MemoryStore, embedder?: EmbeddingClient): Record<string, ToolDefinition> {
  const tools: Record<string, ToolDefinition> = {
    wopal_task: createWopalTaskTool(manager),
    wopal_output: createWopalOutputTool(manager),
    wopal_cancel: createWopalCancelTool(manager),
    wopal_reply: createWopalReplyTool(manager),
  }

  if (store) {
    tools.memory_manage = createMemoryManageTool(store, embedder)
  }

  return tools
}

export { createWopalTaskTool, createWopalOutputTool, createWopalCancelTool, createWopalReplyTool, createMemoryManageTool }
