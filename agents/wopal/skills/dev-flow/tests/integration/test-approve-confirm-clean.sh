#!/bin/bash
# test-approve-confirm-clean.sh - Test approve --confirm commit order
#
# Test Case I4: approve --confirm 先写 executing，再 commit/push，最后同步 Issue
#
# Scenarios:
#   1. planning Plan 已 push → approve --confirm 后 Plan 变 executing 且 workspace 保持干净
#
# Fixture: 在 /tmp/dev-flow-test-<pid>/ 创建临时 space repo + bare remote + stub gh

set -euo pipefail

TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TESTS_DIR="$(dirname "$TEST_DIR")"
SKILL_DIR="$(dirname "$TESTS_DIR")"

source "$TESTS_DIR/lib/test-helpers.sh"
source "$TESTS_DIR/lib/git-fixture.sh"

run_tests() {
    local fixture_dir
    fixture_dir=$(setup_fixture)

    local gh_bin_dir
    gh_bin_dir=$(create_stub_gh "$fixture_dir")

    export FIXTURE_DIR="$fixture_dir"

    local remote_path
    remote_path=$(create_bare_remote "origin" "$fixture_dir")

    local workspace_path
    workspace_path=$(create_clone_workspace "$remote_path" "space" "$fixture_dir")

    init_workspace_commit "$workspace_path" "Initial commit"

    local default_branch
    default_branch=$(cd "$workspace_path" && git branch --show-current)

    mkdir -p "$workspace_path/docs/products/ontology/plans"

    local plan_file="$workspace_path/docs/products/ontology/plans/120-fix-dev-flow-approve-confirm-order.md"
    cat > "$plan_file" <<'EOF'
# 120-fix-dev-flow-approve-confirm-order

## Metadata

- **Issue**: #120
- **Type**: fix
- **Target Project**: ontology
- **Created**: 2026-04-21
- **Status**: planning

## Scope Assessment

- **Complexity**: Medium
- **Confidence**: High

## Goal

修复 approve --confirm 的提交时序，避免 commit 后再次把 Plan 改脏。

## Technical Context

### Confirmed Bugs

| # | File | 已确认缺陷 | 影响 |
|---|------|------------|------|
| 1 | `scripts/cmd/approve.sh` | 先 commit 再写 executing | 空间仓库残留脏变更 |

### Key Findings

1. approve --confirm 必须先完成 Plan 状态切换，再把最终内容 commit/push。

## In Scope

- 调整 approve --confirm 的状态切换与 commit/push 顺序
- 保证 issue 同步读取的是已 push 的 executing 版 Plan

## Out of Scope

- 不改 verify 与 archive 流程

## Affected Files

| Component | Files | Operation |
|-----------|-------|-----------|
| Approve | `scripts/cmd/approve.sh` | modify |

## Implementation

### Task 1: 修正 approve --confirm 的提交顺序

**Files**: `scripts/cmd/approve.sh`

**Changes**:
- [ ] Step 1: 将执行态状态写入移到 commit 前
- [ ] Step 2: 确保 commit/push 带上 executing 状态
- [ ] Step 3: 在 commit/push 后再同步 Issue

**Verification**: 用集成测试复现并验证 workspace 保持干净

## Delegation Strategy

| 批次 | Task | 执行者 | 依赖 |
|------|------|--------|------|
| 1 | Task 1 | Wopal | 无 |

单一脚本顺序修复，Wopal 直接处理。

## Test Plan

#### 集成测试

##### Case I4: approve --confirm 不再留下 Plan 脏变更
- Goal: 证明 approve --confirm 会把 executing 状态纳入同一次 commit/push
- Fixture: tests/integration/test-approve-confirm-clean.sh
- Execution:
  - [ ] Step 1: 运行 tests/integration/test-approve-confirm-clean.sh
  - [ ] Step 2: 确认 Plan 状态切到 executing
  - [ ] Step 3: 确认 git status 为空
- Expected Evidence: 最新提交已进入 origin/main，workspace 无残留脏变更

## Acceptance Criteria

### Agent Verification

- [ ] approve --confirm 后 Plan 状态为 executing 且已被 commit/push
- [ ] approve --confirm 结束后 workspace 保持干净

### User Validation

#### Scenario 1: approve --confirm 后不再出现空间仓库脏变更
- Goal: 验证 Agent 执行 approve --confirm 后无需手动清理由脚本造成的残留变更
- Precondition: Plan 处于 planning 且内容已评审通过
- User Actions:
  1. 让 agent 执行 flow.sh approve <issue> --confirm
  2. 查看空间仓库状态
- Expected Result: Plan 进入 executing，空间仓库不再留下额外脏变更

- [x] 用户已完成上述功能验证并确认结果符合预期
EOF

    cd "$workspace_path"
    git add "$plan_file"
    git commit -m "Add planning plan" >/dev/null 2>&1
    push_commits "$workspace_path" "origin" "$default_branch"

    export PATH="$gh_bin_dir:$PATH"
    export DEV_FLOW_WORKSPACE_ROOT="$workspace_path"

    test_start "approve --confirm commits executing status without leaving dirty plan"

    run_cmd "bash '$SKILL_DIR/scripts/flow.sh' approve 120 --confirm"

    if [[ "$LAST_EXIT_CODE" -ne 0 ]]; then
        test_fail "approve --confirm failed with exit code $LAST_EXIT_CODE"
        echo "Output: $LAST_OUTPUT"
        cleanup_fixture
        test_summary
        return 1
    fi

    assert_output_contains "Status: executing" "Command should enter executing state"
    assert_file_contains "$plan_file" "- **Status**: executing"

    local workspace_status
    workspace_status=$(git -C "$workspace_path" status --porcelain)
    assert_equals "" "$workspace_status" "Workspace should stay clean after approve --confirm"

    local latest_commit
    latest_commit=$(git -C "$workspace_path" rev-parse HEAD)
    if is_commit_in_remote "$workspace_path" "$latest_commit" "origin" "$default_branch"; then
        test_pass "Latest commit was pushed to remote"
    else
        test_fail "Latest commit was not pushed to remote"
    fi

    local latest_message
    latest_message=$(git -C "$workspace_path" log -1 --format='%s')
    assert_equals "docs(plan): approve plan #120" "$latest_message" "Status transition should be part of approve commit"

    local gh_log
    gh_log=$(get_gh_stub_log "$fixture_dir")
    assert_contains "Command: gh issue edit 120" "$gh_log" "Issue should be synced after commit/push"

    cleanup_fixture
    test_summary
}
