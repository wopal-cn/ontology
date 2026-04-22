---
name: dev-flow
description: |
  Issue / Plan 驱动的开发工作流。⚠️ 只有当任务以 GitHub Issue 或 Plan 作为执行载体时才使用本技能。

  必须使用本技能的场景：
  - 开发、修复、重构某个 GitHub Issue（如 "#14"、"这个 issue"、"处理 issue 120"）
  - 创建、修改、推进、验证、归档 Plan
  - 用户要求“写个方案 / 出个计划 / 开始开发 / 继续开发 / 执行计划”，且任务会通过 Plan 落地执行
  - 从 PRD 拆分 Issue

  不使用本技能的场景：
  - spec 驱动流程（Spec / OpenSpec / spec-first / spec-kit）
  - 单纯研究、讨论、解释、评审
  - 不需要 Issue 或 Plan 承载的临时小改动

  🔴 判断标准：任务是否要进入 “Issue / Plan → 实施 → 验证 → 归档” 这条开发链路。只有是，才使用本技能。

  依赖：git-worktrees 技能（可选，用于隔离开发环境）
compatibility:
  - bash 3.x+
  - gh CLI
  - jq
---

# dev-flow — Issue / Plan 驱动开发流程

统一状态机：

```text
planning → executing → verifying → done
```

统一命令链：

```text
plan → approve → approve --confirm → complete → verify --confirm → archive
```

## 核心原则

1. 先进入 Plan 生命周期，再开始实施。
2. `approve --confirm` 和 `verify --confirm` 都是人类授权门。
3. `complete` 只表示“实施完成，进入用户验证阶段”，不代表“用户已验证通过”。
4. `archive` 只做归档收尾，不承担验证职责。

## 最容易遗漏的两步

1. **Plan 写完后：`--check` → 必要时 `sync <issue> --body-only` → `approve` → 等用户审批。**
2. **实施完成后：勾选已完成步骤 → 完成 Agent Verification → `complete` → 再等用户验证。**

   **步骤勾选范围**：
   - Implementation：每个 Task 的 **Changes** 和 **Verification** 里的 `- [ ] Step N:` 格式 checkbox
   - Test Plan：每个 Case 的 **Execution** 里的 `- [ ] Step N:` 格式 checkbox
   
   `complete` 会强制校验以上所有 Step checkbox 必须全部勾选，否则阻断并提示。

## 状态机与命令映射

| 命令 | 前置状态 | 后置状态 | 作用 |
|------|---------|---------|------|
| `plan` | 无 / 初始 | `planning` | 创建或定位 Plan |
| `approve` | `planning` | `planning` | 校验 Plan，提交方案评审 |
| `approve --confirm` | `planning` | `executing` | 用户审批通过后开始实施 |
| `complete` | `executing` | `verifying` | 实施完成，进入用户验证阶段 |
| `verify --confirm` | `verifying` | `done` | 用户验证通过后进入 done |
| `archive` | `done` | 归档 | 归档 Plan，关闭 Issue |

命令顺序不合法时，回到正确状态顺序执行，不要强行推进。

## 人类授权门

| 命令 | 用户信号 |
|------|---------|
| `approve --confirm` | “审批通过”、“approved”、“可以开始” |
| `verify --confirm` | “验证通过”、“没问题”、“validation passed” |
| `reset` | “重置”、“reset” |

禁止：
- 未经授权执行任何 `--confirm`
- 跳过 `approve` 直接 `approve --confirm`
- 让用户自己执行这些脚本

## 标准流程

### A. 进入 planning

**Issue 驱动：**

```bash
flow.sh plan <issue>
```

**Plan 驱动（无 Issue）：**

```bash
flow.sh plan --title "<type>(<scope>): <description>" --project <name> --type <type> [--scope <scope>]
```

### B. Plan 写完后，进入方案评审

不要直接开工。按这个顺序推进：

1. 完成 Plan 编写；结构以 `templates/plan.md` 为准。
2. 显式运行校验：
   ```bash
   flow.sh plan <issue> --check
   ```
   无 Issue 模式则用原始 plan 参数重新定位并校验。
3. **仅 Issue 驱动**：如果 Plan 调整会影响 Issue body 展示内容，执行：
   ```bash
   flow.sh sync <issue> --body-only
   ```
   说明：
   - 它不会检测“哪些章节变了”
   - 它会根据当前 Plan 重新生成并整体覆盖 Issue body
   - 保守策略：只要你认为 Issue body 应更新，就重新同步一次
4. 然后必须执行：
   ```bash
   flow.sh approve <issue>
   ```
5. 停止推进，等待用户审批。收到明确授权后，才能执行：
   ```bash
   flow.sh approve <issue> --confirm [--worktree]
   ```

不要这样做：
- Plan 刚写完就直接开始实施
- 忘记执行 `approve`
- Plan 已调整但 Issue 仍停留在旧内容

### C. 进入 executing 后实施

实施过程中，每完成一个步骤就立即勾选对应 checkbox，不要积压到最后统一补勾。

至少及时更新：
- `Implementation` 里的 `Changes`
- `Verification` 里的步骤
- 已实际完成的测试步骤

### D. 实施完成后，进入用户验证阶段

不要直接让用户验证。先完成这几步：

1. 回看 Plan，确认**所有步骤都已勾选**（Implementation + Test Plan 的 Step checkbox）。
2. 完成并勾选 `### Agent Verification`。
3. 然后必须执行：
   ```bash
   flow.sh complete <issue>
   ```

`complete` 的硬门控：
- Step completion：Implementation / Test Plan 中所有 `- [ ] Step N:` 格式 checkbox 必须勾选
- Agent Verification：`### Agent Verification` 中所有 checkbox 必须勾选

门控失败时会阻断并提示：
- 显示未勾选的步骤列表
- 提示 Agent 检查工作并完成勾选
- 再次执行 `complete`

`complete` 后，任务正式进入 `verifying`。

只有在仓库策略明确要求 Pull Request 时，才改用：

```bash
flow.sh complete <issue> --pr
```

不要这样做：
- 步骤做完了但不勾选 checkbox
- `Agent Verification` 未完成就推进
- 忘记执行 `complete`

### E. 用户验证通过后进入 done

用户完成验证并明确确认后，执行：

```bash
flow.sh verify <issue> --confirm
```

这一步的硬前提：
- Plan 当前状态是 `verifying`
- User Validation 最终 checkbox 已由用户勾选

### F. 最后归档

```bash
flow.sh archive <issue>
```

归档前提：Plan 状态已经是 `done`。

## 主流路径

| 场景 | 命令路径 |
|------|----------|
| Issue 驱动 | `plan → --check → sync(issue, 如需) → approve → approve --confirm → complete → verify --confirm → archive` |
| Plan 驱动 | `plan → approve → approve --confirm → complete → verify --confirm → archive` |

补充：
- 无 Issue 模式下，没有 `sync` 这一步
- 无 Issue 模式下，后续统一用 `plan-name`

## worktree 场景

把 `--worktree` 视为隔离执行策略，而不是工作区不干净时的补救按钮。

优先在这些情况下使用 `--worktree`：
- 用户明确要求使用 worktree
- 希望把当前任务与其他工作隔离
- 多任务并行开发，避免上下文与改动互相污染
- 任务周期较长、改动面较大，或准备委派给 fae 持续执行

用法：

```bash
flow.sh approve <issue> --confirm --worktree
```

要点：
- 用户已明确说明使用 worktree 时，必须带 `--worktree`
- `--worktree` 只在真正进入 `executing` 时使用
- 目标项目工作区不干净，不是选择 worktree 的理由本身，而是禁止继续在当前工作区执行的信号
- 不带 `--worktree` 且目标项目工作区不干净时，命令会阻断；此时应先清理/提交当前变更，或改用 `--worktree`
- worktree 创建失败时，状态应保持在 `planning`

## PR（高级可选）

默认主流程不走 PR。

只在这些情况下使用 `--pr`：
- 目标仓库要求通过 PR 合并代码
- 你明确需要 GitHub Review / CI / branch protection 这条流程

最小记忆即可：

```text
complete --pr → PR opened → PR merged → verify --confirm → archive
```

如果不确定，就不要走 PR 路径。

## Plan 质量门

进入 `approve` 前，Plan 必须达到可执行质量，而不是空提纲。

SKILL.md 不重复模板章节内容，只规定流程要求：
- Plan 写完后先做质量校验
- 校验通过后再进入 `approve`
- 实施过程中及时勾选步骤
- 实施完成后补齐 `Agent Verification`，再执行 `complete`

如果 `approve` 被 check-doc 阻断，先修 Plan，再重试。

## Acceptance Criteria 的使用方式

### Agent Verification

由 agent 在 `complete` 前完成并勾选，用于机器可验证项，如构建、单测、CLI 自测。

### User Validation

由用户在真实验证后确认，用于人工感知项，如 UI / UX、业务流程、集成行为。

关键约束：
- Agent 不得代勾选 User Validation 最终 checkbox
- `verify --confirm` 会严格检查这道门

## 命令面速查

### `flow.sh issue create`

创建规范化 Issue。开发任务建 Issue 时只用这个入口。

```bash
flow.sh issue create --title "<type>(<scope>): <description>" --project <name> [options]
```

**必填参数**：
- `--goal "<一句话目标>"` — 必填，不传会产生占位符 `<一句话描述目标>`
- title 的 `<description>` 必须是英文祈使句（≤50 chars），格式如 `add missing config keys`

**常用参数**：
- `--background`
- `--scope`
- `--out-of-scope`
- `--reference`

类型专属参数按需使用：
- perf：`--baseline` / `--target`
- refactor：`--affected-components` / `--refactor-strategy`
- docs：`--target-documents` / `--audience`
- test：`--test-scope` / `--test-strategy`
- fix：`--confirmed-bugs` / `--cleanup-scope` / `--key-findings`

### `flow.sh issue update`

```bash
flow.sh issue update <issue> [options]
```

适合补充 Goal、Background、Scope、Acceptance Criteria 及各类型特定字段。

### `flow.sh sync`

手动把 Plan 同步回 Issue，不推进状态。

```bash
flow.sh sync <issue>
flow.sh sync <issue> --body-only
flow.sh sync <issue> --labels-only
```

### `flow.sh status`

```bash
flow.sh status <issue>
```

显示：Issue 标题 / 状态 / labels、对应 Plan、Plan 状态、worktree 信息（若存在）。

### `flow.sh list`

```bash
flow.sh list
```

### `flow.sh decompose-prd`

```bash
flow.sh decompose-prd <prd-path> [--dry-run] [--project <name>]
```

建议先：

```bash
flow.sh decompose-prd <prd-path> --dry-run
```

### `flow.sh reset`

Issue 驱动：

```bash
flow.sh reset <issue>
```

Plan 驱动：

```bash
flow.sh reset <plan-name>
```

这是破坏性操作，只在用户明确要求时执行。

## 边缘场景

1. **已有 Plan 再次执行 `plan`**：不重复创建，继续基于现有 Plan 推进。
2. **`complete` 时 Step 未完成**：先勾选 Implementation / Test Plan 中所有 `- [ ] Step N:` 格式的 checkbox，不要强行进入 `verifying`。
3. **`complete` 时 Agent Verification 未完成**：先补齐 `Agent Verification`，不要强行进入 `verifying`。
4. **`verify --confirm` 时 PR 未 merged**：先等 PR merge。
5. **`verify --confirm` 时用户未勾选最终 checkbox**：先让用户完成 User Validation。
6. **目标项目工作区不干净**：这表示当前工作区不适合继续执行；先清理/提交当前变更，或改用 `--worktree`。
7. **参数选择规则**：Issue 驱动一律传 issue number；无 Issue 的 Plan 驱动一律传 plan-name。

## 错误处理

| 错误 | 处理 |
|------|------|
| `Invalid transition` | 回到正确状态顺序执行 |
| `Plan not found` | 先运行 `plan` |
| `check-doc failed` | 修好 Plan 再 `approve` |
| `Step completion failed` | 勾选 Implementation / Test Plan 中所有 Step checkbox，再 `complete` |
| `Agent Verification failed` | 补齐 Agent Verification checkbox，再 `complete` |
| `dirty workspace` | 当前工作区不适合继续执行；先清理/提交，或改用 `--worktree` |
| `PR not merged yet` | 等 merge 后再 `verify --confirm` |
| `User Validation gate failed` | 让用户完成验证并勾选最终 checkbox |

## 参考

按需读取：

| 文件 | 用途 |
|------|------|
| `templates/plan.md` | Plan 骨架模板 |
| `templates/issue.md` | 通用 / feature / enhance / chore 类型 Issue 模板 |
| `templates/issue-fix.md` | fix 类型 Issue 模板 |
| `templates/issue-perf.md` | perf 类型 Issue 模板 |
| `templates/issue-refactor.md` | refactor 类型 Issue 模板 |
| `templates/issue-docs.md` | docs 类型 Issue 模板 |
| `templates/issue-test.md` | test 类型 Issue 模板 |
| `references/plan-validation.md` | Plan 校验规则（含 Test Plan / AC 写法） |
| `references/issue-format.md` | Issue 标题与 Plan 命名规范 |
