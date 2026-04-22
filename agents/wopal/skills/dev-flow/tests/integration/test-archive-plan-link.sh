#!/bin/bash

set -euo pipefail

TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TESTS_DIR="$(dirname "$TEST_DIR")"
SKILL_DIR="$(dirname "$TESTS_DIR")"

source "$TESTS_DIR/lib/test-helpers.sh"

create_fake_gh() {
    local bin_dir="$1"
    mkdir -p "$bin_dir"

    cat > "$bin_dir/gh" <<'EOF'
#!/bin/bash
set -euo pipefail

case "$1 $2" in
    "repo view")
        echo "sampx/wopal-space"
        ;;
    "issue view")
        cat "$GH_STATE_DIR/body.md"
        ;;
    "issue edit")
        printf '%s\n' "$@" > "$GH_STATE_DIR/edit-args.txt"
        ;;
    *)
        echo "unexpected gh call: $*" >&2
        exit 1
        ;;
esac
EOF

    chmod +x "$bin_dir/gh"
}

run_tests() {
    local tmp_dir bin_dir archived_file driver
    tmp_dir=$(mktemp -d)
    bin_dir="$tmp_dir/bin"
    mkdir -p "$tmp_dir/state"
    create_fake_gh "$bin_dir"
    driver="$tmp_dir/run.sh"

    mkdir -p "$tmp_dir/docs/products/ontology/plans/done"
    archived_file="$tmp_dir/docs/products/ontology/plans/done/20260422-120-refactor-dev-flow-optimize-new-issue-flow.md"
    printf '# archived\n' > "$archived_file"

    cat > "$tmp_dir/state/body.md" <<'EOF'
## Related Resources

| Resource | Link |
|----------|------|
| Plan | [120-refactor-dev-flow-optimize-new-issue-flow](https://github.com/sampx/wopal-space/blob/main/docs/products/ontology/plans/120-refactor-dev-flow-optimize-new-issue-flow.md) |
EOF

    test_start "update_issue_plan_link rewrites archived plan URL to blob contract"

    cat > "$driver" <<EOF
#!/bin/bash
set -euo pipefail
source "$SKILL_DIR/lib/plan-sync.sh"
find_workspace_root() { printf '%s\n' "$tmp_dir"; }
update_issue_plan_link 120 "$archived_file" sampx/wopal-space
EOF
    chmod +x "$driver"

    run_cmd "PATH='$bin_dir:$PATH' GH_STATE_DIR='$tmp_dir/state' bash '$driver'"

    if [[ "$LAST_EXIT_CODE" -ne 0 ]]; then
        test_fail "update_issue_plan_link should succeed"
        echo "$LAST_OUTPUT"
    else
        test_pass "update_issue_plan_link command succeeded"
    fi

    assert_file_contains "$tmp_dir/state/edit-args.txt" "docs/products/ontology/plans/done/20260422-120-refactor-dev-flow-optimize-new-issue-flow.md"

    test_summary
}

run_tests
