import type { WopalTask } from "../types.js"
import type { DebugLog } from "../debug.js"
import { toErrorMessage } from "./task-launcher.js"
import { CONTEXT_WARN_THRESHOLD } from "./task-monitor.js"

export interface SendProgressDeps {
  client: {
    session?: {
      promptAsync?: (args: {
        path: { id: string }
        body: {
          noReply?: boolean
          parts: Array<{ type: string; text: string }>
        }
      }) => Promise<void>
    }
  }
  debugLog: DebugLog
}

export async function sendProgressNotification(
  deps: SendProgressDeps,
  task: WopalTask,
  messageCount: number,
  contextUsage: number | null,
): Promise<void> {
  const { client, debugLog } = deps

  if (typeof client.session?.promptAsync !== "function") return

  let contextLine = ''
  if (contextUsage !== null) {
    const warn = contextUsage >= CONTEXT_WARN_THRESHOLD ? ' ⚠️' : ''
    contextLine = `\n**Context:** ${contextUsage}% used${warn}`
  }

  const notification = `[WOPAL TASK PROGRESS]
**ID:** \`${task.id}\`
**Description:** ${task.description}
**Progress:** ${messageCount} messages${contextLine}

Task is still running. Use \`wopal_task_output(task_id="${task.id}")\` for details.`
  // Note: noReply: false to trigger main agent response, consistent with idle/stuck notifications

  await client.session.promptAsync({
    path: { id: task.parentSessionID },
    body: {
      noReply: false,
      parts: [{ type: "text", text: notification }],
    },
  }).catch((err: unknown) => {
    debugLog(`[progressNotify] send error: ${toErrorMessage(err)}`)
  })

  debugLog(`[progressNotify] sent: taskId=${task.id} messages=${messageCount}`)
}