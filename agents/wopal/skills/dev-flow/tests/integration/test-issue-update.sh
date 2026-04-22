#!/bin/bash

set -euo pipefail

TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TESTS_DIR="$(dirname "$TEST_DIR")"
SKILL_DIR="$(dirname "$TESTS_DIR")"

source "$TESTS_DIR/lib/test-helpers.sh"

run_tests() {
    source "$SKILL_DIR/lib/issue.sh"

    test_start "update_structured_issue_body only updates target section"

    local original_body
    original_body=$(build_structured_issue_body --type perf --goal "Old goal" --background "Old background" --baseline "200ms" --target "120ms" --scope "one,two" --reference "docs/original.md")

    local updated_body
    updated_body=$(update_structured_issue_body "$original_body" --goal "New goal")

    assert_contains "New goal" "$updated_body" "Goal should update"
    assert_contains "Old background" "$updated_body" "Background should remain"
    assert_contains "200ms" "$updated_body" "Baseline should remain"

    test_start "update_structured_issue_body preserves related resources rows"

    local updated_scope_body
    updated_scope_body=$(update_structured_issue_body "$original_body" --scope "alpha,beta")

    assert_contains "docs/original.md" "$updated_scope_body" "Research row should remain"
    assert_contains "| Plan | _待关联_ |" "$updated_scope_body" "Plan row should remain"
    assert_contains "- alpha" "$updated_scope_body" "New scope item alpha should exist"
    assert_contains "- beta" "$updated_scope_body" "New scope item beta should exist"

    test_start "update_structured_issue_body can add research without touching plan row"

    local no_research_body
    no_research_body=$(build_structured_issue_body --type feature --goal "Goal only")

    local with_research_body
    with_research_body=$(update_structured_issue_body "$no_research_body" --reference "docs/new.md")

    assert_contains "docs/new.md" "$with_research_body" "Research row should be inserted"
    assert_contains "| Plan | _待关联_ |" "$with_research_body" "Plan row should remain present"

    test_summary
}

run_tests
