#!/bin/bash
# test-user-validation.sh - Test check_user_validation function
#
# Test Case U3: check_user_validation 只接受显式用户确认 checkbox
#
# Scenarios:
#   1. 纯文本内容（无 checkbox）→ 应失败
#   2. checkbox 未勾选 → 应失败
#   3. checkbox 已勾选 → 应成功
#
# Note: 测试时动态修改 checkbox 状态

set -euo pipefail

# Get directories
TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TESTS_DIR="$(dirname "$TEST_DIR")"
SKILL_DIR="$(dirname "$TESTS_DIR")"
FIXTURES_DIR="$TESTS_DIR/fixtures/plans"

source "$TESTS_DIR/lib/test-helpers.sh"
source "$TESTS_DIR/lib/git-fixture.sh"

# ============================================
# Helper: Modify checkbox state in file
# ============================================

set_checkbox_checked() {
    local file="$1"
    # Replace "- [ ] 用户已完成" with "- [x] 用户已完成"
    sed -i '' 's/- \[ \] 用户已完成/- [x] 用户已完成/' "$file" 2>/dev/null || \
    sed -i 's/- \[ \] 用户已完成/- [x] 用户已完成/' "$file"
}

set_checkbox_unchecked() {
    local file="$1"
    sed -i '' 's/- \[x\] 用户已完成/- [ ] 用户已完成/' "$file" 2>/dev/null || \
    sed -i 's/- \[x\] 用户已完成/- [ ] 用户已完成/' "$file"
}

# ============================================
# Test: check_user_validation gate
# ============================================

run_tests() {
    local fixture_dir
    fixture_dir=$(setup_fixture)
    
    # Source plan.sh library
    source "$SKILL_DIR/lib/plan.sh"
    
    # ============================================
    test_start "Scenario 1: Plain text only (no checkbox) should fail"
    
    # Copy bad fixture to temp location (so we don't modify original)
    local temp_plan="$fixture_dir/test-plain-text.md"
    cp "$FIXTURES_DIR/fix-bad-user-validation-no-checkbox.md" "$temp_plan"
    
    # This plan has User Validation section but no final checkbox
    
    run_cmd "check_user_validation '$temp_plan'"
    
    if [[ "$LAST_EXIT_CODE" -eq 1 ]]; then
        assert_output_contains "checkbox" || \
        assert_output_contains "final confirmation" "Should mention missing checkbox"
        test_pass
    else
        test_fail "Expected failure (exit 1), got exit code $LAST_EXIT_CODE"
        echo "Output: $LAST_OUTPUT"
    fi
    
    # ============================================
    test_start "Scenario 2: Checkbox unchecked should fail"
    
    # Copy good fixture and ensure checkbox is unchecked
    local temp_plan2="$fixture_dir/test-unchecked.md"
    cp "$FIXTURES_DIR/fix-good-user-validation-checked.md" "$temp_plan2"
    
    # Ensure checkbox is unchecked
    set_checkbox_unchecked "$temp_plan2"
    
    run_cmd "check_user_validation '$temp_plan2'"
    
    if [[ "$LAST_EXIT_CODE" -eq 1 ]]; then
        assert_output_contains "NOT checked" || \
        assert_output_contains "未勾选" || \
        assert_output_contains "checkbox" "Should mention unchecked status"
        test_pass
    else
        test_fail "Expected failure (exit 1), got exit code $LAST_EXIT_CODE"
        echo "Output: $LAST_OUTPUT"
    fi
    
    # ============================================
    test_start "Scenario 3: Checkbox checked should succeed"
    
    # Copy good fixture with checked checkbox
    local temp_plan3="$fixture_dir/test-checked.md"
    cp "$FIXTURES_DIR/fix-good-user-validation-checked.md" "$temp_plan3"
    
    # Ensure checkbox is checked (copy already has it checked)
    set_checkbox_checked "$temp_plan3"
    
    run_cmd "check_user_validation '$temp_plan3'"
    
    if [[ "$LAST_EXIT_CODE" -eq 0 ]]; then
        assert_output_contains "passed" || \
        assert_output_contains "success" || \
        test_pass
    else
        test_fail "Expected success (exit 0), got exit code $LAST_EXIT_CODE"
        echo "Output: $LAST_OUTPUT"
    fi
    
    # ============================================
    test_start "Scenario 4: No User Validation section passes (backward compat)"
    
    # Create a minimal plan without User Validation section
    local temp_plan4="$fixture_dir/test-no-uv-section.md"
    cat > "$temp_plan4" << 'EOF'
# test-backward-compat

## Metadata

- **Status**: done

## Goal

Test backward compatibility

## In Scope

- Testing

## Implementation

### Task 1: Test

**Changes**:
- [x] Step 1: Test backward compat

## Test Plan

N/A — backward compat test

## Acceptance Criteria

### Agent Verification

- [x] Done
EOF
    
    run_cmd "check_user_validation '$temp_plan4'"
    
    if [[ "$LAST_EXIT_CODE" -eq 0 ]]; then
        test_pass "Backward compat: no User Validation section passes"
    else
        test_fail "Expected pass for backward compat, got exit code $LAST_EXIT_CODE"
        echo "Output: $LAST_OUTPUT"
    fi
    
    cleanup_fixture
    test_summary
}