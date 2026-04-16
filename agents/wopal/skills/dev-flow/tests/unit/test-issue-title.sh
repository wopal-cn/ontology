#!/bin/bash
# test-issue-title.sh - Test extract_scope and validate_issue_title functions
#
# Test Case U4: Issue title scope extraction and mandatory validation
#
# Scenarios:
#   1. extract_scope: title with scope → returns scope string
#   2. extract_scope: title without scope → returns empty string
#   3. validate_issue_title: valid format with scope → passes
#   4. validate_issue_title: missing scope → fails with error
#   5. validate_issue_title: description too long → fails
#   6. validate_issue_title: invalid type → fails
#
# Note: Tests the new mandatory scope requirement from #110

set -euo pipefail

# Get directories
TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TESTS_DIR="$(dirname "$TEST_DIR")"
SKILL_DIR="$(dirname "$TESTS_DIR")"

source "$TESTS_DIR/lib/test-helpers.sh"

# ============================================
# Test: extract_scope function
# ============================================

run_tests() {
    # Source issue.sh library
    source "$SKILL_DIR/lib/issue.sh"
    
    # ============================================
    test_start "extract_scope: title with scope returns scope string"
    
    local title="feat(cli): add skills remove command"
    local scope
    scope=$(extract_scope "$title")
    
    assert_equals "cli" "$scope" "Should extract 'cli' from title"
    
    # ============================================
    test_start "extract_scope: title with dev-flow scope"
    
    local title2="fix(dev-flow): repair workflow bugs"
    local scope2
    scope2=$(extract_scope "$title2")
    
    assert_equals "dev-flow" "$scope2" "Should extract 'dev-flow' from title"
    
    # ============================================
    test_start "extract_scope: title without scope returns empty"
    
    local title3="refactor: unify plan status management"
    local scope3
    scope3=$(extract_scope "$title3")
    
    assert_equals "" "$scope3" "Should return empty for title without scope"
    
    # ============================================
    test_start "extract_scope: title with multi-part scope"
    
    local title4="feat(wopal-plugin): add new feature"
    local scope4
    scope4=$(extract_scope "$title4")
    
    assert_equals "wopal-plugin" "$scope4" "Should handle hyphenated scope"
    
    # ============================================
    test_start "validate_issue_title: valid format with scope passes"
    
    local valid_title="feat(cli): add skills remove"
    
    run_cmd "validate_issue_title '$valid_title'"
    
    if [[ "$LAST_EXIT_CODE" -eq 0 ]]; then
        test_pass
    else
        test_fail "Expected pass, got exit code $LAST_EXIT_CODE"
        echo "Output: $LAST_OUTPUT"
    fi
    
    # ============================================
    test_start "validate_issue_title: missing scope fails"
    
    local no_scope_title="refactor: unify plan status management"
    
    run_cmd "validate_issue_title '$no_scope_title'"
    
    if [[ "$LAST_EXIT_CODE" -eq 1 ]]; then
        # Should mention scope is mandatory
        assert_output_contains "scope" || \
        assert_output_contains "mandatory" || \
        assert_output_contains "Scope is mandatory" "Should mention scope requirement"
        test_pass
    else
        test_fail "Expected failure for missing scope, got exit code $LAST_EXIT_CODE"
        echo "Output: $LAST_OUTPUT"
    fi
    
    # ============================================
    test_start "validate_issue_title: description too long fails"
    
    local long_title="feat(cli): this is a very long description that exceeds fifty characters limit"
    
    run_cmd "validate_issue_title '$long_title'"
    
    if [[ "$LAST_EXIT_CODE" -eq 1 ]]; then
        assert_output_contains "50" || \
        assert_output_contains "long" || \
        assert_output_contains "description" "Should mention description length"
        test_pass
    else
        test_fail "Expected failure for long description, got exit code $LAST_EXIT_CODE"
        echo "Output: $LAST_OUTPUT"
    fi
    
    # ============================================
    test_start "validate_issue_title: invalid type fails"
    
    local invalid_type="invalid(cli): some description"
    
    run_cmd "validate_issue_title '$invalid_type'"
    
    if [[ "$LAST_EXIT_CODE" -eq 1 ]]; then
        assert_output_contains "type" || \
        assert_output_contains "Invalid" "Should mention invalid type"
        test_pass
    else
        test_fail "Expected failure for invalid type, got exit code $LAST_EXIT_CODE"
        echo "Output: $LAST_OUTPUT"
    fi
    
    # ============================================
    test_start "validate_issue_title: valid fix type with scope"
    
    local fix_title="fix(dev-flow): handle edge case"
    
    run_cmd "validate_issue_title '$fix_title'"
    
    if [[ "$LAST_EXIT_CODE" -eq 0 ]]; then
        test_pass
    else
        test_fail "Expected pass for valid fix title, got exit code $LAST_EXIT_CODE"
        echo "Output: $LAST_OUTPUT"
    fi
    
    # ============================================
    test_start "validate_issue_title: valid enhance type with scope"
    
    local enhance_title="enhance(plugin): optimize performance"
    
    run_cmd "validate_issue_title '$enhance_title'"
    
    if [[ "$LAST_EXIT_CODE" -eq 0 ]]; then
        test_pass
    else
        test_fail "Expected pass for valid enhance title, got exit code $LAST_EXIT_CODE"
        echo "Output: $LAST_OUTPUT"
    fi
    
    test_summary
}