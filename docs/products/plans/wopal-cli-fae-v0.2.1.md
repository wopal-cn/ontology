# Plan: wopal fae CLI v0.2.1 Implementation

> **Feature Type**: 新功能
> **Complexity**: 高
> **Affected Systems**: wopal-cli, agent-orchestration skill
> **Core Dependencies**: eventsource
> **Created**: 2026-03-11
> **Updated**: 2026-03-12
> **Prerequisite**: wopal-cli v0.2.0 架构升级完成

---

## 1. 功能概述

### 面临问题

Wopal（运行在 OpenCode TUI 中的 AI Agent）无法直接调用 HTTP API 或 SDK，只能通过 bash 工具执行 CLI 命令。需要一套专门为 AI Agent 设计的工具集来管理 sandbox agent（Fae）并监控其执行进度。

### 解决方案

基于 v0.2.0 延迟加载架构，构建 `wopal fae` CLI 子命令，封装 OpenCode HTTP API，提供：
- 沙箱管理（启动/停止/列表/日志）
- 会话管理（创建/列表/删除/状态/todo/diff）
- 消息交互（同步发送/流式输出）
- 后台任务（启动/状态/等待/取消）
- SSE 事件订阅

### 用户故事

```
As Wopal (AI Agent)
I want 通过 CLI 管理 sandbox 和 session，发送消息并监控 Fae 执行进度
So that 我可以委派任务给 Fae 并获取执行结果
```

---

## 2. 上下文参考

### 项目位置

| 版本 | 目录 | 说明 |
|------|------|------|
| v0.1.0 | `tools/wopal-cli/` | 旧版本，保留备份 |
| **v0.2.0+** | `wopal-cli/` | 新架构（延迟加载） |

### 现有代码参考

#### wopal-cli（新架构）

| 文件 | 原因 |
|------|------|
| `src/commands/skills/index.ts` | 子命令注册模式、延迟加载集成 |
| `src/lib/logger.ts` | Logger 注入模式 |
| `src/lib/error-utils.ts` | 统一错误处理 |
| `src/lib/help-texts.ts` | Help Text 构建工具 |
| `src/program/register-subclis.ts` | 子命令延迟加载注册 |

### 需要创建的新文件

| 文件 | 用途 |
|------|------|
| `src/commands/fae/index.ts` | fae 主命令注册 |
| `src/commands/fae/sandbox.ts` | sandbox 子命令 |
| `src/commands/fae/session.ts` | session 子命令 |
| `src/commands/fae/send.ts` | send 命令 |
| `src/commands/fae/stream.ts` | stream 命令 |
| `src/commands/fae/task.ts` | task 子命令 |
| `src/commands/fae/event.ts` | event 命令 |
| `src/lib/fae/types.ts` | 类型定义 |
| `src/lib/fae/client.ts` | OpenCode HTTP API 客户端 |
| `src/lib/fae/docker.ts` | Docker 容器管理 |
| `src/lib/fae/event-monitor.ts` | SSE 事件监控 |
| `src/lib/fae/task-manager.ts` | 任务管理器 |
| `src/lib/fae/storage.ts` | 本地存储 |
| `src/lib/fae/progress.ts` | 进度计算 |
| `tests/commands/fae/*.test.ts` | 测试文件 |

### 参考文档

| 文档 | 位置 | 说明 |
|------|------|------|
| [PRD-wopal-cli.md](../PRD-wopal-cli.md) | 产品需求和验收标准 |
| [DESIGN-wopal-cli.md](../DESIGN-wopal-cli.md) | 命令设计和架构 |
| [opencode-session-agent-messaging.md](../../research/opencode-session-agent-messaging.md) | Session/Message API 详解 |
| [opencode-project-worktree-workspace-architecture.md](../../research/opencode-project-worktree-workspace-architecture.md) | Project/Worktree 架构 |
| [opencode-sdk-gap-analysis.md](../../analysis/opencode-sdk-gap-analysis.md) | API 覆盖率分析 |

---

## 3. 需遵循的代码模式

### 命名约定

- 命令注册函数：`register<Command>Command`
- Logger 注入函数：`setLogger`
- 类型定义：PascalCase，在 `src/lib/fae/types.ts` 集中定义
- 常量：UPPER_SNAKE_CASE

### 延迟加载集成

fae 子命令通过 `register-subclis.ts` 注册为延迟加载：

```typescript
// src/program/register-subclis.ts
const entries: SubCliEntry[] = [
  // ... existing entries
  {
    name: "fae",
    description: "Sandbox agent management",
    register: async (program) => {
      const mod = await import("../commands/fae/index.js");
      mod.registerFaeCli(program);
    },
  },
];
```

### 错误处理

- 使用 `handleCommandError` 统一处理
- API 错误封装为 `FaeClientError` 类型
- JSON 输出时错误信息包含在 `error` 字段

### 日志记录

- 使用注入的 Logger 实例
- Debug 模式输出详细 API 调用信息
- 不在日志中输出敏感信息（token、密钥）

### JSON 输出格式

```typescript
// 成功响应
{ "success": true, "data": { ... } }

// 错误响应
{ "success": false, "error": "message", "code": "ERROR_CODE" }
```

---

## 4. 阶段实现计划

### Phase 1: 基础架构

- 创建 lib/fae 目录结构
- 实现 types.ts 类型定义
- 实现 client.ts HTTP API 客户端
- 实现 storage.ts 本地存储

### Phase 2: 沙箱管理

- 实现 docker.ts Docker 管理
- 实现 sandbox.ts 命令
- 支持 start/stop/list/logs

### Phase 3: 会话管理

- 实现 session.ts 命令
- 支持 create/list/delete/status/todo/diff
- 集成 client.ts

### Phase 4: 消息交互

- 实现 send.ts 同步发送
- 实现 stream.ts 流式输出
- 集成 event-monitor.ts

### Phase 5: 后台任务

- 实现 event-monitor.ts SSE 监控
- 实现 task-manager.ts 任务管理
- 实现 progress.ts 进度计算
- 实现 task.ts 命令

### Phase 6: 集成

- 更新 register-subclis.ts 添加 fae entry
- 编写单元测试
- 端到端工作流验证
- 更新 AGENTS.md

---

## 5. 详细任务拆解

### Phase 1: 基础架构

---

### T1: CREATE src/lib/fae/types.ts

- [ ] **状态**: 待处理
- **IMPLEMENT**: 定义 Fae CLI 核心类型
- **PATTERN**: 参考 `src/types/lock.ts` 的类型定义模式
- **IMPORTS**: 无
- **GOTCHA**: 使用 `export type` 和 `export interface` 分离类型和值
- **VALIDATE**: `pnpm build`

```typescript
// Sandbox 相关
export interface SandboxInfo {
  id: string;
  project: string;
  port: number;
  url: string;
  status: 'running' | 'stopped' | 'error';
  containerId?: string;
  createdAt: string;
}

// Session 相关
export interface SessionInfo {
  id: string;
  sandboxId: string;
  title?: string;
  status: 'idle' | 'busy' | 'retry';
  createdAt: string;
}

// Task 相关
export interface TaskInfo {
  taskId: string;
  sessionId: string;
  sandboxId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  message: string;
  startedAt: string;
  completedAt?: string;
}

export interface TaskProgress {
  taskId: string;
  status: string;
  progress: {
    currentStep: string;
    stepDescription?: string;
  };
  context: {
    tokensUsed: number;
    tokensLimit: number;
    usagePercent: number;
  };
  activity: {
    lastEvent: string;
    lastEventAt: string;
    idleSeconds: number;
  };
  health: {
    isStuck: boolean;
    warnings: Array<{ type: string; message: string; suggestion?: string }>;
  };
}

// SSE 事件类型
export interface FaeEvent {
  type: string;
  properties: Record<string, unknown>;
}

// API 响应类型
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}
```

---

### T2: CREATE src/lib/fae/storage.ts

- [ ] **状态**: 待处理
- **IMPLEMENT**: 本地 JSON 文件存储，管理 sandbox 和 task 元数据
- **PATTERN**: 参考 `src/lib/lock-manager.ts` 的文件读写模式
- **IMPORTS**: `fs-extra`, `path`, `os`
- **GOTCHA**: 使用 `~/.wopal/fae/` 作为存储目录，确保目录存在
- **VALIDATE**: `pnpm build`

```typescript
// 核心功能：
// - getStorageDir(): string - 返回 ~/.wopal/fae/
// - saveSandbox(info: SandboxInfo): Promise<void>
// - loadSandbox(id: string): Promise<SandboxInfo | null>
// - listSandboxes(): Promise<SandboxInfo[]>
// - deleteSandbox(id: string): Promise<void>
// - saveTask(info: TaskInfo): Promise<void>
// - loadTask(taskId: string): Promise<TaskInfo | null>
// - listTasks(): Promise<TaskInfo[]>
// - deleteTask(taskId: string): Promise<void>
```

---

### T3: CREATE src/lib/fae/client.ts

- [ ] **状态**: 待处理
- **IMPLEMENT**: OpenCode HTTP API 客户端，封装所有 API 调用
- **PATTERN**: 参考 `opencode-sdk` 的 API 调用模式，使用 fetch
- **IMPORTS**: `Logger`, `types.ts`
- **GOTCHA**: 
  - 使用 `http://127.0.0.1:{port}` 作为 base URL
  - 超时设置 30 秒
  - 错误时抛出 FaeClientError
- **VALIDATE**: `pnpm build`

```typescript
// 核心功能：
// - constructor(port: number, logger?: Logger)
// - session.list(): Promise<SessionInfo[]>
// - session.create(title?: string): Promise<SessionInfo>
// - session.delete(id: string): Promise<void>
// - session.status(id: string): Promise<{ status: string }>
// - session.todo(id: string): Promise<TodoItem[]>
// - session.diff(id: string): Promise<DiffResult>
// - session.command(id: string, cmd: string): Promise<void>
// - session.send(id: string, message: string): Promise<string>
// - session.sendAsync(id: string, message: string): Promise<void>
// - global.health(): Promise<boolean>
// - global.event(): Promise<EventSource> // SSE

// 错误类
export class FaeClientError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'FaeClientError';
  }
}
```

---

### Phase 2: 沙箱管理

---

### T4: CREATE src/lib/fae/docker.ts

- [ ] **状态**: 待处理
- **IMPLEMENT**: Docker 容器管理，使用 child_process 调用 docker CLI
- **PATTERN**: 参考 `src/lib/git.ts` 的子进程调用模式
- **IMPORTS**: `child_process.spawn`, `Logger`, `types.ts`, `storage.ts`
- **GOTCHA**:
  - 容器命名：`wopal-fae-{project-hash}`
  - 端口范围：20001-20100
  - 挂载项目目录到容器
- **VALIDATE**: `pnpm build`

```typescript
// 核心功能：
// - setLogger(logger: Logger): void
// - findAvailablePort(): Promise<number>
// - startSandbox(projectPath: string, port?: number): Promise<SandboxInfo>
// - stopSandbox(sandboxId: string): Promise<void>
// - listSandboxes(): Promise<SandboxInfo[]>
// - getLogs(sandboxId: string, tail?: number): Promise<string>
// - checkDockerAvailable(): Promise<boolean>
```

---

### T5: CREATE src/commands/fae/sandbox.ts

- [ ] **状态**: 待处理
- **IMPLEMENT**: sandbox 子命令实现
- **PATTERN**: 参考 `src/commands/skills/list.ts` 的命令注册模式
- **IMPORTS**: `commander`, `picocolors`, `docker.ts`, `storage.ts`, `help-texts.ts`
- **GOTCHA**: 所有输出支持 `--json` 选项
- **VALIDATE**: `pnpm build && wopal fae sandbox --help`

```bash
# 命令结构
wopal fae sandbox start <project> [--port <port>] [--json]
wopal fae sandbox stop <sandbox-id> [--json]
wopal fae sandbox list [--json]
wopal fae sandbox logs <sandbox-id> [--tail <n>]
```

---

### Phase 3: 会话管理

---

### T6: CREATE src/commands/fae/session.ts

- [ ] **状态**: 待处理
- **IMPLEMENT**: session 子命令实现
- **PATTERN**: 参考 `src/commands/skills/download.ts` 的复杂命令模式
- **IMPORTS**: `commander`, `picocolors`, `client.ts`, `storage.ts`, `types.ts`
- **GOTCHA**: `--sandbox` 选项用于多沙箱场景
- **VALIDATE**: `pnpm build && wopal fae session --help`

```bash
# 命令结构
wopal fae session create [--sandbox <id>] [--title <title>] [--json]
wopal fae session list [--sandbox <id>] [--json]
wopal fae session delete <session-id> [--sandbox <id>]
wopal fae session status <session-id> [--sandbox <id>] [--json]
wopal fae session todo <session-id> [--sandbox <id>] [--json]
wopal fae session diff <session-id> [--sandbox <id>] [--json]
```

---

### Phase 4: 消息交互

---

### T7: CREATE src/lib/fae/event-monitor.ts

- [ ] **状态**: 待处理
- **IMPLEMENT**: SSE 事件监控，基于 eventsource 库
- **PATTERN**: 无现有参考，新建模块
- **IMPORTS**: `eventsource`, `Logger`, `types.ts`
- **GOTCHA**:
  - 自动重连机制
  - 事件类型过滤
  - 错误处理
- **VALIDATE**: `pnpm build`

```typescript
// 核心功能：
// - constructor(url: string, logger?: Logger)
// - subscribe(filters?: string[]): AsyncGenerator<FaeEvent>
// - on(event: string, handler: (data: FaeEvent) => void): void
// - close(): void
// - isConnected(): boolean
```

---

### T8: CREATE src/commands/fae/send.ts

- [ ] **状态**: 待处理
- **IMPLEMENT**: 同步发送消息命令
- **PATTERN**: 参考 `src/commands/skills/passthrough.ts` 的简单命令模式
- **IMPORTS**: `commander`, `client.ts`, `storage.ts`
- **GOTCHA**: 阻塞直到 Fae 完成响应
- **VALIDATE**: `pnpm build && wopal fae send --help`

```bash
# 命令结构
wopal fae send <session-id> <message> [--sandbox <id>]
```

---

### T9: CREATE src/commands/fae/stream.ts

- [ ] **状态**: 待处理
- **IMPLEMENT**: 流式输出命令
- **PATTERN**: 参考 event-monitor.ts 的 SSE 处理
- **IMPORTS**: `commander`, `picocolors`, `client.ts`, `event-monitor.ts`
- **GOTCHA**: 实时输出到 stdout，Ctrl+C 中断
- **VALIDATE**: `pnpm build && wopal fae stream --help`

```bash
# 命令结构
wopal fae stream <session-id> [--sandbox <id>]
```

---

### Phase 5: 后台任务

---

### T10: CREATE src/lib/fae/task-manager.ts

- [ ] **状态**: 待处理
- **IMPLEMENT**: 后台任务生命周期管理
- **PATTERN**: 无现有参考，新建模块
- **IMPORTS**: `Logger`, `client.ts`, `event-monitor.ts`, `storage.ts`, `progress.ts`, `types.ts`
- **GOTCHA**:
  - 任务 ID 生成：`task-{timestamp}-{random}`
  - 使用 Map 存储运行中任务
  - 超时处理
- **VALIDATE**: `pnpm build`

```typescript
// 核心功能：
// - setLogger(logger: Logger): void
// - startTask(sandboxId: string, sessionId: string, message: string): Promise<TaskInfo>
// - getStatus(taskId: string): Promise<TaskProgress>
// - waitTask(taskId: string, timeout?: number): Promise<TaskInfo>
// - cancelTask(taskId: string): Promise<void>
// - listTasks(status?: string): Promise<TaskInfo[]>
// - cleanupCompleted(): Promise<void>
```

---

### T11: CREATE src/lib/fae/progress.ts

- [ ] **状态**: 待处理
- **IMPLEMENT**: 基于 SSE 事件聚合计算进度
- **PATTERN**: 无现有参考，新建模块
- **IMPORTS**: `types.ts`
- **GOTCHA**:
  - 从 todo.updated 事件提取任务进度
  - 从 message.part.updated 检测工具调用
  - 计算 idleSeconds 判断是否卡住
- **VALIDATE**: `pnpm build`

```typescript
// 核心功能：
// - calculateProgress(events: FaeEvent[]): TaskProgress
// - detectStuck(idleSeconds: number): boolean
// - extractToolCalls(events: FaeEvent[]): string[]
// - calculateTokenUsage(context: Context): number
```

---

### T12: CREATE src/commands/fae/task.ts

- [ ] **状态**: 待处理
- **IMPLEMENT**: task 子命令实现
- **PATTERN**: 参考 `src/commands/skills/list.ts` 的命令注册模式
- **IMPORTS**: `commander`, `picocolors`, `task-manager.ts`, `types.ts`
- **GOTCHA**: 所有命令支持 `--json`
- **VALIDATE**: `pnpm build && wopal fae task --help`

```bash
# 命令结构
wopal fae task start <session-id> <message> [--sandbox <id>] [--json]
wopal fae task status <task-id> [--json]
wopal fae task wait <task-id> [--timeout <sec>] [--json]
wopal fae task cancel <task-id>
wopal fae task list [--status running|completed|failed] [--json]
```

---

### T13: CREATE src/commands/fae/event.ts

- [ ] **状态**: 待处理
- **IMPLEMENT**: SSE 事件订阅命令
- **PATTERN**: 参考 stream.ts 的 SSE 处理
- **IMPORTS**: `commander`, `event-monitor.ts`, `storage.ts`
- **GOTCHA**:
  - 持续运行直到 Ctrl+C
  - 每行输出一个 JSON 事件
  - 支持 `--filter` 过滤事件类型
- **VALIDATE**: `pnpm build && wopal fae event --help`

```bash
# 命令结构
wopal fae event subscribe [--sandbox <id>] [--filter <pattern>]
```

---

### Phase 6: 集成

---

### T14: CREATE src/commands/fae/index.ts

- [ ] **状态**: 待处理
- **IMPLEMENT**: fae 主命令注册，整合所有子命令
- **PATTERN**: 参考 `src/commands/skills/index.ts` 的子命令注册模式
- **IMPORTS**: `commander`, 所有子命令模块
- **GOTCHA**: 添加 `.addHelpCommand(false)`
- **VALIDATE**: `pnpm build && wopal fae --help`

---

### T15: UPDATE src/program/register-subclis.ts

- [ ] **状态**: 待处理
- **IMPLEMENT**: 在 entries 数组中添加 fae 子命令
- **PATTERN**: 参考 skills entry 的注册模式
- **IMPORTS**: 无（使用动态 import）
- **GOTCHA**: fae 子命令自动享受延迟加载
- **VALIDATE**: `pnpm build && wopal fae --help`

```typescript
// 添加内容到 entries 数组：
{
  name: "fae",
  description: "Sandbox agent management",
  register: async (program) => {
    const mod = await import("../commands/fae/index.js");
    mod.registerFaeCli(program);
  },
},
```

---

### T16: UPDATE package.json

- [ ] **状态**: 待处理
- **IMPLEMENT**: 添加 eventsource 依赖
- **PATTERN**: 无
- **IMPORTS**: 无
- **GOTCHA**: docker 管理使用 child_process，无需 dockerode
- **VALIDATE**: `pnpm install && pnpm build`

```json
{
  "dependencies": {
    "eventsource": "^3.0.2"
  },
  "devDependencies": {
    "@types/eventsource": "^3.0.0"
  }
}
```

---

### T17: UPDATE wopal-cli/AGENTS.md

- [ ] **状态**: 待处理
- **IMPLEMENT**: 更新项目规范，添加 fae 命令文档
- **PATTERN**: 遵循现有文档结构
- **IMPORTS**: 无
- **GOTCHA**: 保持简洁，只记录关键信息
- **VALIDATE**: 人工审阅

---

## 6. 测试策略

### 单元测试

| 模块 | 测试范围 |
|------|---------|
| `storage.ts` | 文件读写、目录创建、错误处理 |
| `client.ts` | API 调用、错误响应、超时处理 |
| `docker.ts` | 端口分配、容器生命周期、错误处理 |
| `event-monitor.ts` | SSE 连接、事件解析、重连机制 |
| `task-manager.ts` | 任务创建、状态查询、取消操作 |
| `progress.ts` | 进度计算、卡住检测 |

### 集成测试

| 场景 | 验证点 |
|------|--------|
| 启动沙箱并创建会话 | sandbox start → session create |
| 同步发送消息 | send → 等待响应 → 验证输出 |
| 后台任务执行 | task start → status → wait |
| SSE 事件流 | event subscribe → 验证事件格式 |

### 边界用例

- 沙箱启动失败（Docker 不可用）
- 端口冲突处理
- 网络超时
- SSE 断连重连
- 任务超时
- 空响应处理

---

## 7. 验证命令

| 验证层级 | 执行命令 | 预期结果 |
|---------|---------|---------|
| Level 1 (语法与风格) | `pnpm build` | 无编译错误 |
| Level 2 (格式化) | `pnpm format:check` | 无格式问题 |
| Level 3 (单元测试) | `pnpm test:run` | 所有测试通过 |
| Level 4 (命令验证) | `wopal fae --help` | 显示帮助信息 |
| Level 5 (沙箱验证) | `wopal fae sandbox list --json` | 返回 JSON 数组 |

---

## 8. 验收标准

- [ ] 所有 Phase 1-6 任务完成
- [ ] `wopal fae sandbox start/stop/list/logs` 命令可用
- [ ] `wopal fae session create/list/delete/status/todo/diff` 命令可用
- [ ] `wopal fae send` 命令可用
- [ ] `wopal fae stream` 命令可用
- [ ] `wopal fae task start/status/wait/cancel/list` 命令可用
- [ ] `wopal fae event subscribe` 命令可用
- [ ] 所有命令支持 `--json` 输出
- [ ] 单元测试覆盖率 > 70%
- [ ] `pnpm build` 无错误
- [ ] AGENTS.md 已更新

---

## 9. 风险与缓解

| 风险 | 缓解措施 |
|------|---------|
| Docker CLI 不可用 | 提供 `--docker-path` 选项，支持自定义路径 |
| SSE 连接不稳定 | 实现自动重连，记录断连事件 |
| API 响应格式变更 | 基于研究文档定义类型，添加运行时验证 |
| 端口冲突 | 端口范围 20001-20100，自动查找可用端口 |
| 长时间任务超时 | 提供 `--timeout` 选项，默认 300 秒 |

---

## 10. 后续步骤

1. 确保 v0.2.0 架构升级完成
2. 用户审阅本计划
3. 确认后进入执行阶段（`/execute`）
4. 按 Phase 顺序逐步实现
5. 每完成一个 Phase 进行验证
6. 全部完成后进行集成测试

---

## 11. 相关文档

| 文档 | 位置 | 说明 |
|------|------|------|
| 架构升级计划 | `plans/wopal-cli-architecture-v0.2.0.md` | v0.2.0 延迟加载架构 |
| PRD | `docs/products/PRD-wopal-cli.md` | 产品需求 |
| DESIGN | `docs/products/DESIGN-wopal-cli.md` | 详细设计 |
| OpenCode 架构研究 | `docs/research/opencode-*.md` | API 研究文档 |

---

> **信心指数**: 8/10
> 
> **理由**: 
> - v0.2.0 架构已建立延迟加载机制，fae 集成简单
> - 现有代码库有成熟的命令模式可参考
> - 研究文档详尽，API 结构清晰
> - 主要风险在 Docker 管理和 SSE 稳定性，已有缓解措施
