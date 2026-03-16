# Wopal 非阻塞委派能力方案

> 日期: 2026-03-15
> 状态: **Phase 2 已完成，Phase 3 待实施**
> 更新: 2026-03-16
> 研究文档: `projects/agent-tools/docs/wopal-orchestrator-evolution-research-2026-03-15.md`

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

### 5.1 SSE 超时处理 (P0)

**问题**: 2-10 分钟任务偶发 SSE 超时

**方案**: 实现心跳检测 + 自动重连

```typescript
// simple-task-manager.ts
class SimpleTaskManager {
  private maxRetries = 3
  private retryDelay = 2000  // ms

  async pollMessagesWithRetry(sessionID: string): Promise<MessagesResult> {
    let lastError: Error | null = null
    
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        return await this.client.session.messages({ 
          path: { id: sessionID } 
        })
      } catch (err) {
        lastError = err as Error
        console.warn(`[poll] attempt ${attempt + 1} failed:`, err)
        
        if (attempt < this.maxRetries - 1) {
          await new Promise(r => setTimeout(r, this.retryDelay))
        }
      }
    }
    
    // 所有重试都失败
    throw lastError
  }
}
```

**参考**: `labs/fork/sampx/wopal-queen/.../BackgroundManager` 的重连逻辑

### 5.2 错误传播 (P0)

确保子进程 Crash 或 SSE 彻底断开时返回明确状态：
- `FAILED` 状态码
- 错误原因（timeout / crash / network_error）
- 原始错误信息

### 5.3 并发限制 (P1)

**方案**: 全局最大活跃任务数限制

```typescript
// simple-task-manager.ts
class SimpleTaskManager {
  private concurrencyLimit = 3
  private runningCount = 0
  private taskQueue: Array<() => void> = []

  async launch(input: LaunchInput): Promise<LaunchOutput> {
    const taskId = generateId()
    
    if (this.runningCount >= this.concurrencyLimit) {
      // 加入队列
      return new Promise((resolve) => {
        this.taskQueue.push(() => {
          this.doLaunch(taskId, input).then(resolve)
        })
      })
    }
    
    this.runningCount++
    return this.doLaunch(taskId, input)
  }

  private async doLaunch(taskId: string, input: LaunchInput): Promise<LaunchOutput> {
    // ... 现有 launch 逻辑
  }

  private onTaskComplete(): void {
    this.runningCount--
    const next = this.taskQueue.shift()
    if (next) {
      this.runningCount++
      next()
    }
  }
}
```

### 5.4 任务队列 (P1)

- FIFO 队列机制
- 任务完成时自动启动下一个
- 支持队列位置查询

### 5.5 进度百分比估算 (P2)

**方案**: 基于历史数据 + 当前进度

```typescript
// progress-analyzer.ts
interface TaskHistory {
  avgMessagesPerMin: number
  avgSteps: number
}

function estimateProgress(
  currentMessages: number,
  currentSteps: number,
  history: TaskHistory
): number {
  const msgProgress = currentMessages / (history.avgMessagesPerMin * 5)  // 假设 5 分钟任务
  const stepProgress = currentSteps / history.avgSteps
  
  return Math.min(90, Math.max(10, Math.round((msgProgress + stepProgress) / 2 * 100)))
}
```

**参考**: `labs/fork/sampx/wopal-queen/...` progress estimation

### 5.6 取消传播 (P2)

```typescript
// simple-task-manager.ts
async cancel(taskId: string): Promise<boolean> {
  const task = this.tasks.get(taskId)
  if (!task || task.status !== 'running') return false
  
  // 1. 终止子会话
  if (task.sessionID) {
    await this.client.session.abort({ path: { id: task.sessionID } })
  }
  
  // 2. 清理临时目录
  if (task.tempDir) {
    await fs.remove(task.tempDir)
  }
  
  // 3. 终止关联进程树
  if (task.pid) {
    process.kill(-task.pid)  // 杀死进程组
  }
  
  task.status = 'cancelled'
  return true
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

## 七、验收标准

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

| 功能 | 优先级 |
|------|--------|
| SSE 超时处理 - 心跳/重连 | P0 |
| 错误传播 - Crash 准确报告 | P0 |
| 并发限制 - 最大任务数 | P1 |
| 任务队列 - FIFO 排队 | P1 |
| 进度百分比估算 | P2 |
| 取消传播 - 清理进程树 | P2 |

---

## 八、生产就绪度

| 场景 | 状态 | 说明 |
|------|------|------|
| 短任务 (<2min) | ✅ 可用 | 表现稳定 |
| 中任务 (2-10min) | ⚠️ 偶发超时 | 需 Phase 3 SSE 处理 |
| 长任务 (>10min) | ❌ 高风险 | 需 Phase 3 |
| 并发控制 | ❌ 无限制 | 需 Phase 3 |

---

## 九、fae 协同经验

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

## 十、关键修复记录

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
