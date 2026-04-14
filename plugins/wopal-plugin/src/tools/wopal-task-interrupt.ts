import { tool, type ToolContext, type ToolDefinition } from "@opencode-ai/plugin"
import type { SimpleTaskManager } from "../simple-task-manager.js"

export function createWopalInterruptTool(manager: SimpleTaskManager): ToolDefinition {
  return tool({
    description: "Interrupt a running task by aborting its session. The task remains in 'running' state and can be resumed via wopal_task_reply.",
    args: {
      task_id: tool.schema.string().describe("Task ID to interrupt"),
    },
    execute: async (args: { task_id: string }, context: ToolContext) => {
      if (!context.sessionID) {
        return "Current session ID is unavailable; cannot interrupt task."
      }

      const interrupted = await manager.interrupt(args.task_id, context.sessionID)

      if (interrupted === 'interrupted') {
        return `Task ${args.task_id} interrupted. The session was aborted but task remains running. Use wopal_task_reply to resume.`
      }

      if (interrupted === 'not_running') {
        return `Failed to interrupt ${args.task_id}: task is not running.`
      }

      return `Task not found for current session: ${args.task_id}`
    },
  })
}

// Legacy alias for backward compatibility
export const createWopalCancelTool = createWopalInterruptTool
