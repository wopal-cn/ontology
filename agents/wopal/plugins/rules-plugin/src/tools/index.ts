import type { ToolDefinition } from "@opencode-ai/plugin"
import type { SimpleTaskManager } from "../simple-task-manager.js"
import { createWopalTaskTool } from "./wopal-task.js"
import { createWopalOutputTool } from "./wopal-output.js"
import { createWopalCancelTool } from "./wopal-cancel.js"
import { createWopalReplyTool } from "./wopal-reply.js"

export function createWopalTools(manager: SimpleTaskManager): Record<string, ToolDefinition> {
  return {
    wopal_task: createWopalTaskTool(manager),
    wopal_output: createWopalOutputTool(manager),
    wopal_cancel: createWopalCancelTool(manager),
    wopal_reply: createWopalReplyTool(manager),
  }
}

export { createWopalTaskTool, createWopalOutputTool, createWopalCancelTool, createWopalReplyTool }
