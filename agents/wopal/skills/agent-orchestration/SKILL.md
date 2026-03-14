---
name: agent-orchestration
description: >
  Orchestrate OpenCode agent with OpenSpec-driven workflows and worktree isolation.
  Use when you need to: (1) Drive OpenCode with OpenSpec artifacts (proposal/design/specs/tasks),
  (2) Execute tasks in background with process-adapter, (3) Monitor and interact with background agent sessions,
  (4) Use worktree for isolated development. This skill is for Wopal to coordinate OpenCode as an execution unit.
---

# Agent Orchestration (OpenCode)

编排 OpenCode 代理，通过 OpenSpec 驱动的工作流和 Worktree 隔离实现高效开发。

## 前置要求

- ✅ `process-adapter`（`@wopal/process` npm 包，全局安装）
- ✅ `opencode` 命令行工具
- ✅ `git-worktrees` 技能（可选，用于 Worktree 集成）

安装 `@wopal/process`：

```bash
cd projects/agent-tools/tools/process && npm install && npm link
```

检查所有依赖：

```bash
.agents/skills/agent-orchestration/scripts/check-dependencies.sh
```

## 快速开始

### 1. 简单任务（无 Worktree）

```bash
# 启动后台任务
SESSION=$(process-adapter start \
  "OPENCODE_PERMISSION='{\"bash\":{\"*\":\"allow\"},\"edit\":{\"*\":\"allow\"},\"write\":{\"*\":\"allow\"}}' \
   opencode run 'Read AGENTS.md and summarize project architecture.'" \
  --name my-task \
  --cwd projects/agent-tools | awk '{print $3}')

# 查看进度
process-adapter log $SESSION
```

### 2. OpenSpec 工作流（带 Worktree）

```bash
WORKSPACE_ROOT="/Users/sam/coding/wopal/wopal-workspace"
CHANGE="add-auth"

# 1. 创建 worktree
.agents/skills/git-worktrees/scripts/worktree.sh create agent-tools feature/auth

# 2. 清理标记文件
rm -f /tmp/opencode-done-$CHANGE

# 3. 启动 OpenCode（使用绝对路径）
SESSION=$(process-adapter start \
  "PROCESS_ADAPTER_SESSION_ID=$CHANGE \
   OPENCODE_PERMISSION='{\"bash\":{\"*\":\"allow\"},\"edit\":{\"*\":\"allow\"},\"write\":{\"*\":\"allow\"}}' \
   opencode run 'Read $WORKSPACE_ROOT/openspec/changes/$CHANGE/tasks.md and implement all tasks. Run tests.'" \
  --name $CHANGE \
  --cwd .worktrees/agent-tools-feature-auth | awk '{print $3}')

# 4. 监控完成
.agents/skills/agent-orchestration/scripts/wait-for-opencode.sh $CHANGE 300

# 5. 查看结果
process-adapter log $SESSION
```

### 3. 一键启动（推荐）

```bash
.agents/skills/agent-orchestration/scripts/quick-start.sh \
  agent-tools feature/auth add-auth 300
```

## 核心概念

### process-adapter 会话管理

```bash
process-adapter list                          # 列出所有会话
process-adapter log <session-id>              # 查看输出（最后 200 行）
process-adapter log <session-id> --limit 100  # 限制行数
process-adapter poll <session-id>             # 检查状态
process-adapter kill <session-id>             # 终止进程
process-adapter remove <session-id>           # 清理会话
```

### OpenCode 权限配置

非交互模式下，权限请求会被自动拒绝。必须通过环境变量预授权：

```bash
# 完整权限（OpenSpec 实现任务）
OPENCODE_PERMISSION='{"bash":{"*":"allow"},"edit":{"*":"allow"},"write":{"*":"allow"}}'

# Worktree 模式（需要读取主仓库 OpenSpec 文件）
OPENCODE_PERMISSION='{
  "bash": {"*": "allow"},
  "edit": {"*": "allow"},
  "write": {"*": "allow"},
  "read": {"*": "allow"},
  "external_directory": {"*": "allow"}
}'
```

详见 [references/permission-configs.md](references/permission-configs.md)。

### 完成通知机制

通过 `task-notify.js` 插件监听 OpenCode 任务完成：

1. 启动时设置 `PROCESS_ADAPTER_SESSION_ID=<task-id>`
2. 任务完成后插件创建标记文件 `/tmp/opencode-done-<task-id>`
3. `wait-for-opencode.sh` 轮询该文件直到存在或超时

**重要**：启动前必须清理残余标记文件，避免误判完成。

### Worktree 隔离

新格式（`create <project> <branch>`）：

```bash
# 创建
.agents/skills/git-worktrees/scripts/worktree.sh create <project> <branch>

# 生成路径：.worktrees/<project>-<branch-dir>/
# 分支中的 / 自动转换为 -，如 feature/auth → agent-tools-feature-auth

# 清理
.agents/skills/git-worktrees/scripts/worktree.sh remove <project> <branch>
```

**重要**：OpenCode 运行在 worktree 目录，必须使用**绝对路径**读取主仓库的 OpenSpec 文件。

详见 [examples/worktree-integration.md](examples/worktree-integration.md)。

## 常见场景

### 并行执行多个任务

```bash
WORKSPACE_ROOT="/Users/sam/coding/wopal/wopal-workspace"

# 清理标记文件
rm -f /tmp/opencode-done-task-1 /tmp/opencode-done-task-2

# 并行启动
S1=$(process-adapter start \
  "PROCESS_ADAPTER_SESSION_ID=task-1 OPENCODE_PERMISSION='...' \
   opencode run 'Read $WORKSPACE_ROOT/openspec/changes/change-1/tasks.md and implement.'" \
  --name task-1 --cwd .worktrees/project-branch-1 | awk '{print $3}')

S2=$(process-adapter start \
  "PROCESS_ADAPTER_SESSION_ID=task-2 OPENCODE_PERMISSION='...' \
   opencode run 'Read $WORKSPACE_ROOT/openspec/changes/change-2/tasks.md and implement.'" \
  --name task-2 --cwd .worktrees/project-branch-2 | awk '{print $3}')

# 依次等待完成
.agents/skills/agent-orchestration/scripts/wait-for-opencode.sh task-1 300
.agents/skills/agent-orchestration/scripts/wait-for-opencode.sh task-2 300
```

### 会话监控

```bash
# 基础监控
python3 .agents/skills/agent-orchestration/scripts/monitor_session.py <session-id>

# 过滤输出
python3 .agents/skills/agent-orchestration/scripts/monitor_session.py <session-id> --filter "Error|Warning"

# 持续监控
python3 .agents/skills/agent-orchestration/scripts/monitor_session.py <session-id> --watch
```

## 常见错误排查

| 症状 | 原因 | 解决方案 |
|------|------|----------|
| Permission denied | 非交互模式未预授权 | 设置 `OPENCODE_PERMISSION` 环境变量 |
| 读不到 OpenSpec 文件 | Worktree 使用相对路径 | 改用绝对路径 + `external_directory` 权限 |
| 任务立即"完成" | 残余标记文件 | 启动前 `rm -f /tmp/opencode-done-<task-id>` |
| 任务超时无响应 | OpenCode 崩溃 | 使用 `process-adapter log/poll` 排查 |

详见 [references/troubleshooting.md](references/troubleshooting.md)。

## 资源

**脚本**：
- `scripts/quick-start.sh` — 一键启动 OpenSpec 任务
- `scripts/check-dependencies.sh` — 依赖检查
- `scripts/wait-for-opencode.sh` — 监控任务完成（支持超时）
- `scripts/monitor_session.py` — 会话输出监控
- `scripts/prepare_openspec_context.sh` — 生成 OpenSpec 执行摘要

**示例**：
- `examples/openspec-workflow.md` — 完整 OpenSpec 驱动工作流
- `examples/simple-task.md` — 简单任务示例
- `examples/worktree-integration.md` — Worktree 集成详细指南
- `examples/parallel-agents.md` — 并行任务示例

**参考**：
- `references/permission-configs.md` — 权限配置模式
- `references/troubleshooting.md` — 常见问题排查

