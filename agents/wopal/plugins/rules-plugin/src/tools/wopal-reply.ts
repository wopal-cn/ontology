import { tool, type ToolContext, type ToolDefinition } from "@opencode-ai/plugin"
import type { SimpleTaskManager } from "../simple-task-manager.js"
import { createDebugLog } from "../debug.js"
import { trackActivity } from "../progress-tracker.js"

const debugLog = createDebugLog("[wopal-task]", "task")

async function replyQuestion(taskId: string, manager: SimpleTaskManager, client: any, requestID: string, message: string) {
  const v2Client = manager.getV2Client()
  if (typeof v2Client?.question?.reply === "function") {
    const result = await v2Client.question.reply({
      requestID,
      answers: [[message]],
    })
    // v2 client has ThrowOnError=false by default — must check for error manually
    const resultObj = result as Record<string, unknown> | undefined
    if (resultObj?.error) {
      throw new Error(`question.reply returned error: ${JSON.stringify(resultObj.error)}`)
    }
    debugLog(`task ${taskId} resolved question via v2 client: requestID=${requestID} result=${JSON.stringify(result)}`)
    return
  }

  if (typeof client?.question?.reply === "function") {
    await client.question.reply({
      requestID,
      answers: [[message]],
    })
    return
  }

  const serverUrl = manager.getServerUrl()
  if (!serverUrl) {
    throw new Error("question.reply is unavailable")
  }

  const clientAny = manager.getClient()
  const internalFetch = (clientAny as any)?._client?.getConfig?.()?.fetch ?? globalThis.fetch

  const url = new URL(`/question/${requestID}/reply`, serverUrl)
  const response = await internalFetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      answers: [[message]],
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`question.reply fallback failed: ${response.status} ${response.statusText} — ${body}`)
  }

  debugLog(`task ${taskId} resolved question via HTTP fallback: requestID=${requestID}`)
}

export function createWopalReplyTool(manager: SimpleTaskManager): ToolDefinition {
  return tool({
    description: "Send a message to a background task to resume or redirect its execution. Works on waiting and idle (running+idleNotified) tasks.",
    args: {
      task_id: tool.schema.string().describe("The ID of the waiting task to reply to"),
      message: tool.schema.string().describe("The message to send to the background task"),
    },
    execute: async (args: { task_id: string; message: string }, context: ToolContext) => {
      const { task_id, message } = args
      debugLog(`wopal_reply called: task_id=${task_id}`)

      if (!context.sessionID) {
        return "Error: Current session ID is unavailable; cannot reply to task."
      }

      const task = manager.getTaskForParent(task_id, context.sessionID)
      if (!task) {
        return "Error: Task not found or not owned by this session"
      }

      if (task.status !== "waiting" && task.status !== "running") {
        return `Error: Task is ${task.status}. Only running and waiting tasks can receive replies.`
      }

      if (!task.sessionID) {
        return "Error: Task has no active session"
      }

      const client = manager.getClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const clientAny = client as any

      try {
        if (task.pendingQuestionID) {
          const questionID = task.pendingQuestionID
          debugLog(`resolving question deferred: requestID=${questionID}`)

          await replyQuestion(task_id, manager, clientAny, questionID, message)

          debugLog(`question resolved: requestID=${questionID}`)
          delete task.pendingQuestionID

          task.status = "running"
          delete task.waitingReason
          if (task.idleNotified) delete task.idleNotified
          trackActivity(task, "text")
          debugLog(`task ${task_id} resumed via question.reply`)

          return `Reply sent to task ${task_id}. The background task will continue execution.`
        }

        if (typeof clientAny?.session?.promptAsync !== "function") {
          return "Error: session.promptAsync is unavailable"
        }

        await clientAny.session.promptAsync({
          path: { id: task.sessionID },
          body: {
            parts: [{ type: "text", text: message }],
          },
        })

        task.status = "running"
        delete task.waitingReason
        if (task.idleNotified) delete task.idleNotified
        trackActivity(task, "text")
        debugLog(`task ${task_id} resumed`)

        return `Reply sent to task ${task_id}. The background task will continue execution.`
      } catch (err) {
        debugLog(`wopal_reply error: ${err}`)
        return `Failed to send reply: ${err instanceof Error ? err.message : String(err)}`
      }
    },
  })
}
