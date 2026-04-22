#!/bin/bash

set -euo pipefail

TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TESTS_DIR="$(dirname "$TEST_DIR")"
SKILL_DIR="$(dirname "$TESTS_DIR")"

source "$TESTS_DIR/lib/test-helpers.sh"
source "$SKILL_DIR/lib/issue.sh"

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
    "label list")
        exit 0
        ;;
    "label create")
        exit 0
        ;;
    "issue view")
        shift 2
        if printf '%s\n' "$@" | grep -q "labels\[\]\.name"; then
            printf '%s\n' "type/feature" "project/ontology" "status/planning"
        elif printf '%s\n' "$@" | grep -q "--json body"; then
            cat "$GH_STATE_DIR/body.md"
        else
            TITLE_JSON=$(python3 - <<'PY'
import json, os, pathlib
title = pathlib.Path(os.environ['GH_STATE_DIR']) / 'title.txt'
body = pathlib.Path(os.environ['GH_STATE_DIR']) / 'body.md'
print(json.dumps({
  "title": title.read_text(),
  "body": body.read_text(),
  "number": 120,
  "state": "OPEN",
  "labels": [
    {"name": "type/feature"},
    {"name": "project/ontology"},
    {"name": "status/planning"}
  ]
}))
PY
)
            printf '%s\n' "$TITLE_JSON"
        fi
        ;;
    "issue edit")
        if printf '%s\n' "$@" | grep -q -- "--body"; then
            printf '%s\n' "$@" > "$GH_STATE_DIR/edit-body-args.txt"
        else
            printf '%s\n' "$@" >> "$GH_STATE_DIR/label-edits.txt"
        fi
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
    local tmp_dir bin_dir initial_body
    tmp_dir=$(mktemp -d)
    bin_dir="$tmp_dir/bin"
    mkdir -p "$tmp_dir/state"
    create_fake_gh "$bin_dir"

    initial_body=$(build_structured_issue_body --type feature --goal "Old goal" --background "Old background" --scope "one,two" --reference "docs/original.md")
    printf '%s' "$initial_body" > "$tmp_dir/state/body.md"
    printf '%s' "feat(dev-flow): old behavior" > "$tmp_dir/state/title.txt"

    test_start "issue update preserves unrelated sections and syncs labels"

    run_cmd "PATH='$bin_dir:$PATH' GH_STATE_DIR='$tmp_dir/state' bash '$SKILL_DIR/scripts/flow.sh' issue update 120 --title 'perf(dev-flow): reduce label sync overhead' --project wopal-cli --goal 'New goal'"

    if [[ "$LAST_EXIT_CODE" -ne 0 ]]; then
        test_fail "issue update should succeed"
        echo "$LAST_OUTPUT"
    else
        test_pass "issue update command succeeded"
    fi

    assert_file_contains "$tmp_dir/state/edit-body-args.txt" "New goal"
    assert_file_contains "$tmp_dir/state/edit-body-args.txt" "Old background"
    assert_file_contains "$tmp_dir/state/edit-body-args.txt" "docs/original.md"
    assert_file_contains "$tmp_dir/state/label-edits.txt" "type/perf"
    assert_file_contains "$tmp_dir/state/label-edits.txt" "type/feature"
    assert_file_contains "$tmp_dir/state/label-edits.txt" "project/wopal-cli"
    assert_file_contains "$tmp_dir/state/label-edits.txt" "project/ontology"

    test_summary
}

run_tests
