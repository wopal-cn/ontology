---
name: dev-flow
description: |
  统一开发工作流技能。提供**协议驱动、状态机强制、单一入口**的功能开发流程。
  
  触发条件：
  - 用户提到 "dev-flow"、"开发流程"、"Issue 工作流"、"Plan 管理"
  - 用户要求创建/管理 Plan 或 Issue
  - 用户说 "开始开发"、"执行计划"、"归档计划"
  - 用户要求 "decompose PRD" 或从 PRD 创建 Issue
  
  **协议依赖**: 此技能依赖 git-worktrees 技能创建隔离开发环境。
compatibility:
  - bash
  - gh CLI (GitHub CLI)
  - jq
---

# dev-flow — 统一开发工作流

## 概述

`dev-flow` 整合 Issue 管理和 Plan 生命周期，解决双技能导致的入口分散、状态不同步问题。

**核心特性**：
- 单一入口点：`flow.sh <command> <issue>`
- 7 状态强制转换：跳步报错
- Issue Label 自动同步
- 协议依赖 git-worktrees

## 状态机

```
draft → refining → reviewed → executing → completed → validated → done
  │                                          │
  │                                          └── 可能需要 --pr 创建 PR
  └─── 任意状态可跳回 draft（重置）
```

| 状态 | 含义 | Issue Label |
|------|------|-------------|
| `draft` | 初始创建 | `status/planning` |
| `refining` | 研究和填充中 | `status/planning` |
| `reviewed` | 用户确认，可执行 | `status/planning` |
| `executing` | 开发中 | `status/in-progress` |
| `completed` | 代码完成，待验证 | `status/in-review` |
| `validated` | 用户验证通过 | `status/done` |
| `done` | 已归档 | Issue 已关闭 |

**强制转换规则**：
- 只能按顺序前进，禁止跳步
- `reviewed` 必须通过 `check-doc` 验证
- `validated` 需要 `--confirm` 确认

## 命令

### 生命周期命令

```bash
# 创建 Plan 并关联 Issue
flow.sh start <issue> [--project <name>] [--prd <path>]

# 进入研究阶段
flow.sh refine <issue>

# 提交评审（自动运行 check-doc）
flow.sh review <issue> [--confirm]

# 开始执行（可选 worktree 隔离）
flow.sh dev <issue> [--worktree]

# 标记完成（可选创建 PR）
flow.sh complete <issue> [--pr]

# 用户验证确认
flow.sh validate <issue> --confirm

# 归档并清理
flow.sh archive <issue>
```

### 查询命令

```bash
# 查看任务状态
flow.sh status <issue>

# 列出进行中任务
flow.sh list

# 从 PRD 创建 Issue
flow.sh decompose-prd <prd-path> [--dry-run]
```

### 重置命令

```bash
# 重置到 draft 状态（谨慎使用）
flow.sh reset <issue>
```

## 使用流程

### 功能开发流程

```
1. 用户创建 Issue（GitHub Web 或 gh CLI）
   
2. AI: dev-flow start 14 --project agent-tools
   → 创建 Plan 文件，关联 Issue

3. AI: dev-flow refine 14
   → 状态变为 refining
   → AI 研究代码库，填充 Plan 内容

4. AI: dev-flow review 14
   → 运行 check-doc
   → 等待用户确认

5. 用户确认后: dev-flow review 14 --confirm
   → 状态变为 reviewed

6. AI: dev-flow dev 14 --worktree
   → 调用 git-worktrees 创建隔离环境
   → 状态变为 executing

7. AI 执行实施...

8. AI: dev-flow complete 14
   → 状态变为 completed

9. 用户验证通过后: dev-flow validate 14 --confirm
   → 状态变为 validated

10. AI: dev-flow archive 14
    → 移动 Plan 到 done/
    → 关闭 Issue
    → 清理 worktree（可选）
```

### Bug 修复流程

```
1. dev-flow start 15 --project agent-tools
2. dev-flow refine 15
3. dev-flow review 15 --confirm
4. dev-flow dev 15           # 通常不需要 worktree
5. dev-flow complete 15
6. dev-flow validate 15 --confirm
7. dev-flow archive 15
```

## 协议依赖

### git-worktrees

`dev-flow dev <issue> --worktree` 会调用 git-worktrees 技能：

```bash
# dev-flow 内部调用
bash /path/to/git-worktrees/scripts/worktree.sh create <project> <branch> --no-install --no-test
```

**分支命名规则**: `issue-{N}-{slug}`
- N: Issue 编号
- slug: 从标题生成的 kebab-case

## 文件结构

```
dev-flow/
├── SKILL.md              # 本文档
├── scripts/
│   └── flow.sh           # 主入口脚本
├── lib/
│   ├── state-machine.sh  # 状态机核心
│   ├── issue.sh          # Issue 封装
│   ├── plan.sh           # Plan 操作
│   └── check-doc.sh      # 方案检查
└── templates/
    └── plan.md           # Plan 模板
```

## 错误处理

| 错误 | 原因 | 解决 |
|------|------|------|
| `Invalid transition` | 尝试跳步 | 按顺序执行 |
| `Plan not found` | Plan 文件不存在 | 先运行 `start` |
| `Issue not linked` | Plan 未关联 Issue | `start` 时指定 `--issue` |
| `check-doc failed` | Plan 内容不完整 | 修复后重新 `review` |
| `gh CLI not available` | 未安装 gh | 安装 GitHub CLI |

## AI 使用指南

### 何时使用此技能

1. **用户请求创建 Plan** → `start` 命令
2. **用户说"开始开发"** → `dev` 命令
3. **用户要求"执行计划"** → 先 `review --confirm`，再 `dev`
4. **用户说"计划完成了"** → `complete` 命令
5. **用户确认验证通过** → `validate --confirm`
6. **用户要求归档** → `archive` 命令

### 关键提示

- **不要跳步**：状态机强制顺序执行
- **等待确认**：`review` 和 `validate` 需要用户明确确认
- **check-doc 失败**：先修复 Plan 内容，再重新 review
- **worktree 可选**：简单修改通常不需要隔离环境

### 示例对话

```
用户: 帮我开发 Issue #14

AI: 
1. 首先创建 Plan：
   bash .agents/skills/dev-flow/scripts/flow.sh start 14 --project agent-tools

2. 进入研究阶段：
   bash .agents/skills/dev-flow/scripts/flow.sh refine 14

[AI 研究代码库，填充 Plan...]

3. 提交评审：
   bash .agents/skills/dev-flow/scripts/flow.sh review 14

用户: Plan 看起来没问题，继续

AI: 确认评审：
   bash .agents/skills/dev-flow/scripts/flow.sh review 14 --confirm

4. 开始开发（使用 worktree 隔离）：
   bash .agents/skills/dev-flow/scripts/flow.sh dev 14 --worktree

[AI 执行实施...]

5. 标记完成：
   bash .agents/skills/dev-flow/scripts/flow.sh complete 14

用户: 验证通过

AI: 确认验证：
   bash .agents/skills/dev-flow/scripts/flow.sh validate 14 --confirm

6. 归档：
   bash .agents/skills/dev-flow/scripts/flow.sh archive 14
```

## 迁移说明

此技能替代：
- `plan-master` — 所有功能已迁移
- `issue-workflow` — Issue 封装已迁移

迁移后删除旧技能目录。
