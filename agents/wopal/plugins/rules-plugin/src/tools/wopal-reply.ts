import { tool, type ToolContext, type ToolDefinition } from "@opencode-ai/plugin"
import type { SimpleTaskManager } from "../simple-task-manager.js"
import { createDebugLog } from "../debug.js"

const debugLog = createDebugLog("[wopal-task]", "task")

export function createWopalReplyTool(manager: SimpleTaskManager): ToolDefinition {
  return tool({
    description:
      "Send a message to a waiting background task to resume its execution. Use when a background task is waiting for your input.",
    args: {
      task_id: tool.schema.string().describe("The ID of the waiting task to reply to"),
      message: tool.schema.string().describe("The message to send to the background task"),
    },
    execute: async (args: { task_id: string; message: string }, context: ToolContext): Promise<string> => {
      const { task_id, message } = args
      debugLog(`wopal_reply called: task_id=${task_id}`)

      if (!context.sessionID) {
        return JSON.stringify({ error: "Current session ID is unavailable; cannot reply to task." })
      }

      // Verify task exists and belongs to current parent session
      const task = manager.getTaskForParent(task_id, context.sessionID)
      if (!task) {
        return JSON.stringify({ error: "Task not found or not owned by this session" })
      }

      // Verify task status is waiting
      if (task.status !== "waiting") {
        return JSON.stringify({ error: `Task is ${task.status}, not waiting. Only waiting tasks can receive replies.` })
      }

      // Verify task has sessionID
      if (!task.sessionID) {
        return JSON.stringify({ error: "Task has no active session" })
      }

      // Get client
      const client = manager.getClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const clientAny = client as any

      if (typeof clientAny?.session?.promptAsync !== "function") {
        return JSON.stringify({ error: "session.promptAsync is unavailable" })
      }

      try {
        // Inject message into child session
        await clientAny.session.promptAsync({
          path: { id: task.sessionID },
          body: {
            parts: [{ type: "text", text: message }],
          },
        })

        // Reset task status to running
        task.status = "running"
        delete task.waitingReason
        debugLog(`task ${task_id} resumed`)

        return JSON.stringify({
          success: true,
          message: `Reply sent to task ${task_id}. The background task will continue execution.`,
        })
      } catch (err) {
        debugLog(`wopal_reply error: ${err}`)
        return JSON.stringify({ error: `Failed to send reply: ${err instanceof Error ? err.message : String(err)}` })
      }
    },
  })
}