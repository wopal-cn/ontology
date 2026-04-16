# 106-fix-repair-workflow-bugs-and-harden-design

## Metadata

- **Issue**: #106
- **Type**: fix
- **Target Project**: ontology
- **Created**: 2026-04-15
- **Status**: planning

## Scope Assessment

- **Complexity**: High
- **Confidence**: High

## Goal

修复 dev-flow 中已确认的脚本/校验缺陷，重建 fix 类 Issue 的内容模型与 Plan→Issue 渲染链路。

## Technical Context

### Confirmed Bugs

| # | File | 已确认缺陷 | 影响 |
|---|------|------------|------|
| 1 | `scripts/cmd/approve.sh` | push 检测逻辑错误 | 误判 |

### Key Findings

1. approve 的 push 检测必须以文件级 commit 可达性为准。

## In Scope

- 修复 approve 的文件级 push 检测
- 补齐无 Issue 模式的 PR 创建路径

## Out of Scope

- 不改 dev-flow 的 4-state 状态机语义

## Affected Files

| Component | Files | Operation |
|-----------|-------|-----------|
| Approve | `scripts/cmd/approve.sh` | modify |

## Implementation

### Task 1: 修复 approve 的文件级 push 检测

**Files**: `approve.sh`

**Changes**:
- [x] Step 1: 用 `git log -n 1 -- <plan>` 定位最后一次修改该 Plan 文件的 commit
- [x] Step 2: 用该 commit 与 `origin/main` 做可达性判断
- [x] Step 3: 删除仓库级 ahead 数分支

**Verification**: 在临时目录构造 3 组 git fixture 验证

## Test Plan

#### 单元测试

##### Case U1: approve 只按 Plan 文件 commit 判断 push 状态
- Goal: 证明 is_file_pushed 只关注文件最后修改 commit 是否进入 origin/main
- Fixture: tests/unit/test-approve-push.sh 在 /tmp/dev-flow-test-<pid>/ 创建 bare remote + clone
- Execution:
  - [ ] Step 1: 运行 tests/unit/test-approve-push.sh
  - [ ] Step 2: 确认 3 条场景全部 pass
- Expected Evidence: 只有最新 Plan commit 不在 origin/main 时返回失败

#### 集成测试

##### Case I1: Issue renderer 三路输出共享同一 contract
- Goal: 证明 fix 类 Issue 的三路 body 在 section 顺序上一致
- Fixture: tests/integration/test-issue-contract.sh
- Execution:
  - [ ] Step 1: 运行 tests/integration/test-issue-contract.sh
  - [ ] Step 2: 确认三路输出 section 顺序一致
- Expected Evidence: fix body 包含 Confirmed Bugs 等审计 section

## Acceptance Criteria

### Agent Verification

- [x] approve.sh 的 push 检测基于文件级 commit 可达性
- [x] 无 Issue 模式 complete --pr 走真实 helper

### User Validation

#### Scenario 1: verify --confirm 未勾选时阻断
- Goal: 确认 agent 不能在用户未勾选时自作主张通过验证
- Precondition: Plan 处于 verifying 状态，最终确认 checkbox 未勾选
- User Actions:
  1. 让 agent 执行 flow.sh verify <plan> --confirm
  2. 确认命令被阻断
- Expected Result: 第一次执行被明确阻断

- [x] 用户已完成上述功能验证并确认结果符合预期