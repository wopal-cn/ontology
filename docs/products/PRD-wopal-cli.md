# PRD: Wopal CLI

> **产品名称**: Wopal CLI  
> **版本**: v1.0  
> **状态**: Draft  
> **创建日期**: 2026-03-11  
> **负责人**: Wopal (AI Agent)

---

## 1. 执行摘要 (Executive Summary)

**Wopal CLI** 是 Wopal（运行在 OpenCode TUI 中的 AI Agent）的主命令行工具集。它封装了 Wopal 日常开发所需的各类能力，通过结构化的 CLI 接口提供服务。

**核心问题**：Wopal 作为 AI Agent，无法直接调用 HTTP API 或 SDK，只能通过 bash 工具执行 CLI 命令。需要一套专门为 AI Agent 设计的工具集。

**解决方案**：`wopal` CLI 提供多个子命令，每个封装特定领域的功能：
- `wopal skills` - 技能管理（下载、扫描、安装）
- `wopal fae` - 与 Fae agent（sandbox agent）进行沟通
- `wopal find` - 透传搜索

**MVP 目标**：完善 `wopal fae` 子命令，实现沙箱管理、会话管理、消息发送和后台任务监控能力，使 Wopal 能够委派任务给 Fae 并获取执行结果。

---

## 2. 使命 (Mission)

### 使命声明

> 为 Wopal（AI Agent）提供一套完整的 CLI 工具集，使其能够高效执行开发任务、管理资源、调度协作 agent。

### 核心原则

1. **AI-First 设计** - 输出格式优先考虑 AI 解析（JSON），而非人类阅读
2. **子命令模块化** - 每个子命令独立、职责单一
3. **结构化输出** - 统一的 JSON 输出格式，便于 Wopal 解析
4. **自包含实现** - 不依赖外部实验性 SDK，参考后完整实现
5. **Node.js 原生能力** - 用 Node.js 直接管理 Docker，不依赖 shell 脚本

---

## 3. 产品结构

### 3.1 子命令概览

| 子命令 | 功能 | 状态 |
|--------|------|------|
| `wopal skills` | AI Agent 技能管理（下载、扫描、安装） | ✅ 已实现 |
| `wopal fae` | 与 Fae agent（sandbox agent）进行沟通 | 🚧 开发中 |
| `wopal find` | 透传搜索 | ✅ 已实现 |

### 3.2 各子命令详情

#### `wopal skills` - 技能管理

管理 AI Agent 技能的生命周期：

```bash
wopal skills download <url>     # 下载技能到 INBOX
wopal skills scan               # 扫描 INBOX 中的技能
wopal skills check <skill>      # 安全检查
wopal skills install <skill>    # 安装技能
wopal skills list               # 列出已安装技能
wopal skills inbox list/show/remove  # INBOX 管理
```

#### `wopal fae` - Fae Agent 沟通

**Fae**（精怪仙子）是运行在 sandbox 中的 OpenCode agent。`wopal fae` 子命令使 Wopal 能够：

1. **管理沙箱** - 启动/停止 sandbox serve
2. **管理会话** - 创建/查询/删除 Session
3. **发送消息** - 同步或异步与 Fae 交互
4. **监控进度** - 实时获取任务执行状态
5. **获取结果** - 评估 Fae 的工作成果

```bash
wopal fae sandbox start/stop/list/logs   # 沙箱管理
wopal fae session create/list/delete     # 会话管理
wopal fae send <session> <message>       # 同步发送
wopal fae stream <session>               # 流式输出
wopal fae task start/status/wait/cancel  # 后台任务
wopal fae event subscribe                # SSE 事件订阅
```

#### `wopal find` - 透传搜索

透传搜索能力（实现细节略）。

---

## 4. 目标用户 (Target Users)

| 用户类型 | 技术水平 | 核心需求 | 痛点 |
|---------|---------|---------|------|
| **Wopal (主控 AI Agent)** | 高 | 通过 CLI 完成各类开发任务 | 无法直接调用 HTTP API；需要结构化输出 |
| **Fae (Sandbox Agent)** | 高 | 接收任务、执行工具调用、返回结果 | （被动执行，无主动需求） |
| **愚佛 (开发者)** | 高 | 调试 Fae 行为、查看日志、手动测试 | 需要人类可读的输出模式 |

**注**：主要用户是 Wopal（AI Agent），人类开发者通过 `--human` 选项获得可读输出。

---

## 5. MVP 范围 - `wopal fae` (MVP Scope)

### 范围内 (In Scope)

- [x] **沙箱管理**
  - 启动/停止 sandbox serve
  - 列出运行中的沙箱
  - 查看沙箱日志

- [x] **会话管理**
  - 创建/列出/删除 Session
  - Session 归属沙箱追踪
  - Session 状态查询（status/todo/diff/command）

- [x] **消息交互**
  - 同步发送消息（等待完成）
  - 流式输出（实时显示到 stdout）

- [x] **后台任务**
  - 后台启动任务（立即返回 task-id）
  - 查询任务状态（详细进度）
  - 等待任务完成（阻塞）
  - 取消任务

- [x] **进度监控**
  - 基于 SSE 事件流聚合状态
  - Token 消耗统计
  - 当前步骤识别
  - 健康检查（是否卡住）

- [x] **结构化输出**
  - JSON 格式输出（`--json`）
  - 人类可读输出（默认）

### 范围外 (Out of Scope)

- [ ] **多 Fae 协作** - Fae 之间的消息传递和同步
- [ ] **质量自动化检查** - 代码风格、测试覆盖等自动验证
- [ ] **任务依赖管理** - 任务间依赖关系和执行顺序
- [ ] **资源池管理** - 自动扩缩容沙箱数量
- [ ] **远程沙箱** - 非 Docker 的沙箱类型（云沙箱）
- [ ] **历史记录查询** - 已完成任务的长期存储和检索
- [ ] **成本预算控制** - 基于成本自动终止任务

---

## 6. 用户故事 - `wopal fae` (User Stories)

### US-1: 启动沙箱

**As a** Wopal (AI Agent)  
**I want to** 通过 CLI 启动一个 sandbox serve  
**So that** 我可以在隔离环境中执行任务

**验收标准**：
- 命令：`wopal fae sandbox start <project> [--port <port>]`
- 输出包含：sandbox-id, port, url, status
- 支持 `--json` 输出格式
- 自动检测端口冲突

**示例**：
```bash
$ wopal fae sandbox start projects/agent-tools --json
{"id":"sb-001","project":"agent-tools","port":20001,"url":"http://127.0.0.1:20001","status":"running"}
```

---

### US-2: 创建会话

**As a** Wopal  
**I want to** 在沙箱中创建新会话  
**So that** 我可以在独立的上下文中与 Fae 交互

**验收标准**：
- 命令：`wopal fae session create [--sandbox <id>] [--title <title>]`
- 输出包含：session-id, sandbox-id
- 不指定沙箱时使用默认沙箱

**示例**：
```bash
$ wopal fae session create --sandbox sb-001 --title "实现功能" --json
{"id":"ses-abc","sandboxId":"sb-001","title":"实现功能","createdAt":"2026-03-11T12:00:00Z"}
```

---

### US-3: 同步发送消息

**As a** Wopal  
**I want to** 同步发送消息并等待 Fae 完成响应  
**So that** 我可以获取完整的执行结果

**验收标准**：
- 命令：`wopal fae send <session-id> <message> [--sandbox <id>]`
- 阻塞直到 Fae 完成响应
- 输出完整的响应文本
- 支持 `--json` 输出包含 token 统计

**示例**：
```bash
$ wopal fae send ses-abc "分析项目结构并总结"
项目采用 Monorepo 架构，包含三个主要模块...
```

---

### US-4: 后台启动任务

**As a** Wopal  
**I want to** 在后台启动长时间任务并立即获得 task-id  
**So that** 我可以继续其他工作而不被阻塞

**验收标准**：
- 命令：`wopal fae task start <session-id> <message> [--sandbox <id>]`
- 立即返回 task-id
- 任务在后台执行
- 支持 `--json` 输出

**示例**：
```bash
$ wopal fae task start ses-abc "实现用户认证模块" --json
{"taskId":"task-001","status":"running"}
```

---

### US-5: 查询任务进度

**As a** Wopal  
**I want to** 查询任务的详细进度状态  
**So that** 我可以判断 Fae 的执行情况和健康状态

**验收标准**：
- 命令：`wopal fae task status <task-id>`
- 输出包含：
  - 基础状态：status, message
  - 时间信息：startedAt, elapsed
  - 进度信息：currentStep, stepDescription
  - 上下文：tokensUsed, tokensLimit, usagePercent
  - 成本：cost
  - 活动：toolCalls, lastActivity, idleSeconds
  - 健康：isStuck, warnings

**示例**：
```bash
$ wopal fae task status task-001 --json
{
  "taskId": "task-001",
  "status": "running",
  "progress": {
    "currentStep": "tool:edit",
    "stepDescription": "正在编辑 src/auth.ts"
  },
  "context": {
    "tokensUsed": 45000,
    "usagePercent": 22.5
  },
  "activity": {
    "idleSeconds": 5
  },
  "health": {
    "isStuck": false
  }
}
```

---

### US-6: 等待任务完成

**As a** Wopal  
**I want to** 阻塞等待任务完成并获取最终结果  
**So that** 我可以同步获取执行结果

**验收标准**：
- 命令：`wopal fae task wait <task-id> [--timeout <sec>]`
- 阻塞直到任务完成或超时
- 输出最终结果
- 超时时返回当前状态

**示例**：
```bash
$ wopal fae task wait task-001 --timeout 300 --json
{"taskId":"task-001","status":"completed","result":"用户认证模块已实现"}
```

---

### US-7: 检测任务卡住

**As a** Wopal  
**I want to** 通过进度状态判断任务是否卡住  
**So that** 我可以决定是否干预或取消任务

**验收标准**：
- `task status` 输出包含 `health.isStuck` 字段
- `idleSeconds > 60` 时标记为可能卡住
- 提供 `warnings` 数组说明问题
- 建议干预措施

**示例**：
```bash
$ wopal fae task status task-001 --json
{
  "status": "running",
  "health": {
    "isStuck": true,
    "warnings": [
      {"type": "stuck", "message": "任务已空闲 120 秒", "suggestion": "检查日志或发送新指令"}
    ]
  }
}
```

---

### US-8: 并行管理多个 Fae

**As a** Wopal  
**I want to** 同时管理多个沙箱和会话  
**So that** 我可以并行执行多个独立任务

**验收标准**：
- 支持同时运行多个 sandbox serve
- 每个沙箱可创建多个会话
- `sandbox list` 显示所有运行中的沙箱
- `session list` 支持按沙箱过滤

**示例**：
```bash
$ wopal fae sandbox list --json
[
  {"id":"sb-001","project":"agent-tools","port":20001,"status":"running"},
  {"id":"sb-002","project":"wopal-web","port":20002,"status":"running"}
]
```

---

## 7. 核心架构与模式 (Core Architecture & Patterns)

> **注**：本节为高层架构概述，详细设计见 `docs/products/DESIGN-wopal-cli.md`。

### 调用链

```
Wopal (OpenCode TUI)
    │
    │  bash 工具调用
    ▼
┌─────────────────────────────────────┐
│  wopal CLI                           │
│  ├── skills (技能管理)               │
│  ├── fae (Fae 沟通)                  │
│  │   ├── fae-client.ts (HTTP API)   │
│  │   ├── fae-docker.ts (容器管理)   │
│  │   ├── fae-event-monitor.ts (SSE) │
│  │   └── commands/ (sandbox/session)│
│  └── find (搜索)                     │
└─────────────────────────────────────┘
    │
    │  HTTP API / SSE / Docker API
    ▼
┌─────────────────────────────────────┐
│  Fae (Docker 容器中的 OpenCode)      │
│  ├── 处理消息                        │
│  ├── 调用工具（edit/bash/read...）   │
│  └── 可能调用 Subagent（Task 工具）  │
└─────────────────────────────────────┘
```

### SSE 事件驱动架构

**关键发现**：OpenCode 提供 `GET /event?directory=<path>` 全局事件流，一个 SSE 连接可监控所有 Session。

| 事件 | 触发时机 | Wopal 用途 |
|------|----------|-----------|
| `session.status` | Session 状态变更 | 判断 idle/busy/retry |
| `message.part.delta` | 文本增量 | 实时输出 |
| `message.part.updated` | Part 更新 | 检测工具调用 |
| `session.idle` | Session 空闲（完成） | 任务完成信号 |
| `session.error` | 发生错误 | 错误处理 |
| `todo.updated` | Todo 列表变更 | 进度监控 |
| `question.asked` | Fae 提出问题 | 非交互模式核心 |

### 设计模式

1. **Client 模式** - 封装 OpenCode HTTP API
2. **Event Monitor 模式** - SSE 事件监听与聚合
3. **Task Manager 模式** - 后台任务生命周期管理
4. **Progress Calculator 模式** - 基于事件流计算进度

---

## 8. 技术约束与决策 (Technical Constraints & Decisions)

### 约束

| 约束 | 说明 |
|------|------|
| Wopal 只能通过 bash 调用 CLI | 无法直接调用 HTTP API/SDK |
| 输出必须是结构化 JSON | 便于 AI 解析 |
| 需要详细进度信息 | 判断 Fae 状态、上下文使用、是否卡住 |
| SSE 连接需要稳定 | 实现自动重连 |

### 技术决策

| 决策 | 理由 |
|------|------|
| **参考 opencode-sdk 完整实现** | opencode-sdk 是实验性项目，不稳定；参考其代码在 wopal-cli 中完整实现 API 客户端 |
| **Node.js 直接管理 Docker** | sandbox.sh 是给人类使用的；wopal-cli 用 Node.js 原生能力（dockerode 或 child_process 调用 docker CLI）管理容器 |
| SSE 全局事件流监控 | 一个连接监控所有 Session，高效 |
| 本地 JSON 文件存储任务状态 | 简单可靠，无需数据库 |
| TypeScript 实现 | 与现有 wopal-cli 技术栈一致 |

---

## 9. 状态判断逻辑 (Status Judgment Logic)

Wopal 通过以下字段判断 Fae 状态并决策：

| 字段 | 判断条件 | Wopal 行动 |
|------|----------|-----------|
| `status` | `running` / `completed` / `failed` | 基础状态判断 |
| `progress.currentStep` | 当前工具调用 | 了解进度 |
| `context.usagePercent` | > 80% | 考虑压缩或新会话 |
| `activity.idleSeconds` | > 60s | 可能卡住，检查日志 |
| `health.isStuck` | `true` | 取消任务或干预 |
| `todos` | 任务列表变化 | 进度评估 |

---

## 10. 典型工作流 (Typical Workflows)

### 工作流 1：简单任务（同步）

```bash
# 1. 确保沙箱运行
wopal fae sandbox list --json

# 2. 创建会话
wopal fae session create --sandbox sb-001 --title "分析" --json

# 3. 同步发送（等待完成）
wopal fae send ses-xxx "分析项目结构" --sandbox sb-001
```

### 工作流 2：并行任务（后台）

```bash
# 1. 创建会话
wopal fae session create --sandbox sb-001 --title "API" --json   # ses-aaa
wopal fae session create --sandbox sb-002 --title "测试" --json  # ses-bbb

# 2. 后台启动任务
wopal fae task start ses-aaa "实现 API" --json    # task-1
wopal fae task start ses-bbb "编写测试" --json    # task-2

# 3. 轮询进度
wopal fae task status task-1 --json
wopal fae task status task-2 --json

# 4. 等待完成
wopal fae task wait task-1 --timeout 300
wopal fae task wait task-2 --timeout 300

# 5. 获取结果
wopal fae session diff ses-aaa --sandbox sb-001 --json
wopal fae session diff ses-bbb --sandbox sb-002 --json
```

### 工作流 3：SSE 事件驱动监控（推荐）

```bash
# 1. 启动事件监听（后台进程）
wopal fae event subscribe --sandbox sb-001 > /tmp/fae-events.log &
EVENT_PID=$!

# 2. 发送任务
wopal fae task start ses-xxx "实现功能" --json

# 3. 监控事件（Wopal 解析事件日志）
# 收到 todo.updated → 更新进度
# 收到 question.asked → 解析问题，决定答案
# 收到 session.idle → 任务完成

# 4. 响应问题（如需要）
wopal fae question reply <request-id> --answers '["选项1"]'

# 5. 完成后停止监听
kill $EVENT_PID
```

---

## 11. 非功能性需求 (Non-Functional Requirements)

| 需求 | 目标 | 验收标准 |
|------|------|---------|
| 响应时间 | 命令执行 < 500ms | 95% 请求在此时间内 |
| 可靠性 | SSE 连接稳定性 > 99% | 自动重连，事件不丢失 |
| 可扩展性 | 支持同时 10+ Fae | 无性能瓶颈 |
| 可维护性 | 代码覆盖率 > 80% | 单元测试 + 集成测试 |
| 安全性 | 无敏感信息泄露 | 不在日志中输出 token |

---

## 12. 里程碑与发布计划 (Milestones & Release Plan)

### v0.1 - 基础能力 (MVP)

**目标**：实现 `wopal fae` 核心命令

| 功能 | 优先级 | 状态 |
|------|--------|------|
| sandbox start/stop/list | P0 | 待开发 |
| session create/list/delete | P0 | 待开发 |
| session status/todo/diff | P0 | 待开发 |
| send (同步发送) | P0 | 待开发 |
| task start/status/wait | P0 | 待开发 |
| event subscribe | P0 | 待开发 |

### v0.2 - 增强能力

| 功能 | 优先级 | 状态 |
|------|--------|------|
| stream (流式输出) | P1 | 待开发 |
| question reply | P1 | 待开发 |
| 健康检查优化 | P1 | 待开发 |
| 错误恢复机制 | P1 | 待开发 |

### v1.0 - 生产就绪

| 功能 | 优先级 | 状态 |
|------|--------|------|
| 完整测试覆盖 | P1 | 待开发 |
| 文档完善 | P1 | 待开发 |
| 性能优化 | P2 | 待开发 |

---

## 13. 相关文档

| 文档 | 位置 | 说明 |
|------|------|------|
| 整合设计文档 | `docs/products/DESIGN-wopal-cli.md` | **主设计文档**（架构、实施、命令设计） |
| OpenCode 架构研究 | `docs/research/opencode-project-worktree-workspace-architecture.md` | Project/Worktree/Workspace 架构 |
| Session/消息研究 | `docs/research/opencode-session-agent-messaging.md` | Session 生命周期和消息机制 |
| SDK 差距分析 | `docs/analysis/opencode-sdk-gap-analysis.md` | API 覆盖率分析（参考用，不依赖） |

---

## 14. 关键依赖

| 依赖 | 说明 |
|------|------|
| OpenCode serve | 必须运行在沙箱中，监听 HTTP API |
| Docker | 容器运行时，用于启动 sandbox |
| dockerode 或 docker CLI | Node.js 管理 Docker 容器的方式 |
| eventsource | SSE 客户端库 |

> **注**：不依赖 `sandbox.sh`（给人类使用）和 `@opencode-ai/sdk`（实验性项目），参考其代码在 wopal-cli 中完整实现。

---

## 15. 风险与缓解 (Risks & Mitigation)

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| SSE 连接不稳定 | 高 | 中 | 实现自动重连 + 本地缓存 |
| OpenCode API 变更 | 高 | 低 | 参考 SDK 代码实现，保持接口兼容 |
| Docker 管理复杂度 | 中 | 中 | 使用成熟的 dockerode 库或 docker CLI |
| 资源竞争 | 中 | 中 | 限制并发数量 + 队列调度 |
| 进度计算不准 | 中 | 中 | 基于 todo 状态 + 工具调用综合判断 |
| 长时间任务超时 | 中 | 中 | 提供超时配置 + 自动重试 |

---

> **下一步**: 开始实施 v0.1 MVP - 基础命令实现
