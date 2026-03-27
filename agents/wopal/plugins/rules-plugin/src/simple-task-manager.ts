import type {
  CancelResult,
  LaunchInput,
  LaunchOutput,
  WopalTask,
} from "./types.js"
import type { DebugLog } from "./debug.js"
import type { IdleDiagnostic } from "./idle-diagnostic.js"
import { createDebugLog } from "./debug.js"
import {
  checkAndInterruptStaleTasks,
  DEFAULT_STALE_TIMEOUT_MS,
  DEFAULT_MESSAGE_STALENESS_TIMEOUT_MS,
  MIN_RUNTIME_BEFORE_STALE_MS,
} from "./stale-detector.js"
import { ConcurrencyManager } from "./concurrency-manager.js"
import { registerManagerForCleanup, unregisterManagerForCleanup } from "./process-cleanup.js"

const defaultManagerLog = createDebugLog("[wopal-task]", "task")

const DEFAULT_TIMEOUT_MS = 300_000  // 5 minutes
const MAX_TIMEOUT_MS = 3_600_000    // 1 hour
const CLEANUP_INTERVAL_MS = 600_000 // 10 minutes
const CLEANUP_MAX_AGE_MS = 3600_000 // 1 hour
const TASK_TTL_MS = 1_800_000       // 30 minutes for non-terminal tasks
const DEFAULT_CONCURRENCY_LIMIT = 3 // Default concurrent tasks
const MAX_STALE_TIMEOUT_MS = 1_800_000 // 30 minutes
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
  private directory: string
  private debugLog: DebugLog
  private timeoutTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private cleanupInterval: ReturnType<typeof setInterval> | undefined = undefined
  private staleCheckInterval: ReturnType<typeof setInterval> | undefined = undefined
  private concurrency = new ConcurrencyManager()
  private readonly CONCURRENCY_KEY = 'default'
  private isShuttingDown = false

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client: any,
    directory: string,
    debugLog?: DebugLog,
  ) {
    this.client = client
    this.directory = directory
    this.debugLog = debugLog ?? defaultManagerLog

    // Setup automatic cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanup(CLEANUP_MAX_AGE_MS)
    }, CLEANUP_INTERVAL_MS)
    this.cleanupInterval.unref()

    // Setup stale task detection (every 30 seconds)
    this.staleCheckInterval = setInterval(() => {
      checkAndInterruptStaleTasks({
        tasks: this.tasks.values(),
        config: {
          staleTimeoutMs: DEFAULT_STALE_TIMEOUT_MS,
          messageStalenessMs: DEFAULT_MESSAGE_STALENESS_TIMEOUT_MS,
          minRuntimeBeforeStaleMs: MIN_RUNTIME_BEFORE_STALE_MS,
        },
        onStale: (task, reason) => this.interruptStaleTask(task, reason),
      })
      // Also check for progress notifications
      this.checkProgressNotifications()
    }, 30_000)
    this.staleCheckInterval.unref()

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

  /** Dispose of all timers and cleanup resources */
  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }
    this.cleanupInterval = undefined
    if (this.staleCheckInterval) {
      clearInterval(this.staleCheckInterval)
    }
    this.staleCheckInterval = undefined
    for (const timer of this.timeoutTimers.values()) {
      clearTimeout(timer)
    }
    this.timeoutTimers.clear()
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
    this.debugLog(`[launch] starting: description="${input.description}" agent="${input.agent}" timeout=${input.timeout ?? 300}s parentSessionID=${input.parentSessionID}`)

    // Acquire concurrency slot first
    try {
      await this.concurrency.acquire(this.CONCURRENCY_KEY, DEFAULT_CONCURRENCY_LIMIT)
    } catch (err) {
      this.debugLog(`[launch] concurrency acquire failed: ${err}`)
      return { ok: false, status: 'error', error: 'Concurrency queue cancelled' }
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
      timeoutMs: Math.min(
        (input.timeout ?? DEFAULT_TIMEOUT_MS / 1000) * 1000,
        MAX_TIMEOUT_MS
      ),
      staleTimeoutMs: input.staleTimeout
        ? Math.min(input.staleTimeout * 1000, MAX_STALE_TIMEOUT_MS)
        : undefined,
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
          // wopal_output 和 wopal_cancel 保留可用，支持监工模式
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
    this.scheduleTimeoutCheck(task.id, task.timeoutMs ?? DEFAULT_TIMEOUT_MS)

    void Promise.resolve(promptResult).catch(async (err: unknown) => {
      const error = `Background task execution failed: ${toErrorMessage(err)}`
      this.debugLog(`[launch] promptAsync error for ${taskId}: ${error}`)

      if (this.failTask(task, error)) {
        await this.abortSession(task.sessionID)
      }
    })

    this.debugLog(`[launch] success: taskId=${taskId} sessionID=${task.sessionID} timeoutMs=${task.timeoutMs}`)

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

    this.clearTimeoutTimer(task.id)
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

    this.clearTimeoutTimer(task.id)
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

    this.clearTimeoutTimer(task.id)
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
    this.debugLog(`[cancel] requested: taskId=${id} parentSessionID=${parentSessionID}`)

    const task = this.getTaskForParent(id, parentSessionID)
    if (!task) {
      this.debugLog(`[cancel] failed: taskId=${id} not found or ownership mismatch`)
      return 'not_found'
    }
    if (task.status !== 'running') {
      this.debugLog(`[cancel] failed: taskId=${id} status=${task.status} (not running)`)
      return 'not_running'
    }

    // 先设置状态，防止 abort 触发 session.idle 导致的竞态
    this.clearTimeoutTimer(task.id)
    this.releaseConcurrencySlot(task)
    task.status = 'cancelled'
    task.completedAt = new Date()
    this.debugLog(`[cancel] status set to cancelled: taskId=${id}`)

    // 然后调用 abort
    if (task.sessionID && typeof this.client.session?.abort === "function") {
      try {
        await this.client.session.abort({
          path: { id: task.sessionID },
        })
      } catch (err) {
        this.debugLog(`[cancel] abort error (ignored, task already cancelled): ${toErrorMessage(err)}`)
        // 不返回 abort_failed，因为任务已经被标记为 cancelled
      }
    }

    this.debugLog(`[cancel] success: taskId=${id}`)
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

Use \`wopal_output(task_id="${task.id}")\` to retrieve the result.
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
    const runningTasks = Array.from(this.tasks.values()).filter(t => t.status === 'running')
    
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

Task is still running. Use \`wopal_output(task_id="${task.id}")\` for details.
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

  private scheduleTimeoutCheck(taskId: string, timeoutMs: number): void {
    this.debugLog(`[timeout] scheduled: taskId=${taskId} timeoutMs=${timeoutMs}`)
    
    const timer = setTimeout(async () => {
      const task = this.tasks.get(taskId)
      if (!task || task.status !== 'running') return

      this.timeoutTimers.delete(taskId)

      // Set status BEFORE abort to prevent race with promptAsync.catch and session.error
      this.releaseConcurrencySlot(task)
      task.status = 'error'
      task.error = `Task timed out after ${timeoutMs / 1000} seconds`
      task.errorCategory = 'timeout'
      task.completedAt = new Date()

      this.debugLog(`[timeout] triggered: taskId=${taskId} after ${timeoutMs / 1000}s`)

      await this.abortSession(task.sessionID)
      await this.notifyParent(taskId)
    }, timeoutMs)

    this.timeoutTimers.set(taskId, timer)
  }

  private clearTimeoutTimer(taskId: string): void {
    const timer = this.timeoutTimers.get(taskId)
    if (timer) {
      clearTimeout(timer)
      this.timeoutTimers.delete(taskId)
      this.debugLog(`[timeout] cleared: taskId=${taskId}`)
    }
  }

  private releaseConcurrencySlot(task: WopalTask): void {
    if (task.concurrencyKey) {
      this.concurrency.release(task.concurrencyKey)
      task.concurrencyKey = undefined
    }
  }

  private async interruptStaleTask(task: WopalTask, reason: string): Promise<void> {
    this.debugLog(`[stale] interrupting taskId=${task.id}: ${reason}`)

    this.clearTimeoutTimer(task.id)
    this.releaseConcurrencySlot(task)
    task.status = 'error'
    task.error = `Stale timeout (${reason})`
    task.errorCategory = 'timeout'
    task.completedAt = new Date()

    await this.abortSession(task.sessionID)
    await this.notifyParent(task.id)
  }
}
