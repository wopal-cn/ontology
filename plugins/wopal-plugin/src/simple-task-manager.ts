import type {
  CancelResult,
  LaunchInput,
  LaunchOutput,
  WopalTask,
} from "./types.js"
import type { DebugLog } from "./debug.js"
import type { IdleDiagnostic } from "./idle-diagnostic.js"
import { createDebugLog } from "./debug.js"
import { checkStuckTasks, clearStuckState, DEFAULT_STUCK_TIMEOUT_MS } from "./stuck-detector.js"
import { ConcurrencyManager } from "./concurrency-manager.js"
import { registerManagerForCleanup, unregisterManagerForCleanup } from "./process-cleanup.js"

const defaultManagerLog = createDebugLog("[wopal-task]", "task")

const CLEANUP_INTERVAL_MS = 600_000 // 10 minutes
const CLEANUP_MAX_AGE_MS = 3600_000 // 1 hour
const TASK_TTL_MS = 1_800_000       // 30 minutes for non-terminal tasks
const DEFAULT_CONCURRENCY_LIMIT = 5 // Default concurrent tasks
// Progress notification thresholds
const PROGRESS_NOTIFY_MESSAGE_THRESHOLD = 20  // Notify after 20 new messages
const PROGRESS_NOTIFY_TIME_THRESHOLD_MS = 180_000  // 3 minutes

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private v2Client: any
  private serverUrl?: URL
  private directory: string
  private debugLog: DebugLog
  private cleanupInterval: ReturnType<typeof setInterval> | undefined = undefined
  private tickerInterval: ReturnType<typeof setInterval> | undefined = undefined
  private concurrency = new ConcurrencyManager()
  private readonly CONCURRENCY_KEY = 'default'
  private isShuttingDown = false

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    v2Client: any,
    directory: string,
    serverUrl?: URL,
    debugLog?: DebugLog,
  ) {
    this.client = client
    this.v2Client = v2Client
    this.directory = directory
    if (serverUrl !== undefined) {
      this.serverUrl = serverUrl
    }
    this.debugLog = debugLog ?? defaultManagerLog

    // Setup automatic cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanup(CLEANUP_MAX_AGE_MS)
    }, CLEANUP_INTERVAL_MS)
    this.cleanupInterval.unref()

    // Setup stuck detection and progress notifications (every 30 seconds)
    this.tickerInterval = setInterval(() => {
      this.checkStuckTasks()
      clearStuckState(this.tasks.values())
      this.checkProgressNotifications()
    }, 30_000)
    this.tickerInterval.unref()

    // Register for process exit cleanup
    registerManagerForCleanup(this)
  }

  private unregistered = false

  /** Unregister from process cleanup (for disposal) */
  unregisterFromCleanup(): void {
    if (this.unregistered) return
    this.unregistered = true
    unregisterManagerForCleanup(this)
  }

  /** Get the working directory for this manager */
  getDirectory(): string {
    return this.directory
  }

  /** Get the client instance for external use (e.g., fetching session messages) */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getClient(): any {
    return this.client
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getV2Client(): any {
    return this.v2Client
  }

  getServerUrl(): URL | undefined {
    return this.serverUrl
  }

  /** Dispose of all timers and cleanup resources */
  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }
    this.cleanupInterval = undefined
    if (this.tickerInterval) {
      clearInterval(this.tickerInterval)
    }
    this.tickerInterval = undefined
  }

  /** Graceful shutdown: stop all tasks and cleanup */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) return
    this.isShuttingDown = true

    this.debugLog('[shutdown] initiating graceful shutdown')

    // 1. Stop all timers
    this.dispose()

    // 2. Cancel all waiting tasks in concurrency queue
    this.concurrency.clear()

    // 3. Abort all running tasks
    const runningTasks = Array.from(this.tasks.values()).filter(
      (t) => t.status === 'running'
    )

    for (const task of runningTasks) {
      this.debugLog(`[shutdown] aborting task: ${task.id}`)
      this.releaseConcurrencySlot(task)
      await this.abortSession(task.sessionID)
      task.status = 'interrupt'
      task.error = 'Shutdown: task interrupted'
      task.completedAt = new Date()
    }

    // 4. Wait for all tasks to reach terminal state (max 5 seconds)
    await this.waitForTerminalState(5000)

    this.debugLog('[shutdown] completed')
  }

  private async waitForTerminalState(timeoutMs: number): Promise<void> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const hasRunning = Array.from(this.tasks.values()).some(
        (t) => t.status === 'running'
      )
      if (!hasRunning) break
      await new Promise((r) => setTimeout(r, 100))
    }
  }

  async launch(input: LaunchInput): Promise<LaunchOutput> {
    this.debugLog(`[launch] starting: description="${input.description}" agent="${input.agent}" parentSessionID=${input.parentSessionID}`)

    // Acquire concurrency slot (non-blocking)
    if (!this.concurrency.tryAcquire(this.CONCURRENCY_KEY, DEFAULT_CONCURRENCY_LIMIT)) {
      this.debugLog(`[launch] concurrency limit reached (${DEFAULT_CONCURRENCY_LIMIT}/${DEFAULT_CONCURRENCY_LIMIT})`)
      return { ok: false, status: 'error', error: `Concurrency limit reached (${DEFAULT_CONCURRENCY_LIMIT}/${DEFAULT_CONCURRENCY_LIMIT}). Wait for running tasks to finish.` }
    }

    if (!input.parentSessionID) {
      this.debugLog(`[launch] failed: parent session ID is required`)
      return {
        ok: false,
        status: 'error',
        error: "Background task launch failed: parent session ID is required",
      }
    }

    if (typeof this.client.session?.create !== "function") {
      this.debugLog(`[launch] failed: session.create is unavailable`)
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
      concurrencyKey: this.CONCURRENCY_KEY,
    }
    this.tasks.set(taskId, task)

    try {
      const session = await this.client.session.create({
        parentID: input.parentSessionID,
        title: input.description,
      })

this.debugLog(`[launch] session.create returned: ${JSON.stringify(session)}`)
      task.sessionID = session?.data?.id ?? session?.id ?? session?.info?.id
      if (task.sessionID) {
        this.sessionToTask.set(task.sessionID, taskId)
      } else {
        const error =
          "Background task launch failed: child session did not provide an ID"

        this.failTask(task, error)
        this.debugLog(`[launch] failed: child session did not provide an ID`)
        return { ok: false, taskId, status: 'error', error }
      }
    } catch (err) {
      this.debugLog(`[launch] session.create error: ${err}`)
      const error = `Background task launch failed: ${toErrorMessage(err)}`
      this.failTask(task, error)
      return { ok: false, taskId, status: 'error', error }
    }

    if (typeof this.client.session?.promptAsync !== "function") {
      const error =
        "Background task launch failed: session.promptAsync is unavailable"
      this.debugLog(`[launch] failed: session.promptAsync is unavailable`)
      await this.abortSession(task.sessionID)
      this.failTask(task, error)
      return { ok: false, taskId, status: 'error', error }
    }

    const promptResult = this.client.session.promptAsync({
      path: { id: task.sessionID },
      body: {
        agent: input.agent,
        parts: [{ type: "text", text: input.prompt }],
        tools: {
          "wopal_task": false,  // 禁止嵌套启动新任务
          // wopal_task_output 和 wopal_task_cancel 保留可用，支持监工模式
        },
      },
    })

    if (!isPromiseLike(promptResult)) {
      const error =
        "Background task launch failed: session.promptAsync did not return a promise"
      this.debugLog(`[launch] failed: promptAsync did not return a promise`)
      await this.abortSession(task.sessionID)
      this.failTask(task, error)
      return { ok: false, taskId, status: 'error', error }
    }

    task.status = 'running'
    task.startedAt = new Date()
    task.progress = { toolCalls: 0, lastUpdate: new Date() }

    void Promise.resolve(promptResult).catch(async (err: unknown) => {
      const error = `Background task execution failed: ${toErrorMessage(err)}`
      this.debugLog(`[launch] promptAsync error for ${taskId}: ${error}`)

      if (this.failTask(task, error)) {
        await this.abortSession(task.sessionID)
      }
    })

    this.debugLog(`[launch] success: taskId=${taskId} sessionID=${task.sessionID}`)

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
      if (task) {
        this.debugLog(`[markCompleted] skipped: taskId=${task.id} status=${task.status} (not running)`)
      }
      return undefined
    }

    this.releaseConcurrencySlot(task)
    task.status = 'completed'
    task.completedAt = new Date()
    this.debugLog(`[markCompleted] taskId=${task.id} sessionID=${sessionID}`)
    return task
  }

  markTaskErrorBySession(sessionID: string, error: string): WopalTask | undefined {
    const task = this.findBySession(sessionID)
    if (!task) {
      this.debugLog(`[markError] skipped: no task found for sessionID=${sessionID}`)
      return undefined
    }

    if (!this.failTask(task, error)) {
      this.debugLog(`[markError] skipped: taskId=${task.id} status=${task.status} (already terminal)`)
      return undefined
    }

    this.debugLog(`[markError] taskId=${task.id} sessionID=${sessionID} error="${error.substring(0, 100)}"`)
    return task
  }

  markTaskWaitingBySession(sessionID: string, diagnostic: IdleDiagnostic): WopalTask | undefined {
    const task = this.findBySession(sessionID)
    if (!task || task.status !== 'running') {
      return undefined
    }

    // 注意：waiting 状态不释放 concurrency slot，因为任务可能恢复
    task.status = 'waiting'
    task.waitingReason = diagnostic.reason
    if (diagnostic.lastMessage !== undefined) {
      task.lastAssistantMessage = diagnostic.lastMessage
    }
    this.debugLog(`[markWaiting] taskId=${task.id} sessionID=${sessionID} reason=${diagnostic.reason}`)
    return task
  }

  async cancel(id: string, parentSessionID: string): Promise<CancelResult> {
    const task = this.getTaskForParent(id, parentSessionID)
    if (!task) {
      this.debugLog(`[cancel] failed: taskId=${id} not found or ownership mismatch`)
      return 'not_found'
    }
    if (task.status !== 'running' && task.status !== 'waiting' && task.status !== 'pending') {
      this.debugLog(`[cancel] failed: taskId=${id} status=${task.status}`)
      return 'not_running'
    }

    // 先设置状态，防止 abort 触发 session.idle 导致的竞态
    this.releaseConcurrencySlot(task)
    task.status = 'cancelled'
    task.completedAt = new Date()

    if (task.sessionID) {
      try {
        await this.client.session.abort({
          path: { id: task.sessionID },
        })
      } catch (err) {
        // Ignore abort errors - task already marked as cancelled
      }
    }

    this.debugLog(`[cancel] taskId=${id}`)
    return 'cancelled'
  }

  async complete(id: string, parentSessionID: string): Promise<'completed' | 'not_found' | 'not_running'> {
    const task = this.getTaskForParent(id, parentSessionID)
    if (!task) {
      this.debugLog(`[complete] failed: taskId=${id} not found or ownership mismatch`)
      return 'not_found'
    }
    if (task.status !== 'running') {
      this.debugLog(`[complete] failed: taskId=${id} status=${task.status}`)
      return 'not_running'
    }

    // Restore concurrencyKey from waitingConcurrencyKey if present (idle case)
    if (task.waitingConcurrencyKey) {
      task.concurrencyKey = task.waitingConcurrencyKey
      delete task.waitingConcurrencyKey
    }
    this.releaseConcurrencySlot(task)
    task.status = 'completed'
    task.completedAt = new Date()

    this.debugLog(`[complete] taskId=${id}`)
    return 'completed'
  }

  async notifyParent(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId)
    if (!task || !task.sessionID) return

    const statusText = task.idleNotified ? 'IDLE' : task.status.toUpperCase()
    const notification = `<system-reminder>
[WOPAL TASK ${statusText}]
**ID:** \`${task.id}\`
**Description:** ${task.description}
${task.error ? `**Error:** ${task.error}` : ''}

Use \`wopal_task_output(task_id="${task.id}")\` to retrieve the result.
</system-reminder>`

    if (typeof this.client.session?.promptAsync !== "function") {
      this.debugLog("[notifyParent] skipped: session.promptAsync unavailable")
      return
    }

    await this.client.session.promptAsync({
      path: { id: task.parentSessionID },
      body: {
        noReply: false,
        parts: [{ type: "text", text: notification, synthetic: true }],
      },
    }).catch((err: unknown) => {
      this.debugLog(
        `[notifyParent] error: ${toErrorMessage(err)}`,
      )
    })

    this.debugLog(`[notifyParent] success: taskId=${taskId}`)
  }

  private async checkProgressNotifications(): Promise<void> {
    const runningTasks = Array.from(this.tasks.values()).filter(t => t.status === 'running' && !t.idleNotified)
    
    for (const task of runningTasks) {
      if (!task.sessionID) continue
      
      try {
        const messagesResult = await this.client.session?.messages?.({
          path: { id: task.sessionID },
        })
        
        if (!messagesResult?.data) continue
        
        const messageCount = messagesResult.data.length
        const now = new Date()
        const lastNotifyCount = task.lastNotifyMessageCount ?? 0
        
        // 用 startedAt 作为第一次通知的时间基准
        const referenceTime = lastNotifyCount > 0 
          ? (task.lastNotifyTime?.getTime() ?? 0)
          : (task.startedAt?.getTime() ?? 0)
        const messageDelta = messageCount - lastNotifyCount
        const timeDelta = now.getTime() - referenceTime
        
        if (messageDelta >= PROGRESS_NOTIFY_MESSAGE_THRESHOLD || 
            (referenceTime > 0 && timeDelta >= PROGRESS_NOTIFY_TIME_THRESHOLD_MS)) {
          await this.sendProgressNotification(task, messageCount)
          task.lastNotifyMessageCount = messageCount
          task.lastNotifyTime = now
        }
      } catch (err) {
        this.debugLog(`[progressNotify] error for ${task.id}: ${toErrorMessage(err)}`)
      }
    }
  }

  private async sendProgressNotification(task: WopalTask, messageCount: number): Promise<void> {
    if (typeof this.client.session?.promptAsync !== "function") return

    const notification = `<system-reminder>
[WOPAL TASK PROGRESS]
**ID:** \`${task.id}\`
**Description:** ${task.description}
**Progress:** ${messageCount} messages

Task is still running. Use \`wopal_task_output(task_id="${task.id}")\` for details.
</system-reminder>`

    await this.client.session.promptAsync({
      path: { id: task.parentSessionID },
      body: {
        noReply: true,
        parts: [{ type: "text", text: notification, synthetic: true }],
      },
    }).catch((err: unknown) => {
      this.debugLog(`[progressNotify] send error: ${toErrorMessage(err)}`)
    })

    this.debugLog(`[progressNotify] sent: taskId=${task.id} messages=${messageCount}`)
  }

  cleanup(maxAgeMs = 3600_000): void {
    const now = Date.now()
    let cleanedCount = 0

    for (const [id, task] of this.tasks) {
      // Terminal tasks: remove after maxAgeMs
      if (['completed', 'error', 'cancelled', 'interrupt'].includes(task.status)) {
        if (task.completedAt && now - task.completedAt.getTime() > maxAgeMs) {
          this.tasks.delete(id)
          if (task.sessionID) {
            this.sessionToTask.delete(task.sessionID)
          }
          cleanedCount++
        }
        continue
      }

      // Non-terminal tasks: check for TTL timeout
      const timestamp = task.status === 'pending'
        ? task.createdAt?.getTime()
        : task.startedAt?.getTime()

      if (timestamp && now - timestamp > TASK_TTL_MS) {
        this.releaseConcurrencySlot(task)
        this.tasks.delete(id)
        if (task.sessionID) {
          this.sessionToTask.delete(task.sessionID)
        }
        cleanedCount++
        this.debugLog(`[cleanup] pruned stale ${task.status} task: ${id}`)
      }
    }

    if (cleanedCount > 0) {
      this.debugLog(`[cleanup] removed ${cleanedCount} old task(s)`)
    }
  }

  private failTask(task: WopalTask, error: string): boolean {
    if (['completed', 'cancelled', 'error', 'interrupt'].includes(task.status)) {
      this.debugLog(`[failTask] skipped: taskId=${task.id} status=${task.status} (already terminal)`)
      return false
    }

    this.releaseConcurrencySlot(task)
    task.status = 'error'
    task.error = error
    task.completedAt = task.completedAt ?? new Date()
    this.debugLog(`[failTask] taskId=${task.id} error="${error.substring(0, 100)}"`)
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
        `[abortSession] error for ${sessionID}: ${toErrorMessage(err)}`,
      )
}
  }

  public releaseConcurrencySlot(task: WopalTask): void {
    if (task.concurrencyKey) {
      this.concurrency.release(task.concurrencyKey)
      task.concurrencyKey = undefined
    }
  }

  private async checkStuckTasks(): Promise<void> {
    const results = checkStuckTasks({
      tasks: this.tasks.values(),
      config: { stuckTimeoutMs: DEFAULT_STUCK_TIMEOUT_MS },
    })

    for (const { task, durationMs } of results) {
      const durationSeconds = Math.floor(durationMs / 1000)
      const durationMinutes = Math.floor(durationSeconds / 60)
      const durationText = durationMinutes >= 1
        ? `${durationMinutes}min ${durationSeconds % 60}s`
        : `${durationSeconds}s`

      task.stuckNotified = true
      task.stuckNotifiedAt = new Date()

      this.debugLog(`[stuck] detected: taskId=${task.id} duration=${durationText}`)
      await this.notifyParentStuck(task, durationText)
    }
  }

  async notifyParentStuck(task: WopalTask, durationText: string): Promise<void> {
    if (!task.sessionID) return

    const notification = `<system-reminder>
[WOPAL TASK STUCK]
**ID:** \`${task.id}\`
**Description:** ${task.description}
**Duration:** No meaningful output for ${durationText}

The background task may be stuck in a reasoning loop. Use \`wopal_task_output(task_id="${task.id}", section="reasoning")\` to check its thinking content. If it's truly stuck, use \`wopal_task_cancel(task_id="${task.id}")\` to terminate it.
</system-reminder>`

    if (typeof this.client.session?.promptAsync !== "function") {
      this.debugLog("[notifyParentStuck] skipped: session.promptAsync unavailable")
      return
    }

    await this.client.session.promptAsync({
      path: { id: task.parentSessionID },
      body: {
        noReply: false,
        parts: [{ type: "text", text: notification, synthetic: true }],
      },
    }).catch((err: unknown) => {
      this.debugLog(`[notifyParentStuck] error: ${toErrorMessage(err)}`)
    })

    this.debugLog(`[notifyParentStuck] sent: taskId=${task.id} duration=${durationText}`)
  }
}
