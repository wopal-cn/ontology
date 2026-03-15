# Wopal 非阻塞委派能力方案

> 日期: 2026-03-15
> 状态: **Phase 2 已完成**
> 更新: 2026-03-15 (Phase 2 实施完成)

---

## 一、目标

为 Wopal 添加**非阻塞任务委派**能力：委派 subagent 后立即返回，通过事件驱动获取结果，而非阻塞等待。

---

## 二、研究结论

### 2.1 P0 验证结果 ✅

| # | 问题 | 结论 | 源码证据 |
|---|------|------|----------|
| 1 | `session.idle` 事件是否存在？ | ✅ 存在（deprecated 但仍发布） | `opencode/src/session/status.ts:36-41, 66-71` |
| 2 | 如何向父会话注入消息？ | ✅ `client.session.promptAsync({ path: { id }, body: { parts } })` | `wopal-queen/manager.ts:1553-1562` |
| 3 | `promptAsync` 是否非阻塞？ | ✅ "returning immediately" | `sdk.gen.ts:1921` |

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

**发布逻辑** (`status.ts:66-71`):
```typescript
if (status.type === "idle") {
  // deprecated
  Bus.publish(Event.Idle, { sessionID })
  delete state()[sessionID]
  return
}
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

**向父会话注入消息** (`manager.ts:1553-1562`):
```typescript
await this.client.session.promptAsync({
  path: { id: task.parentSessionID },
  body: {
    noReply: !allComplete,  // true = 不触发 AI 响应
    parts: [createInternalAgentTextPart(notification)],
  },
})
```

### 2.4 OpenCode 原生 task 工具

**不支持后台执行。** 源码证据 `labs/ref-repos/opencode/packages/opencode/src/tool/task.ts:128`：
```typescript
const result = await SessionPrompt.prompt({...})  // 阻塞等待
```
参数中无 `run_in_background`。

### 2.5 wopal-queen BackgroundManager 规模

**规模**：31 文件，~10k LOC，深度耦合无法简单提取。

---

## 三、方案：扩展 rules-plugin

### 3.1 架构

```
┌─────────────────────────────────────────────────────────┐
│                    rules-plugin                          │
├─────────────────────────────────────────────────────────┤
│  现有功能:                                               │
│  ├── tool.execute.before (上下文跟踪)                   │
│  ├── experimental.chat.messages.transform               │
│  ├── chat.message                                       │
│  ├── experimental.chat.system.transform                 │
│  └── experimental.session.compacting                    │
├─────────────────────────────────────────────────────────┤
│  新增功能:                                               │
│  ├── event hook (监听 session.idle)                     │
│  ├── SimpleTaskManager                                  │
│  └── 工具: wopal_task, wopal_output, wopal_cancel       │
└─────────────────────────────────────────────────────────┘
```

### 3.2 接口定义

```typescript
// ===== types.ts =====

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
  error?: string
}

export interface LaunchInput {
  description: string
  prompt: string
  agent: string
  parentSessionID: string
}

export interface LaunchOutput {
  taskId: string
  status: 'pending'
}
```

### 3.3 SimpleTaskManager

```typescript
// ===== simple-task-manager.ts =====

import type { PluginInput } from "@opencode-ai/plugin"
import type { WopalTask, LaunchInput } from "./types.js"
import { createDebugLog } from "./debug.js"

const debugLog = createDebugLog()

export class SimpleTaskManager {
  private tasks = new Map<string, WopalTask>()
  private sessionToTask = new Map<string, string>()  // sessionID -> taskID
  private client: PluginInput["client"]
  private directory: string

  constructor(client: PluginInput["client"], directory: string) {
    this.client = client
    this.directory = directory
  }

  async launch(input: LaunchInput): Promise<{ taskId: string; status: "pending" }> {
    const taskId = `wopal-task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    
    // 1. 创建任务记录
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
    
    // 2. 创建子会话
    const session = await (this.client as any).session.create({
      parentID: input.parentSessionID,
      title: input.description,
    })
    
    task.sessionID = session?.id ?? session?.info?.id
    if (task.sessionID) {
      this.sessionToTask.set(task.sessionID, taskId)
    }
    
    // 3. fire-and-forget prompt
    task.status = 'running'
    ;(this.client as any).session.promptAsync({
      path: { id: task.sessionID },
      body: {
        agent: input.agent,
        parts: [{ type: "text", text: input.prompt }],
      },
    }).catch((err: Error) => {
      debugLog(`[SimpleTaskManager] promptAsync error for ${taskId}:`, err.message)
      task.status = 'error'
      task.error = err.message
      task.completedAt = new Date()
    })
    
    debugLog(`[SimpleTaskManager] launched task ${taskId} with session ${task.sessionID}`)
    
    return { taskId, status: 'pending' }
  }

  getTask(id: string): WopalTask | undefined {
    return this.tasks.get(id)
  }

  findBySession(sessionID: string): WopalTask | undefined {
    const taskId = this.sessionToTask.get(sessionID)
    if (!taskId) return undefined
    return this.tasks.get(taskId)
  }

  async cancel(id: string): Promise<boolean> {
    const task = this.tasks.get(id)
    if (!task || task.status !== 'running') return false
    
    if (task.sessionID) {
      await (this.client as any).session.abort({
        path: { id: task.sessionID },
      }).catch(() => {})
    }
    
    task.status = 'cancelled'
    task.completedAt = new Date()
    return true
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

    await (this.client as any).session.promptAsync({
      path: { id: task.parentSessionID },
      body: {
        noReply: true,
        parts: [{ type: "text", text: notification }],
      },
    }).catch((err: Error) => {
      debugLog(`[SimpleTaskManager] notifyParent error:`, err.message)
    })
    
    debugLog(`[SimpleTaskManager] notified parent for task ${taskId}`)
  }

  // 清理已完成任务（避免内存泄漏）
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
}
```

### 3.4 event hook 实现

```typescript
// ===== runtime.ts 扩展 =====

// 在 createHooks() 中添加:
"event": async (input: { event: { type: string; properties?: Record<string, unknown> } }) => {
  if (input.event.type === "session.idle") {
    const sessionID = input.event.properties?.sessionID as string | undefined
    if (!sessionID) return
    
    const task = this.taskManager.findBySession(sessionID)
    if (task && task.status === 'running') {
      task.status = 'completed'
      task.completedAt = new Date()
      
      debugLog(`[event] task ${task.id} completed via session.idle`)
      
      // 异步通知父会话
      this.taskManager.notifyParent(task.id).catch(() => {})
    }
  }
  
  // 处理 session.error
  if (input.event.type === "session.error") {
    const sessionID = input.event.properties?.sessionID as string | undefined
    const error = input.event.properties?.error
    
    if (sessionID) {
      const task = this.taskManager.findBySession(sessionID)
      if (task && task.status === 'running') {
        task.status = 'error'
        task.error = typeof error === 'string' ? error : JSON.stringify(error)
        task.completedAt = new Date()
        
        this.taskManager.notifyParent(task.id).catch(() => {})
      }
    }
  }
}
```

### 3.5 工具定义

```typescript
// ===== tools/wopal-task.ts =====

import type { Tool } from "@opencode-ai/plugin"
import type { SimpleTaskManager } from "../simple-task-manager.js"

export function createWopalTaskTool(manager: SimpleTaskManager): Tool {
  return {
    name: "wopal_task",
    description: "Launch a non-blocking background task with a subagent",
    parameters: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description: "Short description of the task (3-5 words)",
        },
        prompt: {
          type: "string",
          description: "Detailed instructions for the subagent",
        },
        agent: {
          type: "string",
          description: "Agent type: 'general', 'explore', 'code-quality-reviewer', etc.",
          default: "general",
        },
      },
      required: ["description", "prompt"],
    },
    execute: async (args, context) => {
      const result = await manager.launch({
        description: args.description,
        prompt: args.prompt,
        agent: args.agent ?? "general",
        parentSessionID: context.sessionID,
      })
      
      return {
        content: [{
          type: "text",
          text: `Task launched: ${result.taskId}\nStatus: ${result.status}\n\nUse \`wopal_output(task_id="${result.taskId}")\` to check progress.`,
        }],
      }
    },
  }
}

// ===== tools/wopal-output.ts =====

export function createWopalOutputTool(manager: SimpleTaskManager): Tool {
  return {
    name: "wopal_output",
    description: "Get the status or result of a background task",
    parameters: {
      type: "object",
      properties: {
        task_id: {
          type: "string",
          description: "Task ID returned by wopal_task",
        },
      },
      required: ["task_id"],
    },
    execute: async (args) => {
      const task = manager.getTask(args.task_id)
      
      if (!task) {
        return {
          content: [{ type: "text", text: `Task not found: ${args.task_id}` }],
        }
      }
      
      let result = `**Task:** ${task.id}\n`
      result += `**Status:** ${task.status}\n`
      result += `**Description:** ${task.description}\n`
      result += `**Agent:** ${task.agent}\n`
      
      if (task.status === 'completed') {
        result += `\n✅ Task completed at ${task.completedAt?.toISOString()}`
        result += `\n\nCheck the subagent session (${task.sessionID}) for detailed results.`
      } else if (task.status === 'error') {
        result += `\n❌ Error: ${task.error}`
      } else if (task.status === 'running') {
        result += `\n⏳ Task is still running...`
      }
      
      return {
        content: [{ type: "text", text: result }],
      }
    },
  }
}

// ===== tools/wopal-cancel.ts =====

export function createWopalCancelTool(manager: SimpleTaskManager): Tool {
  return {
    name: "wopal_cancel",
    description: "Cancel a running background task",
    parameters: {
      type: "object",
      properties: {
        task_id: {
          type: "string",
          description: "Task ID to cancel",
        },
      },
      required: ["task_id"],
    },
    execute: async (args) => {
      const cancelled = await manager.cancel(args.task_id)
      
      return {
        content: [{
          type: "text",
          text: cancelled
            ? `Task ${args.task_id} cancelled.`
            : `Failed to cancel ${args.task_id} (not running or not found)`,
        }],
      }
    },
  }
}
```

### 3.6 不需要的东西

- ❌ ConcurrencyController（Phase 1 不限制并发）
- ❌ tmux 集成
- ❌ 轮询机制（改用 event-driven）
- ❌ fallback/retry 机制
- ❌ 任务持久化（内存存储足够）

---

## 四、文件变更清单

| 文件 | 操作 | 预估 LOC |
|------|------|----------|
| `src/types.ts` | 新增 | ~30 |
| `src/simple-task-manager.ts` | 新增 | ~120 |
| `src/tools/wopal-task.ts` | 新增 | ~35 |
| `src/tools/wopal-output.ts` | 新增 | ~35 |
| `src/tools/wopal-cancel.ts` | 新增 | ~25 |
| `src/tools/index.ts` | 新增 | ~10 |
| `src/runtime.ts` | 修改 | +35 |
| `src/index.ts` | 修改 | +15 |
| `src/simple-task-manager.test.ts` | 新增 | ~120 |
| **总计** | | **~425** |

---

## 五、测试策略

### 5.1 单元测试

```typescript
// simple-task-manager.test.ts

describe("SimpleTaskManager", () => {
  describe("launch", () => {
    it("creates task with pending status")
    it("creates child session with parentID")
    it("calls promptAsync without awaiting")
    it("returns taskId immediately")
    it("maps sessionID to taskID")
  })
  
  describe("getTask", () => {
    it("returns task by id")
    it("returns undefined for unknown id")
  })
  
  describe("findBySession", () => {
    it("finds task by sessionID")
  })
  
  describe("cancel", () => {
    it("aborts session and marks cancelled")
    it("returns false for non-running task")
  })
  
  describe("notifyParent", () => {
    it("calls promptAsync with noReply:true")
    it("includes task id and status in notification")
  })
  
  describe("cleanup", () => {
    it("removes old completed tasks")
    it("keeps recent tasks")
  })
})
```

### 5.2 手动测试场景

1. 启动任务 → 立即返回 → 检查任务状态
2. 任务完成 → 收到 session.idle → 父会话收到通知
3. 取消任务 → 状态变为 cancelled
4. 错误处理 → 模拟 promptAsync 失败

---

## 六、实施步骤

### Phase 1: MVP ✅ 已完成

1. ✅ **创建 types.ts** - 接口定义
2. ✅ **创建 SimpleTaskManager** - 核心逻辑
3. ✅ **创建 3 个工具** - wopal_task, wopal_output, wopal_cancel
4. ✅ **扩展 runtime.ts** - 添加 event hook
5. ✅ **扩展 index.ts** - 注册工具
6. ✅ **编写单元测试** - 175 测试通过
7. ✅ **修复关键 bug** - session.data.id 提取、ownership 校验

### Phase 2: 增强功能 ✅ 已完成

| 功能 | 说明 | 优先级 | 状态 |
|------|------|--------|------|
| 结果提取 | 获取子代理的产出消息 | P0 | ✅ 完成 |
| 超时处理 | 任务超时自动终止 | P1 | ✅ 完成 |
| 自动清理 | 过期任务回收 | P2 | ✅ 完成 |
| 死锁处理 | 任务卡住时强制终止 | P3 | 推迟到 Phase 3 |

---

### 2.6 Phase 2 研究结论 ✅

**研究日期**: 2026-03-15

#### 2.6.1 插件生命周期验证

**研究结论**：OpenCode 插件以**单例模式**运行，`SimpleTaskManager` 的内存状态在正常运行中持久。

**证据**（来自 wopal-queen `index.ts:18-29`）：
```typescript
let activePluginDispose: PluginDispose | null = null

const OhMyOpenCodePlugin: Plugin = async (ctx) => {
  // ...
  await activePluginDispose?.()  // 只在插件重载时清理旧实例

  const managers = createManagers({...})  // 创建新实例
  // ...
  activePluginDispose = dispose
}
```

**结论**：
- 正常使用时插件不会重载，任务状态持久
- 插件重载（如配置变更）会清空任务状态，但这是预期行为
- **不需要**额外的持久化方案（如文件存储）

### 2.4.2 结果提取 API 验证 ✅

**wopal-queen 参考实现** (`task-result-format.ts:16-18`)：
```typescript
const messagesResult: BackgroundOutputMessagesResult = await client.session.messages({
  path: { id: task.sessionID },
})
```

**消息结构** (`clients.ts:3-14`)：
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

**结论**：API 验证通过，可直接实施。

### 2.4.3 Session Cursor 机制

**目的**：跟踪已读消息，避免 `wopal_output` 多次调用时重复输出。

**wopal-queen 实现** (`session-cursor.ts:43-77`)：
```typescript
const sessionCursors = new Map<string, CursorState>()

export function consumeNewMessages<T extends CursorMessage>(
  sessionID: string | undefined,
  messages: T[]
): T[] {
  // 根据上次读取位置返回新消息
  // 使用 message.id 或 message.time 作为 key
}
```

**结论**：Phase 2 P0 需要实现简化版的 cursor 机制。

---

### 2.5 Phase 2 详细设计

#### 2.5.1 结果提取 (P0)

**目标**: 让 `wopal_output` 在任务完成后返回子代理的实际输出内容

**API 参考** (来自 wopal-queen `task-result-format.ts:16-18`):
```typescript
const messagesResult = await client.session.messages({
  path: { id: task.sessionID },
})
```

**实施方案**:

1. **新增 `session-messages.ts`** - 消息提取工具函数
```typescript
// types.ts 新增
export interface SessionMessage {
  id?: string
  info?: {
    role?: string
    time?: string | { created?: number }
  }
  parts?: Array<{
    type?: string
    text?: string
    content?: string | Array<{ type: string; text?: string }>
  }>
}

export interface MessagesResult {
  data?: SessionMessage[]
  error?: unknown
}

// session-messages.ts
export function getErrorMessage(value: MessagesResult): string | null {
  if (Array.isArray(value)) return null
  if (value.error === undefined || value.error === null) return null
  if (typeof value.error === "string" && value.error.length > 0) return value.error
  return String(value.error)
}

export function extractMessages(value: MessagesResult): SessionMessage[] {
  if (Array.isArray(value)) return value.filter(isSessionMessage)
  if (Array.isArray(value.data)) return value.data.filter(isSessionMessage)
  return []
}

export function extractAssistantContent(messages: SessionMessage[]): string {
  const extractedContent: string[] = []
  
  // 过滤 assistant 和 tool 消息
  const relevantMessages = messages.filter(
    (m) => m.info?.role === "assistant" || m.info?.role === "tool"
  )
  
  for (const message of relevantMessages) {
    for (const part of message.parts ?? []) {
      // text 或 reasoning 内容
      if ((part.type === "text" || part.type === "reasoning") && part.text) {
        extractedContent.push(part.text)
        continue
      }
      
      // tool_result 内容
      if (part.type === "tool_result") {
        if (typeof part.content === "string" && part.content) {
          extractedContent.push(part.content)
        } else if (Array.isArray(part.content)) {
          for (const block of part.content) {
            if ((block.type === "text" || block.type === "reasoning") && block.text) {
              extractedContent.push(block.text)
            }
          }
        }
      }
    }
  }
  
  return extractedContent.filter((text) => text.length > 0).join("\n\n")
}
```

2. **新增 `session-cursor.ts`** - 消息游标（避免重复输出）
```typescript
interface CursorState {
  lastKey?: string
  lastCount: number
}

const sessionCursors = new Map<string, CursorState>()

function buildMessageKey(message: SessionMessage, index: number): string {
  if (message.id) return `id:${message.id}`
  const time = message.info?.time
  if (typeof time === "number" || typeof time === "string") {
    return `t:${time}:${index}`
  }
  return `i:${index}`
}

export function consumeNewMessages(
  sessionID: string | undefined,
  messages: SessionMessage[]
): SessionMessage[] {
  if (!sessionID) return messages

  const keys = messages.map((m, i) => buildMessageKey(m, i))
  const cursor = sessionCursors.get(sessionID)
  let startIndex = 0

  if (cursor?.lastKey) {
    const lastIndex = keys.lastIndexOf(cursor.lastKey)
    if (lastIndex >= 0) startIndex = lastIndex + 1
  }

  if (messages.length > 0) {
    sessionCursors.set(sessionID, {
      lastKey: keys[keys.length - 1],
      lastCount: messages.length,
    })
  }

  return messages.slice(startIndex)
}
```

3. **修改 `wopal-output.ts`** - 在 completed 状态时获取结果:
```typescript
execute: async (args, context) => {
  // ... 现有状态查询逻辑 ...

  if (task.status === 'completed' && task.sessionID) {
    const client = manager.getClient()  // 需要新增方法
    
    const messagesResult = await client.session.messages({
      path: { id: task.sessionID },
    })

    const error = getErrorMessage(messagesResult)
    if (error) {
      result += `\n\nError fetching result: ${error}`
    } else {
      const messages = extractMessages(messagesResult)
      const newMessages = consumeNewMessages(task.sessionID, messages)
      const content = extractAssistantContent(newMessages)
      
      if (newMessages.length === 0) {
        result += `\n\n---\n\n(No new output since last check)`
      } else {
        result += `\n\n---\n\n${content || "(No text output)"}`
      }
    }
  }
}
```

4. **修改 `simple-task-manager.ts`** - 新增 getClient():
```typescript
getClient() {
  return this.client
}
```

---

#### 2.5.2 超时处理 (P1)

**目标**: 任务超时自动终止，避免无限等待

**设计方案**:

1. **类型扩展** (`types.ts`):
```typescript
export interface WopalTask {
  // ... 现有字段 ...
  timeoutMs?: number      // 超时时间（毫秒）
}

export interface LaunchInput {
  // ... 现有字段 ...
  timeout?: number        // 超时秒数（默认 300 = 5分钟，最大 3600）
}
```

2. **超时检测** (`simple-task-manager.ts`):
```typescript
// 在 launch() 中添加
const DEFAULT_TIMEOUT_MS = 300_000  // 5 分钟
const MAX_TIMEOUT_MS = 3_600_000    // 1 小时

async launch(input: LaunchInput): Promise<LaunchOutput> {
  // ... 现有逻辑 ...

  const timeoutMs = Math.min(
    (input.timeout ?? 300) * 1000,
    MAX_TIMEOUT_MS
  )
  task.timeoutMs = timeoutMs

  // 在 task.status = 'running' 后启动超时定时器
  this.scheduleTimeoutCheck(task.id, timeoutMs)
  
  return { ok: true, taskId, status: 'running' }
}

private timeoutTimers = new Map<string, ReturnType<typeof setTimeout>>()

private scheduleTimeoutCheck(taskId: string, timeoutMs: number): void {
  const timer = setTimeout(async () => {
    const task = this.tasks.get(taskId)
    if (!task || task.status !== 'running') return

    this.timeoutTimers.delete(taskId)

    await this.abortSession(task.sessionID)
    task.status = 'error'
    task.error = `Task timed out after ${timeoutMs / 1000} seconds`
    task.completedAt = new Date()

    this.debugLog(`[SimpleTaskManager] task ${taskId} timed out`)
    await this.notifyParent(taskId)
  }, timeoutMs)

  this.timeoutTimers.set(taskId, timer)
}

// 在任务完成/取消时清理定时器
private clearTimeoutTimer(taskId: string): void {
  const timer = this.timeoutTimers.get(taskId)
  if (timer) {
    clearTimeout(timer)
    this.timeoutTimers.delete(taskId)
  }
}
```

3. **wopal_task 参数** (`tools/wopal-task.ts`):
```typescript
timeout: {
  type: "number",
  description: "Timeout in seconds (default: 300, max: 3600)",
  minimum: 10,
  maximum: 3600,
}
```

4. **清理定时器时机**：
- `markTaskCompletedBySession()` - 任务完成
- `markTaskErrorBySession()` - 任务出错
- `cancel()` - 任务取消

---

#### 2.5.3 自动清理 (P2)

**目标**: 定期清理已完成任务，避免内存泄漏

**设计方案**:

1. **在 `simple-task-manager.ts` 中添加定时器**:
```typescript
export class SimpleTaskManager {
  private cleanupInterval?: ReturnType<typeof setInterval>
  
  constructor(
    client: any,
    directory: string,
    debugLog?: DebugLog,
  ) {
    // ... 现有逻辑 ...
    
    // 每 10 分钟清理一次
    this.cleanupInterval = setInterval(() => {
      this.cleanup(3600_000)  // 清理 1 小时前的任务
    }, 600_000)
    this.cleanupInterval.unref()  // 不阻止进程退出
  }

  // 新增 dispose 方法
  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = undefined
    }
    // 清理所有超时定时器
    for (const timer of this.timeoutTimers.values()) {
      clearTimeout(timer)
    }
    this.timeoutTimers.clear()
  }
}
```

2. **在 `index.ts` 中调用 dispose**:
```typescript
// 如果 OpenCode 支持 dispose hook，注册清理
// 目前依赖进程退出时自动清理
```

**注意**: 现有的 `cleanup()` 方法已经实现，只需要添加定时器调用。

---

#### 2.5.8 死锁处理 (P3 - 推迟到 Phase 3)

**原因**: 需要心跳检测机制，复杂度较高。Phase 2 依靠超时机制作为主要保护。

**Phase 3 可选方案**（参考 wopal-queen）:
1. **轮询检测** - 定期检查任务进度（3s 间隔）
2. **稳定性检测** - 消息数量 10s 不变视为卡住
3. **progress 追踪** - 记录 toolCalls 数量和最后更新时间

**当前 Phase 2 保护措施**:
- 超时机制（默认 5 分钟）确保任务不会无限等待
- 用户可手动调用 `wopal_cancel` 强制终止

---

#### 2.5.5 Phase 2 文件变更清单（最终版）

| 文件 | 操作 | 预估 LOC | 说明 |
|------|------|----------|------|
| `src/types.ts` | 修改 | +15 | SessionMessage, MessagesResult, timeout 字段 |
| `src/session-messages.ts` | 新增 | ~35 | getErrorMessage, extractMessages, extractAssistantContent |
| `src/session-cursor.ts` | 新增 | ~30 | consumeNewMessages |
| `src/simple-task-manager.ts` | 修改 | +45 | timeout, cleanupInterval, dispose, getClient |
| `src/tools/wopal-task.ts` | 修改 | +8 | timeout 参数 |
| `src/tools/wopal-output.ts` | 修改 | +25 | 结果提取逻辑 |
| `src/session-messages.test.ts` | 新增 | ~50 | 消息提取测试 |
| **总计** | | **~208** | 符合 < 300 LOC 约束 |

---

#### 2.5.6 Phase 2 实施优先级（最终版）

| 顺序 | 功能 | 文件 | 复杂度 | 依赖 |
|------|------|------|--------|------|
| 1 | 结果提取 | session-messages.ts, wopal-output.ts | 低 | 无 |
| 2 | Session Cursor | session-cursor.ts | 低 | 结果提取 |
| 3 | 超时处理 | simple-task-manager.ts, wopal-task.ts | 低 | 无 |
| 4 | 自动清理 | simple-task-manager.ts | 低 | 无 |

---

#### 2.5.7 Phase 2 验收标准（最终版）

**P0 结果提取**:
- [x] `wopal_output` 在任务 completed 状态时返回子代理输出
- [x] 提取 assistant 和 tool 消息的内容
- [x] 处理 text, reasoning, tool_result 三种 part 类型
- [x] 多次调用 `wopal_output` 只返回新内容（cursor 机制）

**P1 超时处理**:
- [x] `wopal_task` 支持 timeout 参数（默认 300s，最大 3600s）
- [x] 超时后自动终止任务并通知父会话
- [x] 任务完成/取消时清理超时定时器

**P2 自动清理**:
- [x] 每 10 分钟清理 1 小时前的已完成任务
- [x] dispose 方法清理所有定时器

**代码质量**:
- [x] 单元测试覆盖新增逻辑 (224 测试通过)
- [x] 代码量增加 < 300 LOC（当前实际 ~208）

---

### Phase 3: 整合优化

1. 重命名 rules-plugin → wopal-plugin
2. 统一文档

---

## 七、验收标准

- [x] `wopal_task` 工具可用，启动后立即返回 task_id
- [x] `wopal_output` 工具可查询任务状态
- [x] `wopal_cancel` 工具可取消运行中任务
- [x] 任务完成后父会话收到 system-reminder 通知
- [x] 代码量 < 500 LOC（新增）
- [x] 单元测试覆盖核心逻辑（175 测试通过）
- [x] 与现有 rules-plugin 功能无冲突

---

## 八、关键发现与修复

### 8.1 session.create 返回结构

**问题**：`session.create` 返回的结构不是 `session.id`，而是 `session.data.id`

**修复**：`simple-task-manager.ts:98`
```typescript
task.sessionID = session?.data?.id ?? session?.id ?? session?.info?.id
```

### 8.2 调试日志简化

**问题**：原实现有 `console.debug` 和文件写入两条路径，测试难以覆盖

**修复**：统一写入日志文件，默认路径 `tmpdir/opencode-rules-debug.log`

### 8.3 Ownership 校验

**问题**：任何会话都能查询/取消其他会话的任务

**修复**：`getTaskForParent(id, parentSessionID)` 增加父会话归属校验

---

## 九、关键文件路径

```
# Worktree 根目录
/Users/sam/coding/wopal/wopal-workspace/.worktrees/agent-tools-feature-nonblocking-delegation/

# 插件源码
agents/wopal/plugins/rules-plugin/src/
├── index.ts                    # 插件入口，注册工具
├── types.ts                    # WopalTask, LaunchInput, LaunchOutput, CancelResult
├── simple-task-manager.ts      # 核心任务管理器
├── runtime.ts                  # 事件监听 (session.idle, session.error)
├── debug.ts                    # 调试日志（文件写入）
└── tools/
    ├── wopal-task.ts           # wopal_task 工具
    ├── wopal-output.ts         # wopal_output 工具
    ├── wopal-cancel.ts         # wopal_cancel 工具
    └── index.ts                # 工具导出

# 测试文件
agents/wopal/plugins/rules-plugin/src/
├── simple-task-manager.test.ts
├── runtime.events.test.ts
└── tools/wopal-tools.test.ts

# OpenCode 源码参考
labs/ref-repos/opencode/packages/opencode/src/session/status.ts      # session.idle 定义
labs/ref-repos/opencode/packages/opencode/src/server/routes/session.ts # prompt_async 端点

# wopal-queen 参考模式
projects/agent-tools/agents/wopal/plugins/wopal-queen/src/features/background-agent/manager.ts
```

---

## 十、风险与缓解

| 风险 | 缓解措施 | 状态 |
|------|----------|------|
| session.idle deprecated 未来移除 | 同时监听 session.status + type:idle | 待实施 |
| 任务内存泄漏 | cleanup() 定期清理 + 最大任务数限制 | 需定时触发 |
| 通知失败 | catch 错误，不阻塞主流程 | ✅ |
| 子会话权限继承 | Phase 1 暂不处理，使用默认权限 | - |
