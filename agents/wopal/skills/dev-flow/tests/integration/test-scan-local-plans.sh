#!/bin/bash
# test-scan-local-plans.sh - Test _scan_local_plans function
#
# Test Case I11: Local Plan scanning for list command
#
# Scenarios:
#   1. Plans in docs/products/*/plans/ are found
#   2. Plans without Issue are detected (has_issue=False)
#   3. Plans in done/ directory are excluded
#   4. Plans without Status metadata default to draft

set -euo pipefail

# Get directories
TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TESTS_DIR="$(dirname "$TEST_DIR")"
SKILL_DIR="$(dirname "$TESTS_DIR")"
SCRIPTS_DIR="$SKILL_DIR/scripts"

source "$TESTS_DIR/lib/test-helpers.sh"
source "$TESTS_DIR/lib/git-fixture.sh"

# ============================================
# Test: _scan_local_plans via Python
# ============================================

run_tests() {
    local fixture_dir
    fixture_dir=$(setup_fixture)
    
    # ============================================
    test_start "scan finds Plans in project subdirectory"
    
    # Create structure: docs/products/myproject/plans/123-plan.md
    local project_plans="$fixture_dir/docs/products/myproject/plans"
    mkdir -p "$project_plans"
    
    cat > "$project_plans/123-test-plan.md" <<'PLANEOF'
# 123-test-plan

## Metadata

- **Issue**: #123
- **Status**: executing

## Goal

Test.
PLANEOF
    
    local scan_result
    scan_result=$(cd "$SCRIPTS_DIR" && python3 -c "
import sys
sys.path.insert(0, '.')
from dev_flow.commands.query import _scan_local_plans
import json
results = _scan_local_plans('$fixture_dir')
print(json.dumps(results))
" 2>&1)
    
    # Parse and verify
    assert_contains '"name": "123-test-plan"' "$scan_result" "scan should find plan"
    assert_contains '"project": "myproject"' "$scan_result" "scan should detect project"
    assert_contains '"status": "executing"' "$scan_result" "scan should detect status"
    assert_contains '"has_issue": true' "$scan_result" "scan should detect Issue"
    assert_contains '"issue_number": 123' "$scan_result" "scan should extract Issue number"
    
    # ============================================
    test_start "scan detects Plans without Issue"
    
    cat > "$project_plans/standalone-plan.md" <<'PLANEOF'
# standalone-plan

## Metadata

- **Status**: planning

## Goal

Standalone.
PLANEOF
    
    scan_result=$(cd "$SCRIPTS_DIR" && python3 -c "
import sys
sys.path.insert(0, '.')
from dev_flow.commands.query import _scan_local_plans
import json
results = _scan_local_plans('$fixture_dir')
print(json.dumps(results))
" 2>&1)
    
    assert_contains '"name": "standalone-plan"' "$scan_result" "scan should find standalone plan"
    assert_contains '"has_issue": false' "$scan_result" "scan should detect no Issue"
    
    # ============================================
    test_start "scan excludes Plans in done/ directory"
    
    local done_dir="$project_plans/done"
    mkdir -p "$done_dir"
    
    cat > "$done_dir/archived-plan.md" <<'PLANEOF'
# archived-plan

## Metadata

- **Status**: done

## Goal

Archived.
PLANEOF
    
    scan_result=$(cd "$SCRIPTS_DIR" && python3 -c "
import sys
sys.path.insert(0, '.')
from dev_flow.commands.query import _scan_local_plans
import json
results = _scan_local_plans('$fixture_dir')
print(json.dumps(results))
" 2>&1)
    
    # archived-plan should NOT be in results
    if echo "$scan_result" | grep -q '"name": "archived-plan"'; then
        test_fail "scan should NOT include Plans in done/ directory"
    else
        test_pass "scan correctly excludes done/ Plans"
    fi
    
    # ============================================
    test_start "scan defaults Status to draft"
    
    cat > "$project_plans/no-status-plan.md" <<'PLANEOF'
# no-status-plan

## Metadata

- **Issue**: #99

## Goal

No status.
PLANEOF
    
    scan_result=$(cd "$SCRIPTS_DIR" && python3 -c "
import sys
sys.path.insert(0, '.')
from dev_flow.commands.query import _scan_local_plans
import json
results = _scan_local_plans('$fixture_dir')
# Filter to no-status-plan
for r in results:
    if r['name'] == 'no-status-plan':
        print(json.dumps(r))
" 2>&1)
    
    assert_contains '"status": "draft"' "$scan_result" "scan should default to draft"
    
    # ============================================
    test_summary
}

# Run tests
run_tests