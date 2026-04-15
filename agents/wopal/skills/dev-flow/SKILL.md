---
name: dev-flow
description: |
  **统一开发工作流 — Issue 驱动或 Plan 驱动的开发任务必须使用此技能。**
  
  提供 4-state 状态机强制的完整开发流程：planning → executing → verifying → done
  
  **必须使用本技能的场景**：
  - 任何涉及 GitHub Issue 的开发任务（#N、"这个 issue"、"那个任务"）
  - 用户说"做/开发/处理/搞定/完成"某个功能或 bug
  - 用户要求"开始开发"、"继续开发"、"执行计划"、"归档计划"
  - 用户要求创建、修改、管理 Plan 文件
  - 用户说"写个方案"、"出个计划"、"怎么实现"
  - 从 PRD 分解任务、创建 Issue
  - **无 Issue 快速开发**：用户直接说"做个 plan"
  
  **协议依赖**: git-worktrees 技能（可选，用于隔离开发）
compatibility:
  - bash 3.x+
  - gh CLI (GitHub CLI)
  - jq
---

# dev-flow

## 状态机 (4-State Model)

```
planning → executing → verifying → done
     ↑          ↑           ↑         ↑
 创建 Plan   审批通过    用户验证通过   归档收尾
```

| 状态 | 含义 | Issue Label |
|------|------|-------------|
| `planning` | 规划编写（含调查） | `status/planning` |
| `executing` | 执行实施中 | `status/in-progress` |
| `verifying` | 实施完成，等待用户验证 | `status/verifying` |
| `done` | 已完成，等待归档 | Issue 未关闭 |

**关键设计**：
- Plan Status 与 Issue 主状态标签 1:1 对应
- `complete` 触发 `executing -> verifying` 状态跃迁
- `verify --confirm` 是用户验证门（PR / 无 PR 两条路径统一）
- `archive` 仅做归档收尾，不承担用户确认职责

## 人类授权门

Agent **必须等待用户明确授权后才执行**：

| 命令 | 授权时机 | 用户表达 |
|------|----------|----------|
| `flow.sh approve <plan> --confirm` | 审批通过 | "审批通过"、"approved" |
| `flow.sh verify <plan> --confirm` | 用户验证通过（无 PR） | "验证通过"、"validation passed" |
| `flow.sh reset <plan>` | 重置（破坏性） | "重置"、"reset" |

**禁止行为**：
- 未经授权执行带 `--confirm` 的命令
- 告诉用户"你自己执行这个脚本"
- 跳过验证门直接推进状态

## 命令流

```bash
# Issue 驱动模式
flow.sh plan <issue> [--project <name>] [--check]       # 创建 Plan
flow.sh approve <issue> --confirm [--worktree]          # 审批 → executing
flow.sh complete <issue> [--pr]                         # 完成 → verifying
flow.sh verify <issue> --confirm                        # 用户验证 → done（无 PR）
flow.sh archive <issue>                                 # 归档

# 无 Issue 快速开发模式
flow.sh plan --title "<title>" --project <name> --type <type>
flow.sh approve <plan-name> --confirm [--worktree]
flow.sh complete <plan-name> [--pr]
flow.sh verify <plan-name> --confirm                    # 无 PR 路径用户验证门
flow.sh archive <plan-name>
```

### 参数说明

| 参数 | 含义 |
|------|------|
| `--check` | 验证 Plan 合规性（不创建） |
| `--worktree` | 创建隔离开发环境（前置检查优先） |
| `--pr` | 完成时创建 PR |
| `--confirm` | **用户授权确认**（Agent 收到授权后执行） |

## 验证路径

```
executing
    │
    ├── complete --pr ──→ verifying + pr/opened
    │       │
    │       └── PR merged + 用户确认 ──→ verify --confirm ──→ done
    │
    └── complete ──→ verifying
            │
            └── verify --confirm ──→ done
                    │
                    └── archive ──→ 归档收尾
```

| 场景 | 用户验证门 | 归档条件 |
|------|------------|----------|
| **有 PR** | `verify --confirm`（前提：PR merged） | PR merged + 用户确认 → `archive` |
| **无 PR** | `verify --confirm` | 用户验证通过 → `archive` |

## Label 体系

| 类别 | Labels | 用途 |
|------|--------|------|
| **status** | `status/planning` → `status/in-progress` → `status/verifying` | 主状态（单一互斥） |
| **type** | `type/feature`, `type/bug`, `type/refactor`, `type/docs`, `type/chore` | 任务类型 |
| **project** | `project/ontology`, `project/wopal-cli`, `project/space` | 目标项目 |
| **pr** | `pr/opened` | PR 子状态（叠加） |

**已移除**: `validation/awaiting`, `validation/passed` — 验证现在是主状态 `verifying`

## 状态映射表

| 命令 | Plan 状态 | Issue Label |
|------|----------|-------------|
| `plan` | `planning` | `status/planning` |
| `approve --confirm` | `executing` | `status/in-progress` |
| `complete` | `verifying` | `status/verifying` |
| `complete --pr` | `verifying` | `status/verifying` + `pr/opened` |
| `verify --confirm`（无 PR） | `done` | 保持（等待 archive） |
| `verify --confirm`（PR merged） | `done` | 保持（等待 archive） |
| `archive` | 归档文件 | Issue closed |

## 安全检查

### approve 前置检查

`approve --confirm` 在状态推进前执行：
1. **目标项目 git 脏工作区检查** — 有未提交变更则阻断并提示风险
2. **worktree 创建**（若 `--worktree`）— 失败则保持 `planning` 状态

**顺序保证**：所有前置检查成功后才推进状态，防止失败污染状态。

### approve 评审 commit

评审通过后自动提交 Plan 变更，保证评审对象稳定：
- 仅提交 Plan 文件变更
- 提交信息：`review: approve plan <plan-name>`
- 回显 commit hash 便于追溯

## Acceptance Criteria 分层

```
## Acceptance Criteria

### Agent Verification
- [x] 代码构建通过  ← Agent 完成，complete 前校验
- [x] 单元测试通过

### User Validation
- 重启后功能正常    ← 用户确认，verify --confirm 前
- UI 交互确认
```

| 子章节 | 校验时机 | 执行者 |
|--------|----------|--------|
| `### Agent Verification` | `complete` | Agent 打勾 |
| `### User Validation` | `verify --confirm` | 用户确认（纯文本） |

## 标准工作流

**Issue 驱动（正式任务）**：
```
1. plan <issue>           → AI 创建 Plan + 调查 (status: planning)
2. approve <issue>        → AI 提交审批，暂停
   用户授权后 → approve <issue> --confirm [--worktree]
3. complete <issue>       → AI 完成 → verifying
4. verify <issue>         → AI 提示用户验证
   用户验证后 → verify <issue> --confirm
5. archive <issue>        → AI 归档
```

**PR 路径**：
```
complete <issue> --pr → verifying + pr/opened
等待 PR merge + 用户确认
verify <issue> --confirm → done
archive <issue> → 归档
```

## 创建 Issue

```bash
flow.sh new-issue \
  --title "feat(cli): add skills remove" \
  --project wopal-cli \
  --type feature \
  --goal "一句话目标" \
  --scope "范围项 1, 范围项 2"
```

**必须使用 `flow.sh new-issue`**，禁止直接用 `gh issue create`。

## Issue 标题规范

**格式**: `<type>(<scope>): <description>`

| 元素 | 规则 | 示例 |
|------|------|------|
| `type` | 必选，见下方类型表 | `feat`, `fix` |
| `scope` | 可选，括号包裹，对应项目名 | `(cli)` |
| `description` | 必选，英文祈使句，≤50 chars | `add skills remove` |

**合法类型**:

| type | 用途 | Issue label |
|------|------|-------------|
| `feat` | 新功能 | `type/feature` |
| `fix` | Bug 修复 | `type/bug` |
| `refactor` | 重构（不改变功能） | `type/refactor` |
| `docs` | 文档更新 | `type/docs` |
| `test` | 测试相关 | `type/test` |
| `chore` | 构建/工具 | `type/chore` |
| `enhance` | 功能增强 | `type/feature` |

**长度限制**:
- `description`: ≤ 50 characters
- 整体标题: ≤ 72 characters

**示例**:
- ✅ `feat(cli): add skills remove command`
- ✅ `fix(plugin): handle expired tokens gracefully`
- ✅ `refactor: unify plan status management`（无 scope）
- ❌ `添加 skills remove 功能`（中文、无 type）
- ❌ `feat: This is a very long description exceeding fifty characters limit`（过长）

**Plan 名称提取**:
从 `<description>` 部分提取 slug（去掉 type/scope），转 kebab-case。
例如: `feat(cli): add skills remove` → Plan 名称: `feat-add-skills-remove`

## Plan 调查阶段

`plan` 命令包含调查子阶段：
1. 识别组件、阅读源文件
2. 映射当前架构、识别代码路径
3. 评估复杂度、识别风险
4. 检查现有模式、查看测试
5. 确定 Issue 类型

`approve` 时 `check-doc` 验证调查充分性：
- Technical Context 非空
- Affected Files 至少一行
- Complexity/Confidence 已填写

## 错误处理

| 错误 | 解决 |
|------|------|
| `Invalid transition` | 按状态顺序执行 |
| `Plan not found` | 先运行 `plan` |
| `check-doc failed` | 修复 Plan 后 `plan --check` |
| `dirty workspace` | 先提交或用 `--worktree` |

## 示例

```
用户: 帮我开发 Issue #14

AI:
  flow.sh plan 14
  [调查 + 编写...]
  flow.sh approve 14
  ⚠️ 等待审批

用户: 审批通过

AI: flow.sh approve 14 --confirm --worktree
    [执行实施...]
    flow.sh complete 14
    ⚠️ 等待用户验证

用户: 验证通过

AI: flow.sh verify 14 --confirm
    flow.sh archive 14
```
