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
    "label list")
        exit 0
        ;;
    "label create")
        exit 0
        ;;
    "issue create")
        printf '%s\n' "$@" > "$GH_CAPTURE_DIR/issue-create-args.txt"
        echo "https://github.com/sampx/wopal-space/issues/999"
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
    local tmp_dir bin_dir
    tmp_dir=$(mktemp -d)
    bin_dir="$tmp_dir/bin"
    mkdir -p "$tmp_dir/capture"
    create_fake_gh "$bin_dir"

    test_start "issue create infers perf type from title"

    run_cmd "PATH='$bin_dir:$PATH' GH_CAPTURE_DIR='$tmp_dir/capture' bash '$SKILL_DIR/scripts/flow.sh' issue create --title 'perf(dev-flow): reduce label sync overhead' --project ontology --baseline '200ms' --target '120ms'"

    if [[ "$LAST_EXIT_CODE" -ne 0 ]]; then
        test_fail "issue create should succeed"
        echo "$LAST_OUTPUT"
    else
        test_pass "issue create command succeeded"
    fi

    assert_file_contains "$tmp_dir/capture/issue-create-args.txt" "type/perf"
    assert_file_contains "$tmp_dir/capture/issue-create-args.txt" "## Baseline"
    assert_file_contains "$tmp_dir/capture/issue-create-args.txt" "## Target"

    test_start "issue create rejects title and explicit type mismatch"

    run_cmd "PATH='$bin_dir:$PATH' GH_CAPTURE_DIR='$tmp_dir/capture' bash '$SKILL_DIR/scripts/flow.sh' issue create --title 'perf(dev-flow): reduce label sync overhead' --project ontology --type feature"

    if [[ "$LAST_EXIT_CODE" -eq 0 ]]; then
        test_fail "mismatch should fail"
    else
        test_pass "mismatch rejected"
    fi

    assert_output_contains "Type mismatch"

    test_summary
}

run_tests
