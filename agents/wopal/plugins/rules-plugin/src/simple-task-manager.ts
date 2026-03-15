import type {
  CancelResult,
  LaunchInput,
  LaunchOutput,
  WopalTask,
} from "./types.js"
import type { DebugLog } from "./debug.js"
import { createDebugLog } from "./debug.js"

const defaultManagerLog = createDebugLog("[wopal-task]")

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (typeof error === "string" && error.length > 0) {
    return error
  }

  try {
    const serialized = JSON.stringify(error)
    if (serialized && serialized !== "{}") {
      return serialized
    }
  } catch {
    // Ignore JSON serialization failures and fall back to String().
  }

  return String(error)
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return typeof value === "object" && value !== null && "then" in value
}

export class SimpleTaskManager {
  private tasks = new Map<string, WopalTask>()
  private sessionToTask = new Map<string, string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private client: any
  private directory: string
  private debugLog: DebugLog

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client: any,
    directory: string,
    debugLog?: DebugLog,
  ) {
    this.client = client
    this.directory = directory
    this.debugLog = debugLog ?? defaultManagerLog
  }

  /** Get the working directory for this manager */
  getDirectory(): string {
    return this.directory
  }

  async launch(input: LaunchInput): Promise<LaunchOutput> {
    if (!input.parentSessionID) {
      return {
        ok: false,
        status: 'error',
        error: "Background task launch failed: parent session ID is required",
      }
    }

    if (typeof this.client.session?.create !== "function") {
      return {
        ok: false,
        status: 'error',
        error: "Background task launch failed: session.create is unavailable",
      }
    }

    const taskId = `wopal-task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    const task: WopalTask = {
      id: taskId,
      status: 'pending',
      description: input.description,
      agent: input.agent,
      prompt: input.prompt,
      parentSessionID: input.parentSessionID,
      createdAt: new Date(),
    }
    this.tasks.set(taskId, task)

    try {
      const session = await this.client.session.create({
        parentID: input.parentSessionID,
        title: input.description,
      })

this.debugLog(`[SimpleTaskManager] session.create returned: ${JSON.stringify(session)}`)
      task.sessionID = session?.data?.id ?? session?.id ?? session?.info?.id
      if (task.sessionID) {
        this.sessionToTask.set(task.sessionID, taskId)
      } else {
        const error =
          "Background task launch failed: child session did not provide an ID"

        this.failTask(task, error)
        return { ok: false, taskId, status: 'error', error }
      }
    } catch (err) {
      this.debugLog(`[SimpleTaskManager] session.create error: ${err}`)
      const error = `Background task launch failed: ${toErrorMessage(err)}`
      this.failTask(task, error)
      return { ok: false, taskId, status: 'error', error }
    }

    if (typeof this.client.session?.promptAsync !== "function") {
      const error =
        "Background task launch failed: session.promptAsync is unavailable"

      await this.abortSession(task.sessionID)
      this.failTask(task, error)
      return { ok: false, taskId, status: 'error', error }
    }

    const promptResult = this.client.session.promptAsync({
      path: { id: task.sessionID },
      body: {
        agent: input.agent,
        parts: [{ type: "text", text: input.prompt }],
      },
    })

    if (!isPromiseLike(promptResult)) {
      const error =
        "Background task launch failed: session.promptAsync did not return a promise"

      await this.abortSession(task.sessionID)
      this.failTask(task, error)
      return { ok: false, taskId, status: 'error', error }
    }

    task.status = 'running'

    void Promise.resolve(promptResult).catch(async (err: unknown) => {
      const error = `Background task execution failed: ${toErrorMessage(err)}`
      this.debugLog(`[SimpleTaskManager] promptAsync error for ${taskId}: ${error}`)

      if (this.failTask(task, error)) {
        await this.abortSession(task.sessionID)
      }
    })

    this.debugLog(`[SimpleTaskManager] launched task ${taskId} with session ${task.sessionID}`)

    return { ok: true, taskId, status: 'running' }
  }

  getTask(id: string): WopalTask | undefined {
    return this.tasks.get(id)
  }

  getTaskForParent(id: string, parentSessionID: string): WopalTask | undefined {
    const task = this.tasks.get(id)
    if (!task || task.parentSessionID !== parentSessionID) {
      return undefined
    }

    return task
  }

  findBySession(sessionID: string): WopalTask | undefined {
    const taskId = this.sessionToTask.get(sessionID)
    if (!taskId) return undefined
    return this.tasks.get(taskId)
  }

  markTaskCompletedBySession(sessionID: string): WopalTask | undefined {
    const task = this.findBySession(sessionID)
    if (!task || task.status !== 'running') {
      return undefined
    }

    task.status = 'completed'
    task.completedAt = new Date()
    return task
  }

  markTaskErrorBySession(sessionID: string, error: string): WopalTask | undefined {
    const task = this.findBySession(sessionID)
    if (!task) {
      return undefined
    }

    if (!this.failTask(task, error)) {
      return undefined
    }

    return task
  }

  async cancel(id: string, parentSessionID: string): Promise<CancelResult> {
    const task = this.getTaskForParent(id, parentSessionID)
    if (!task) return 'not_found'
    if (task.status !== 'running') return 'not_running'

    if (task.sessionID) {
      if (typeof this.client.session?.abort === "function") {
        try {
          await this.client.session.abort({
            path: { id: task.sessionID },
          })
        } catch (err) {
          this.debugLog(
            `[SimpleTaskManager] abort error for ${id}: ${toErrorMessage(err)}`,
          )
          return 'abort_failed'
        }
      }
    }

    if (task.status !== 'running') return 'not_running'

    task.status = 'cancelled'
    task.completedAt = new Date()
    return 'cancelled'
  }

  async notifyParent(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task || !task.sessionID) return

    const statusText = task.status.toUpperCase()
    const notification = `<system-reminder>
[WOPAL TASK ${statusText}]
**ID:** \`${task.id}\`
**Description:** ${task.description}
${task.error ? `**Error:** ${task.error}` : ''}

Use \`wopal_output(task_id="${task.id}")\` to check task status.
Result retrieval is not supported by this tool.
</system-reminder>`

    if (typeof this.client.session?.promptAsync !== "function") {
      this.debugLog("[SimpleTaskManager] notifyParent skipped: session.promptAsync unavailable")
      return
    }

    await this.client.session.promptAsync({
      path: { id: task.parentSessionID },
      body: {
        noReply: true,
        parts: [{ type: "text", text: notification }],
      },
    }).catch((err: unknown) => {
      this.debugLog(
        `[SimpleTaskManager] notifyParent error: ${toErrorMessage(err)}`,
      )
    })

    this.debugLog(`[SimpleTaskManager] notified parent for task ${taskId}`)
  }

  cleanup(maxAgeMs = 3600_000): void {
    const now = Date.now()
    for (const [id, task] of this.tasks) {
      if (task.completedAt && now - task.completedAt.getTime() > maxAgeMs) {
        this.tasks.delete(id)
        if (task.sessionID) {
          this.sessionToTask.delete(task.sessionID)
        }
      }
    }
  }

  private failTask(task: WopalTask, error: string): boolean {
    if (task.status === 'completed' || task.status === 'cancelled') {
      return false
    }

    task.status = 'error'
    task.error = error
    task.completedAt = task.completedAt ?? new Date()
    return true
  }

  private async abortSession(sessionID: string | undefined): Promise<void> {
    if (!sessionID || typeof this.client.session?.abort !== "function") {
      return
    }

    try {
      await this.client.session.abort({
        path: { id: sessionID },
      })
    } catch (err) {
      this.debugLog(
        `[SimpleTaskManager] cleanup abort error for ${sessionID}: ${toErrorMessage(err)}`,
      )
    }
  }
}
