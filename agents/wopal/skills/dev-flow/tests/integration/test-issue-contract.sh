#!/bin/bash
# test-issue-contract.sh - Test Issue renderer contract consistency
#
# Test Case I1: Issue renderer 三路输出共享同一 contract
#
# Scenarios:
#   1. build_structured_issue_body (fix type) → 包含审计 section
#   2. build_structured_issue_body (non-fix type) → 无审计 section
#   3. Template skeleton → section 顺序一致
#
# Fixture: Source lib/issue.sh and templates/issue.md

set -euo pipefail

# Get directories
TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TESTS_DIR="$(dirname "$TEST_DIR")"
SKILL_DIR="$(dirname "$TESTS_DIR")"
FIXTURES_DIR="$TESTS_DIR/fixtures/plans"

source "$TESTS_DIR/lib/test-helpers.sh"

# ============================================
# Helper: Extract section headings from body
# ============================================

extract_sections() {
    local content="$1"
    echo "$content" | grep -E '^## ' | sed 's/^## //' || true
}

# ============================================
# Test: Issue renderer contract
# ============================================

run_tests() {
    # Source issue.sh library
    source "$SKILL_DIR/lib/issue.sh"
    
    # ============================================
    test_start "Fix type Issue body has audit sections"
    
    local fix_body
    fix_body=$(build_structured_issue_body --type fix \
        --goal "Fix push detection bug" \
        --background "approve.sh uses wrong logic" \
        --confirmed-bugs "Bug 1: wrong detection" \
        --content-model-defects "Defect: missing renderer" \
        --cleanup-scope "Only approve.sh" \
        --key-findings "Findings: need file-level commit" \
        --scope "Fix push detection" \
        --out-of-scope "No state machine change" \
        --reference "docs/xxx.md")
    
    # Extract sections
    local sections
    sections=$(extract_sections "$fix_body")
    
    # Verify fix body has audit sections
    assert_contains "Goal" "$sections" "Should have Goal section"
    assert_contains "Background" "$sections" "Should have Background section"
    assert_contains "Confirmed Bugs" "$sections" "Should have Confirmed Bugs section"
    assert_contains "Content Model Defects" "$sections" "Should have Content Model Defects section"
    assert_contains "Cleanup Scope" "$sections" "Should have Cleanup Scope section"
    assert_contains "Key Findings" "$sections" "Should have Key Findings section"
    assert_contains "In Scope" "$sections" "Should have In Scope section"
    assert_contains "Out of Scope" "$sections" "Should have Out of Scope section"
    assert_contains "Acceptance Criteria" "$sections" "Should have Acceptance Criteria section"
    assert_contains "Related Resources" "$sections" "Should have Related Resources section"
    
    test_pass "Fix body has all audit sections"
    
    # ============================================
    test_start "Non-fix type Issue body has no audit sections"
    
    local feature_body
    feature_body=$(build_structured_issue_body \
        --type feature \
        --goal "Add new feature" \
        --background "Background for feature" \
        --scope "In scope items" \
        --out-of-scope "Out of scope items" \
        --reference "reference.md")
    
    local feature_sections
    feature_sections=$(extract_sections "$feature_body")
    
    # Verify feature body does NOT have audit sections
    assert_contains "Goal" "$feature_sections" "Should have Goal"
    assert_contains "Background" "$feature_sections" "Should have Background"
    assert_contains "In Scope" "$feature_sections" "Should have In Scope"
    assert_contains "Out of Scope" "$feature_sections" "Should have Out of Scope"
    
    # Should NOT contain audit sections
    if echo "$feature_sections" | grep -q "Confirmed Bugs"; then
        test_fail "Feature body should NOT have Confirmed Bugs section"
    else
        test_pass "Feature body correctly excludes audit sections"
    fi
    
    if echo "$feature_sections" | grep -q "Content Model Defects"; then
        test_fail "Feature body should NOT have Content Model Defects section"
    else
        test_pass "Feature body correctly excludes Content Model Defects"
    fi
    
    # ============================================
    test_start "Section order is consistent"
    
    # For fix type, expected order:
    # Goal → Background → Confirmed Bugs → Content Model Defects → Cleanup Scope → Key Findings → In Scope → Out of Scope → Acceptance Criteria → Related Resources
    
    # Check that sections appear in correct order in fix_body
    local goal_pos background_pos bugs_pos defects_pos scope_pos findings_pos
    goal_pos=$(echo "$fix_body" | grep -n "^## Goal" | head -1 | cut -d: -f1)
    background_pos=$(echo "$fix_body" | grep -n "^## Background" | head -1 | cut -d: -f1)
    bugs_pos=$(echo "$fix_body" | grep -n "^## Confirmed Bugs" | head -1 | cut -d: -f1)
    defects_pos=$(echo "$fix_body" | grep -n "^## Content Model Defects" | head -1 | cut -d: -f1)
    scope_pos=$(echo "$fix_body" | grep -n "^## In Scope" | head -1 | cut -d: -f1)
    findings_pos=$(echo "$fix_body" | grep -n "^## Key Findings" | head -1 | cut -d: -f1)
    
    # Assert order: Goal < Background < Confirmed Bugs < Content Model Defects < Key Findings < In Scope
    if [[ "$goal_pos" -lt "$background_pos" && \
          "$background_pos" -lt "$bugs_pos" && \
          "$bugs_pos" -lt "$defects_pos" && \
          "$defects_pos" -lt "$findings_pos" && \
          "$findings_pos" -lt "$scope_pos" ]]; then
        test_pass "Section order is correct"
    else
        test_fail "Section order is incorrect"
        echo "Goal: $goal_pos, Background: $background_pos, Bugs: $bugs_pos, Defects: $defects_pos, Findings: $findings_pos, Scope: $scope_pos"
    fi
    
    # ============================================
    test_start "Perf/Refactor/Docs/Test templates render dedicated sections"

    local perf_body refactor_body docs_body test_body
    perf_body=$(build_structured_issue_body --type perf --goal "Speed up" --baseline "200ms" --target "120ms")
    refactor_body=$(build_structured_issue_body --type refactor --goal "Refactor" --affected-components "a,b" --refactor-strategy "extract modules")
    docs_body=$(build_structured_issue_body --type docs --goal "Docs" --target-documents "README" --audience "contributors")
    test_body=$(build_structured_issue_body --type test --goal "Tests" --test-scope "CLI" --test-strategy "integration")

    assert_contains "Baseline" "$(extract_sections "$perf_body")" "Perf body should have Baseline"
    assert_contains "Affected Components" "$(extract_sections "$refactor_body")" "Refactor body should have Affected Components"
    assert_contains "Target Documents" "$(extract_sections "$docs_body")" "Docs body should have Target Documents"
    assert_contains "Test Strategy" "$(extract_sections "$test_body")" "Test body should have Test Strategy"

    # ============================================
    test_start "Empty optional sections are suppressed"

    local minimal_body
    minimal_body=$(build_structured_issue_body --type feature --goal "Only goal")

    if echo "$minimal_body" | grep -q "^## Background"; then
        test_fail "Minimal body should not render empty Background"
    else
        test_pass "Background omitted when empty"
    fi

    if echo "$minimal_body" | grep -q "^## In Scope"; then
        test_fail "Minimal body should not render empty In Scope"
    else
        test_pass "In Scope omitted when empty"
    fi

    # ============================================
    test_start "Template skeleton has consistent sections"
    
    local template_file="$SKILL_DIR/templates/issue.md"
    
    if [[ -f "$template_file" ]]; then
        local template_content
        template_content=$(cat "$template_file")
        
        local template_sections
        template_sections=$(extract_sections "$template_content")
        
        # Template should have same base sections
        assert_contains "Goal" "$template_sections" "Template should have Goal"
        assert_contains "Background" "$template_sections" "Template should have Background"
        assert_contains "In Scope" "$template_sections" "Template should have In Scope"
        assert_contains "Out of Scope" "$template_sections" "Template should have Out of Scope"
        
        test_pass "Template skeleton consistent"
    else
        skip_test "Template file not found: $template_file"
    fi
    
    test_summary
}

run_tests
