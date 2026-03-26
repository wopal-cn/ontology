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
│                                 │  └── tools/               │
│                                 │      ├── wopal-task       │
│                                 │      ├── wopal-output     │
│                                 │      └── wopal-cancel     │
├─────────────────────────────────────────────────────────────┤
│  基础设施: debug.ts, session-store.ts, types.ts              │
└─────────────────────────────────────────────────────────────┘
```

**核心流程**：
- **规则注入**：发现规则文件 → 匹配条件 → 注入系统提示词
- **任务委派**：`wopal_task` 启动子会话 → `wopal_output` 查询状态 → `session.idle` 事件触发完成

---

## 资源类型

| 类型 | 作用 | 位置 |
|------|------|------|
| **工具** | OpenCode 工具定义 | `src/tools/` |
| **核心逻辑** | 任务管理、并发控制 | `src/simple-task-manager.ts`, `src/concurrency-manager.ts` |
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
├── runtime.ts            # OpenCode 事件钩子
├── debug.ts              # 调试日志系统
├── session-store.ts      # 会话状态存储
├── message-context.ts    # 消息上下文提取
├── session-messages.ts   # 消息提取
├── session-cursor.ts     # 消息游标 (避免重复输出)
├── progress-analyzer.ts  # 进度分析
├── loop-detector.ts      # 循环检测
├── mcp-tools.ts          # MCP 工具检测
├── utils.ts              # 规则发现工具
└── tools/
    ├── index.ts          # 工具注册
    ├── wopal-task.ts     # wopal_task 工具
    ├── wopal-output.ts   # wopal_output 工具
    └── wopal-cancel.ts   # wopal_cancel 工具
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
type WopalTaskStatus = 'pending' | 'running' | 'completed' | 'error' | 'cancelled' | 'interrupt'

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
}
```

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