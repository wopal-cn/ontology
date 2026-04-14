# wopal-plugin — Wopal OpenCode 插件

> **定位**：Wopal 专用的 OpenCode 插件，提供规则注入 + 非阻塞任务委派 + 记忆系统

---

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                     index.ts (入口)                         │
│              返回 { tool, event, hook, ... }               │
├─────────────────────────────────────────────────────────────┤
│  运行时 (runtime.ts)            │  任务管理                 │
│  ├── 规则注入(rules/)           │  simple-task-manager.ts   │
│  ├── 记忆注入(memory/)          │  concurrency-manager.ts   │
│  ├── 消息转换                   │  stuck-detector.ts        │
│  └── 事件路由                   │  progress-tracker.ts      │
├─────────────────────────────────────────────────────────────┤
│  诊断与检测                     │  通信辅助                  │
│  ├── idle-diagnostic.ts        │  permission-proxy.ts      │
│  ├── error-classifier.ts       │  question-relay.ts        │
│  └── loop-detector.ts          │  session-messages.ts      │
├─────────────────────────────────────────────────────────────┤
│  rules/ (规则子系统)            │  tools/ (OpenCode 工具)    │
│  ├── discoverer.ts              │  ├── wopal-task.ts        │
│  ├── matcher.ts                 │  ├── wopal-task-output.ts │
│  ├── formatter.ts               │  ├── wopal-task-reply.ts  │
│  └── path-extractor.ts          │  ├── wopal-task-interrupt │
├─────────────────────────────────────────────────────────────┤
│  memory/ (记忆系统)             │  utils/ (通用工具)        │
│  ├── store.ts (418行)           │  debug.ts                 │
│  ├── embedder.ts                │  session-store.ts         │
│  ├── retriever.ts               │  utils.ts                 │
│  ├── injector.ts                │                           │
│  ├── distill.ts (249行)         │                           │
│  ├── session-context.ts         │                           │
│  ├── llm-client.ts              │                           │
│  ├── categories.ts              │                           │
│  ├── conversation.ts            │                           │
│  ├── dedup.ts                   │                           │
│  ├── prompts.ts                 │                           │
│  └── types.ts                   │                           │
└─────────────────────────────────────────────────────────────┘
```

**数据流**：
1. **规则注入**：`rules/discoverer` → `rules/matcher` → `rules/formatter` → `runtime.ts`(systemTransform) → OpenCode
2. **任务委派**：`wopal_task` → `simple-task-manager` → 子会话 → `idle-diagnostic` → 状态更新
3. **记忆注入**：`memory/store` → `memory/retriever` → `runtime.ts`(systemTransform) → OpenCode
4. **上下文管理**：`context_manage` → `memory/session-context` → `buildEnrichedQuery`

**核心流程**：
- **规则注入**：发现规则文件 → 匹配条件 → 注入系统提示词
- **任务委派**：`wopal_task` 启动子会话 → `wopal_task_output` 查询状态 → `session.idle` 触发诊断 → Wopal 判断完成/等待/错误
- **双向通信**：子会话等待 → `[WOPAL TASK WAITING]` 通知父代理 → `wopal_task_reply` 恢复执行
- **进度通知**：ticker 每 30s 检查 → 消息数/时间/上下文用量触发阈值 → 通知父代理
- **上下文管理**：`context_manage summary` 生成摘要 → 存入 SessionContext → `buildEnrichedQuery` 读缓存增强检索

---

## 资源类型

| 类型 | 作用 | 位置 |
|------|------|------|
| **工具** | OpenCode 工具定义（7 个） | `src/tools/` |
| **规则子系统** | 规则发现、匹配、格式化、路径提取 | `src/rules/` |
| **核心逻辑** | 任务管理、并发控制 | `src/simple-task-manager.ts`, `src/concurrency-manager.ts` |
| **诊断模块** | Idle 状态诊断 | `src/idle-diagnostic.ts` |
| **检测器** | Stuck 检测、循环检测、错误分类 | `src/stuck-detector.ts`, `src/loop-detector.ts`, `src/error-classifier.ts` |
| **运行时** | 事件钩子、规则注入、消息转换 | `src/runtime.ts` |
| **通信辅助** | 权限代理、问题中继 | `src/permission-proxy.ts`, `src/question-relay.ts` |
| **测试** | 单元测试 | `src/*.test.ts`, `src/rules/*.test.ts` |

---

## 目录结构

### 当前结构

```
src/                              # 源码目录
├── index.ts                      # 入口
├── types.ts                      # 类型定义
│
├── runtime.ts                    # 运行时（事件路由、规则/记忆注入、消息转换）
├── simple-task-manager.ts        # 任务管理（状态、启动、监控、进度通知）
│
├── rules/                        # 规则子系统（#88 从 utils.ts 拆分）
│   ├── index.ts                  # 统一导出
│   ├── discoverer.ts             # 规则发现（扫描 .agents/rules/）
│   ├── matcher.ts                # 条件匹配（路径、文件类型）
│   ├── formatter.ts              # 规则格式化
│   ├── path-extractor.ts         # 路径提取
│   └── *.test.ts                 # 测试文件
│
├── concurrency-manager.ts        # 并发控制
├── stuck-detector.ts             # Stuck 检测
├── progress-tracker.ts           # 进度追踪
├── progress-analyzer.ts          # 进度分析
├── error-classifier.ts           # 错误分类
├── idle-diagnostic.ts            # Idle 诊断
├── loop-detector.ts              # 循环检测
├── permission-proxy.ts           # 权限代理
├── question-relay.ts             # 问题中继
├── process-cleanup.ts            # 进程清理
├── debug.ts                      # 调试日志
├── session-store.ts              # 会话存储
├── session-store-instance.ts     # 会话存储实例
├── message-context.ts            # 消息上下文
├── session-messages.ts           # 消息提取
├── session-cursor.ts             # 消息游标
├── mcp-tools.ts                  # MCP 工具
├── test-helpers.ts               # 测试辅助
│
├── memory/                       # 记忆子系统
│   ├── index.ts                  # 统一导出
│   ├── store.ts                  # LanceDB CRUD（tags 字段）
│   ├── embedder.ts               # OpenAI Embedding
│   ├── retriever.ts              # 语义检索（tags boost）
│   ├── injector.ts               # 格式化注入系统提示词
│   ├── distill.ts                # 蒸馏引擎核心逻辑（preview/confirm/cancel）
│   ├── session-context.ts        # 会话状态模型
│   ├── llm-client.ts             # LLM 客户端
│   ├── categories.ts             # 记忆分类定义（#89 内部拆分）
│   ├── conversation.ts           # 会话消息提取（#89 内部拆分）
│   ├── dedup.ts                  # 去重逻辑（#89 内部拆分）
│   ├── prompts.ts                # 蒸馏提示词模板（#89 内部拆分）
│   ├── types.ts                  # 记忆类型定义（#89 内部拆分）
│   └── store.test.ts             # 测试文件
│
└── tools/                        # OpenCode 工具定义
    ├── index.ts                  # 工具注册入口
    ├── wopal-task.ts             # 启动任务
    ├── wopal-task-output.ts      # 查询状态/完成/输出
    ├── wopal-task-reply.ts       # 恢复/中断子会话
    ├── wopal-task-interrupt.ts   # 强制中断任务
    ├── wopal-task-diff.ts        # 查看任务文件变更
    ├── memory-manage.ts          # 记忆 CRUD + 蒸馏（preview/confirm/cancel）
    ├── context-manage.ts         # 会话摘要 + 状态查询（summary/status）
    └── distill-formatters.ts     # 蒸馏输出格式化
```

### 目标结构（拆分规划）

```
src/
├── rules/                   # ✅ 已完成 (#88)
│   ├── discoverer.ts
│   ├── matcher.ts
│   ├── formatter.ts
│   └── path-extractor.ts
├── memory/                  # ✅ 内部拆分已完成 (#89)
│   ├── categories.ts
│   ├── conversation.ts
│   ├── dedup.ts
│   ├── prompts.ts
│   └── types.ts
├── hooks/                   # 从 runtime.ts 拆分
│   ├── event-handler.ts
│   ├── system-transform.ts
│   └── message-transform.ts
├── tasks/                   # 从 simple-task-manager.ts 拆分
│   ├── manager.ts
│   ├── launcher.ts
│   └── monitor.ts

scripts/                     # CLI 工具（从根目录移入）
test/                        # 测试工具（从根目录移入）
```

### 拆分任务清单

| 当前文件 | 拆分为 | 状态 |
|----------|--------|------|
| `utils.ts` | `rules/` 目录 | ✅ 已完成 (#88) |
| `distill.ts` + `store.ts` | memory 内部模块 | ✅ 已完成 (#89) |
| `runtime.ts` | `hooks/` 目录 | 🔴 待拆 |
| `simple-task-manager.ts` | `tasks/` 目录 | 🔴 待拆 |
| 根目录 `*.ts` 脚本 | 移入 `scripts/` | 🔴 待移 |
| `pnpm-lock.yaml` | 删除 | 🔴 待删 |
| `pnpm-workspace.yaml` | 删除 | 🔴 待删 |

---

## 工具清单

| 工具名 | 作用 | 关键参数 |
|--------|------|----------|
| `wopal_task` | 启动子会话任务 | `description`, `prompt`, `agent` |
| `wopal_task_output` | 查询状态/输出/完成 | `task_id`, `section`, `last_n`, `action` |
| `wopal_task_reply` | 恢复或中断等待中的子会话 | `task_id`, `message`, `interrupt` |
| `wopal_task_interrupt` | 强制中断运行中的任务 | `task_id` |
| `wopal_task_diff` | 查看任务产生的文件变更 | `task_id` |
| `memory_manage` | 记忆 CRUD + 蒸馏 | `command`, `query`, `text`, `category`, `tags`, `id` |
| `context_manage` | 会话摘要/状态查询 | `action` (summary/status) |

> **命名约定**：任务相关工具统一 `wopal_task_*` 前缀；`wopal_task_interrupt` 是旧 `wopal_cancel` 的重命名。

---

## 文件规范

### 单文件限制

| 类型 | 最大行数 | 说明 |
|------|----------|------|
| 核心逻辑文件 | **300 行** | 超过必须拆分 |
| 工具定义文件 | **150 行** | 单一职责 |
| 类型定义文件 | **200 行** | 可适当放宽 |

**触发拆分信号**：文件超过 300 行、函数超过 50 行、职责超过 2 个、导入超过 15 个模块。

---

## 核心类型

```typescript
// 任务状态（无终态 — 任务是永续对话通道）
type WopalTaskStatus = 'pending' | 'running' | 'waiting' | 'error'

// 错误分类
type ErrorCategory = 'timeout' | 'crash' | 'network' | 'cancelled' | 'unknown'

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
  waitingReason?: string
  lastAssistantMessage?: string
  // 进度通知追踪
  lastNotifyMessageCount?: number
  lastNotifyTime?: Date
  lastContextUsage?: number
  lastNotifyContextUsage?: number
  // Stuck 检测
  stuckNotified?: boolean
  stuckNotifiedAt?: Date
  // 其他
  pendingQuestionID?: string
  idleNotified?: boolean
}

// 记忆记录（store.ts）
interface MemoryRecord {
  id: string
  body: string           // 记忆正文（结论前置格式）
  tags: string           // 逗号分隔关键词
  category: string       // 7 个合法分类之一
  importance: number     // 0-1
  project?: string
  vector?: number[]
  createdAt: number
}
```

---

## 双向通信机制

### 状态流转

```
running → [session.idle] → IDLE 通知 → Wopal 判断
Wopal → wopal_task_output(action="complete") 完成任务
     → wopal_task_reply(message="...") 恢复任务
     → wopal_task_reply(message="...", interrupt=true) 中断并纠偏
     → wopal_task_interrupt(task_id) 强制中断
```

### 通知格式

| 状态 | 通知标记 | 说明 |
|------|---------|------|
| `waiting` | `[WOPAL TASK WAITING]` | 子代理提问，等待父代理回复 |
| `error` | `[WOPAL TASK ERROR]` | 任务异常终止 |
| `permission` | `[WOPAL TASK PERMISSION]` | 权限自动授权通知 |
| `question` | `[WOPAL TASK QUESTION]` | Question Tool 事件中继 |

### 进度通知

ticker 每 30 秒检查运行中任务，满足任一条件时通知父代理：

| 触发条件 | 阈值 | 说明 |
|----------|------|------|
| 消息数增长 | ≥ 20 条新消息 | `lastNotifyMessageCount` 基准 |
| 时间间隔 | ≥ 3 分钟 | `lastNotifyTime` 基准 |
| 上下文用量 | ≥ 45% 且增长 ≥ 5% | 避免子会话耗尽上下文 |

### 权限自动代理

子会话权限请求（如 bash、write）自动 `once` 授权，避免无 TUI 导致的永久阻塞。

---

## 记忆系统设计

记忆系统由两个子系统组成：**记忆蒸馏**（提取和存储长期记忆）和**上下文管理**（会话级状态管理）。

### 数据流

```
用户消息 → memory_manage(distill) → 提取记忆 → MemoryStore（LanceDB）
                                              ↓
用户消息 → buildEnrichedQuery ← 读 SessionContext ← context_manage(summary)
              ↓
         记忆检索 → 注入系统提示词
```

### 记忆蒸馏

**职责**：从会话中提取有价值的信息，存入 LanceDB 长期记忆。

| 组件 | 文件 | 职责 |
|------|------|------|
| DistillEngine | `memory/distill.ts` | 蒸馏核心逻辑（preview → confirm），内部模块：categories, conversation, dedup, prompts, types |
| MemoryStore | `memory/store.ts` | LanceDB CRUD，`tags` 字段，`get(id)` API |
| EmbeddingClient | `memory/embedder.ts` | OpenAI Embedding |
| MemoryRetriever | `memory/retriever.ts` | 语义检索（tags boost） |
| MemoryInjector | `memory/injector.ts` | 格式化注入系统提示词 |

**蒸馏流程**（通过 `memory_manage` 工具）：
1. `memory_manage command=distill` — LLM 提取候选记忆
2. 用户审查候选（Agent 必须全量展示）
3. `memory_manage command=confirm` — 去重后存入 LanceDB

### 上下文管理

**职责**：管理会话级状态（摘要、title），为记忆检索提供语义上下文。

| 组件 | 文件 | 职责 |
|------|------|------|
| SessionContext | `memory/session-context.ts` | 状态模型 + 文件 I/O |
| context_manage | `tools/context-manage.ts` | summary/status 子命令 |

**SessionContext 模型**（`~/.wopal/memory/state/{sessionID}.json`）：

```typescript
interface SessionContext {
  sessionID: string;
  title: string | null;
  distill?: {           // 蒸馏状态
    messageCount: number;
    extractedAt: string;
    depth: "shallow" | "deep";
  };
  summary?: {           // 会话摘要
    text: string;
    messageCount: number;
    generatedAt: string;
  };
}
```

**设计原则**：
- 按功能模块分块，新增功能加新块，不改已有结构
- 每个字段必须被后续流程读取并影响决策
- 不做向后兼容迁移，旧格式文件直接清理

**context_manage 工具**：
- `action=summary`：LLM 生成 ≤50 字摘要 → 存入 SessionContext → 更新 session title
- `action=status`：展示摘要/蒸馏状态 → 过时判断（新消息 > 20 条提示重新生成）

### 职责边界

`memory_manage` 和 `context_manage` 职责明确分离：

| 关注点 | 归属 | 工具/方法 |
|--------|------|----------|
| 记忆 CRUD + 蒸馏 | `memory_manage` | `list/stats/search/add/update/delete/injected/distill/confirm/cancel` |
| 会话摘要 + title | `context_manage` | `summary/status` |
| 注入时的语义 query | 上下文管理（读缓存） | `buildEnrichedQuery` |
| 历史状态清理 | 上下文管理 | `cleanupLegacyStateFiles` |

### 关键字段：tags

记忆记录使用 `tags` 字段（逗号分隔关键词）替代旧 `concepts` 字段。用于：
- `retriever.ts` 的 tags boost 提升检索精度
- `memory_manage update` 修改标签
- 蒸馏提示词中的候选标签

### store API

| 方法 | 用途 |
|------|------|
| `store.add(record)` | 新增记忆 |
| `store.get(id)` | 精确 ID 匹配（前缀匹配） |
| `store.search(query, limit)` | FTS + LIKE 混合检索 |
| `store.delete(ids)` | 批量删除 |
| `store.stats()` | 统计信息 |
| `store.listAll(limit?)` | 列出全部 |

---

## 关键常量

| 常量 | 值 | 用途 |
|------|-----|------|
| `CLEANUP_INTERVAL_MS` | 10 分钟 | 过期任务清理间隔 |
| `CLEANUP_MAX_AGE_MS` | 1 小时 | 任务最大保留时间 |
| `TASK_TTL_MS` | 30 分钟 | 非终态任务 TTL |
| `DEFAULT_CONCURRENCY_LIMIT` | 5 | 并发任务数限制 |
| `PROGRESS_NOTIFY_MESSAGE_THRESHOLD` | 20 | 进度通知消息数阈值 |
| `PROGRESS_NOTIFY_TIME_THRESHOLD_MS` | 3 分钟 | 进度通知时间阈值 |
| `CONTEXT_WARN_THRESHOLD` | 45% | 上下文用量警告阈值 |
| `CONTEXT_NOTIFY_INCREMENT` | 5% | 上下文增量通知阈值 |
| `DEFAULT_STUCK_TIMEOUT_MS` | — | Stuck 检测超时 |

---

## 部署

插件通过 `.opencode/plugins/` 目录的 symlink 自动发现机制加载，无需手动部署或配置。

### 自动发现机制

OpenCode 启动时自动扫描 `.opencode/plugins/*.{ts,js}`，无需在 `opencode.jsonc` 中声明。

### 插件安装位置

```
.opencode/plugins/
├── wopal-plugin.ts    → symlink → projects/ontology/plugins/wopal-plugin/src/index.ts
└── task-notify.js     → symlink → projects/ontology/plugins/task-notify.js
```

### 开发阶段

直接修改 `src/*.ts`，symlink 即时生效。**修改后必须重启 OpenCode** 才能生效（插件在启动时一次性加载）。

### 依赖管理

- `.opencode/package.json` 由 OpenCode 自动注入 `@opencode-ai/plugin` + 执行 `npm install`
- `wopal-plugin/node_modules/` 包含插件的其他依赖（`@lancedb/lancedb`, `openai`, `yaml`）
- Bun import 从 symlink 目标向上查找 `node_modules`，依赖可达

---

## 注意事项

- **禁止 console.log**：使用 `createDebugLog()` 或 `createWarnLog()` 输出日志
- **日志模块匹配**：`createDebugLog(prefix, module)` 的 `module` 决定日志能否被环境变量过滤。新增功能必须用对应模块的日志函数，禁止混用
- **调试日志禁止截断**：排错时看不到完整内容 = 白打。禁止 `.slice(0, N)` 截断
- **调试日志格式**：列表换行打印、一条事件一条日志、关键标识可读（附带 description 而非裸 UUID）
- **Bun 原生 TS**：OpenCode 直接运行 `.ts` 文件，无需 `dist/`
- **测试优先**：修改核心逻辑后运行 `bun run test:run` 验证
- **子会话无 TUI**：权限请求自动授权，Question Tool 事件中继到父代理
- **waiting 不释放并发槽**：任务恢复后继续执行，不占用新槽位
- **修改后需重启**：插件源码变更后必须重启 OpenCode 才能生效

---

## 开发规范

### 开发命令

```bash
bun install               # 安装依赖（必须用 Bun）
bun run test:run          # 运行所有测试
bun run test              # 进入 watch 模式
bun run build             # tsc 编译到 dist/
bun run lint              # ESLint
bun run format:check      # Prettier 检查
```

### 包管理器

只允许 Bun。禁止 npm、pnpm。

### 调试日志

```bash
WOPAL_PLUGIN_DEBUG=1       # 启用所有模块
WOPAL_PLUGIN_DEBUG=task    # 仅任务模块
WOPAL_PLUGIN_DEBUG=memory  # 仅记忆模块
WOPAL_PLUGIN_LOG_FILE=logs/debug.log  # 指定日志文件
```

默认日志位置：`tmpdir()/wopal-plugin.log`

### 代码风格

- TypeScript ESM 模块，`.js` 后缀导入
- 测试文件与源文件同目录（`foo.ts` + `foo.test.ts`）
- Vitest 测试框架
