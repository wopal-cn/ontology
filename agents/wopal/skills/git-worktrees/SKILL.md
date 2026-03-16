---
name: git-worktrees
description: Workspace-level Git worktree management for parallel development across multiple branches. Supports dynamic project validation, automated dependency installation, and plan-driven development with --plan flag for migrating plan documents. Use this skill when creating isolated development environments, working on multiple features in parallel, or when you have a plan document ready for implementation.
---

# Git Worktree 管理工具

## 概述

工作空间级 Git worktree 管理工具，实现统一的 worktree 创建、管理和清理。支持多分支并行开发、实验性功能隔离，以及计划驱动开发工作流。

**核心特性**：
- 工作空间级统一管理（`.worktrees/` 目录）
- 动态项目验证（从 `.workspace.md` 读取）
- 自动依赖安装和测试验证
- 计划驱动开发支持（`--plan` 参数）

## 快速开始

### 基本用法

```bash
# 创建 worktree
./scripts/worktree.sh create <project> <branch>

# 列出 worktree
./scripts/worktree.sh list [--all|<project>]

# 删除 worktree
./scripts/worktree.sh remove <project> <branch>

# 清理
./scripts/worktree.sh prune <project>
```

### 创建 Worktree

```bash
# 创建新分支（默认）
./scripts/worktree.sh create agent-tools feature/wopal-cli-scan

# 使用已存在的分支
./scripts/worktree.sh create wopal hotfix-123 --existing

# 跳过依赖安装
./scripts/worktree.sh create agent-tools feature/test --no-install

# 跳过测试
./scripts/worktree.sh create agent-tools feature/test --no-test

# 创建 worktree 并迁移计划文档
./scripts/worktree.sh create agent-tools feature/auth --plan auth-feature-plan
```

## 使用场景

### 1. 并行开发多个功能

```bash
# 在 agent-tools 上开发两个功能
./scripts/worktree.sh create agent-tools feature/auth
./scripts/worktree.sh create agent-tools feature/logging

# 切换到不同功能开发
cd .worktrees/agent-tools-feature-auth
cd .worktrees/agent-tools-feature-logging
```

### 2. 计划驱动开发

```bash
# 1. 编写计划文档
# docs/products/plans/my-feature.md

# 2. 创建 worktree 并迁移计划
./scripts/worktree.sh create agent-tools feature/my-feature --plan my-feature

# 3. 在 worktree 中按计划开发
cd .worktrees/agent-tools-feature-my-feature
# ... 开发 ...

# 4. 提交（文档 + 代码一起）
git add .
git commit -m "feat: 实现我的功能"

# 5. 合并回主分支，计划文档也随之进入
```

### 3. 紧急修复隔离

```bash
# 创建紧急修复的隔离环境
./scripts/worktree.sh create wopal hotfix/security-patch

# 修复完成后合并并清理
cd .worktrees/wopal-hotfix-security-patch
git commit -m "fix: 安全补丁"
cd ../../projects/web/wopal
git merge hotfix/security-patch
./scripts/worktree.sh remove wopal hotfix/security-patch
```

## 命令详解

### create

创建新的 worktree。

**语法**：
```bash
./scripts/worktree.sh create <project> <branch> [选项]
```

**参数**：
- `<project>`: 项目名（从 `.workspace.md` 的项目列表中选择）
- `<branch>`: 分支名（分支中的 `/` 会自动转换为 `-`）

**选项**：
- `--existing`: 使用已存在的分支而非创建新分支
- `--no-install`: 跳过依赖安装
- `--no-test`: 跳过测试运行
- `--plan <name>`: 迁移计划文档到 worktree（指定文档名，不含 .md 后缀）
    - 文档从 `docs/products/plans/` 或 `projects/<name>/docs/products/plans/` 迁移
    - 迁移后在 worktree 中随实现一起提交，合并时返回主分支

**路径规则**：
```
工作空间根目录/.worktrees/<project>-<branch>
```

示例：
- 项目: `agent-tools`, 分支: `feature/auth`
- 路径: `.worktrees/agent-tools-feature-auth`

### list

列出 worktree。

**语法**：
```bash
./scripts/worktree.sh list [--all|<project>]
```

**参数**：
- 无参数或 `--all`: 列出所有项目的 worktree（详细模式）
- `<project>`: 只列出指定项目的 worktree

### remove

删除 worktree。

**语法**：
```bash
./scripts/worktree.sh remove <project> <branch>
```

删除时会提示确认，并询问是否同时删除分支。

### prune

清理已删除分支的 worktree 记录。

**语法**：
```bash
./scripts/worktree.sh prune <project>
```

## 项目列表

可用项目名从工作空间根目录的 `.workspace.md` 文件动态读取。查看当前可用项目：

```bash
# 查看 .workspace.md 中的项目列表
grep -E '^\| `projects/[^/]+/`' .workspace.md
```

当前工作空间的项目（示例）：
- `agent-tools` - AI 工具研发中心
- `wopal` - Wopal 平台
- `flex-scheduler` - 任务调度系统

## 自动化流程

创建 worktree 时自动执行：

1. **项目验证**：检查项目名是否在 `.workspace.md` 中
2. **路径构建**：构建工作空间级路径（`${workspace}/.worktrees/${project}-${branch}`）
3. **依赖安装**：检测项目类型并安装依赖（可通过 `--no-install` 跳过）
   - Node.js: `pnpm install` 或 `npm install`
   - Python: 跳过（假设环境已配置）
   - Rust: `cargo build`
   - Go: `go mod download`
4. **测试验证**：运行测试验证基线（可通过 `--no-test` 跳过）

## 注意事项

### 清理顺序

删除 worktree 的正确顺序：

```bash
# 1. 删除 worktree（脚本会自动处理）
./scripts/worktree.sh remove <project> <branch>

# 脚本会按顺序执行：
# - git worktree remove
# - 询问是否删除分支（可选）
```

### 常见问题

**Q: 提示"无效项目名"？**
A: 项目名必须从 `.workspace.md` 的项目列表中选择，查看可用项目：
```bash
./scripts/worktree.sh help
```

**Q: worktree 已存在？**
A: 使用 `list` 命令查看现有 worktree，然后删除或使用不同的分支名。

**Q: 测试失败？**
A: 脚本会警告但不会阻止创建。检查测试失败原因，确认是否为预存在问题。

**Q: 创建 worktree 时提示"主分支存在未提交的变更"？**
A: 如有未提交变更，脚本会警告并询问是否继续。建议先提交其他变更。如果只是计划文档的变更，可使用 `--plan` 参数自动忽略该文档。

## 完整工作流示例

### 功能开发流程

```bash
# 1. 创建功能分支 worktree
./scripts/worktree.sh create agent-tools feature/new-skill

# 2. 切换到 worktree
cd .worktrees/agent-tools-feature-new-skill

# 3. 开发
# ... 编写代码、测试 ...

# 4. 提交
git add .
git commit -m "feat: 添加新技能"

# 5. 回到主工作区合并
cd ../../projects/agent-tools
git checkout main
git merge feature/new-skill --no-ff

# 6. 清理 worktree
./scripts/worktree.sh remove agent-tools feature/new-skill
```
