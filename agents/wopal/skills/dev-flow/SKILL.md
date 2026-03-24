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
- Execute `flow.sh validate <issue> --confirm` on behalf of the user
- Ask the user to let the agent run these commands
- Bypass the check by proceeding without confirmation

If the user has not explicitly confirmed (by saying "approved", "validation passed", etc.), the agent **must stop and wait**.

This is a non-negotiable safety control — it ensures a human explicitly authorizes every transition from planning to execution and from execution to archive.

## CRITICAL: State Machine Compliance

The agent **must strictly follow** the state machine sequence:

```
create → start → plan → approve → dev → complete → validate → archive
```

| Phase | Agent Action | Human Gate |
|-------|---------------|------------|
| Implementation | Execute after `approve --confirm` | `approve --confirm` |
| Validation | Run tests, verify changes, mark Acceptance Criteria **immediately** per item | `validate --confirm` |

### Verification Discipline

1. **Mark Progress Immediately**: Each completed verification item must be marked `[x]` in the Plan file **right away**, not batched at the end
2. **Clean Up Test Data**: Test Issues created during verification must be **deleted** (not closed) after use:
   ```bash
   gh issue delete <issue> --repo <repo> --yes
   ```
3. **No Skipping**: Never skip `validate` phase or proceed to `archive` without user confirmation

## 状态机 (5-State Model)

```
investigating → planning → approved → executing → done
                            ↑              ↑
                       用户确认审批    验证/PR merged
```

| 状态 | 含义 | Label |
|------|------|-------|
| `investigating` | 调查研究 | `status/planning` |
| `planning` | 计划编写 | `status/planning` |
| `approved` | 计划通过 | `status/approved` |
| `executing` | 执行中 | `status/in-progress` |
| `done` | 已归档 | `status/done` |

### Label 子状态机制

| 类别 | Label | 含义 |
|------|-------|------|
| 验证 | `validation/awaiting` | 等待用户验证（无 PR） |
| 验证 | `validation/passed` | 验证通过（无 PR） |
| PR | `pr/opened` | PR 已创建 |

## 命令

```bash
# 创建 Issue（推荐方式）
flow.sh create --title "<title>" --project <name> --type <type> [--body "<body>"]

# 生命周期
flow.sh start <issue> [--project <name>]   # 创建 Plan
flow.sh spike <issue>                      # 调查阶段
flow.sh plan <issue> [--check]             # 计划阶段
flow.sh approve <issue> [--confirm] [--update-issue]  # 提交审批
flow.sh dev <issue> [--worktree]           # 开始执行
flow.sh complete <issue> [--pr]            # 完成
flow.sh validate <issue> --confirm         # 验证（无 PR 路径）
flow.sh archive <issue>                    # 归档

# 查询
flow.sh status <issue>                     # 查看状态
flow.sh list                               # 列出任务
flow.sh decompose-prd <prd> [--dry-run]    # 从 PRD 创建 Issue
```

## start 命令要求

运行 `flow.sh start <issue>` 前，Issue 必须有 `project/*` label，否则会报错并显示修复指引。

示例：
```bash
# 添加项目 label
gh issue edit <issue> --add-label 'project/agent-tools'
```

## 创建 Issue

**必须使用 `flow.sh create`**，禁止直接用 `gh issue create`。

### 参数

| 参数 | 必填 | 说明 |
|------|------|------|
| `--title` | ✅ | Issue 标题，格式：`<type>(<scope>): <description>` |
| `--project` | ✅ | 目标项目名（格式：`[a-z0-9-]+`） |
| `--type` | ✅ | 类型：`feature`、`fix`、`refactor`、`docs`、`chore` |
| `--body` | ❌ | Issue 内容（可选，有默认模板） |

### 自动添加的 Labels

- `status/planning` — 初始状态
- `type/*` — 根据 `--type` 参数
- `project/*` — 根据 `--project` 参数

### 示例

```bash
flow.sh create \
  --title "feat(wopal-cli): add skills remove command" \
  --project wopal-cli \
  --type feature
```

**Issue Body 模板**：见 `templates/issue.md`

## 验证路径

```
executing
    │
    ├── complete --pr ──→ pr/opened ──→ PR merged ──→ archive
    │
    └── complete ──→ validation/awaiting
                              │
                              └── validate --confirm ──→ validation/passed ──→ archive
```

| 场景 | 命令 | 验证方式 | 归档条件 |
|------|------|----------|----------|
| 有 PR | `complete --pr` | PR review | PR merged |
| 无 PR | `complete` | `validate --confirm` | `validation/passed` |

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

**设计**：`start` 命令自动补全缺失的 labels，无需 AI 手动添加。

### Label 体系

| 类别 | Labels | 用途 |
|------|--------|------|
| **status** | `status/planning` → `status/approved` → `status/in-progress` → `status/done` | 流程状态 |
| **type** | `type/feature`, `type/bug`, `type/refactor`, `type/docs`, `type/chore` | 任务类型 |
| **project** | `project/agent-tools`, `project/wopal-cli`, `project/space` | 目标项目 |
| **validation** | `validation/awaiting`, `validation/passed` | 用户验证（无 PR 路径） |
| **pr** | `pr/opened` | PR 已创建 |

### 自动补全时机

`start` 命令执行时：
1. 从 Issue title 解析 type（`feat:` → `type/feature`）
2. 从 Issue body 或 `--project` 参数获取 project
3. 自动添加 `status/planning` + `type/*` + `project/*`

## 标准工作流程

```
1. start <issue>     → AI 创建 Plan (status: investigating)
2. spike <issue>     → AI 调查研究（可选，保持 investigating）
3. plan <issue>      → AI 进入计划阶段 (status: planning)
4. approve <issue>   → AI 提交审批，暂停等待
   用户确认后 → approve <issue> --confirm
   如 Goal/Scope 有调整 → approve <issue> --confirm --update-issue
5. dev <issue>       → AI 执行实施 (status: executing)
6. complete <issue>  → AI 完成，添加验证 Label
   无 PR → 用户验证后执行 validate --confirm
   有 PR → 等待 PR merge
7. archive <issue>   → AI 归档 (status: done)
```

## AI 使用要点

### 两个暂停点

| 命令 | 触发者 | AI 行为 |
|------|--------|---------|
| `approve --confirm` | 用户 | 执行 `approve` 后**暂停**，等用户确认 |
| `validate --confirm` | 用户 | 执行 `complete` 后**暂停**，等用户验证 |

### Acceptance Criteria（强制）

**`complete` 前必须完成**：Plan 中的 `## Acceptance Criteria` 所有条目必须打勾。

```
## Acceptance Criteria

- [x] 验收条件 1  ← 必须打勾
- [x] 验收条件 2  ← 必须打勾
```

验证规则：
- `complete` 命令会检查是否有 `- [ ]`（未完成）
- 如有未完成项，拒绝 complete 并提示
- AI 必须执行验证并打勾，不能跳过

### 最佳实践

- **plan 阶段**：随时用 `--check` 验证格式
- **Issue 标题**：使用类型前缀（`fix:`, `feat:`, `docs:`）
- **worktree**：复杂功能用 `--worktree` 隔离

## Spike 阶段：深度代码调查

Spike 是探索性调查阶段，目标是深入理解问题空间，为后续计划提供坚实的技术基础。

### 调查步骤（10 步）

1. **识别组件** - 确定涉及的模块/子系统，不要从名称猜测，必须阅读代码确认
2. **彻底阅读源文件** - 不只是 grep 关键词，理解逻辑，跟踪调用链
3. **映射当前架构** - 组件如何交互？数据流是什么？边界在哪里？
4. **识别精确代码路径** - 提供文件路径**和行号**，命名函数、结构体、模块
5. **评估复杂度**：
   - Low: 隔离变更，<3 文件，路径清晰
   - Medium: 多文件，需要设计决策，范围明确
   - High: 跨切面变更，架构决策，有未知项
6. **识别风险与边界情况** - 什么可能出错？有哪些权衡？哪些决策需要人类输入？
7. **检查现有模式** - 类似功能如何实现？实现应保持一致
8. **查看测试** - 有哪些测试模式？期望什么覆盖率？
9. **检查架构文档** - 审阅 `docs/` 中相关文档
10. **确定 Issue 类型** - feat / fix / refactor / chore / perf / docs

### Plan 文档填充要求

调查完成后，在 Plan 中填充以下章节：

```markdown
## Scope Assessment
- **Complexity**: Low|Medium|High
- **Confidence**: High|Medium|Low

## Technical Context
<当前架构描述，为什么需要变更>

## Affected Components
| Component | Key Files | Role |
|-----------|-----------|------|
| <component> | `file1`, `file2` | <在此变更中的作用> |

## Code References
| Location | Description |
|----------|-------------|
| `file:line` | <代码做什么，为什么相关> |

## Risks & Open Questions
- <需要人类判断的风险或未知项>
- <可能有两种方向的设计决策>

## Test Considerations
- <测试策略>
- <需要的测试级别：unit, integration, e2e>
```

### 设计原则

1. **一切进入 Plan 文档** - 调查发现必须记录在 Plan 中，不要分散
2. **不做实施计划** - Spike 识别问题空间和方向，实施计划是 `plan` 阶段的职责
3. **节省后续工作** - 调查应足够详细，后续执行时可直接使用

### Issue 同步机制

Plan 评审通过后，Agent 需判断是否更新 Issue：

**判断规则**：
- **Goal/Scope 无变化** → `approve --confirm`（不更新 Issue）
- **Goal/Scope 有调整** → `approve --confirm --update-issue`（同步到 Issue）

**更新方式**：
- `--update-issue` 会用 Plan 的规范化内容**替换**整个 Issue body
- Issue 模板格式：英文标题 + 中文内容

**同步内容**（从 Plan 提取）：
- Goal → Issue Goal
- Technical Context → Issue Background
- In Scope → Issue In Scope
- Out of Scope → Issue Out of Scope
- Acceptance Criteria → Issue Acceptance Criteria

## Plan 模板格式

```markdown
# {project}-{type}-{slug}

## Metadata
- **Issue**: #N
- **Type**: feature|enhance|fix|refactor|docs|test
- **Created**: YYYY-MM-DD
- **Status**: investigating

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

## Code References
| Location | Description |
|----------|-------------|
| `file:line` | <代码做什么，为什么相关> |

## Files
| 文件 | 操作 | 说明 |
|------|------|------|

## Implementation
### Task N: 标题
**Files**: `path/to/file`
**Changes**: ...
**Verification**: ...

## Test Plan
- **Unit**: ...
- **Integration**: ...

## Risks & Open Questions
- ...

## Documentation Impact
- ...

## Acceptance Criteria
- [ ] ...
```

## 错误处理

| 错误 | 解决 |
|------|------|
| `Invalid transition` | 按顺序执行命令 |
| `Plan not found` | 先运行 `start` |
| `check-doc failed` | 修复 Plan 后重新 `plan --check` |

## 示例

```
用户: 帮我开发 Issue #14

AI: 
  flow.sh start 14 --project agent-tools
  flow.sh spike 14
  [调查研究...]
  flow.sh plan 14
  [填充 Plan...]
  flow.sh plan 14 --check
  flow.sh approve 14
  ⚠️ 暂停，等待审批确认

用户: 审批通过

AI: flow.sh approve 14 --confirm
    flow.sh dev 14 --worktree
    [执行实施...]
    flow.sh complete 14
    ⚠️ 暂停，等待验证

用户: 验证通过

AI: flow.sh validate 14 --confirm
    flow.sh archive 14
```