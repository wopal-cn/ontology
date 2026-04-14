import { tool, type ToolContext, type ToolDefinition } from "@opencode-ai/plugin"
import type { SimpleTaskManager } from "../tasks/simple-task-manager.js"
import { createDebugLog } from "../debug.js"

const debugLog = createDebugLog("[wopal-task]", "task")

export function createWopalTaskDiffTool(manager: SimpleTaskManager): ToolDefinition {
  return tool({
    description: "Show file changes made by a background task. More token-efficient than wopal_task_output for verifying code changes.",
    args: {
      task_id: tool.schema.string().describe("Task ID to check file changes for"),
    },
    execute: async (args: { task_id: string }, context: ToolContext) => {
      if (!context.sessionID) {
        return "Current session ID is unavailable; cannot check diff."
      }

      const { task_id } = args
      const task = manager.getTaskForParent(task_id, context.sessionID)
      if (!task) {
        return `Task not found for current session: ${task_id}`
      }

      if (!task.sessionID) {
        return "Task has no active session; cannot retrieve diff."
      }

      const v2Client = manager.getV2Client()
      if (typeof v2Client?.session?.diff !== "function") {
        return "File diff is unavailable (session.diff not supported). Use wopal_task_output to check the task output instead."
      }

      try {
        const result = await v2Client.session.diff({
          query: { sessionID: task.sessionID },
        })

        const diffs = (result as any)?.data ?? result
        if (!Array.isArray(diffs) || diffs.length === 0) {
          return "No file changes in this task."
        }

        let output = `**File changes for task ${task.id}:**\n\n`
        let totalAdditions = 0
        let totalDeletions = 0

        for (const diff of diffs) {
          const status = diff.status ?? "modified"
          const icon = status === "added" ? "+" : status === "deleted" ? "-" : "~"
          output += `[${icon}] ${diff.file} (+${diff.additions}/-${diff.deletions})\n`
          totalAdditions += diff.additions ?? 0
          totalDeletions += diff.deletions ?? 0
        }

        output += `\nTotal: ${diffs.length} files changed, +${totalAdditions}/-${totalDeletions} lines`
        return output
      } catch (err) {
        debugLog(`[diff] error: ${err instanceof Error ? err.message : String(err)}`)
        return `Failed to retrieve diff: ${err instanceof Error ? err.message : String(err)}`
      }
    },
  })
}