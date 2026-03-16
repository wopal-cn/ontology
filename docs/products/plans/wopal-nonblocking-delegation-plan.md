# Wopal 非阻塞委派能力方案

> 日期: 2026-03-15
> 状态: **Phase 2 已完成，Phase 3 设计完成**
> 更新: 2026-03-16
> 研究文档: `projects/agent-tools/docs/wopal-orchestrator-evolution-research-2026-03-15.md`
> 参考源码: `labs/fork/sampx/wopal-queen/src/features/background-agent/`

---

## 一、目标

为 Wopal 添加**非阻塞任务委派**能力：委派 subagent 后立即返回，通过事件驱动获取结果，而非阻塞等待。

---

## 二、研究结论 (Phase 1)

### 2.1 关键验证结果

| # | 问题 | 结论 | 源码证据 |
|---|------|------|----------|
| 1 | `session.idle` 事件是否存在？ | ✅ 存在（deprecated 但仍发布） | `opencode/src/session/status.ts:36-41, 66-71` |
| 2 | 如何向父会话注入消息？ | ✅ `client.session.promptAsync({ path: { id }, body: { parts } })` | `labs/fork/sampx/wopal-queen/.../manager.ts:1553` |
| 3 | `promptAsync` 是否非阻塞？ | ✅ "returning immediately" | `sdk.gen.ts:1921` |
| 4 | OpenCode 原生 task 是否支持后台？ | ❌ 不支持，阻塞等待 | `tool/task.ts:128` |

### 2.2 OpenCode 源码证据

**session.idle 事件定义** (`status.ts:36-41`):
```typescript
// deprecated but still emitted
Idle: BusEvent.define(
  "session.idle",
  z.object({
    sessionID: z.string(),
  }),
),
```

**promptAsync 非阻塞** (`session.ts:792-800`):
```typescript
async (c) => {
  c.status(204)  // 立即返回 204
  return stream(c, async () => {
    SessionPrompt.prompt({ ...body, sessionID })  // 无 await
  })
}
```

### 2.3 wopal-queen 通知模式

**参考文档**: `projects/agent-tools/docs/wopal-orchestrator-evolution-research-2026-03-15.md`

**向父会话注入消息** (`labs/fork/sampx/wopal-queen/.../manager.ts:1553-1562`):
```typescript
await this.client.session.promptAsync({
  path: { id: task.parentSessionID },
  body: {
    noReply: !allComplete,  // true = 不触发 AI 响应
    parts: [createInternalAgentTextPart(notification)],
  },
})
```

---

## 三、架构设计

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                    rules-plugin                          │
├─────────────────────────────────────────────────────────┤
│  新增功能:                                               │
│  ├── event hook (监听 session.idle)                     │
│  ├── SimpleTaskManager                                  │
│  └── 工具: wopal_task, wopal_output, wopal_cancel     │
└─────────────────────────────────────────────────────────┘
```

### 3.2 接口定义

```typescript
// types.ts
export type WopalTaskStatus = 'pending' | 'running' | 'completed' | 'error' | 'cancelled'

export interface WopalTask {
  id: string
  sessionID?: string
  status: WopalTaskStatus
  description: string
  agent: string
  prompt: string
  parentSessionID: string
  createdAt: Date
  completedAt?: Date
  timeoutMs?: number
  error?: string
}

export interface LaunchInput {
  description: string
  prompt: string
  agent: string
  parentSessionID: string
  timeout?: number  // 秒，默认 300
}
```

---

## 四、Phase 2 实现

### 4.1 核心模块

| 文件 | 功能 |
|------|------|
| `simple-task-manager.ts` | 任务管理器：launch, cancel, notifyParent, cleanup |
| `session-messages.ts` | 消息提取：getErrorMessage, extractMessages, extractAssistantContent |
| `session-cursor.ts` | 消息游标：consumeNewMessages，避免重复输出 |
| `progress-analyzer.ts` | 进度分析：消息数、工具调用统计、活动时间 |
| `loop-detector.ts` | 循环检测：>=3次相同工具调用警告 |
| `runtime.ts` | 事件监听：session.idle, session.error |

### 4.2 关键发现：OpenCode 消息协议

**调试结论**：OpenCode 的 tool call part type 是 `tool`，不是 `tool_use` 或 `tool_call`。

**Part 类型完整列表**：
- `step-start`: 步骤开始
- `step-finish`: 步骤结束
- `reasoning`: 推理过程
- `text`: 文本输出
- `tool`: 工具调用 (**注意：这里是 `tool`，不是 `tool_use`**)
- `patch`: 代码补丁

```typescript
// progress-analyzer.ts - 正确用法
if (part.type === "tool" && part.tool) {
  toolCallCount[part.tool] = (toolCallCount[part.tool] || 0) + 1
}
```

### 4.3 结果提取 API

**API 参考** (来自 `labs/fork/sampx/wopal-queen/.../task-result-format.ts:16-18`):
```typescript
const messagesResult = await client.session.messages({
  path: { id: task.sessionID },
})
```

**消息结构**:
```typescript
type BackgroundOutputMessage = {
  id?: string
  info?: { role?: string; time?: string | { created?: number } }
  parts?: Array<{
    type?: string
    text?: string
    content?: string | Array<{ type: string; text?: string }>
  }>
}
```

### 4.4 Session Cursor 机制

**目的**：跟踪已读消息，避免 `wopal_output` 多次调用时重复输出。

```typescript
// session-cursor.ts
interface CursorState {
  lastKey?: string
  lastCount: number
}

export function consumeNewMessages(
  sessionID: string | undefined,
  messages: SessionMessage[]
): SessionMessage[] {
  // 根据 message.id 或时间戳计算偏移
  // 返回自上次读取后的新消息
}
```

### 4.5 超时处理

```typescript
// simple-task-manager.ts
const DEFAULT_TIMEOUT_MS = 300_000   // 5 分钟
const MAX_TIMEOUT_MS = 3_600_000     // 1 小时

private timeoutTimers = new Map<string, ReturnType<typeof setTimeout>>()

private scheduleTimeoutCheck(taskId: string, timeoutMs: number): void {
  const timer = setTimeout(async () => {
    const task = this.tasks.get(taskId)
    if (!task || task.status !== 'running') return

    await this.abortSession(task.sessionID)
    task.status = 'error'
    task.error = `Task timed out after ${timeoutMs / 1000} seconds`
    await this.notifyParent(taskId)
  }, timeoutMs)

  this.timeoutTimers.set(taskId, timer)
}
```

### 4.6 汇报模板

**注入时机**: 任务完成后自动向子会话发送模板提示

```typescript
// runtime.ts - 任务完成时注入
const template = `# Task Report

## Summary
[简短总结任务完成情况]

## Changes Made
- [变更 1]
- [变更 2]

## Verification
- [验证 1]
- [验证 2]

## Notes
[任何需要关注的注意事项]
`
```

---

## 五、Phase 3: 生产就绪方案

### 5.1 任务队列与并发控制 (P1)

**参考**: `labs/fork/sampx/wopal-queen/src/features/background-agent/concurrency.ts`

#### 5.1.1 设计要点

**核心模式**: `acquire/release` slot 移交机制 + `settled` 标志防止 double-resolution

```typescript
// concurrency-manager.ts
interface QueueEntry {
  resolve: () => void
  rawReject: (error: Error) => void
  settled: boolean  // 防止 cancelWaiters 重复 reject
}

export class ConcurrencyManager {
  private counts = new Map<string, number>()  // 当前活跃数
  private queues = new Map<string, QueueEntry[]>()  // 等待队列

  async acquire(key: string, limit: number): Promise<void> {
    const current = this.counts.get(key) ?? 0
    if (current < limit) {
      this.counts.set(key, current + 1)
      return
    }
    // 加入队列等待
    return new Promise((resolve, reject) => {
      const entry: QueueEntry = {
        resolve: () => {
          if (entry.settled) return
          entry.settled = true
          resolve()
        },
        rawReject: reject,
        settled: false,
      }
      const queue = this.queues.get(key) ?? []
      queue.push(entry)
      this.queues.set(key, queue)
    })
  }

  release(key: string): void {
    const queue = this.queues.get(key)
    // 优先移交给等待者（slot 不释放，直接移交）
    while (queue && queue.length > 0) {
      const next = queue.shift()!
      if (!next.settled) {
        next.resolve()  // 移交 slot，计数不变
        return
      }
    }
    // 无等待者，释放 slot
    const current = this.counts.get(key) ?? 0
    if (current > 0) {
      this.counts.set(key, current - 1)
    }
  }

  cancelWaiters(key: string): void {
    const queue = this.queues.get(key)
    if (queue) {
      for (const entry of queue) {
        if (!entry.settled) {
          entry.settled = true
          entry.rawReject(new Error(`Concurrency queue cancelled for: ${key}`))
        }
      }
      this.queues.delete(key)
    }
  }
}
```

#### 5.1.2 集成到 SimpleTaskManager

```typescript
// simple-task-manager.ts
class SimpleTaskManager {
  private concurrency = new ConcurrencyManager()
  private readonly CONCURRENCY_LIMIT = 3
  private readonly CONCURRENCY_KEY = 'default'

  async launch(input: LaunchInput): Promise<LaunchOutput> {
    // 先获取并发 slot
    await this.concurrency.acquire(this.CONCURRENCY_KEY, this.CONCURRENCY_LIMIT)
    
    try {
      return await this.doLaunch(input)
    } catch (err) {
      // 启动失败立即释放 slot
      this.concurrency.release(this.CONCURRENCY_KEY)
      throw err
    }
  }

  private onTaskTerminal(task: WopalTask): void {
    if (task.concurrencyKey) {
      this.concurrency.release(task.concurrencyKey)
      task.concurrencyKey = undefined
    }
  }
}
```

### 5.2 SSE 超时与 Stale 检测 (P0)

**参考**: `labs/fork/sampx/wopal-queen/src/features/background-agent/task-poller.ts`

#### 5.2.1 双重 Stale 检测机制

**检测维度**:
1. **启动后无更新**: 任务启动后长时间无消息更新
2. **运行中无更新**: 运行一段时间后消息停滞

```typescript
// constants.ts
const DEFAULT_STALE_TIMEOUT_MS = 180_000           // 3分钟无更新视为 stale
const DEFAULT_MESSAGE_STALENESS_TIMEOUT_MS = 1_800_000  // 30分钟（启动后）
const MIN_RUNTIME_BEFORE_STALE_MS = 30_000         // 最少运行30秒才检测
```

#### 5.2.2 Stale 检测实现

```typescript
// stale-detector.ts
interface StaleCheckConfig {
  staleTimeoutMs: number        // 运行中无更新超时
  messageStalenessMs: number    // 启动后无更新超时
  minRuntimeBeforeStaleMs: number
}

export function checkAndInterruptStaleTasks(
  tasks: Iterable<WopalTask>,
  config: StaleCheckConfig,
  onStale: (task: WopalTask, reason: string) => void
): void {
  const now = Date.now()

  for (const task of tasks) {
    if (task.status !== 'running') continue
    if (!task.startedAt || !task.sessionID) continue

    const runtime = now - task.startedAt.getTime()

    // Case 1: 启动后从未更新（可能卡住）
    if (!task.progress?.lastUpdate) {
      if (runtime <= config.messageStalenessMs) continue
      
      onStale(task, `no activity for ${Math.round(runtime / 60000)}min since start`)
      continue
    }

    // Case 2: 运行中消息停滞
    if (runtime < config.minRuntimeBeforeStaleMs) continue
    
    const timeSinceLastUpdate = now - task.progress.lastUpdate.getTime()
    if (timeSinceLastUpdate <= config.staleTimeoutMs) continue

    onStale(task, `no activity for ${Math.round(timeSinceLastUpdate / 60000)}min`)
  }
}
```

#### 5.2.3 集成到 TaskManager

```typescript
// simple-task-manager.ts
class SimpleTaskManager {
  private staleCheckInterval: ReturnType<typeof setInterval>

  constructor() {
    // ... 现有初始化
    
    // 每30秒检查一次 stale 任务
    this.staleCheckInterval = setInterval(() => {
      checkAndInterruptStaleTasks(
        this.tasks.values(),
        {
          staleTimeoutMs: 180_000,
          messageStalenessMs: 1_800_000,
          minRuntimeBeforeStaleMs: 30_000,
        },
        (task, reason) => this.interruptStaleTask(task, reason)
      )
    }, 30_000)
  }

  private async interruptStaleTask(task: WopalTask, reason: string): Promise<void> {
    this.debugLog(`[stale] interrupting taskId=${task.id}: ${reason}`)
    
    task.status = 'error'
    task.error = `Stale timeout (${reason})`
    task.completedAt = new Date()
    
    // 释放并发 slot
    this.concurrency?.release(this.CONCURRENCY_KEY)
    
    // 终止子会话
    await this.abortSession(task.sessionID)
    
    // 通知父会话
    await this.notifyParent(task.id)
  }
}
```

### 5.3 错误传播与分类 (P0)

**参考**: `labs/fork/sampx/wopal-queen/src/features/background-agent/error-classifier.ts`

#### 5.3.1 深度错误提取

```typescript
// error-classifier.ts
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export function extractErrorMessage(error: unknown): string | undefined {
  if (!error) return undefined
  if (typeof error === "string") return error
  if (error instanceof Error) return error.message

  if (isRecord(error)) {
    const dataRaw = error["data"]
    const candidates: unknown[] = [
      error,
      dataRaw,
      error["error"],
      isRecord(dataRaw) ? (dataRaw as Record<string, unknown>)["error"] : undefined,
      error["cause"],
    ]

    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.length > 0) return candidate
      if (
        isRecord(candidate) &&
        typeof candidate["message"] === "string" &&
        candidate["message"].length > 0
      ) {
        return candidate["message"]
      }
    }
  }

  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

export function isAbortedSessionError(error: unknown): boolean {
  const message = extractErrorMessage(error) ?? ""
  return message.toLowerCase().includes("aborted")
}

export function classifyError(error: unknown): {
  category: 'timeout' | 'crash' | 'network' | 'cancelled' | 'unknown'
  message: string
  raw: unknown
} {
  const message = extractErrorMessage(error) ?? "Unknown error"
  const lowerMsg = message.toLowerCase()
  
  if (isAbortedSessionError(error)) {
    return { category: 'cancelled', message, raw: error }
  }
  if (lowerMsg.includes('timeout') || lowerMsg.includes('etimedout')) {
    return { category: 'timeout', message, raw: error }
  }
  if (lowerMsg.includes('econnrefused') || lowerMsg.includes('network')) {
    return { category: 'network', message, raw: error }
  }
  if (lowerMsg.includes('crash') || lowerMsg.includes('killed')) {
    return { category: 'crash', message, raw: error }
  }
  
  return { category: 'unknown', message, raw: error }
}
```

#### 5.3.2 错误状态报告

```typescript
// simple-task-manager.ts
private async handleTaskError(
  task: WopalTask, 
  error: unknown, 
  source: 'launch' | 'execution' | 'poll'
): Promise<void> {
  const classified = classifyError(error)
  
  this.debugLog(`[error] taskId=${task.id} source=${source} category=${classified.category}`)
  
  task.status = 'error'
  task.error = `[${classified.category.toUpperCase()}] ${classified.message}`
  task.errorCategory = classified.category  // 新增字段
  task.completedAt = new Date()
  
  // 释放资源
  this.concurrency?.release(this.CONCURRENCY_KEY)
  
  // 通知父会话（包含分类信息）
  await this.notifyParent(task.id)
}
```

### 5.4 进度追踪增强 (P1)

**参考**: `labs/fork/sampx/wopal-queen/src/features/background-agent/types.ts`

#### 5.4.1 TaskProgress 结构

```typescript
// types.ts
interface TaskProgress {
  toolCalls: number           // 工具调用次数
  lastTool?: string           // 最后调用的工具
  lastUpdate: Date            // 最后更新时间
  lastMessage?: string        // 最后消息摘要
  lastMessageAt?: Date        // 最后消息时间
}

interface WopalTask {
  // ... 现有字段
  progress?: TaskProgress
  lastMsgCount?: number       // 用于稳定性检测
  stablePolls?: number        // 连续稳定轮询次数
}
```

#### 5.4.2 进度更新监听

```typescript
// progress-tracker.ts
export function trackMessageProgress(
  task: WopalTask,
  messages: SessionMessage[]
): void {
  if (!task.progress) {
    task.progress = {
      toolCalls: 0,
      lastUpdate: new Date(),
    }
  }

  // 统计工具调用
  let toolCalls = 0
  let lastTool: string | undefined

  for (const msg of messages) {
    for (const part of msg.parts ?? []) {
      if (part.type === 'tool' && part.tool) {
        toolCalls++
        lastTool = part.tool
      }
    }
  }

  task.progress.toolCalls += toolCalls
  task.progress.lastTool = lastTool
  task.progress.lastUpdate = new Date()
  
  if (messages.length > 0) {
    const lastMsg = messages[messages.length - 1]
    task.progress.lastMessage = extractTextPreview(lastMsg)
    task.progress.lastMessageAt = new Date()
  }
}
```

### 5.5 取消传播增强 (P2)

#### 5.5.1 完整取消流程

```typescript
// simple-task-manager.ts
async cancel(id: string, parentSessionID: string): Promise<CancelResult> {
  const task = this.getTaskForParent(id, parentSessionID)
  if (!task) return 'not_found'
  if (task.status !== 'running') return 'not_running'

  this.debugLog(`[cancel] initiating: taskId=${id}`)

  try {
    // 1. 标记取消中（防止竞态）
    task.status = 'cancelling'

    // 2. 终止子会话
    if (task.sessionID) {
      await this.client.session.abort({
        path: { id: task.sessionID },
      }).catch((err: unknown) => {
        this.debugLog(`[cancel] abort warning: ${extractErrorMessage(err)}`)
      })
    }

    // 3. 释放并发 slot
    this.concurrency?.cancelWaiters(this.CONCURRENCY_KEY)

    // 4. 清理超时定时器
    this.clearTimeoutTimer(task.id)

    // 5. 最终状态更新
    task.status = 'cancelled'
    task.completedAt = new Date()
    
    this.debugLog(`[cancel] completed: taskId=${id}`)
    return 'cancelled'
  } catch (err) {
    this.debugLog(`[cancel] failed: ${extractErrorMessage(err)}`)
    // 回滚状态
    task.status = 'running'
    return 'abort_failed'
  }
}
```

### 5.6 任务生命周期与清理 (P1)

**参考**: `labs/fork/sampx/wopal-queen/src/features/background-agent/task-poller.ts`

#### 5.6.1 终态任务清理

```typescript
// constants.ts
const TERMINAL_TASK_TTL_MS = 30 * 60 * 1000  // 终态任务保留30分钟
const TASK_TTL_MS = 30 * 60 * 1000           // 运行中任务30分钟超时

const TERMINAL_STATUSES = new Set(['completed', 'error', 'cancelled', 'interrupt'])
```

#### 5.6.2 清理实现

```typescript
// task-cleanup.ts
export function pruneTasks(args: {
  tasks: Map<string, WopalTask>
  onPruned: (taskId: string, task: WopalTask, reason: string) => void
}): void {
  const { tasks, onPruned } = args
  const now = Date.now()

  for (const [taskId, task] of tasks) {
    // 终态任务：保留一段时间后删除
    if (TERMINAL_STATUSES.has(task.status)) {
      const completedAt = task.completedAt?.getTime()
      if (!completedAt) continue

      const age = now - completedAt
      if (age > TERMINAL_TASK_TTL_MS) {
        tasks.delete(taskId)
        onPruned(taskId, task, 'terminal TTL expired')
      }
      continue
    }

    // 非终态任务：检查是否超时
    const timestamp = task.status === 'pending'
      ? task.queuedAt?.getTime()
      : task.startedAt?.getTime()

    if (!timestamp) continue

    const age = now - timestamp
    if (age > TASK_TTL_MS) {
      onPruned(taskId, task, task.status === 'pending'
        ? 'timed out while queued (30min)'
        : 'timed out after 30min'
      )
    }
  }
}
```

### 5.7 Shutdown 处理 (P2)

**参考**: `labs/fork/sampx/wopal-queen/src/features/background-agent/manager.ts`

#### 5.7.1 优雅关闭实现

```typescript
// simple-task-manager.ts
class SimpleTaskManager {
  private isShuttingDown = false

  async shutdown(): Promise<void> {
    if (this.isShuttingDown) return
    this.isShuttingDown = true
    
    this.debugLog('[shutdown] initiating graceful shutdown')

    // 1. 停止所有定时器
    this.dispose()

    // 2. 取消所有等待中的任务
    this.concurrency?.clear()

    // 3. 终止所有运行中的任务
    const runningTasks = this.tasks.values()
      .filter(t => t.status === 'running')
    
    for (const task of runningTasks) {
      this.debugLog(`[shutdown] aborting task: ${task.id}`)
      await this.abortSession(task.sessionID)
      task.status = 'interrupt'
      task.completedAt = new Date()
    }

    // 4. 等待所有任务进入终态（最多5秒）
    await this.waitForTerminalState(5000)

    this.debugLog('[shutdown] completed')
  }

  private async waitForTerminalState(timeoutMs: number): Promise<void> {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const hasRunning = this.tasks.values()
        .some(t => t.status === 'running')
      if (!hasRunning) break
      await new Promise(r => setTimeout(r, 100))
    }
  }
}
```

---

## 六、文件路径参考

```
# 核心模块
agents/wopal/plugins/rules-plugin/src/
├── simple-task-manager.ts      # 任务管理 (Phase 1-3 修改点)
├── types.ts                    # 类型定义
├── runtime.ts                  # 事件监听
├── debug.ts                    # 调试日志
├── session-messages.ts         # 消息提取
├── session-cursor.ts           # 消息游标
├── progress-analyzer.ts        # 进度分析
├── loop-detector.ts            # 循环检测
└── tools/
    ├── wopal-task.ts
    ├── wopal-output.ts
    ├── wopal-cancel.ts
    └── index.ts

# 测试
src/simple-task-manager.test.ts  # 259 tests

# OpenCode 源码参考
labs/ref-repos/opencode/packages/opencode/src/session/status.ts      # session.idle
labs/ref-repos/opencode/packages/opencode/src/server/routes/session.ts # prompt_async

# wopal-queen 参考
labs/fork/sampx/wopal-queen/src/features/background-agent/manager.ts
```

---

## 七、关键实现模式（来自 wopal-queen）

### 7.1 ConcurrencyManager 核心模式

| 模式 | 说明 | 代码位置 |
|------|------|----------|
| **settled 标志** | 防止 cancelWaiters 重复 reject 已 resolve 的 entry | `concurrency.ts:58-63` |
| **slot 移交** | release 时优先移交给等待者，而非递减计数 | `concurrency.ts:81-86` |
| **per-key 队列** | `Map<string, QueueEntry[]>` 支持多模型并发 | `concurrency.ts:18` |

### 7.2 Stale 检测策略

| 检测类型 | 触发条件 | 超时阈值 |
|----------|----------|----------|
| **启动后无更新** | `!task.progress?.lastUpdate` | 30分钟 |
| **运行中无更新** | `runtime > 30s && timeSinceLastUpdate > 3min` | 3分钟 |

### 7.3 错误提取深度

```
error
├── message (直接)
├── data
│   ├── message (嵌套)
│   └── error (嵌套)
├── error (同级)
└── cause (原因链)
```

### 7.4 任务生命周期常量

| 常量 | 值 | 用途 |
|------|-----|------|
| `TASK_TTL_MS` | 30分钟 | 非终态任务超时 |
| `TERMINAL_TASK_TTL_MS` | 30分钟 | 终态任务保留时间 |
| `DEFAULT_STALE_TIMEOUT_MS` | 3分钟 | 运行中 stale 检测 |
| `MIN_RUNTIME_BEFORE_STALE_MS` | 30秒 | 最少运行时间 |
| `POLLING_INTERVAL_MS` | 3秒 | 消息轮询间隔 |

---

## 八、验收标准

### Phase 1-2 完成 ✅

| 标准 | 状态 |
|------|------|
| wopal_task 立即返回 task_id | ✅ |
| wopal_output 查询状态和结果 | ✅ |
| wopal_cancel 终止任务 | ✅ |
| session.idle 事件驱动完成 | ✅ |
| 结果提取 | ✅ |
| Session Cursor | ✅ |
| 超时处理 | ✅ |
| 进度分析 | ✅ |
| 循环检测 | ✅ |
| 汇报模板 | ✅ |
| 单元测试 | ✅ 259 passed |

### Phase 3 验收

| 功能 | 优先级 | 验收标准 |
|------|--------|----------|
| **并发控制** | P1 | `ConcurrencyManager` 实现 acquire/release 模式，支持 slot 移交，防止 double-resolution |
| **任务队列** | P1 | FIFO 队列，任务完成自动启动下一个，支持队列位置查询 |
| **Stale 检测** | P0 | 双重检测（启动后无更新 vs 运行中无更新），可配置超时阈值 |
| **错误分类** | P0 | 深度提取 error.data/cause，分类为 timeout/crash/network/cancelled/unknown |
| **进度追踪** | P1 | `TaskProgress` 结构，跟踪 toolCalls/lastUpdate/lastMessage |
| **取消增强** | P2 | 完整取消流程：标记→abort→释放 slot→清理定时器→状态更新 |
| **任务清理** | P1 | 终态任务30分钟后清理，非终态任务30分钟超时检测 |
| **Shutdown** | P2 | 优雅关闭：停止定时器→取消队列→终止任务→等待终态 |

---

## 九、生产就绪度

| 场景 | 状态 | 说明 |
|------|------|------|
| 短任务 (<2min) | ✅ 可用 | Phase 1-2 已实现，表现稳定 |
| 中任务 (2-10min) | ⚠️ 偶发超时 | 需 Phase 3 Stale 检测 + 错误分类 |
| 长任务 (>10min) | ❌ 高风险 | 需 Phase 3 完整生命周期管理 |
| 并发控制 | ❌ 无限制 | 需 Phase 3 ConcurrencyManager |
| 优雅关闭 | ❌ 未实现 | 需 Phase 3 shutdown 处理 |

### Phase 3 实施优先级

```
P0 (必须):
  ├── Stale 检测 (5.2) - 防止任务假死
  └── 错误分类 (5.3) - 准确报告失败原因

P1 (重要):
  ├── 并发控制 (5.1) - 防止资源耗尽
  ├── 任务队列 (5.1) - FIFO 排队机制
  ├── 进度追踪 (5.4) - 可观测性
  └── 任务清理 (5.6) - 内存管理

P2 (增强):
  ├── 取消增强 (5.5) - 完整取消流程
  └── Shutdown (5.7) - 优雅关闭
```

---

## 十、fae 协同经验

### 9.1 fae 角色定位

- **执行型分身**：专注编码、重构、文件操作、构建与测试
- **不负责**：规划、设计、评审
- **temperature**: 0.3，输出稳定
- **行为特点**：遇到模糊指令会暂停询问，不猜测

### 9.2 协同最佳实践

| 维度 | 建议 |
|------|------|
| 委派 | description 简洁（3-5 words），prompt 详细说明期望输出格式 |
| 监控 | 用 `wopal_output` 查进度，注意无新消息可能意味着卡住 |
| 验证 | 读文件确认修改、检查构建/测试输出，不信任返回文本 |
| 时限 | 短任务（<2分钟）表现良好，长任务需考虑 SSE 超时风险 |

### 9.3 禁忌

- 不要给 fae 规划任务，她只执行
- 不要只测 happy path，需覆盖边界情况
- 不要长时间不检查进度，可能卡住或超时

---

## 十一、关键修复记录

### session.create 返回结构
```typescript
// 问题：返回结构是 session.data.id
task.sessionID = session?.data?.id ?? session?.id ?? session?.info?.id
```

### Ownership 校验
```typescript
// 问题：任何会话都能查询/取消其他任务
// 修复：getTaskForParent 增加父会话归属校验
```

### OpenCode 消息协议
```typescript
// 问题：循环检测使用错误的 part type
// 修复：使用 part.type === "tool" 而非 tool_use
```
