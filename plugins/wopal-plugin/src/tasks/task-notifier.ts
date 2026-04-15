import type { WopalTask } from "../types.js"
import type { DebugLog } from "../debug.js"
import { toErrorMessage } from "./task-launcher.js"

export interface TaskNotifierDeps {
  client: {
    session?: {
      promptAsync?: (args: {
        path: { id: string }
        body: {
          noReply?: boolean
          parts: Array<{ type: string; text: string; synthetic?: boolean }>
        }
      }) => Promise<void>
    }
  }
  debugLog: DebugLog
}

export async function notifyParent(
  deps: TaskNotifierDeps,
  task: WopalTask,
): Promise<void> {
  const { client, debugLog } = deps

  if (!task.sessionID) return

  const statusText = task.idleNotified ? 'IDLE' : task.status.toUpperCase()
  const notification = `<system-reminder>
[WOPAL TASK ${statusText}]
**ID:** \`${task.id}\`
**Description:** ${task.description}
${task.error ? `**Error:** ${task.error}` : ''}

Use \`wopal_task_output(task_id="${task.id}")\` to retrieve the result.
</system-reminder>`

  if (typeof client.session?.promptAsync !== "function") {
    debugLog("[notifyParent] skipped: session.promptAsync unavailable")
    return
  }

  await client.session.promptAsync({
    path: { id: task.parentSessionID },
    body: {
      noReply: false,
      parts: [{ type: "text", text: notification, synthetic: true }],
    },
  }).catch((err: unknown) => {
    debugLog(`[notifyParent] error: ${toErrorMessage(err)}`)
  })

  debugLog(`[notifyParent] success: taskId=${task.id}`)
}

export async function notifyParentStuck(
  deps: TaskNotifierDeps,
  task: WopalTask,
  durationText: string,
): Promise<void> {
  const { client, debugLog } = deps

  if (!task.sessionID) return

  const notification = `<system-reminder>
[WOPAL TASK STUCK]
**ID:** \`${task.id}\`
**Description:** ${task.description}
**Duration:** No meaningful output for ${durationText}

The background task may be stuck in a reasoning loop. Use \`wopal_task_output(task_id="${task.id}", section="reasoning")\` to check its thinking content. If it's truly stuck, use \`wopal_task_cancel(task_id="${task.id}")\` to terminate it.
</system-reminder>`

  if (typeof client.session?.promptAsync !== "function") {
    debugLog("[notifyParentStuck] skipped: session.promptAsync unavailable")
    return
  }

  await client.session.promptAsync({
    path: { id: task.parentSessionID },
    body: {
      noReply: false,
      parts: [{ type: "text", text: notification, synthetic: true }],
    },
  }).catch((err: unknown) => {
    debugLog(`[notifyParentStuck] error: ${toErrorMessage(err)}`)
  })

  debugLog(`[notifyParentStuck] sent: taskId=${task.id} duration=${durationText}`)
}