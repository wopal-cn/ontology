# wopal-plugin — Wopal OpenCode 插件

> **定位**：Wopal 专用的 OpenCode 插件，提供规则注入 + 非阻塞任务委派能力

---

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                     index.ts (入口)                         │
│              返回 { tool, event, hook, ... }               │
├─────────────────────────────────────────────────────────────┤
│  hooks/ (事件钩子)              │  tasks/ (任务管理)         │
│  ├── event-handler.ts          │  ├── manager.ts           │
│  ├── system-transform.ts       │  ├── launcher.ts          │
│  └── message-transform.ts      │  └── monitor.ts           │
├─────────────────────────────────────────────────────────────┤
│  rules/ (规则注入)              │  diagnostics/ (状态诊断)  │
│  ├── discoverer.ts             │  ├── idle.ts              │
│  ├── matcher.ts                │  ├── stale.ts             │
│  └── formatter.ts              │  └── stuck.ts             │
├─────────────────────────────────────────────────────────────┤
│  memory/ (记忆系统)             │  tools/ (OpenCode 工具)    │
│  ├── store.ts                  │  ├── wopal-task.ts        │
│  ├── embedder.ts               │  ├── wopal-output.ts      │
│  ├── retriever.ts              │  ├── wopal-cancel.ts      │
│  ├── injector.ts               │  ├── wopal-reply.ts       │
│  ├── distill.ts                │  ├── distill-session.ts   │
│  ├── session-context.ts       │  ├── context-manage.ts    │
│  └── llm-client.ts             │  └── memory-manage.ts     │
├─────────────────────────────────────────────────────────────┤
│  utils/ (通用工具)                                            │
│  ├── debug.ts, session-store.ts, concurrency-manager.ts     │
└─────────────────────────────────────────────────────────────┘
```

**数据流**：
1. **规则注入**：`rules/discoverer` → `rules/matcher` → `hooks/system-transform` → OpenCode
2. **任务委派**：`tools/wopal-task` → `tasks/launcher` → 子会话 → `diagnostics/idle` → 状态更新
3. **记忆注入**：`memory/store` → `memory/retriever` → `hooks/system-transform` → OpenCode
4. **上下文管理**：`tools/context-manage` → `memory/session-context` → `buildEnrichedQuery`

**核心流程**：
- **规则注入**：发现规则文件 → 匹配条件 → 注入系统提示词
- **任务委派**：`wopal_task` 启动子会话 → `wopal_task_output` 查询状态 → `session.idle` 事件触发诊断 → 完成/等待/错误
- **双向通信**：子会话等待 → `[WOPAL TASK WAITING]` 通知父代理 → `wopal_task_reply` 恢复执行
- **上下文管理**：`context_manage summary` 生成摘要 → 存入 SessionContext → `buildEnrichedQuery` 读缓存增强检索

---

## 资源类型

| 类型 | 作用 | 位置 |
|------|------|------|
| **工具** | OpenCode 工具定义 | `src/tools/` |
| **核心逻辑** | 任务管理、并发控制 | `src/simple-task-manager.ts`, `src/concurrency-manager.ts` |
| **诊断模块** | Idle 状态诊断 | `src/idle-diagnostic.ts` |
| **事件处理** | 权限代理、问题中继 | `src/permission-proxy.ts`, `src/question-relay.ts` |
| **检测器** | 错误分类 | `src/error-classifier.ts` |
| **运行时** | 事件钩子、规则注入 | `src/runtime.ts` |
| **测试** | 单元测试 | `src/*.test.ts` |

---

## 目录结构

### 当前结构（现状）

```
src/                         # 源码目录
├── index.ts                 # 入口 ✅
├── types.ts                 # 类型定义 ✅
│
├── runtime.ts               # ⚠️ 784 行，职责过载
├── simple-task-manager.ts   # ⚠️ 690 行，职责过载
├── utils.ts                 # ⚠️ 612 行，职责模糊
│
├── concurrency-manager.ts   # 并发控制 ✅
├── stuck-detector.ts        # Stuck 检测
├── error-classifier.ts      # 错误分类
├── idle-diagnostic.ts       # Idle 诊断
├── permission-proxy.ts      # 权限代理
├── question-relay.ts        # 问题中继
├── debug.ts                 # 调试日志
├── session-store.ts         # 会话存储
├── message-context.ts       # 消息上下文
├── session-messages.ts      # 消息提取
├── session-cursor.ts        # 消息游标
├── progress-analyzer.ts     # 进度分析
├── loop-detector.ts         # 循环检测
├── mcp-tools.ts             # MCP 工具
│
├── memory/                  # ✅ 结构良好
│   ├── store.ts
│   ├── embedder.ts
│   ├── retriever.ts
│   ├── injector.ts
│   ├── distill.ts           # ⚠️ 907 行
│   ├── llm-client.ts
│   └── index.ts
│
└── tools/                   # ✅ 结构良好
    ├── index.ts
    ├── wopal-task.ts
    ├── wopal-output.ts
    ├── wopal-cancel.ts
    ├── wopal-reply.ts
    ├── distill-session.ts
    └── memory-manage.ts

根目录/                       # ⚠️ 脚本混放
├── import-memory-md.ts      # CLI 工具
├── check-memories.ts        # CLI 工具
├── clean-memories.ts        # CLI 工具
├── manage-memories.ts       # CLI 工具
├── migrate-embeddings.ts    # CLI 工具
├── test-retrieval.ts        # 测试工具
├── test-retriever-live.ts   # 测试工具
├── validate-wopal-plugin.ts # 验证工具
├── bun.lock                 # ✅ 主锁文件（保留）
└── pnpm-lock.yaml          # ⚠️ 冗余锁文件（待删）
```

### 规范结构（目标）

```
src/                         # 源码目录
├── index.ts                 # 入口
├── types.ts                 # 类型定义
│
├── rules/                   # 规则模块（从 utils.ts 拆分）
│   ├── discoverer.ts       # 规则发现
│   ├── matcher.ts          # 条件匹配
│   └── formatter.ts        # 格式化
│
├── hooks/                   # OpenCode 事件钩子（从 runtime.ts 拆分）
│   ├── event-handler.ts    # 事件路由
│   ├── system-transform.ts # 规则/记忆注入
│   └── message-transform.ts # 消息转换
│
├── tasks/                   # 任务管理（从 simple-task-manager.ts 拆分）
│   ├── manager.ts          # 核心状态管理
│   ├── launcher.ts         # 启动逻辑
│   └── monitor.ts          # 监控（timeout、stale、stuck）
│
├── diagnostics/             # 状态诊断（整合检测器）
│   ├── idle.ts             # Idle 诊断
│   ├── stale.ts            # Stale 检测
│   └── stuck.ts            # Stuck 检测
│
├── memory/                  # 记忆子系统（保持）
│   ├── store.ts
│   ├── embedder.ts
│   ├── retriever.ts
│   ├── injector.ts
│   ├── distill.ts
│   └── llm-client.ts
│
├── tools/                   # OpenCode 工具（保持）
│   └── ...
│
└── utils/                   # 通用工具
    ├── debug.ts
    ├── session-store.ts
    └── concurrency.ts

scripts/                     # CLI 工具（从根目录移入）
├── import-memory.ts
├── check-memories.ts
├── manage-memories.ts
├── migrate-embeddings.ts
└── validate.ts

test/                        # 测试工具（从根目录移入）
├── test-retrieval.ts
└── test-retriever-live.ts
```

### 拆分任务清单

| 当前文件 | 行数 | 拆分为 | 状态 |
|----------|------|--------|------|
| `runtime.ts` | 784 | `hooks/event-handler.ts`, `hooks/system-transform.ts`, `hooks/message-transform.ts` | 🔴 待拆 |
| `simple-task-manager.ts` | 690 | `tasks/manager.ts`, `tasks/launcher.ts`, `tasks/monitor.ts` | 🔴 待拆 |
| `utils.ts` | 612 | `rules/discoverer.ts`, `rules/matcher.ts`, `rules/formatter.ts` | 🔴 待拆 |
| `memory/distill.ts` | 907 | 内部拆分或保持 | 🟡 待评估 |
| 根目录 `*.ts` 脚本 | 7 个 | 移入 `scripts/` 和 `test/` | 🔴 待移 |
| `pnpm-lock.yaml` | - | 删除（保留 bun.lock） | 🔴 待删 |
| `pnpm-workspace.yaml` | - | 删除（Bun 不需要） | 🔴 待删 |

---

## 文件规范

### 单文件限制

| 类型 | 最大行数 | 说明 |
|------|----------|------|
| 核心逻辑文件 | **300 行** | 超过必须拆分 |
| 工具定义文件 | **150 行** | 单一职责 |
| 类型定义文件 | **200 行** | 可适当放宽 |

**触发拆分信号**：
- 文件超过 300 行
- 一个类/函数超过 50 行
- 职责超过 2 个（"和"字出现）
- 导入超过 15 个模块

### 拆分原则

| 原模块 | 拆分策略 |
|--------|----------|
| `runtime.ts` | → `hooks/` 目录：`event-handler.ts`, `system-transform.ts`, `message-transform.ts` |
| `simple-task-manager.ts` | → `tasks/` 目录：`manager.ts`, `launcher.ts`, `monitor.ts` |
| `utils.ts` | → `rules/` 目录：`discoverer.ts`, `matcher.ts`, `formatter.ts` |

---

## 目录规范

### 必须遵守

1. **CLI 工具放 `scripts/`**：根目录禁止 `.ts` 脚本，必须移入 `scripts/`
2. **测试工具放 `test/`**：非 `*.test.ts` 的测试工具放 `test/`
3. **功能模块按目录组织**：
   - `rules/` — 规则发现与注入
   - `hooks/` — OpenCode 事件钩子
   - `tasks/` — 任务管理
   - `diagnostics/` — 状态诊断（idle、stale、stuck）
   - `memory/` — 记忆子系统
   - `tools/` — OpenCode 工具定义

4. **单一职责**：每个文件只做一件事
5. **命名规范**：
   - 文件名使用 kebab-case
   - 类名使用 PascalCase
   - 函数/变量使用 camelCase

### 禁止做法

- ❌ 根目录放置 `.ts` 脚本（放 `scripts/`）
- ❌ 单文件超过 300 行（必须拆分）
- ❌ 循环依赖（A 导入 B，B 又导入 A）
- ❌ `utils.ts` 成为垃圾场（职责必须明确）
- ❌ 使用 npm 或 pnpm（必须用 Bun）
- ❌ 同时存在多个锁文件（只保留 `bun.lock`）

---

## 开发规范

### 开发命令

```bash
# 安装依赖
bun install                    # 使用 Bun（与 OpenCode 宿主一致）

# 测试
bun run test:run              # 运行所有测试
bun run test                  # 进入 watch 模式

# 构建
bun run build                 # tsc 编译到 dist/

# 代码检查
bun run lint                  # ESLint
bun run format:check          # Prettier 检查
```

### 包管理器规范

| 包管理器 | 使用场景 |
|----------|----------|
| **Bun** | ✅ 本项目必须使用 Bun |
| pnpm | ❌ 禁止（会产生冗余锁文件） |
| npm | ❌ 禁止（与 OpenCode 宿主不一致） |

**原因**：
- OpenCode 宿主指定 `packageManager: "bun@1.3.11"`
- Bun 原生支持 TypeScript，无需编译即可运行 `.ts` 文件
- 插件开发应与宿主环境保持一致

### 调试日志

通过环境变量控制：

```bash
# 启用调试日志
WOPAL_PLUGIN_DEBUG=1      # 启用所有模块
WOPAL_PLUGIN_DEBUG=task   # 仅任务模块
WOPAL_PLUGIN_DEBUG=rules  # 仅规则模块

# 指定日志文件
WOPAL_PLUGIN_LOG_FILE=logs/wopal-plugins-debug.log
```

日志位置由 `WOPAL_PLUGIN_LOG_FILE` 环境变量指定，默认 `tmpdir()/wopal-plugin.log`

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
running → [session.idle] → IDLE 通知 → Wopal 判断
Wopal → wopal_task_output 检查 → wopal_task_output(action="complete") / wopal_task_reply / wopal_task_cancel
```

### 通知格式

| 状态 | 通知标记 | 说明 |
|------|---------|------|
| `waiting` | `[WOPAL TASK WAITING]` | 子代理提问，等待父代理回复 |
| `error` | `[WOPAL TASK ERROR]` | 任务异常终止 |
| `permission` | `[WOPAL TASK PERMISSION]` | 权限自动授权通知 |
| `question` | `[WOPAL TASK QUESTION]` | Question Tool 事件中继 |

### wopal_task_reply 使用

当收到 `[WOPAL TASK WAITING]` 通知时，父代理可使用 `wopal_task_reply` 恢复子会话：

```
wopal_task_reply(task_id="wopal-task-xxx", message="继续执行方案 A")
```

中断走偏的任务：

```
wopal_task_reply(task_id="wopal-task-xxx", message="改用方案 B", interrupt=true)
```

### 权限自动代理

子会话权限请求（如 bash、write）自动 `once` 授权，避免无 TUI 导致的永久阻塞。

---

## 关键常量

| 常量 | 值 | 用途 |
|------|-----|------|
| `MAX_TIMEOUT_MS` | 1 小时 | 最大超时 |
| `TASK_TTL_MS` | 30 分钟 | 非终态任务 TTL |
| `DEFAULT_MESSAGE_STALENESS_TIMEOUT_MS` | 30 分钟 | 启动后 stale 检测 |
| `DEFAULT_CONCURRENCY_LIMIT` | 3 | 并发任务数限制 |

---

## 部署 （注意：测试验证过程中无需部署）

插件通过 `sync-to-wopal.py` 同步到 `.wopal/` 目录：

```bash
cd /Users/sam/coding/wopal/wopal-workspace
python scripts/sync-to-wopal.py -y
```

OpenCode 配置 (`opencode.jsonc`)：

### 部署前从源码目录测试
```json
"plugin": [
  "./projects/ontology/plugins/wopal-plugin/src/index.ts"
]
```

### 部署后从部署层加载
```json
"plugin": [
  "./.wopal/plugins/wopal-plugin/src/index.ts"
]
```


---

## 注意事项

- **禁止 console.log**：使用 `createDebugLog()` 或 `createWarnLog()` 输出日志
- **日志模块匹配**：`createDebugLog(prefix, module)` 的 `module` 参数决定日志能否被环境变量过滤输出。新增功能的日志**必须**用对应模块的日志函数，禁止混用（如记忆注入相关日志必须用 `"memory"` 模块，不能默认用 `"rules"`）
- **调试日志禁止截断**：调试日志的唯一目的是排错，必须完整输出内容。禁止使用 `.slice(0, N)` 截断日志内容，禁止省略关键信息。排错时看不到完整内容 = 白打
- **调试日志格式规范**：日志是给人看的，必须对用户友好
  - **列表内容换行打印**：多条记录（如记忆 ID、任务列表、错误条目）必须逐行打印，每条一行，禁止用逗号拼接在一行内。用 `items.map((x, i) => `  [${i+1}] ${x}`).join("\n")` 格式
  - **一条事件一条日志**：`debugLog` 调用对应一个逻辑事件，不要把多条事件的 info 拼成一次调用。但同一事件的摘要和明细可以包含换行
  - **关键标识可读**：打印 ID 时附带人类可读标识（如记忆 title、任务 description），不能只打印裸 UUID
  - **反例**：`retrieved=8, injected=19, tokens=451: 6d14ae76, 70e940c5, 44d8d18c, ...`（挤一行、无标题、无序号）
  - **正例**：`retrieved=8, injected=8, tokens=451\n  [1] 6d14ae76(OpenCode 不支持从其他...)\n  [2] 70e940c5(脚本中 gh CLI 必须...)`
- **Bun 原生 TS**：OpenCode 直接运行 `.ts` 文件，无需 `dist/`
- **测试优先**：修改核心逻辑后运行 `bun run test:run` 验证
- **子会话无 TUI**：权限请求自动授权，Question Tool 事件中继到父代理
- **waiting 不释放并发槽**：任务恢复后继续执行，不占用新槽位