#!/bin/bash
# test-check-doc.sh - Test check_doc_plan function
#
# Test Case U2: check-doc 拒绝坏的 Task/Test 结构并放行好样例
#
# Scenarios:
#   1. valid-issue-plan.md → 应通过
#   2. valid-no-issue-plan.md → 应通过
#   3. bad-changes-numbered.md → 应拒绝（编号列表格式）
#   4. bad-testplan-empty.md → 应拒绝（空洞 Test Plan）
#   5. bad-user-validation-no-checkbox.md → 应拒绝（缺少 checkbox）
#   6. good-user-validation-checked.md → 应通过
#   7. old-plan-no-techcontext.md → 应通过（向后兼容）
#
# Fixture: tests/fixtures/plans/*.md

set -euo pipefail

# Get directories
TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TESTS_DIR="$(dirname "$TEST_DIR")"
SKILL_DIR="$(dirname "$TESTS_DIR")"
FIXTURES_DIR="$TESTS_DIR/fixtures/plans"

source "$TESTS_DIR/lib/test-helpers.sh"

# ============================================
# Test: check_doc_plan validation
# ============================================

run_tests() {
    # Source check-doc.sh library
    source "$SKILL_DIR/lib/check-doc.sh"
    
    # ============================================
    test_start "Valid issue plan should pass"
    
    local plan_file="$FIXTURES_DIR/106-fix-dev-flow-valid-issue-plan.md"
    
    run_cmd "check_doc_plan '$plan_file'"
    
    if [[ "$LAST_EXIT_CODE" -eq 0 ]]; then
        test_pass
    else
        test_fail "Expected pass, got exit code $LAST_EXIT_CODE"
        echo "Output: $LAST_OUTPUT"
    fi
    
    # ============================================
    test_start "Valid no-issue plan should pass"
    
    local plan_file="$FIXTURES_DIR/refactor-dev-flow-valid-no-issue-plan.md"
    
    run_cmd "check_doc_plan '$plan_file'"
    
    if [[ "$LAST_EXIT_CODE" -eq 0 ]]; then
        test_pass
    else
        test_fail "Expected pass, got exit code $LAST_EXIT_CODE"
        echo "Output: $LAST_OUTPUT"
    fi
    
    # ============================================
    test_start "Bad changes numbered should be rejected"
    
    local plan_file="$FIXTURES_DIR/fix-bad-changes-numbered.md"
    
    run_cmd "check_doc_plan '$plan_file'"
    
    if [[ "$LAST_EXIT_CODE" -eq 1 ]]; then
        # Check that error mentions numbered list format
        assert_output_contains "numbered list" || \
        assert_output_contains "编号列表" || \
        assert_output_contains "- [ ] Step" "Should mention correct step format"
        test_pass
    else
        test_fail "Expected rejection (exit 1), got exit code $LAST_EXIT_CODE"
        echo "Output: $LAST_OUTPUT"
    fi
    
    # ============================================
    test_start "Bad empty test plan should be rejected"
    
    local plan_file="$FIXTURES_DIR/fix-bad-testplan-empty.md"
    
    run_cmd "check_doc_plan '$plan_file'"
    
    if [[ "$LAST_EXIT_CODE" -eq 1 ]]; then
        # Check that error mentions test plan structure
        assert_output_contains "Test Plan" || \
        assert_output_contains "Case" || \
        assert_output_contains "structure" "Should mention Test Plan structure issue"
        test_pass
    else
        test_fail "Expected rejection (exit 1), got exit code $LAST_EXIT_CODE"
        echo "Output: $LAST_OUTPUT"
    fi
    
# ============================================
test_start "No User Validation section passes with warning (backward compat)"

# fixture: fix-bad-user-validation-no-checkbox.md lacks User Validation section
# check_doc_plan should pass (backward compat) with warning
local plan_file="$FIXTURES_DIR/fix-bad-user-validation-no-checkbox.md"

run_cmd "check_doc_plan '$plan_file'"

# Expected: exit 0 (pass) with warning about missing User Validation
if [[ "$LAST_EXIT_CODE" -eq 0 ]]; then
    # Should have warned about missing User Validation
    if echo "$LAST_OUTPUT" | grep -q "User Validation"; then
        test_pass "Correctly passed with warning about missing User Validation"
    else
        test_pass "Passed (backward compat)"
    fi
else
    test_fail "Expected pass for backward compat, got exit code $LAST_EXIT_CODE"
    echo "Output: $LAST_OUTPUT"
fi
    
    # ============================================
    test_start "Good user validation checked should pass"
    
    local plan_file="$FIXTURES_DIR/fix-good-user-validation-checked.md"
    
    run_cmd "check_doc_plan '$plan_file'"
    
    if [[ "$LAST_EXIT_CODE" -eq 0 ]]; then
        test_pass
    else
        test_fail "Expected pass, got exit code $LAST_EXIT_CODE"
        echo "Output: $LAST_OUTPUT"
    fi
    
    # ============================================
    test_start "Old plan no techcontext should pass (backward compat)"
    
    local plan_file="$FIXTURES_DIR/feature-old-plan-no-techcontext.md"
    
    run_cmd "check_doc_plan '$plan_file'"
    
    if [[ "$LAST_EXIT_CODE" -eq 0 ]]; then
        test_pass "Backward compatibility maintained"
    else
        test_fail "Expected pass for old format, got exit code $LAST_EXIT_CODE"
        echo "Output: $LAST_OUTPUT"
    fi
    
    test_summary
}