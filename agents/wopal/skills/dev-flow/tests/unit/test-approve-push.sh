#!/bin/bash
# test-approve-push.sh - Test is_file_pushed function
#
# Test Case U1: approve 只按 Plan 文件 commit 判断 push 状态
#
# Scenarios:
#   1. Plan commit 已 push + unrelated ahead commit → 应放行
#   2. Plan commit 未 push → 应阻断
#   3. Plan 未 commit → 应阻断（返回 2）
#
# Fixture: 在 /tmp/dev-flow-test-<pid>/ 创建自包含 git fixture

set -euo pipefail

# Get directories
TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TESTS_DIR="$(dirname "$TEST_DIR")"
SKILL_DIR="$(dirname "$TESTS_DIR")"

source "$TESTS_DIR/lib/test-helpers.sh"
source "$TESTS_DIR/lib/git-fixture.sh"

# ============================================
# Test: is_file_pushed function
# ============================================

run_tests() {
    local fixture_dir
    fixture_dir=$(setup_fixture)
    
    test_start "Scenario 1: Plan commit pushed + unrelated ahead commit"
    
    # Create bare remote
    local remote_path
    remote_path=$(create_bare_remote "origin" "$fixture_dir")
    
    # Clone workspace
    local workspace_path
    workspace_path=$(create_clone_workspace "$remote_path" "ws1" "$fixture_dir")
    
    # Initialize with first commit
    init_workspace_commit "$workspace_path" "Initial commit"
    
    # Get default branch (main or master)
    local default_branch
    default_branch=$(cd "$workspace_path" && git branch --show-current)
    
    # Create docs/products/plans directory
    mkdir -p "$workspace_path/docs/products/plans"
    
    # Create and commit Plan file
    local plan_file="$workspace_path/docs/products/plans/100-test-plan.md"
    echo "# Test Plan" > "$plan_file"
    cd "$workspace_path"
    git add "$plan_file"
    git commit -m "Add plan file" >/dev/null 2>&1
    local plan_commit=$(git rev-parse HEAD)
    
    # Push Plan commit
    push_commits "$workspace_path" "origin" "$default_branch"
    
    # Create unrelated commit (after Plan is pushed)
    echo "unrelated change" > "$workspace_path/unrelated.txt"
    cd "$workspace_path"
    git add unrelated.txt
    git commit -m "Unrelated change" >/dev/null 2>&1
    
    # Now: Plan commit is pushed, but HEAD has an unrelated ahead commit
    # Test is_file_pushed should return 0 (Plan is pushed)
    
    # Source the actual is_file_pushed function
    source "$SKILL_DIR/lib/git.sh"
    
    # Set ROOT_DIR for is_file_pushed
    ROOT_DIR="$workspace_path"
    
    # Test relative path
    local plan_rel="docs/products/plans/100-test-plan.md"
    
    is_file_pushed "$plan_rel" "origin/$default_branch"
    local result=$?
    
    assert_exit_code 0 "$result" "Plan commit should be considered pushed (unrelated ahead doesn't affect it)"
    
    # ============================================
    test_start "Scenario 2: Plan commit not pushed"
    
    # Create another workspace
    local ws2_path
    ws2_path=$(create_clone_workspace "$remote_path" "ws2" "$fixture_dir")
    
    # Configure git user
    cd "$ws2_path"
    git config user.name "Test User" >/dev/null 2>&1
    git config user.email "test@example.com" >/dev/null 2>&1
    
    # Fetch to have remote refs
    git fetch origin >/dev/null 2>&1
    
    # Create docs/products/plans directory
    mkdir -p "$ws2_path/docs/products/plans"
    
    # Create Plan file (but don't push)
    local plan_file2="$ws2_path/docs/products/plans/200-unpushed-plan.md"
    echo "# Unpushed Plan" > "$plan_file2"
    cd "$ws2_path"
    git add "$plan_file2"
    git commit -m "Add unpushed plan" >/dev/null 2>&1
    
    # Plan is committed but NOT pushed
    ROOT_DIR="$ws2_path"
    
    is_file_pushed "docs/products/plans/200-unpushed-plan.md" "origin/$default_branch"
    local result2=$?
    
    assert_exit_code 1 "$result2" "Plan commit not pushed should return 1"
    
    # ============================================
    test_start "Scenario 3: Plan not committed (untracked)"
    
    # Create another workspace
    local ws3_path
    ws3_path=$(create_clone_workspace "$remote_path" "ws3" "$fixture_dir")
    
    cd "$ws3_path"
    git config user.name "Test User" >/dev/null 2>&1
    git config user.email "test@example.com" >/dev/null 2>&1
    git fetch origin >/dev/null 2>&1
    
    # Create Plan file but DON'T commit it (leave untracked)
    mkdir -p "$ws3_path/docs/products/plans"
    local plan_file3="$ws3_path/docs/products/plans/300-uncommitted-plan.md"
    echo "# Uncommitted Plan" > "$plan_file3"
    
    ROOT_DIR="$ws3_path"
    
    is_file_pushed "docs/products/plans/300-uncommitted-plan.md" "origin/$default_branch"
    local result3=$?
    
    assert_exit_code 2 "$result3" "Uncommitted Plan should return 2 (not 1)"
    
    cleanup_fixture
    test_summary
}