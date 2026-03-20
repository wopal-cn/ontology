---
name: issue-workflow
description: Centralized GitHub Issue workflow management. Handles issue creation, analysis, decomposition, PRD/Plan linking, worktree setup, PR creation, and closure. Triggers on "create issue", "analyze issue", "link issue", "issue worktree", "issue pr", "close issue", or issue-related workflow commands.
---

# Issue Workflow

GitHub Issue 中央管理技能，统一处理 Issue 创建、分析、分解、关联、开发环境搭建、PR 提交和闭环。

## 核心职责

| 职责 | 说明 |
|------|------|
| Issue 创建 | 基于模板创建标准化 Issue |
| 路径判断 | 根据 Target Project 确定目标仓库 |
| Worktree 调用 | 调用 git-worktrees 技能创建隔离开发环境 |
| PR 回链 | 创建 PR 并自动回链到 Issue |
| 状态追踪 | 管理 Issue 状态流转 |

---

## Issue 工作流原则

### 粒度控制

**Appetite 判断**：一个 Issue 的工作量应该能在一个 Appetite 周期内完成。

| Appetite | 工作量 | 说明 |
|----------|--------|------|
| 1-2 天 | 小 | 单一功能点或简单修复 |
| 3-5 天 | 中 | 相关功能的组合 |
| 1-2 周 | 大 | **考虑拆分** |
| > 2 周 | 过大 | **必须拆分** |

**拆分信号**：
- Scope 包含 5+ 独立项
- 涉及多种类型（feature + test + docs）
- 不同功能点可以独立交付

### Issue → Plan 流程

```
创建 Issue → 用户确认 Issue 内容 → 创建 Plan
```

**关键**：Issue 创建后，**必须等待用户确认**才能创建 Plan。原因：
1. 用户可能需要调整 Issue 粒度（拆分或合并）
2. 用户可能需要修改 Issue 内容
3. Plan 依赖 Issue 的最终确定

### PRD Phase 与 Issue 的关系

| PRD Phase 粒度 | 建议 |
|----------------|------|
| 小（1-3 个 Scope 项） | 1 Phase = 1 Issue |
| 中（4-6 个 Scope 项） | 评估是否拆分 |
| 大（7+ 个 Scope 项） | **拆分为多个 Issue** |

**注意**：`decompose-prd` 命令只会机械地为每个 Phase 创建一个 Issue，粒度判断需要人工或 AI Agent 完成。

## Label 规范

### 状态 Label

| Label | 说明 |
|-------|------|
| `status/planning` | 规划中，方案待定 |
| `status/in-progress` | 开发中 |
| `status/in-review` | PR 已提交，待审核 |
| `status/blocked` | 阻塞中 |
| `status/done` | 已完成关闭 |

### 类型 Label

| Label | 说明 |
|-------|------|
| `type/feature` | 新功能 |
| `type/bug` | Bug 修复 |
| `type/refactor` | 重构 |
| `type/docs` | 文档更新 |
| `type/chore` | 构建/工具/杂项 |

### 项目 Label

| Label | 说明 |
|-------|------|
| `project/agent-tools` | agent-tools 项目 |
| `project/wopal-cli` | wopal-cli 项目 |
| `project/space` | 空间级（无特定项目） |

## 命令概览

| 命令 | 用途 | 触发词 |
|------|------|--------|
| `create` | 创建 Issue | "create issue", "新建 issue" |
| `analyze` | 分析 Issue | "analyze issue", "分析 issue" |
| `decompose-prd` | 从 PRD 分解 Phase 为 Issue | "decompose prd", "分解 prd" |
| `link-prd` | 关联 PRD | "link prd", "关联 prd" |
| `link-plan` | 关联 Plan | "link plan", "关联 plan" |
| `worktree` | 创建开发环境 | "issue worktree", "创建 worktree" |
| `pr` | 创建 PR | "issue pr", "创建 pr" |
| `close` | 关闭 Issue | "close issue", "关闭 issue" |
| `status` | 查看状态 | "issue status", "issue 状态" |

---

## 项目路径映射

| Target Project | 仓库路径 | 分支前缀 |
|----------------|----------|----------|
| `agent-tools` | `projects/agent-tools/` | - |
| `wopal-cli` | `projects/wopal-cli/` | - |
| `space` | 工作空间根目录 | - |
| `<other>` | 需用户确认 | - |

**注意**：wopal-cli 是独立 Git 仓库，操作时需在项目目录内执行 Git 命令。

---

## 分支命名规范

```
issue-{N}-{slug}
```

| 字段 | 说明 | 示例 |
|------|------|------|
| `{N}` | Issue 编号 | `42` |
| `{slug}` | 简短描述（kebab-case） | `add-issue-workflow` |

**完整示例**：
- `issue-42-add-issue-workflow`
- `issue-123-fix-deploy-bug`

---

## 跨仓 PR 规则

当 PR 需要跨仓库引用时，使用：

```
Refs <space-owner>/<space-repo>#N
```

示例：
```
Refs wopal-space/wopal-workspace#42
```

---

## 命令详解

### create

创建新 Issue。

**语法**：
```bash
./scripts/issue.sh create --title "<title>" --project <project> --type <type> [选项]
```

**必需参数**：
- `--title`: Issue 标题
- `--project`: 目标项目（agent-tools | wopal-cli | space | <other>）
- `--type`: Issue 类型（feature | bug | refactor | docs | chore）

**可选参数**：
- `--body`: Issue 内容（文件路径或直接文本）
- `--label`: 额外 label（可多次指定）
- `--assignee`: 指派人员

**示例**：
```bash
./scripts/issue.sh create \
  --title "添加 Issue 工作流技能" \
  --project agent-tools \
  --type feature \
  --label "status/planning"
```

### analyze

分析 Issue 内容，提取关键信息。

**语法**：
```bash
./scripts/issue.sh analyze <issue-number>
```

**输出**：
- Issue 核心目标
- 目标项目
- 验收标准
- 关联资源（PRD/Plan）

### decompose-prd

从 PRD 的 Implementation Phases 章节创建 Phase Issue。

**语法**：
```bash
./scripts/issue.sh decompose-prd <prd-path> [--dry-run]
```

**参数**：
- `<prd-path>`: PRD 文件路径（相对于工作空间根目录）
- `--dry-run`: 预览模式，不实际创建 Issue

**PRD 格式要求**：

PRD 必须包含 `## Implementation Phases` 章节：

```markdown
## Implementation Phases

### Phase 1: <Phase 名称>

**目标**: <一句话描述>

**Scope**:
- [ ] <功能点 1>
- [ ] <功能点 2>

### Phase 2: <Phase 名称>
...
```

**分解逻辑**：
1. 解析 PRD 的 `Implementation Phases` 章节
2. 为每个 Phase 创建 Issue（使用 Shape Up Pitch 格式）
3. Issue body 包含：
   - Problem: 从 PRD 背景提取
   - Appetite: "TBD"
   - Solution: Phase 目标
   - Scope: Phase 下的 Scope 列表
   - Rabbit Holes: 空
   - No-gos: 空
4. 建立 PRD → Phase Issue 的关联

**示例**：
```bash
./scripts/issue.sh decompose-prd docs/products/PRD-wopalspace.md --dry-run
./scripts/issue.sh decompose-prd docs/products/PRD-wopalspace.md
```

### link-prd

关联 PRD 文档到 Issue。

**语法**：
```bash
./scripts/issue.sh link-prd <issue-number> <prd-path>
```

**示例**：
```bash
./scripts/issue.sh link-prd 42 docs/products/PRD-wopalspace.md
```

### link-plan

关联实施计划到 Issue。

**语法**：
```bash
./scripts/issue.sh link-plan <issue-number> <plan-path>
```

**示例**：
```bash
./scripts/issue.sh link-plan 42 docs/products/agent-tools/plans/issue-workflow-feature.md
```

### worktree

为 Issue 创建隔离开发环境。

**语法**：
```bash
./scripts/issue.sh worktree <issue-number> [选项]
```

**流程**：
1. 获取 Issue 信息确定目标项目
2. 生成分支名：`issue-{N}-{slug}`
3. 调用 git-worktrees 技能创建 worktree
4. 返回 worktree 路径

**示例**：
```bash
./scripts/issue.sh worktree 42
# 输出: .worktrees/agent-tools-issue-42-add-issue-workflow
```

### pr

为 Issue 创建 Pull Request。

**语法**：
```bash
./scripts/issue.sh pr <issue-number> [选项]
```

**可选参数**：
- `--base`: 目标分支（默认 main）
- `--draft`: 创建为 Draft PR

**流程**：
1. 检查当前分支是否有关联 Issue
2. 生成 PR 描述（自动包含 Issue 链接）
3. 创建 PR 并关联 Issue

**PR 描述模板**：
```markdown
## Summary

<!-- 变更摘要 -->

## Related Issue

Closes #<issue-number>

## Changes

- 变更项 1
- 变更项 2

## Test Plan

- [ ] 测试项 1
- [ ] 测试项 2
```

### close

关闭已完成的 Issue。

**语法**：
```bash
./scripts/issue.sh close <issue-number> [--comment "<message>"]
```

**流程**：
1. 验证所有关联 PR 已合并
2. 添加关闭评论（可选）
3. 更新 label 为 `status/done`
4. 关闭 Issue

### status

查看 Issue 当前状态。

**语法**：
```bash
./scripts/issue.sh status <issue-number>
```

**输出**：
- 基本信息（标题、类型、项目）
- 状态 Label
- 关联资源（PRD、Plan、PR）
- 开发环境（worktree 状态）

---

## 完整工作流示例

### 新功能开发流程

```bash
# 1. 创建 Issue
./scripts/issue.sh create \
  --title "添加 Issue 工作流技能" \
  --project agent-tools \
  --type feature

# 假设创建的 Issue 编号为 42

# 2. ⚠️ 等待用户确认 Issue 内容
# - 粒度是否合适？
# - 内容是否需要调整？
# - 是否需要拆分？

# 3. 用户确认后，关联 PRD 和 Plan（如有）
./scripts/issue.sh link-prd 42 docs/products/PRD-wopalspace.md
./scripts/issue.sh link-plan 42 docs/products/agent-tools/plans/issue-workflow-feature.md

# 4. 创建开发环境
./scripts/issue.sh worktree 42
cd .worktrees/agent-tools-issue-42-add-issue-workflow

# 5. 开发...
# 编写代码、测试

# 6. 创建 PR
./scripts/issue.sh pr 42

# 7. 合并后关闭
./scripts/issue.sh close 42 --comment "功能已上线"
```

### Bug 修复流程

```bash
# 1. 创建 Bug Issue
./scripts/issue.sh create \
  --title "修复部署脚本权限问题" \
  --project wopal-cli \
  --type bug \
  --label "status/blocked"

# 假设 Issue 编号为 123

# 2. 创建修复分支
./scripts/issue.sh worktree 123
cd .worktrees/wopal-cli-issue-123-fix-deploy-permission

# 3. 修复并创建 PR
./scripts/issue.sh pr 123

# 4. 关闭
./scripts/issue.sh close 123
```

---

## Issue 模板

见 `templates/issue.md`。

---

## 与其他技能协作

| 技能 | 协作方式 |
|------|----------|
| `plan-master` | Issue 关联 Plan，状态同步 |
| `git-worktrees` | `worktree` 命令调用 git-worktrees 创建隔离环境 |

---

## 注意事项

1. **仓库隔离**：wopal-cli 是独立仓库，Git 操作必须在项目目录内执行
2. **状态同步**：Issue 状态变更时需同步更新 label
3. **跨仓引用**：跨仓库 PR 使用 `Refs` 格式，非 `Closes`