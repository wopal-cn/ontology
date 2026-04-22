#!/bin/bash

set -euo pipefail

TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TESTS_DIR="$(dirname "$TEST_DIR")"
SKILL_DIR="$(dirname "$TESTS_DIR")"

source "$TESTS_DIR/lib/test-helpers.sh"
source "$SKILL_DIR/lib/common.sh"
source "$SKILL_DIR/lib/labels.sh"
source "$SKILL_DIR/lib/issue.sh"
source "$SKILL_DIR/lib/plan.sh"
source "$SKILL_DIR/lib/plan-sync.sh"
source "$SKILL_DIR/scripts/flow.sh"

run_tests() {
    test_start "build_repo_blob_url creates GitHub blob links"

    local url
    url=$(build_repo_blob_url "sampx/wopal-space" "docs/products/ontology/plans/120-demo.md")
    assert_equals "https://github.com/sampx/wopal-space/blob/main/docs/products/ontology/plans/120-demo.md" "$url" "Should build blob URL"

    test_start "build_issue_body_from_plan uses blob URL for plan link"

    local fixture="$TESTS_DIR/fixtures/plans/106-fix-dev-flow-valid-issue-plan.md"
    local body
    body=$(build_issue_body_from_plan "$fixture" "106-fix-dev-flow-valid-issue-plan" "sampx/wopal-space")
    assert_contains "https://github.com/sampx/wopal-space/blob/main/docs/products/ontology/plans/106-fix-dev-flow-valid-issue-plan.md" "$body" "Plan link should be blob URL"

    test_start "find_plan_by_issue resolves archived plans in done directory"

    local tmp_dir archived_dir archived_plan resolved
    tmp_dir=$(mktemp -d)
    archived_dir="$tmp_dir/docs/products/ontology/plans/done"
    mkdir -p "$archived_dir"
    archived_plan="$archived_dir/20260422-120-refactor-dev-flow-optimize-new-issue-flow.md"
    cat > "$archived_plan" <<'EOF'
# 120-refactor-dev-flow-optimize-new-issue-flow

## Metadata

- **Issue**: #120
- **Type**: refactor
- **Target Project**: ontology
- **Created**: 2026-04-21
- **Status**: done
EOF

    find_workspace_root() { printf '%s\n' "$tmp_dir"; }
    resolved=$(find_plan_by_issue 120)
    assert_equals "$archived_plan" "$resolved" "Should find archived plan for issue status lookup"

    test_summary
}

run_tests
