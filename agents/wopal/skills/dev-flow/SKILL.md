---
name: dev-flow
description: |
  **统一开发工作流 — 所有 Issue 驱动的开发任务必须使用此技能。**
  
  提供协议驱动、状态机强制的 Issue → Plan → 执行 → 验证 完整流程。
  
  **必须使用本技能的场景**（即使未明确提及）：
  - 任何涉及 GitHub Issue 的开发任务（#N、Issue N、"这个 issue"、"那个任务"）
  - 用户说"做/开发/处理/搞定/完成"某个功能或 bug
  - 用户要求"开始开发"、"继续开发"、"执行计划"、"归档计划"
  - 用户要求创建、修改、管理 Plan 文件
  - 用户说"写个方案"、"出个计划"、"怎么实现"
  - 从 PRD 分解任务、创建 Issue
  - 用户提到 "dev-flow"、"开发流程"、"Plan 管理"
  
  **协议依赖**: git-worktrees 技能（可选，用于隔离开发）
compatibility:
  - bash 3.x+
  - gh CLI (GitHub CLI)
  - jq
---

# dev-flow

## CRITICAL: `--confirm` Flag Is Human-Only

The `--confirm` flag is a **human gate**. Under **no circumstances** should the agent:

- Execute `flow.sh approve <issue> --confirm` on behalf of the user
- Execute `flow.sh archive <issue> --confirm` on behalf of the user
- Ask the user to let the agent run these commands
- Bypass the check by proceeding without confirmation

If the user has not explicitly confirmed (by saying "approved", "validation passed", etc.), the agent **must stop and wait**.

This is a non-negotiable safety control — it ensures a human explicitly authorizes every transition from planning to execution and from execution to archive.

## CRITICAL: State Machine Compliance

The agent **must strictly follow** the state machine sequence:

```
plan → approve --confirm → complete → archive --confirm
```

| Phase | Agent Action | Human Gate |
|-------|---------------|------------|
| Implementation | Execute after `approve --confirm` | `approve --confirm` |
| Validation | Run tests, verify changes, mark Acceptance Criteria **immediately** per item | `archive --confirm` |

### Verification Discipline

1. **Mark Progress Immediately**: Each completed verification item must be marked `[x]` in the Plan file **right away**, not batched at the end
2. **Clean Up Test Data**: Test Issues created during verification must be **deleted** (not closed) after use:
   ```bash
   gh issue delete <issue> --repo <repo> --yes
   ```
3. **No Skipping**: Never skip validation phase or proceed to `archive` without user confirmation

## 状态机 (3-State Model)

```
planning → executing → done
     ↑         ↑         ↑
 创建 Plan  用户确认审批  验证/PR merged
```

| 状态 | 含义 | Label |
|------|------|-------|
| `planning` | 规划编写（含调查） | `status/planning` |
| `executing` | 执行中 | `status/in-progress` |
| `done` | 已归档 | Issue closed |

### Label 子状态机制

| 类别 | Label | 含义 |
|------|-------|------|
| 验证 | `validation/awaiting` | 等待用户验证（叠加，不替换主状态） |
| 验证 | `validation/passed` | 验证通过（叠加） |
| PR | `pr/opened` | PR 已创建（叠加） |

## 命令

```bash
# 创建 Issue
flow.sh new-issue --title "<title>" --project <name> --type <type> [options]
# 可选参数: --goal, --background, --scope, --out-of-scope, --reference, --body

# 生命周期
flow.sh plan <issue> [--project <name>] [--check]  # 创建 Plan（含调查）
flow.sh approve <issue> --confirm [--worktree]     # 审批 → 执行
flow.sh complete <issue> [--pr]                    # 完成
flow.sh archive <issue> [--confirm]                # 归档

# 查询
flow.sh status <issue>                             # 查看状态
flow.sh list                                       # 列出任务
flow.sh decompose-prd <prd> [--dry-run]            # 从 PRD 创建 Issue
```

## plan 命令要求

运行 `flow.sh plan <issue>` 前，Issue 必须有 `project/*` label，否则会报错并显示修复指引。

示例：
```bash
# 添加项目 label
gh issue edit <issue> --add-label 'project/ontology'
```

## 创建 Issue

**必须使用 `flow.sh new-issue`**，禁止直接用 `gh issue create`。

### 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `--title` | ✅ | Issue 标题，格式：`<type>(<scope>): <description>` |
| `--project` | ✅ | 目标项目名（格式：`[a-z0-9-]+`） |
| `--type` | ✅ | 类型：`feature`、`fix`、`refactor`、`docs`、`chore` |
| `--goal` | ❌ | 一句话目标 |
| `--background` | ❌ | 背景描述 |
| `--scope` | ❌ | 范围项（逗号分隔） |
| `--out-of-scope` | ❌ | 不做的项（逗号分隔） |
| `--reference` | ❌ | 研究报告路径 |
| `--body` | ❌ | 完整 body（结构化参数优先） |

### 自动添加的 Labels

- `status/planning` — 初始状态
- `type/*` — 根据 `--type` 参数
- `project/*` — 根据 `--project` 参数

### Issue 标题 scope 规范

`--title` 中的 `(<scope>)` 应使用**组件级名称**（如 `dev-flow`、`wopal-cli`、`plan-sync`），避免使用大类名（如 `skills`、`commands`）。

```bash
# ✅ 精确 scope
--title "refactor(dev-flow): 优化 plan 模板与验收流程"
--title "feat(wopal-cli): add skills remove command"

# ❌ 过宽 scope
--title "refactor(skills): 优化 plan 模板与验收流程"
--title "feat(cli): add skills remove command"
```

### 示例

```bash
# 基本用法（使用模板）
flow.sh new-issue \
  --title "feat(wopal-cli): add skills remove command" \
  --project wopal-cli \
  --type feature

# 结构化参数（一步填入讨论结果）
flow.sh new-issue \
  --title "feat(mac-reminder): 个人待办技能" \
  --project ontology \
  --type feature \
  --goal "为 Wopal 提供个人待办管理，通过 macOS Reminders App 实现" \
  --background "经调研 AppleScript 可直接操作 Reminders App，JXA 有超时问题排除" \
  --scope "AppleScript 封装脚本, SKILL.md, 安装部署与 E2E 验证" \
  --out-of-scope "优先级排序, 依赖管理, 本地文件存储"
```

**Issue Body 模板**：见 `templates/issue.md`

## 验证路径

```
executing
    │
    ├── complete --pr ──→ pr/opened ──→ PR merged ──→ archive
    │
    └── complete ──→ validation/awaiting（叠加）
                              │
                              └── archive --confirm ──→ done
```

| 场景 | 命令 | 验证方式 | 归档条件 |
|------|------|----------|----------|
| 有 PR | `complete --pr` | PR review | PR merged（自动归档） |
| 无 PR | `complete` | 用户验证 | `validation/awaiting` + `--confirm` |

## Issue 与 PR 仓库分离

**设计决策**：Issue 在空间仓库统一管理，PR 在项目仓库创建。

| 资源 | 仓库 | 原因 |
|------|------|------|
| **Issue** | `sampx/wopal-space` | 跨项目任务统一追踪 |
| **PR** | 项目仓库（如 `wopal-cn/wopal-cli`） | 代码提交在项目 |

### 关键流程

1. **Plan 必须有 `Target Project`** → 指定代码变更在哪个项目
2. **创建 PR 时**：
   - 从 Plan 读取 `Target Project`
   - 获取项目目录的 git remote
   - 在项目仓库创建 PR
3. **更新 Issue 时**：
   - PR URL 写入 Issue body（空间仓库）
   - Label 更新在空间仓库

### PR 状态检测（archive）

`archive` 命令从 Issue body 解析 PR URL：
- 格式：`| PR | https://github.com/owner/repo/pull/123 |`
- 从 URL 提取 owner/repo 和 PR 号
- 用 `gh pr view --json mergedAt` 检测是否 merged

## Labels 管理

**设计**：`plan` 命令自动补全缺失的 labels，无需 AI 手动添加。

### Label 体系（3-state model）

| 类别 | Labels | 用途 |
|------|--------|------|
| **status** | `status/planning` → `status/in-progress` | 主状态（单一互斥） |
| **type** | `type/feature`, `type/bug`, `type/refactor`, `type/docs`, `type/chore` | 任务类型 |
| **project** | `project/ontology`, `project/wopal-cli`, `project/space` | 目标项目 |
| **validation** | `validation/awaiting`, `validation/passed` | 验证子状态（叠加） |
| **pr** | `pr/opened` | PR 子状态（叠加） |

### 自动补全时机

`plan` 命令执行时：
1. 从 Issue title 解析 type（`feat:` → `type/feature`）
2. 从 Issue body 或 `--project` 参数获取 project
3. 自动添加 `status/planning` + `type/*` + `project/*`

## 标准工作流程

```
1. plan <issue>        → AI 创建 Plan + 调查研究 + 编写 (status: planning)
2. approve <issue>     → AI 提交审批，暂停等待
    用户确认后 → approve <issue> --confirm [--worktree]
3. complete <issue>    → AI 完成，添加验证 Label 或创建 PR
    无 PR → 用户验证后执行 archive --confirm
    有 PR → 等待 PR merge
4. archive <issue>     → AI 归档 (status: done)
```

## AI 使用要点

### 两个暂停点

| 命令 | 触发者 | AI 行为 |
|------|--------|---------|
| `approve --confirm` | 用户 | 执行 `approve` 后**暂停**，等用户确认 |
| `archive --confirm` | 用户 | 执行 `complete` 后**暂停**，等用户验证 |

### Acceptance Criteria（分层）

Plan 中的 `## Acceptance Criteria` 分为两层：

```
## Acceptance Criteria

### Agent Verification
- [x] 代码构建通过  ← Agent 完成 complete 前必须打勾
- [x] 单元测试通过  ← complete 会校验此子章节

### User Validation
- [ ] 重启后功能正常  ← 用户 archive 前手动打勾
- [ ] UI 交互确认     ← archive --confirm 会校验此子章节
```

| 子章节 | 校验时机 | 打勾者 |
|--------|----------|--------|
| `### Agent Verification` | `complete` | Agent |
| `### User Validation` | `archive --confirm` | 用户 |

旧 Plan 无子章节时，`complete` 退化为检查整个 AC（向后兼容）。

### 实施后强制流程

Agent 完成所有 Task 实施后，**必须**按以下顺序执行：

1. **逐项验证 Agent Verification AC** → 每验证一项立即在 Plan 中打勾 `[x]`
2. **执行 `flow.sh complete <issue>`** → 校验 Agent Verification 是否全部勾选
3. **输出完成报告**，暂停等用户验证

禁止跳过验证直接 complete，禁止批量打勾不实际验证。

### 最佳实践

- **plan 阶段**：随时用 `--check` 验证格式
- **Issue 标题**：使用类型前缀（`fix:`, `feat:`, `docs:`）
- **worktree**：复杂功能用 `--worktree` 隔离

## plan 命令阶段：调查 + 编写

plan 命令包含两个子阶段（AI 自然衔接，无显式切换）：

### 调查子阶段（10 步 Spike 流程）

1. **识别组件** - 确定涉及的模块/子系统，阅读代码确认
2. **彻底阅读源文件** - 理解逻辑，跟踪调用链
3. **映射当前架构** - 组件交互、数据流、边界
4. **识别精确代码路径** - 文件路径和行号
5. **评估复杂度**：Low/Medium/High
6. **识别风险与边界情况** - 权衡、需人类输入的决策
7. **检查现有模式** - 类似功能实现方式
8. **查看测试** - 测试模式、覆盖率
9. **检查架构文档** - docs/ 相关文档
10. **确定 Issue 类型** - feat/fix/refactor/chore/perf/docs

### 编写子阶段

基于调查结果填充 Plan 章节：
- Scope Assessment：Complexity、Confidence
- Technical Context：架构描述、变更原因、风险
- Affected Components：表格
- In Scope/Out of Scope
- Files：文件列表
- Implementation：Task 分解
- Test Plan

### approve 时验证调查充分性

check-doc 强制验证：
- Technical Context 非空
- Affected Components 至少一行
- Complexity/Confidence 已填写（非占位符）
- 每个 Task 有 Files 和 Verification

## Plan 模板格式

```markdown
# {issue编号}-{type}-{slug}

## Metadata
- **Issue**: #N
- **Type**: feature|enhance|fix|refactor|docs|test
- **Created**: YYYY-MM-DD
- **Status**: planning

## Scope Assessment
- **Complexity**: Low|Medium|High
- **Confidence**: High|Medium|Low

## Goal
<一句话目标>

## Technical Context
<当前架构描述，为什么需要变更>

## Affected Components
| Component | Key Files | Role |
|-----------|-----------|------|

## In Scope
- [ ] 功能点 1

## Out of Scope
- <不做的内容>

## Files
| 文件 | 操作 | 说明 |
|------|------|------|

## Implementation
### Task N: 标题
**Files**: `path/to/file`
**Changes**: ...
**Verification**: ...

## Delegation Strategy
| 批次 | Task | 执行者 | 依赖 |
|------|------|--------|------|
| 1 | Task 1 | fae | 无 |
<!-- 或：N/A — 单一任务，无需并行委派 -->

## Test Plan
### Test Case Design
- <测试用例 1>
### Regression Testing
- <回归验证项>
### Adjustment Strategy
- <调整方案>

## Acceptance Criteria
### Agent Verification
- [ ] <Agent 可验证项>
### User Validation
- <用户验证项>
```

## 错误处理

| 错误 | 解决 |
|------|------|
| `Invalid transition` | 按顺序执行命令 |
| `Plan not found` | 先运行 `plan` |
| `check-doc failed` | 修复 Plan 后重新 `plan --check` |

## 状态映射表

| 命令 | Plan 状态 | Issue Labels |
|------|----------|-------------|
| `new-issue` | 无 | `status/planning` + `type/*` + `project/*` |
| `plan` | `planning` | `status/planning`（不变） |
| `approve --confirm` | `executing` | `status/in-progress`（替换） |
| `complete` | `executing` | `status/in-progress` + `validation/awaiting`（叠加） |
| `complete --pr` | `executing` | `status/in-progress` + `pr/opened`（叠加） |
| `archive` | `done` | closed |

## 示例

```
用户: 帮我开发 Issue #14

AI: 
  flow.sh plan 14
  [调查研究 + 编写 Plan...]
  flow.sh plan 14 --check
  flow.sh approve 14
  ⚠️ 暂停，等待审批确认

用户: 审批通过

AI: flow.sh approve 14 --confirm --worktree
    [执行实施...]
    flow.sh complete 14
    ⚠️ 暂停，等待验证

用户: 验证通过

AI: flow.sh archive 14 --confirm
```