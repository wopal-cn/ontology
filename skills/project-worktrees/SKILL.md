---
name: project-worktrees
description: 项目级 Git worktree 管理工具，面向协同 Agent 设计。支持在项目 .worktrees 目录下创建隔离开发环境，自动依赖安装和测试验证。
---

# 项目级 Git Worktree 管理工具

## 概述

项目级 Git worktree 管理工具，专为协同 Agent 设计。在项目的 `.worktrees/` 目录下创建隔离的开发环境，支持并行开发、实验性功能隔离。

**与 git-worktrees 的区别**：

| 特性 | git-worktrees | project-worktrees |
|------|--------------|-------------------|
| 管理层级 | 工作空间级 | 项目级 |
| worktree 路径 | `<workspace>/.worktrees/<project>-<branch>` | `<project>/.worktrees/<branch>` |
| 项目参数 | 需要 `<project>` | 不需要 |
| OpenSpec 集成 | 有 | 无 |
| 目标用户 | Wopal 主 Agent | 沙箱内的协同 Agent |

## 快速开始

### 基本用法

```bash
# 在项目根目录执行
./scripts/worktree.sh create <branch>
./scripts/worktree.sh list
./scripts/worktree.sh remove <branch>
```

### 创建 Worktree

```bash
# 创建新分支（默认）
./scripts/worktree.sh create feature-auth

# 跳过依赖安装
./scripts/worktree.sh create feature/test --no-install

# 跳过测试
./scripts/worktree.sh create feature/test --no-test

# 使用已存在的分支
./scripts/worktree.sh create hotfix-123 --checkout
```

## 命令详解

### create

创建新的 worktree。

**语法**：
```bash
./scripts/worktree.sh create <branch> [选项]
```

**参数**：
- `<branch>`: 分支名（分支中的 `/` 会自动转换为 `-`）

**选项**：
| 选项 | 说明 |
|------|------|
| `--no-install` | 跳过依赖安装 |
| `--no-test` | 跳过测试运行 |
| `--checkout` | 使用已存在的分支（不创建新分支） |

**路径规则**：
```
<project>/.worktrees/<branch>
```

示例：
- 分支: `feature/auth`
- 路径: `.worktrees/feature-auth`

### list

列出当前项目的所有 worktree。

```bash
./scripts/worktree.sh list
```

### remove

删除 worktree。

**语法**：
```bash
./scripts/worktree.sh remove <branch> [--force]
```

**选项**：
| 选项 | 说明 |
|------|------|
| `--force, -f` | 跳过确认直接删除（适合 Agent 使用） |

### prune

清理已删除分支的 worktree 记录。

```bash
./scripts/worktree.sh prune
```

## 自动化流程

创建 worktree 时自动执行：

1. **路径构建**：构建项目级路径（`${project}/.worktrees/${branch}`）
2. **依赖安装**：检测项目类型并安装依赖（可通过 `--no-install` 跳过）
3. **测试验证**：运行测试验证基线（可通过 `--no-test` 跳过）

### 依赖检测逻辑

脚本会根据锁文件自动选择包管理器：

| 锁文件 | 包管理器 |
|--------|---------|
| `pnpm-lock.yaml` | pnpm install |
| `package-lock.json` | npm install |
| `yarn.lock` | yarn install |
| `bun.lockb` | bun install |
| 无锁文件 | 优先 pnpm（如果可用） |

## 使用场景

### 1. Agent 并行开发

```bash
# 创建多个隔离环境
./scripts/worktree.sh create feature/auth --no-test
./scripts/worktree.sh create feature/logging --no-test

# 在不同环境工作
cd .worktrees/feature-auth
# ... 开发 ...
```

### 2. 紧急修复隔离

```bash
# 创建隔离环境
./scripts/worktree.sh create hotfix/security-patch

# 修复完成后清理
cd .worktrees/hotfix-security-patch
git commit -m "fix: 安全补丁"
cd ../..
./scripts/worktree.sh remove hotfix/security-patch --force
```

### 3. Agent 无交互模式

```bash
# 适合 Agent 使用的完整流程
./scripts/worktree.sh create feature/agent-task --no-test
cd .worktrees/feature-agent-task
# ... Agent 执行任务 ...
git add . && git commit -m "feat: 完成任务"
cd ../..
./scripts/worktree.sh remove feature/agent-task --force
```

## 完整工作流示例

```bash
# 1. 创建功能分支 worktree
./scripts/worktree.sh create feature/new-skill

# 2. 切换到 worktree
cd .worktrees/feature-new-skill

# 3. 开发
# ... 编写代码、测试 ...

# 4. 提交
git add .
git commit -m "feat: 添加新技能"

# 5. 回到主工作区合并
cd ..
git checkout main
git merge feature/new-skill --no-ff

# 6. 清理 worktree
./scripts/worktree.sh remove feature/new-skill --force
```

## 注意事项

- worktree 创建后会自动安装依赖并运行测试（可跳过）
- 完成后务必使用 `remove` 清理，避免僵尸目录
- worktree 内的提交直接写入当前项目 Git 历史
- 使用 `--force` 选项可跳过交互确认，适合 Agent 自动化场景

