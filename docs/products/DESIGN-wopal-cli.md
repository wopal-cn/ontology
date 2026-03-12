# Wopal CLI - 设计文档

> **版本**: v1.1  
> **状态**: 初步设计  
> **创建时间**: 2026-03-11  
> **更新时间**: 2026-03-11  
> **配套文档**: `docs/products/PRD-wopal-cli.md`
> **基于**: OpenCode 架构研究成果 + SDK 差距分析

---

## 1. 概述

### 1.1 背景

**Wopal** 是运行在 OpenCode TUI 中的 AI Agent。为高效完成复杂任务，需要调度多个 sandbox agent（**Fae**，精怪仙子）并行工作。

**核心约束**：
- Wopal 不能直接调用 HTTP API/SDK，只能通过 bash 工具执行 CLI 命令
- 输出必须是结构化 JSON，便于解析
- 需要详细进度信息：Fae 状态、上下文使用、是否卡住

### 1.2 目标

构建 `wopal fae` CLI 工具，封装 OpenCode HTTP API，使 Wopal 能够：
1. 管理沙箱和会话
2. 委派任务给 Fae 执行
3. 实时监控进度（利用 SSE 事件）
4. 响应 Fae 的交互请求（question.asked 事件）

### 1.3 架构关系

```
Wopal (运行在 OpenCode TUI)
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
│  Fae (sandbox 容器中的 OpenCode)     │
│  ├── 处理消息                        │
│  ├── 调用工具（edit/bash/read...）   │
│  └── 可能调用 Subagent（Task 工具）  │
└─────────────────────────────────────┘
```

---

## 2. 研究成果基础

### 2.1 OpenCode 架构研究

| 研究文档 | 位置 | 核心发现 |
|---------|------|---------|
| Project/Worktree/Workspace | `docs/research/opencode-project-worktree-workspace-architecture.md` | Directory → Instance → Project → Worktree 层次关系 |
| Session/Agent/Messaging | `docs/research/opencode-session-agent-messaging.md` | Session 生命周期、Message Part 类型、SSE 事件流、Question 通知机制 |

### 2.2 SDK 差距分析

| 模块 | 当前覆盖率 | 说明 |
|------|-----------|------|
| Session 基础 | 27% | 已有 list/create/get/delete/messages |
| Session 高级 | 0% | **缺失**: status/diff/todo/command |
| Event | 0% | **缺失**: subscribe（核心能力） |
| Question | 0% | **缺失**: list/reply（非交互模式必需） |
| PTY | 0% | **不需要**（沙箱内部机制） |
| Permission | 0% | **不需要**（沙箱全权限） |

### 2.3 SSE 事件机制（核心发现）

**全局事件流**: `GET /event?directory=<path>`

一个 SSE 连接可监控所有 Session，事件类型包括：

| 事件 | 触发时机 | Wopal 用途 |
|------|----------|-----------|
| `session.status` | Session 状态变更 | 判断 idle/busy/retry |
| `message.part.delta` | 文本增量 | 实时输出 |
| `message.part.updated` | Part 更新 | 检测工具调用 |
| `session.idle` | Session 空闲（完成） | 任务完成信号 |
| `session.error` | 发生错误 | 错误处理 |
| `todo.updated` | Todo 列表变更 | 进度监控 |
| `question.asked` | Fae 提出问题 | **非交互模式核心** |
| `file.edited` | 文件被编辑 | 变更追踪 |

**Question 事件结构**:
```typescript
{
  type: 'question.asked',
  properties: {
    id: string,           // requestID，用于回复
    sessionID: string,    // 提问的 Session
    questions: Array<{
      question: string,   // 完整问题
      header: string,     // 简短标签
      options: Array<{ label: string; description: string }>,
      multiple?: boolean
    }>
  }
}
```

---

## 3. 高优先级 CLI 命令

基于差距分析和场景分析，确定以下 **P0 命令**：

### 3.1 P0 - 立即实现（5 个核心命令）

| 命令 | API | 理由 |
|------|-----|------|
| `session status <id>` | `session.status` | 判断会话是否可操作（idle/busy） |
| `session diff <id>` | `session.diff` | **关键** - 评估 Fae 工作结果 |
| `session todo <id>` | `session.todo` | **关键** - 任务跟踪、进度监控 |
| `session command <id>` | `session.command` | 执行斜杠命令 |
| `event subscribe` | `event.subscribe` | **核心** - 实时监控所有状态变化 |

### 3.2 P1 - 近期实现（按需）

| 命令 | API | 理由 |
|------|-----|------|
| `question reply <id>` | `question.reply` | 收到 SSE question.asked 后调用 |
| `mcp status/add` | `mcp.*` | MCP 服务管理 |

### 3.3 不需要实现

| 命令 | 原因 |
|------|------|
| `permission.*` | 沙箱环境已全权限 |
| `pty.*` | OpenCode 内部机制，API 场景不适用 |

---

## 4. 命令详细设计

### 4.1 全局选项

```bash
wopal fae <command> [options]

--json          JSON 格式输出
--sandbox <id>  指定沙箱 ID（多沙箱场景）
--quiet         静默模式
```

### 4.2 沙箱管理

```bash
# 启动沙箱
wopal fae sandbox start <project> [--port <port>]
# 输出: { "id": "sb-001", "port": 20001, "url": "http://127.0.0.1:20001" }

# 停止沙箱
wopal fae sandbox stop <sandbox-id>

# 列出沙箱
wopal fae sandbox list --json
# 输出: [{ id, project, port, status, activeSessions }]

# 查看日志
wopal fae sandbox logs <sandbox-id> [--tail <n>]
```

### 4.3 会话管理

```bash
# 创建会话
wopal fae session create --sandbox <id> --title <title> --json
# 输出: { "id": "ses-xxx", "sandboxId": "sb-001" }

# 列出会话
wopal fae session list --sandbox <id> --json

# 删除会话
wopal fae session delete <session-id>

# 获取会话状态（P0）
wopal fae session status <session-id> --sandbox <id> --json
# 输出: { "status": "idle"|"busy"|"retry", "lastActivity": "..." }

# 获取 Todo 列表（P0）
wopal fae session todo <session-id> --sandbox <id> --json
# 输出: [{ content, status, priority }]

# 获取代码变更（P0）
wopal fae session diff <session-id> --sandbox <id> --json
# 输出: { "files": [...], "additions": 10, "deletions": 5 }

# 执行命令（P0）
wopal fae session command <session-id> <command> --sandbox <id>
```

### 4.4 消息交互

```bash
# 同步发送（等待完成）
wopal fae send <session-id> <message> --sandbox <id>
# 输出: 完整响应文本

# 流式输出（实时显示到 stdout）
wopal fae stream <session-id> --sandbox <id>
# 输出: 增量文本，直到完成
```

### 4.5 后台任务

```bash
# 后台启动任务
wopal fae task start <session-id> <message> --sandbox <id> --json
# 输出: { "taskId": "task-001" }

# 查询任务状态
wopal fae task status <task-id> --json
# 输出: 详细进度（见 4.7）

# 等待任务完成
wopal fae task wait <task-id> [--timeout <sec>]

# 取消任务
wopal fae task cancel <task-id>

# 列出所有任务
wopal fae task list [--status running|completed|failed]
```

### 4.6 事件订阅（核心）

```bash
# 订阅 SSE 事件流（持续运行）
wopal fae event subscribe --sandbox <id> [--filter <pattern>]
# 输出: 每行一个 JSON 事件

# 事件输出格式
{"type":"session.status","properties":{"sessionID":"ses-xxx","status":"busy"}}
{"type":"todo.updated","properties":{"sessionID":"ses-xxx","todos":[...]}}
{"type":"question.asked","properties":{"id":"req-xxx","sessionID":"ses-xxx","questions":[...]}}
{"type":"session.idle","properties":{"sessionID":"ses-xxx"}}
```

### 4.7 task status 详细输出

```json
{
  "taskId": "task-001",
  "sessionId": "ses-xxx",
  "sandboxId": "sb-001",
  "status": "running",
  "message": "实现功能 A 并编写测试",
  
  "timing": {
    "startedAt": "2026-03-11T12:00:00Z",
    "elapsed": 45
  },
  
  "progress": {
    "currentStep": "tool:edit",
    "stepDescription": "编辑 src/auth.ts",
    "toolCalls": ["read", "glob", "edit"]
  },
  
  "context": {
    "model": "claude-3-opus",
    "tokensUsed": 45000,
    "tokensLimit": 200000,
    "usagePercent": 22.5
  },
  
  "todos": [
    { "content": "实现认证", "status": "completed", "priority": "high" },
    { "content": "编写测试", "status": "in_progress", "priority": "high" }
  ],
  
  "activity": {
    "lastEvent": "message.part.delta",
    "lastEventAt": "2026-03-11T12:00:45Z",
    "idleSeconds": 0
  },
  
  "health": {
    "isStuck": false,
    "warnings": []
  }
}
```

---

## 5. 状态判断逻辑

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

## 6. 典型工作流

### 6.1 简单任务（同步）

```bash
# 1. 确保沙箱运行
wopal fae sandbox list --json

# 2. 创建会话
wopal fae session create --sandbox sb-001 --title "分析" --json

# 3. 同步发送（等待完成）
wopal fae send ses-xxx "分析项目结构" --sandbox sb-001
```

### 6.2 并行任务（后台）

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

### 6.3 SSE 事件驱动监控（推荐）

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

## 7. 实现架构

### 7.1 整合到 wopal-cli

在现有 `tools/wopal-cli/` 添加 `fae` 子命令：

```
tools/wopal-cli/src/
├── commands/
│   ├── fae/
│   │   ├── index.ts           # fae 主命令
│   │   ├── sandbox.ts         # 沙箱管理
│   │   ├── session.ts         # 会话管理（含 status/todo/diff/command）
│   │   ├── send.ts            # 同步发送
│   │   ├── stream.ts          # 流式输出
│   │   ├── task.ts            # 后台任务
│   │   ├── event.ts           # SSE 事件订阅
│   │   └── question.ts        # 问题回复
│   └── skills/                # 现有技能命令
├── lib/
│   ├── fae-client.ts          # OpenCode HTTP API 客户端（参考 opencode-sdk 实现）
│   ├── fae-docker.ts          # Docker 容器管理（dockerode 或 docker CLI）
│   ├── fae-event-monitor.ts   # SSE 事件监控
│   ├── fae-task-manager.ts    # 任务管理器
│   ├── fae-progress.ts        # 进度计算
│   └── fae-storage.ts         # 本地存储
└── ...
```

### 7.2 参考现有代码

> **重要决策**：不依赖外部实验性项目，参考代码后在 wopal-cli 中完整实现。

| 参考来源 | 参考内容 | 实现方式 |
|---------|---------|---------|
| `opencode-sdk` | API 客户端设计、SSE 流处理、类型定义 | **参考后完整实现**，不作为依赖 |
| `sandbox.sh` | Docker 启动逻辑、端口分配 | **参考后用 Node.js 实现**，不作为依赖 |
| Docker API | 容器生命周期管理 | 使用 dockerode 或 docker CLI |

### 7.3 沙箱管理实现

使用 Node.js 直接管理 Docker 容器，两种方案：

**方案 A：dockerode（推荐）**
```typescript
import Docker from 'dockerode';

const docker = new Docker();
const container = await docker.createContainer({
  Image: 'opencode-sandbox',
  HostConfig: {
    PortBindings: { '3000/tcp': [{ HostPort: '20001' }] }
  }
});
```

**方案 B：docker CLI**
```typescript
import { spawn } from 'child_process';
const proc = spawn('docker', ['run', '-p', '20001:3000', 'opencode-sandbox']);
```

### 7.4 本地存储

```
~/.wopal/fae/
├── tasks/
│   └── <taskId>.json     # 任务元数据 + 缓存进度
└── sandboxes/
    └── <sandboxId>.json  # 沙箱元数据
```

---

## 8. 实施计划

### Phase 1: 基础命令（1-2 天）

| 任务 | 文件 | 说明 |
|------|------|------|
| fae-client.ts | OpenCode HTTP API 客户端 | 参考 opencode-sdk 完整实现 |
| fae-event-monitor.ts | SSE 事件监控 | 基于 eventsource 库 |
| fae-docker.ts | Docker 容器管理 | 使用 dockerode 或 docker CLI |
| sandbox.ts | 沙箱管理命令 | 调用 fae-docker.ts |
| session.ts | 会话管理 + status/todo/diff/command | 调用 fae-client.ts |
| event.ts | 事件订阅命令 | 调用 fae-event-monitor.ts |

### Phase 2: 消息交互（1 天）

| 任务 | 文件 | 说明 |
|------|------|------|
| send.ts | 同步发送命令 | 调用 fae-client.ts |
| stream.ts | 流式输出命令 | 调用 fae-event-monitor.ts |

### Phase 3: 后台任务（1-2 天）

| 任务 | 文件 | 说明 |
|------|------|------|
| fae-task-manager.ts | 任务管理器 | 基于 Node.js 原生能力 |
| fae-storage.ts | 本地存储 | JSON 文件读写 |
| fae-progress.ts | 进度计算 | 基于 SSE 事件聚合 |
| task.ts | 任务命令 | 调用 fae-task-manager.ts |

### Phase 4: 整合测试（1 天）

| 任务 | 说明 |
|------|------|
| 集成测试 | 端到端工作流验证 |
| 文档 | README 更新 |
| 技能升级 | agent-orchestration 使用新 CLI |

---

## 9. 依赖项

| 依赖 | 说明 |
|------|------|
| OpenCode serve | 必须运行在沙箱中 |
| Docker | 容器运行时 |
| dockerode 或 docker CLI | Node.js 管理 Docker 容器 |
| eventsource | SSE 客户端 |

> **不依赖**：
> - `sandbox.sh` - 给人类使用，wopal-cli 用 Node.js 直接管理
> - `@opencode-ai/sdk` - 实验性项目，参考代码后完整实现
> - `@wopal/process` - 使用 Node.js 原生能力

## 10. 风险与缓解

| 风险 | 缓解措施 |
|------|---------|
| SSE 连接不稳定 | 实现自动重连 + 本地缓存 |
| OpenCode API 变更 | 基于 `@opencode-ai/sdk` 封装 |
| 资源竞争 | 限制并发数量 + 队列调度 |
| 进度计算不准 | 基于 todo 状态 + 工具调用综合判断 |

---

## 11. 相关文档

| 文档 | 位置 | 说明 |
|------|------|------|
| OpenCode 架构研究 | `docs/research/opencode-project-worktree-workspace-architecture.md` | Project/Worktree/Workspace |
| Session/Messaging 研究 | `docs/research/opencode-session-agent-messaging.md` | Session/Agent/Messaging/SSE |
| SDK 差距分析 | `docs/analysis/opencode-sdk-gap-analysis.md` | API 覆盖率分析 |
| wopal-cli 项目规范 | `tools/wopal-cli/AGENTS.md` | 现有 CLI 结构 |

---

> **下一步**: 开始实施 Phase 1 - 基础命令
