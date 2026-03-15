# Wopal 非阻塞委派能力方案

> 日期: 2026-03-15
> 状态: **Phase 1 MVP 已完成，Phase 2 进行中**
> 更新: 2026-03-15

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

### Phase 2: 增强功能 🔄 进行中

| 功能 | 说明 | 状态 |
|------|------|------|
| 结果提取 | 获取子代理的产出消息 | 待实施 |
| 超时处理 | 任务超时自动终止 | 待实施 |
| 死锁处理 | 任务卡住时强制终止 | 待实施 |
| 自动清理 | 过期任务回收 | 已有 cleanup() 方法，需定时触发 |

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
