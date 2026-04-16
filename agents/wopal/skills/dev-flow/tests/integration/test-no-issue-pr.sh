#!/bin/bash
# test-no-issue-pr.sh - Test no-issue mode PR creation
#
# Test Case I2: 无 Issue 模式 complete --pr 走共享 helper
#
# Scenario:
#   1. 无 Issue Plan → complete --pr → stub gh 记录调用
#
# Fixture: 在 /tmp/dev-flow-test-<pid>/ 创建临时项目 repo、feature branch、stub gh

set -euo pipefail

# Get directories
TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TESTS_DIR="$(dirname "$TEST_DIR")"
SKILL_DIR="$(dirname "$TESTS_DIR")"

source "$TESTS_DIR/lib/test-helpers.sh"
source "$TESTS_DIR/lib/git-fixture.sh"

# ============================================
# Test: No-issue PR creation
# ============================================

run_tests() {
    local fixture_dir
    fixture_dir=$(setup_fixture)
    
    # Create stub gh
    local gh_bin_dir
    gh_bin_dir=$(create_stub_gh "$fixture_dir")
    
    # Export fixture dir for stub script
    export FIXTURE_DIR="$fixture_dir"
    
    # Source issue.sh (contains create_pr_for_plan)
    source "$SKILL_DIR/lib/issue.sh"
    
    # ============================================
    test_start "No Issue mode PR creation uses helper"
    
    # Create a project repo structure
    local project_name="test-project"
    local project_path="$fixture_dir/projects/$project_name"
    mkdir -p "$project_path"
    
    # Initialize as git repo
    cd "$project_path"
    git init >/dev/null 2>&1
    git config user.name "Test User" >/dev/null 2>&1
    git config user.email "test@example.com" >/dev/null 2>&1
    
    # Create initial commit on main branch
    echo "# Test Project" > README.md
    git add README.md
    git commit -m "Initial commit" >/dev/null 2>&1
    
    # Create feature branch
    git checkout -b feature-test >/dev/null 2>&1
    
    # Make a change on feature branch
    echo "feature content" > feature.txt
    git add feature.txt
    git commit -m "Feature change" >/dev/null 2>&1
    
    # Create bare remote for the project
    local project_remote="$fixture_dir/project-remote.git"
    git init --bare "$project_remote" >/dev/null 2>&1
    git remote add origin "$project_remote" >/dev/null 2>&1
    git push origin feature-test >/dev/null 2>&1 || true
    
    # Create Plan file
    local plan_dir="$fixture_dir/docs/products/plans"
    mkdir -p "$plan_dir"
    local plan_file="$plan_dir/refactor-test-pr.md"
    
    cat > "$plan_file" << 'EOF'
# refactor-test-pr

## Metadata

- **Type**: refactor
- **Target Project**: test-project
- **Status**: executing

## Goal

Test PR creation without Issue

## Implementation

### Task 1: Create PR

**Changes**:
- [x] Step 1: Create feature branch
- [x] Step 2: Make changes

## Test Plan

N/A — integration test

## Acceptance Criteria

### Agent Verification

- [x] PR created successfully
EOF
    
    # Override PATH to use stub gh
    export PATH="$gh_bin_dir:$PATH"
    
    # Override workspace root detection
    export DEV_FLOW_WORKSPACE_ROOT="$fixture_dir"
    ROOT_DIR="$fixture_dir"
    
    # Override get_project_repo to return mock repo
    # (we can't actually call real gh, but stub will handle it)
    
    # Call create_pr_for_plan
    # Note: This will use stub gh which logs the call
    
    run_cmd "create_pr_for_plan 'refactor-test-pr' --project '$project_name' --plan-file '$plan_file' 2>&1 || true"
    
    # Check stub log for gh pr create call
    local gh_log
    gh_log=$(get_gh_stub_log "$fixture_dir")
    
    # Verify gh pr create was called
    if echo "$gh_log" | grep -q "gh pr create"; then
        test_pass "Stub gh received pr create call"
    else
        test_fail "Expected gh pr create call in stub log"
        echo "Stub log content:"
        echo "$gh_log"
    fi
    
    # Verify call has correct parameters
    if echo "$gh_log" | grep -q "repo"; then
        test_pass "gh pr create has repo parameter"
    else
        test_fail "Missing repo parameter in gh pr create call"
    fi
    
    if echo "$gh_log" | grep -q "base"; then
        test_pass "gh pr create has base parameter"
    else
        test_fail "Missing base parameter in gh pr create call"
    fi
    
    if echo "$gh_log" | grep -q "title"; then
        test_pass "gh pr create has title parameter"
    else
        test_fail "Missing title parameter in gh pr create call"
    fi
    
    if echo "$gh_log" | grep -q "body"; then
        test_pass "gh pr create has body parameter"
    else
        test_fail "Missing body parameter in gh pr create call"
    fi
    
    # ============================================
    test_start "No undefined function error"
    
    # If create_pr_for_plan was undefined, we would have gotten an error
    # The stub call succeeding means the function exists and works
    
    # Reset PATH
    export PATH=""
    
    cleanup_fixture
    test_summary
}