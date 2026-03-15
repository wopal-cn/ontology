import { tool, type ToolContext, type ToolDefinition } from "@opencode-ai/plugin"
import type { SimpleTaskManager } from "../simple-task-manager.js"

export function createWopalOutputTool(manager: SimpleTaskManager): ToolDefinition {
  return tool({
    description: "Get lifecycle status for a background task owned by the current session",
    args: {
      task_id: tool.schema.string().describe("Task ID returned by wopal_task"),
    },
    execute: async (args: { task_id: string }, context: ToolContext) => {
      if (!context.sessionID) {
        return "Current session ID is unavailable; cannot read task status."
      }

      const task = manager.getTaskForParent(args.task_id, context.sessionID)

      if (!task) {
        return `Task not found for current session: ${args.task_id}`
      }

      let result = `**Task:** ${task.id}\n`
      result += `**Status:** ${task.status}\n`
      result += `**Description:** ${task.description}\n`
      result += `**Agent:** ${task.agent}\n`

      if (task.status === 'completed') {
        result += `\nTask completed at ${task.completedAt?.toISOString()}`
        result += `\n\nResult retrieval is not supported by this tool.`
      } else if (task.status === 'error') {
        result += `\nError: ${task.error}`
      } else if (task.status === 'running') {
        result += `\nTask is still running.`
      } else if (task.status === 'cancelled') {
        result += `\nTask was cancelled at ${task.completedAt?.toISOString()}`
      }

      return result
    },
  })
}
