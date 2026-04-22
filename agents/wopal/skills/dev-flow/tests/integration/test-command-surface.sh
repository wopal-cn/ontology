#!/bin/bash
# test-command-surface.sh - Test public command surface

set -euo pipefail

TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TESTS_DIR="$(dirname "$TEST_DIR")"
SKILL_DIR="$(dirname "$TESTS_DIR")"

source "$TESTS_DIR/lib/test-helpers.sh"

run_tests() {
    test_start "flow.sh help exposes issue create/update"

    run_cmd "bash '$SKILL_DIR/scripts/flow.sh' help"

    if [[ "$LAST_EXIT_CODE" -ne 0 ]]; then
        test_fail "help command failed"
        echo "$LAST_OUTPUT"
    fi

    assert_output_contains "issue create"
    assert_output_contains "issue update"

    test_start "flow.sh help no longer exposes new-issue"

    if echo "$LAST_OUTPUT" | grep -q "new-issue"; then
        test_fail "help output should not mention new-issue"
    else
        test_pass "help output no longer mentions new-issue"
    fi

    test_summary
}

run_tests
