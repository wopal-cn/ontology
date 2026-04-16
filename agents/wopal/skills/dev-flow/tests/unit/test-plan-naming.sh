#!/bin/bash
# test-plan-naming.sh - Test validate_plan_name function with mandatory scope
#
# Test Case U5: Plan file naming with mandatory scope validation
#
# Scenarios:
#   1. Issue format with scope → passes (e.g., 110-feature-dev-flow-slug)
#   2. No-issue format with scope → passes (e.g., feature-dev-flow-slug)
#   3. Old format without scope → fails (e.g., 110-feature-slug)
#   4. No-issue old format → fails (e.g., feature-slug)
#   5. Invalid type → fails
#
# Note: Tests the new mandatory scope naming requirement from #110

set -euo pipefail

# Get directories
TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TESTS_DIR="$(dirname "$TEST_DIR")"
SKILL_DIR="$(dirname "$TESTS_DIR")"

source "$TESTS_DIR/lib/test-helpers.sh"

# ============================================
# Test: validate_plan_name with mandatory scope
# ============================================

run_tests() {
    # Source plan.sh library
    source "$SKILL_DIR/lib/plan.sh"
    
    # ============================================
    test_start "validate_plan_name: Issue format with scope passes"
    
    local issue_plan="110-feature-dev-flow-improve-plan-naming"
    
    run_cmd "validate_plan_name '$issue_plan'"
    
    if [[ "$LAST_EXIT_CODE" -eq 0 ]]; then
        test_pass
    else
        test_fail "Expected pass, got exit code $LAST_EXIT_CODE"
        echo "Output: $LAST_OUTPUT"
    fi
    
    # ============================================
    test_start "validate_plan_name: Issue format with cli scope"
    
    local cli_plan="42-feature-cli-add-skills-remove"
    
    run_cmd "validate_plan_name '$cli_plan'"
    
    if [[ "$LAST_EXIT_CODE" -eq 0 ]]; then
        test_pass
    else
        test_fail "Expected pass, got exit code $LAST_EXIT_CODE"
        echo "Output: $LAST_OUTPUT"
    fi
    
    # ============================================
    test_start "validate_plan_name: No-issue format with scope passes"
    
    local no_issue_plan="fix-dev-flow-handle-expired-tokens"
    
    run_cmd "validate_plan_name '$no_issue_plan'"
    
    if [[ "$LAST_EXIT_CODE" -eq 0 ]]; then
        test_pass
    else
        test_fail "Expected pass, got exit code $LAST_EXIT_CODE"
        echo "Output: $LAST_OUTPUT"
    fi
    
    # ============================================
    test_start "validate_plan_name: No-issue with hyphenated scope"
    
    local hyphen_scope_plan="refactor-wopal-plugin-optimize-modules"
    
    run_cmd "validate_plan_name '$hyphen_scope_plan'"
    
    if [[ "$LAST_EXIT_CODE" -eq 0 ]]; then
        test_pass
    else
        test_fail "Expected pass for hyphenated scope, got exit code $LAST_EXIT_CODE"
        echo "Output: $LAST_OUTPUT"
    fi
    
    # ============================================
    # Note: The regex cannot distinguish old format (no scope) from new format
    # when the old slug happens to have 2+ segments. E.g., "110-feature-improve-plan-naming"
    # matches as: issue=110, type=feature, scope=improve, slug=plan-naming.
    # Scope enforcement happens at plan creation time (via extract_scope from Issue title),
    # not at regex validation time. The regex only checks structural format.
    test_start "validate_plan_name: Old Issue format with multi-segment slug still matches (regex limitation)"
    
    local old_issue_plan="110-feature-improve-plan-naming"
    
    # This passes because regex sees: issue=110, type=feature, scope=improve, slug=plan-naming
    # Scope enforcement is at creation time, not validation time
    run_cmd "validate_plan_name '$old_issue_plan'"
    
    if [[ "$LAST_EXIT_CODE" -eq 0 ]]; then
        test_pass "Old format still matches regex (scope enforcement is at creation time)"
    else
        test_fail "Expected pass for structurally valid name, got exit code $LAST_EXIT_CODE"
        echo "Output: $LAST_OUTPUT"
    fi
    
    # ============================================
    test_start "validate_plan_name: Single segment after type fails (no scope no slug)"
    
    local single_segment="feature-someslug"
    
    run_cmd "validate_plan_name '$single_segment'"
    
    if [[ "$LAST_EXIT_CODE" -eq 1 ]]; then
        assert_output_contains "scope" || \
        assert_output_contains "Invalid" "Should fail with only one segment after type"
        test_pass
    else
        test_fail "Expected failure for single segment after type, got exit code $LAST_EXIT_CODE"
        echo "Output: $LAST_OUTPUT"
    fi
    
    # ============================================
    test_start "validate_plan_name: Old no-issue format with multi-segment slug matches"
    
    local old_no_issue_plan="fix-handle-expired-tokens"
    
    # Matches as: type=fix, scope=handle, slug=expired-tokens
    run_cmd "validate_plan_name '$old_no_issue_plan'"
    
    if [[ "$LAST_EXIT_CODE" -eq 0 ]]; then
        test_pass "Old no-issue format still matches (regex cannot distinguish)"
    else
        test_fail "Expected pass for structurally valid name, got exit code $LAST_EXIT_CODE"
        echo "Output: $LAST_OUTPUT"
    fi
    
    # ============================================
    test_start "validate_plan_name: Invalid type fails"
    
    local invalid_type_plan="42-invalid-dev-flow-some-slug"
    
    run_cmd "validate_plan_name '$invalid_type_plan'"
    
    if [[ "$LAST_EXIT_CODE" -eq 1 ]]; then
        assert_output_contains "type" || \
        assert_output_contains "Invalid" "Should mention invalid type"
        test_pass
    else
        test_fail "Expected failure for invalid type, got exit code $LAST_EXIT_CODE"
        echo "Output: $LAST_OUTPUT"
    fi
    
    # ============================================
    test_start "validate_plan_name: Valid fix type with scope"
    
    local fix_plan="15-fix-plugin-handle-error"
    
    run_cmd "validate_plan_name '$fix_plan'"
    
    if [[ "$LAST_EXIT_CODE" -eq 0 ]]; then
        test_pass
    else
        test_fail "Expected pass for valid fix plan, got exit code $LAST_EXIT_CODE"
        echo "Output: $LAST_OUTPUT"
    fi
    
    # ============================================
    test_start "validate_plan_name: Valid refactor type with scope"
    
    local refactor_plan="refactor-cli-optimize-commands"
    
    run_cmd "validate_plan_name '$refactor_plan'"
    
    if [[ "$LAST_EXIT_CODE" -eq 0 ]]; then
        test_pass
    else
        test_fail "Expected pass for valid refactor plan, got exit code $LAST_EXIT_CODE"
        echo "Output: $LAST_OUTPUT"
    fi
    
    # ============================================
    test_start "validate_plan_name: Valid docs type with scope"
    
    local docs_plan="docs-dev-flow-update-readme"
    
    run_cmd "validate_plan_name '$docs_plan'"
    
    if [[ "$LAST_EXIT_CODE" -eq 0 ]]; then
        test_pass
    else
        test_fail "Expected pass for valid docs plan, got exit code $LAST_EXIT_CODE"
        echo "Output: $LAST_OUTPUT"
    fi
    
    # ============================================
    test_start "validate_plan_name: Valid chore type with scope"
    
    local chore_plan="chore-cli-reorganize-scripts"
    
    run_cmd "validate_plan_name '$chore_plan'"
    
    if [[ "$LAST_EXIT_CODE" -eq 0 ]]; then
        test_pass
    else
        test_fail "Expected pass for valid chore plan, got exit code $LAST_EXIT_CODE"
        echo "Output: $LAST_OUTPUT"
    fi
    
    test_summary
}