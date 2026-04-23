#!/bin/bash
# test-sync-ac.sh - Test _extract_acceptance_criteria handles ### sub-sections
#
# Test Case I10: Regression test for sync AC extraction bug
#
# Bug: line.startswith("##") matched ### headers, causing premature break
# Fix: line.startswith("## ") only matches ## followed by space
#
# Scenarios:
#   1. AC with ### Agent/User sub-sections → full content extracted
#   2. AC stops at next ## section (not ### within AC)

set -euo pipefail

# Get directories
TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TESTS_DIR="$(dirname "$TEST_DIR")"
SKILL_DIR="$(dirname "$TESTS_DIR")"
SCRIPTS_DIR="$SKILL_DIR/scripts"

source "$TESTS_DIR/lib/test-helpers.sh"
source "$TESTS_DIR/lib/git-fixture.sh"

# ============================================
# Test: AC extraction via Python one-liner
# ============================================

run_tests() {
    local fixture_dir
    fixture_dir=$(setup_fixture)
    
    # ============================================
    test_start "AC extraction includes ### sub-sections fully"
    
    # Create a plan with ### sub-sections in AC
    local plan_file="$fixture_dir/100-test-ac-plan.md"
    cat > "$plan_file" <<'PLANEOF'
# 100-test-ac-plan

## Metadata

- **Issue**: #100
- **Status**: executing

## Goal

Test AC extraction.

## Acceptance Criteria

### Agent Verification

- [ ] Agent test 1
- [ ] Agent test 2

### User Validation

- [ ] User test 1
- [ ] User test 2

## Out of Scope

Nothing.
PLANEOF
    
    # Call _extract_acceptance_criteria directly via Python
    local ac_output
    ac_output=$(cd "$SCRIPTS_DIR" && python3 -c "
import sys
sys.path.insert(0, '.')
from dev_flow.commands.sync import _extract_acceptance_criteria
print(_extract_acceptance_criteria('$plan_file'))
" 2>&1)
    
    assert_contains "### Agent Verification" "$ac_output" "AC should contain Agent Verification sub-section"
    assert_contains "Agent test 1" "$ac_output" "AC should contain agent test item 1"
    assert_contains "Agent test 2" "$ac_output" "AC should contain agent test item 2"
    assert_contains "### User Validation" "$ac_output" "AC should contain User Validation sub-section"
    assert_contains "User test 1" "$ac_output" "AC should contain user test item 1"
    assert_contains "User test 2" "$ac_output" "AC should contain user test item 2"
    
    # ============================================
    test_start "AC extraction stops at next ## section"
    
    if echo "$ac_output" | grep -q "^## Out of Scope"; then
        test_fail "AC should NOT contain next ## section (Out of Scope)"
    else
        test_pass "AC correctly stops before next ## section"
    fi
    
    # ============================================
    test_start "AC extraction handles empty AC section"
    
    local empty_ac_plan="$fixture_dir/101-empty-ac-plan.md"
    cat > "$empty_ac_plan" <<'PLANEOF'
# 101-empty-ac-plan

## Metadata

- **Status**: executing

## Goal

Test.

## Acceptance Criteria

## Out of Scope

Nothing.
PLANEOF
    
    local empty_ac_output
    empty_ac_output=$(cd "$SCRIPTS_DIR" && python3 -c "
import sys
sys.path.insert(0, '.')
from dev_flow.commands.sync import _extract_acceptance_criteria
result = _extract_acceptance_criteria('$empty_ac_plan')
print(repr(result))
" 2>&1)
    
    # Empty AC should return empty string
    if echo "$empty_ac_output" | grep -q "''\""; then
        test_pass "Empty AC section returns empty string"
    elif echo "$empty_ac_output" | grep -q '^""$'; then
        test_pass "Empty AC section returns empty string"
    else
        # Check if it's just whitespace or truly empty
        local trimmed
        trimmed=$(echo "$empty_ac_output" | xargs)
        if [[ -z "$trimmed" || "$trimmed" == "''" ]]; then
            test_pass "Empty AC section returns empty string"
        else
            test_fail "Empty AC should return empty string, got: $empty_ac_output"
        fi
    fi
    
    # ============================================
    test_summary
}

# Run tests
run_tests