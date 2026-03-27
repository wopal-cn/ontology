# rules-plugin — Wopal OpenCode 插件

> **定位**：Wopal 专用的 OpenCode 插件，提供规则注入 + 非阻塞任务委派能力

---

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                        index.ts (入口)                       │
│         返回 { tool, event, "chat.message", ... }           │
├─────────────────────────────────────────────────────────────┤
│  规则注入层                      │  任务委派层               │
│  ├── runtime.ts                 │  ├── simple-task-manager  │
│  ├── utils.ts                   │  ├── concurrency-manager  │
│  ├── message-context.ts         │  ├── stale-detector       │
│  └── mcp-tools.ts               │  ├── error-classifier     │
│                                 │  ├── idle-diagnostic      │ ← NEW
│                                 │  ├── permission-proxy     │ ← NEW
│                                 │  ├── question-relay       │ ← NEW
│                                 │  └── tools/               │
│                                 │      ├── wopal-task       │
│                                 │      ├── wopal-output     │
│                                 │      ├── wopal-cancel     │
│                                 │      └── wopal-reply      │ ← NEW
├─────────────────────────────────────────────────────────────┤
│  基础设施: debug.ts, session-store.ts, types.ts              │
└─────────────────────────────────────────────────────────────┘
```

**核心流程**：
- **规则注入**：发现规则文件 → 匹配条件 → 注入系统提示词
- **任务委派**：`wopal_task` 启动子会话 → `wopal_output` 查询状态 → `session.idle` 事件触发诊断 → 完成/等待/错误
- **双向通信**：子会话等待 → `[WOPAL TASK WAITING]` 通知父代理 → `wopal_reply` 恢复执行

---

## 资源类型

| 类型 | 作用 | 位置 |
|------|------|------|
| **工具** | OpenCode 工具定义 | `src/tools/` |
| **核心逻辑** | 任务管理、并发控制 | `src/simple-task-manager.ts`, `src/concurrency-manager.ts` |
| **诊断模块** | Idle 状态诊断 | `src/idle-diagnostic.ts` |
| **事件处理** | 权限代理、问题中继 | `src/permission-proxy.ts`, `src/question-relay.ts` |
| **检测器** | Stale 检测、错误分类 | `src/stale-detector.ts`, `src/error-classifier.ts` |
| **运行时** | 事件钩子、规则注入 | `src/runtime.ts` |
| **测试** | 单元测试 | `src/*.test.ts` |

---

## 目录结构

```
src/
├── index.ts              # 插件入口
├── types.ts              # 类型定义 (WopalTask, WopalTaskStatus 等)
├── simple-task-manager.ts # 任务管理器核心
├── concurrency-manager.ts # 并发控制 (FIFO 队列 + slot 移交)
├── stale-detector.ts     # Stale 任务检测
├── error-classifier.ts   # 错误分类
├── idle-diagnostic.ts    # Idle 状态诊断 (区分 completed/waiting/error)
├── permission-proxy.ts    # 子会话权限自动代理
├── question-relay.ts     # Question Tool 事件中继
├── runtime.ts            # OpenCode 事件钩子
├── debug.ts              # 调试日志系统
├── session-store.ts      # 会话状态存储
├── message-context.ts    # 消息上下文提取
├── session-messages.ts   # 消息提取 (含 extractFullHistory)
├── session-cursor.ts     # 消息游标 (避免重复输出)
├── progress-analyzer.ts  # 进度分析
├── loop-detector.ts      # 循环检测
├── mcp-tools.ts          # MCP 工具检测
├── utils.ts              # 规则发现工具
└── tools/
    ├── index.ts          # 工具注册
    ├── wopal-task.ts     # wopal_task 工具
    ├── wopal-output.ts   # wopal_output 工具
    ├── wopal-cancel.ts   # wopal_cancel 工具
    └── wopal-reply.ts    # wopal_reply 工具 (恢复等待中的任务)
```

---

## 开发规范

### 开发命令

```bash
# 测试
npm run test:run          # 运行所有测试
npm run test              # 进入 watch 模式

# 构建
npm run build             # tsc 编译到 dist/

# 代码检查
npm run lint              # ESLint
npm run format:check      # Prettier 检查
```

### 调试日志

通过环境变量控制：

```bash
# 启用调试日志
WOPAL_PLUGIN_DEBUG=1      # 启用所有模块
WOPAL_PLUGIN_DEBUG=task   # 仅任务模块
WOPAL_PLUGIN_DEBUG=rules  # 仅规则模块

# 指定日志文件
WOPAL_PLUGIN_LOG_FILE=/tmp/wopal-plugin.log
```

日志默认位置：`tmpdir()/wopal-plugin.log`

### 代码风格

- TypeScript ESM 模块
- 使用 `.js` 后缀导入 (`import { foo } from "./bar.js"`)
- 测试文件与源文件同目录 (`foo.ts` + `foo.test.ts`)
- Vitest 测试框架

---

## 核心类型

```typescript
// 任务状态
type WopalTaskStatus = 'pending' | 'running' | 'waiting' | 'completed' | 'error' | 'cancelled' | 'interrupt'

// 终端状态
['completed', 'error', 'cancelled', 'interrupt']

// 任务对象
interface WopalTask {
  id: string
  sessionID?: string
  status: WopalTaskStatus
  description: string
  agent: string
  prompt: string
  parentSessionID: string
  startedAt?: Date
  progress?: TaskProgress
  errorCategory?: ErrorCategory
  // Idle 诊断字段
  waitingReason?: string       // waiting 状态原因
  lastAssistantMessage?: string // 最后 assistant 消息摘要
}

// Idle 诊断结果
interface IdleDiagnostic {
  verdict: 'completed' | 'waiting' | 'error'
  reason: string
  lastMessage?: string
}
```

---

## 双向通信机制

### 状态流转

```
running → [session.idle] → diagnoseIdle() → {completed | waiting | error}
         ↑                                           │
         │                                           ↓
         └─────── wopal_reply ←── [WOPAL TASK WAITING] 通知
```

### 通知格式

| 状态 | 通知标记 | 说明 |
|------|---------|------|
| `completed` | `[WOPAL TASK COMPLETED]` | 任务正常完成 |
| `waiting` | `[WOPAL TASK WAITING]` | 子代理提问，等待父代理回复 |
| `error` | `[WOPAL TASK ERROR]` | 任务异常终止 |
| `permission` | `[WOPAL TASK PERMISSION]` | 权限自动授权通知 |
| `question` | `[WOPAL TASK QUESTION]` | Question Tool 事件中继 |

### wopal_reply 使用

当收到 `[WOPAL TASK WAITING]` 通知时，父代理可使用 `wopal_reply` 恢复子会话：

```
wopal_reply(task_id="wopal-task-xxx", message="继续执行方案 A")
```

### 权限自动代理

子会话权限请求（如 bash、write）自动 `once` 授权，避免无 TUI 导致的永久阻塞。

---

## 关键常量

| 常量 | 值 | 用途 |
|------|-----|------|
| `DEFAULT_TIMEOUT_MS` | 5 分钟 | 任务默认超时 |
| `MAX_TIMEOUT_MS` | 1 小时 | 最大超时 |
| `TASK_TTL_MS` | 30 分钟 | 非终态任务 TTL |
| `DEFAULT_STALE_TIMEOUT_MS` | 3 分钟 | 运行中 stale 检测 |
| `DEFAULT_MESSAGE_STALENESS_TIMEOUT_MS` | 30 分钟 | 启动后 stale 检测 |
| `DEFAULT_CONCURRENCY_LIMIT` | 3 | 并发任务数限制 |

---

## 部署

插件通过 `sync-to-wopal.py` 同步到 `.wopal/` 目录：

```bash
cd /Users/sam/coding/wopal/wopal-workspace
python scripts/sync-to-wopal.py -y
```

OpenCode 配置 (`opencode.jsonc`)：
```json
"plugin": [
  "./projects/ontology/agents/wopal/plugins/rules-plugin/src/index.ts"
]
```

---

## 注意事项

- **禁止 console.log**：使用 `createDebugLog()` 或 `createWarnLog()` 输出日志
- **Bun 原生 TS**：OpenCode 直接运行 `.ts` 文件，无需 `dist/`
- **测试优先**：修改核心逻辑后运行 `npm run test:run` 验证
- **子会话无 TUI**：权限请求自动授权，Question Tool 事件中继到父代理
- **waiting 不释放并发槽**：任务恢复后继续执行，不占用新槽位