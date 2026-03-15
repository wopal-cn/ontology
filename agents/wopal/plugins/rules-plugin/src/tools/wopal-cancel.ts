import { tool, type ToolContext, type ToolDefinition } from "@opencode-ai/plugin"
import type { SimpleTaskManager } from "../simple-task-manager.js"

export function createWopalCancelTool(manager: SimpleTaskManager): ToolDefinition {
  return tool({
    description: "Cancel a running background task owned by the current session",
    args: {
      task_id: tool.schema.string().describe("Task ID to cancel"),
    },
    execute: async (args: { task_id: string }, context: ToolContext) => {
      if (!context.sessionID) {
        return "Current session ID is unavailable; cannot cancel task."
      }

      const cancelled = await manager.cancel(args.task_id, context.sessionID)

      if (cancelled === 'cancelled') {
        return `Task ${args.task_id} cancelled.`
      }

      if (cancelled === 'abort_failed') {
        return `Failed to cancel ${args.task_id}: backend abort request failed.`
      }

      if (cancelled === 'not_running') {
        return `Failed to cancel ${args.task_id}: task is not running.`
      }

      return `Task not found for current session: ${args.task_id}`
    },
  })
}
