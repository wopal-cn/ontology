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
    local tmp_dir bin_dir driver
    tmp_dir=$(mktemp -d)
    bin_dir="$tmp_dir/bin"
    mkdir -p "$tmp_dir/state"
    create_fake_gh "$bin_dir"
    driver="$tmp_dir/run.sh"

    test_start "update_issue_link updates existing English Related Resources row"

    cat > "$tmp_dir/state/body.md" <<'EOF'
## Goal

Old goal

## Related Resources

| Resource | Link |
|----------|------|
| Plan | _待关联_ |
EOF

    cat > "$driver" <<EOF
#!/bin/bash
set -euo pipefail
source "$SKILL_DIR/lib/issue.sh"
update_issue_link 120 sampx/wopal-space plan "[plan](https://github.com/sampx/wopal-space/blob/main/docs/products/ontology/plans/120.md)"
EOF
    chmod +x "$driver"

    run_cmd "PATH='$bin_dir:$PATH' GH_STATE_DIR='$tmp_dir/state' bash '$driver'"

    if [[ "$LAST_EXIT_CODE" -ne 0 ]]; then
        test_fail "update_issue_link should succeed"
        echo "$LAST_OUTPUT"
    else
        test_pass "update_issue_link command succeeded"
    fi

    assert_file_contains "$tmp_dir/state/edit-args.txt" "## Related Resources"
    assert_file_contains "$tmp_dir/state/edit-args.txt" "[plan](https://github.com/sampx/wopal-space/blob/main/docs/products/ontology/plans/120.md)"

    test_summary
}

run_tests
