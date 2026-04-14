import type {
  CancelResult,
  LaunchInput,
  LaunchOutput,
  SessionMessage,
  WopalTask,
} from "../types.js"
import type { DebugLog } from "../debug.js"
import type { IdleDiagnostic } from "./idle-diagnostic.js"
import { createDebugLog } from "../debug.js"
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
const CONTEXT_WARN_THRESHOLD = 45  // Warn when context usage >= 45%
const CONTEXT_NOTIFY_INCREMENT = 5   // Re-notify only after usage grows by 5%

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
  private tickRunning = false

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
      if (this.tickRunning) return
      this.tickRunning = true
      void (async () => {
        try {
          const taskInfos = await this.checkProgressNotifications()
          clearStuckState(this.tasks.values())
          this.checkStuckTasks()
          this.logTickStatus(taskInfos)
        } finally {
          this.tickRunning = false
        }
      })()
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
      // Shutdown sets error status to mark task as terminated
      task.status = 'error'
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

  /**
   * Legacy method - session.idle events in runtime.ts now handle idle notification directly.
   * This method is kept for backward compatibility but does nothing.
   */
  markTaskCompletedBySession(sessionID: string): WopalTask | undefined {
    const task = this.findBySession(sessionID)
    if (!task || task.status !== 'running') {
      return undefined
    }
    return task
  }

  markTaskErrorBySession(sessionID: string, error: string): WopalTask | undefined {
    const task = this.findBySession(sessionID)
    if (!task) {
      this.debugLog(`[markError] skipped: no task found for sessionID=${sessionID}`)
      return undefined
    }

    // Don't change status if task was already interrupted (idleNotified=true)
    // The session.error event fires after abort, but interrupted tasks should stay running
    if (task.idleNotified && task.status === 'running') {
      this.debugLog(`[markError] skipped: taskId=${task.id} was interrupted (idleNotified=true), preserving running state`)
      return task
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

  async interrupt(id: string, parentSessionID: string): Promise<CancelResult> {
    const task = this.getTaskForParent(id, parentSessionID)
    if (!task) {
      this.debugLog(`[interrupt] failed: taskId=${id} not found or ownership mismatch`)
      return 'not_found'
    }
    if (task.status !== 'running') {
      this.debugLog(`[interrupt] failed: taskId=${id} status=${task.status}`)
      return 'not_running'
    }

    // Mark idleNotified so session.error event won't change status
    // This preserves running state for reply-based recovery
    task.idleNotified = true
    if (task.concurrencyKey) {
      task.waitingConcurrencyKey = task.concurrencyKey
    }
    this.releaseConcurrencySlot(task)

    // 只 abort session，不改变状态
    // abort 后状态仍为 running，等待用户 reply 唤醒
    if (task.sessionID) {
      try {
        await this.client.session.abort({
          path: { id: task.sessionID },
        })
        this.debugLog(`[interrupt] aborted session for taskId=${id}`)
      } catch (err) {
        this.debugLog(`[interrupt] abort error (task may already be idle): ${toErrorMessage(err)}`)
      }
    }

    return 'interrupted'
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

  private async getContextUsagePercent(sessionID: string): Promise<number | null> {
    const ctxLog = (msg: string) => this.debugLog(`[ctxUsage:${sessionID.slice(0, 8)}] ${msg}`)
    try {
      if (typeof this.client.session?.messages !== "function") {
        ctxLog("no session.messages API")
        return null
      }
      const messagesResult = await this.client.session.messages({
        path: { id: sessionID },
      })
      const messages = messagesResult?.data ?? []
      ctxLog(`fetched ${messages.length} messages`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lastAssistant = [...messages].reverse().find((m: any) =>
        m?.info?.role === "assistant" && m?.info?.tokens
      )
      if (!lastAssistant?.info?.tokens) {
        const assistantCount = messages.filter((m: SessionMessage) => m?.info?.role === "assistant").length
        ctxLog(`no assistant with tokens (total assistants: ${assistantCount})`)
        return null
      }

      const tokens = lastAssistant.info.tokens
      const used = (tokens.input ?? 0) + (tokens.cache?.read ?? 0)
      if (used === 0) {
        ctxLog("tokens.input=0 (step still streaming)")
        return null
      }

      if (typeof this.client.config?.providers !== "function") {
        ctxLog("no config.providers API")
        return null
      }
      const providersResult = await this.client.config.providers({
        query: { directory: this.directory },
      })
      const providers = providersResult?.data?.providers ?? []
      const providerID = lastAssistant.info.providerID ?? lastAssistant.info.model?.providerID
      const modelID = lastAssistant.info.modelID ?? lastAssistant.info.model?.modelID
      if (!providerID || !modelID) {
        ctxLog(`missing IDs: providerID=${providerID ?? 'undefined'} modelID=${modelID ?? 'undefined'}`)
        return null
      }

      const provider = providers.find((p: { id: string }) => p.id === providerID)
      const contextLimit = provider?.models?.[modelID]?.limit?.context
      if (!contextLimit) {
        ctxLog(`no context limit for ${providerID}/${modelID}`)
        return null
      }

      const pct = Math.round((used / contextLimit) * 100)
      ctxLog(`${used}/${contextLimit} = ${pct}%`)
      return pct
    } catch (err) {
      ctxLog(`error: ${toErrorMessage(err)}`)
      return null
    }
  }

  private async checkProgressNotifications(): Promise<Array<{ taskId: string; messageCount: number; wasNotified: boolean; contextUsage: number | null }>> {
    const taskInfos: Array<{ taskId: string; messageCount: number; wasNotified: boolean; contextUsage: number | null }> = []
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
        
        // Message/time based notification
        let shouldNotify = messageDelta >= PROGRESS_NOTIFY_MESSAGE_THRESHOLD || 
            (referenceTime > 0 && timeDelta >= PROGRESS_NOTIFY_TIME_THRESHOLD_MS)
        
        // Context usage based notification
        let contextUsage: number | null = null
        try {
          contextUsage = await this.getContextUsagePercent(task.sessionID)
          // Cache successful fetch for tick display (used when current tick fails)
          if (contextUsage !== null) {
            task.lastContextUsage = contextUsage
          }
        } catch {
          // Graceful degradation
        }
        
        // Context usage based notification (OR: independent from message/time)
        // Triggers when context >= 45%, then re-triggers every +5%
        if (contextUsage !== null && contextUsage >= CONTEXT_WARN_THRESHOLD) {
          const lastNotifiedUsage = task.lastNotifyContextUsage ?? 0
          const usageGrowth = contextUsage - lastNotifiedUsage
          if (usageGrowth >= CONTEXT_NOTIFY_INCREMENT) {
            shouldNotify = true
          }
        }
        
        if (shouldNotify) {
          await this.sendProgressNotification(task, messageCount, contextUsage)
          task.lastNotifyMessageCount = messageCount
          task.lastNotifyTime = now
          // Sync context baseline to prevent duplicate notifications
          // from other trigger conditions
          if (contextUsage !== null && contextUsage >= CONTEXT_WARN_THRESHOLD) {
            task.lastNotifyContextUsage = contextUsage
          }
        }
        
        taskInfos.push({
          taskId: task.id,
          messageCount,
          wasNotified: shouldNotify,
          contextUsage
        })
      } catch (err) {
        this.debugLog(`[progressNotify] error for ${task.id}: ${toErrorMessage(err)}`)
      }
    }

    return taskInfos
  }

  private async sendProgressNotification(task: WopalTask, messageCount: number, contextUsage: number | null): Promise<void> {
    if (typeof this.client.session?.promptAsync !== "function") return

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
    // 注意：noReply: false 以触发主 agent 响应，与 idle/stuck 通知一致

    await this.client.session.promptAsync({
      path: { id: task.parentSessionID },
      body: {
        noReply: false,
        parts: [{ type: "text", text: notification }],
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
      // Terminal tasks: only 'error' is terminal
      if (task.status === 'error') {
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
    // Only 'error' is terminal, but also check if already failed
    if (task.status === 'error') {
      this.debugLog(`[failTask] skipped: taskId=${task.id} status=${task.status} (already error)`)
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

  /**
   * Re-acquire concurrency slot when waking up an idle task via reply.
   * This ensures the task takes a slot when resuming execution.
   */
  public reacquireSlotOnWakeUp(task: WopalTask): void {
    if (task.status === 'waiting' || task.idleNotified) {
      // Always tryAcquire to properly increment the counter
      // waitingConcurrencyKey is just a saved string, not an active slot
      if (this.concurrency.tryAcquire(this.CONCURRENCY_KEY, DEFAULT_CONCURRENCY_LIMIT)) {
        task.concurrencyKey = this.CONCURRENCY_KEY
        this.debugLog(`[reacquireSlot] taskId=${task.id} acquired slot`)
      } else {
        this.debugLog(`[reacquireSlot] taskId=${task.id} concurrency limit reached, proceeding anyway`)
        // Proceed without slot - the task was already running and we're just resuming
      }
      // Clean up waitingConcurrencyKey regardless
      delete task.waitingConcurrencyKey
    }
  }

  /**
   * Get concurrency slot usage for debugging.
   */
  getConcurrencyStatus(): { used: number; limit: number; available: number } {
    const used = this.concurrency.getCount(this.CONCURRENCY_KEY)
    return {
      used,
      limit: DEFAULT_CONCURRENCY_LIMIT,
      available: DEFAULT_CONCURRENCY_LIMIT - used,
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

  private logTickStatus(
    progressInfos: Array<{ taskId: string; messageCount: number; wasNotified: boolean; contextUsage: number | null }>
  ): void {
    // Exclude idleNotified tasks - they're awaiting Wopal's judgment, no need to monitor
    const runningTasks = Array.from(this.tasks.values())
      .filter(t => t.status === 'running' && !t.idleNotified)
    
    if (runningTasks.length === 0) return

    const now = Date.now()
    const lines = runningTasks.map((task, i) => {
      const shortId = task.id.replace('wopal-task-', '').slice(0, 8)
      const lastNotifyCount = task.lastNotifyMessageCount ?? 0
      const wasChecked = progressInfos.find(p => p.taskId === task.id)
      
      // 消息增量
      let msgsText: string
      if (wasChecked) {
        msgsText = lastNotifyCount > 0
          ? `+${wasChecked.messageCount - lastNotifyCount} msgs`
          : `${wasChecked.messageCount} msgs`
      } else {
        msgsText = '—'
      }
      
      // 耗时：距上次通知，或从 startedAt
      const refTime = lastNotifyCount > 0 && task.lastNotifyTime
        ? task.lastNotifyTime.getTime()
        : (task.startedAt?.getTime() ?? 0)
      const elapsedMs = refTime > 0 ? now - refTime : 0
      const totalSec = Math.floor(elapsedMs / 1000)
      const min = Math.floor(totalSec / 60)
      const sec = totalSec % 60
      const timeText = `${min}m${sec.toString().padStart(2, '0')}s`
      
      // 上下文使用率：优先当前 tick，fallback 到上次缓存值
      const ctxPct = wasChecked?.contextUsage ?? task.lastContextUsage
      const ctxText = ctxPct != null
        ? (ctxPct >= CONTEXT_WARN_THRESHOLD ? `, ctx:${ctxPct}% ⚠️` : `, ctx:${ctxPct}%`)
        : ''
      
      // 通知标记
      const notifiedMark = wasChecked?.wasNotified ? ' ✓notified' : ''
      
      return `  [${i + 1}] wopal-task-${shortId} "${task.description}": ${msgsText}, ${timeText}${ctxText}${notifiedMark}`
    })
    
    this.debugLog(`[tick] ${runningTasks.length} tasks:\n${lines.join('\n')}`)
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

  /**
   * Update cached context usage for a task's sub-session.
   * Called from runtime event handler on step-finish to capture tokens
   * before they become stale in the next streaming step.
   */
  async cacheContextUsage(sessionID: string): Promise<void> {
    const task = this.findBySession(sessionID)
    if (!task?.sessionID) return

    try {
      const pct = await this.getContextUsagePercent(sessionID)
      if (pct !== null) {
        task.lastContextUsage = pct
        this.debugLog(`[ctxCache] session=${sessionID.slice(0, 8)} cached=${pct}%`)
      }
    } catch {
      // Graceful degradation
    }
  }
}
