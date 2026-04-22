#!/bin/bash
# test-type-labels.sh - Test type normalization and label mapping

set -euo pipefail

TEST_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TESTS_DIR="$(dirname "$TEST_DIR")"
SKILL_DIR="$(dirname "$TESTS_DIR")"

source "$TESTS_DIR/lib/test-helpers.sh"

run_tests() {
    source "$SKILL_DIR/lib/labels.sh"

    test_start "normalize_plan_type: perf maps to perf"
    local normalized
    normalized=$(normalize_plan_type perf)
    assert_equals "perf" "$normalized" "perf should normalize to perf"

    test_start "plan_type_to_issue_label: perf maps to type/perf"
    local perf_label
    perf_label=$(plan_type_to_issue_label perf)
    assert_equals "type/perf" "$perf_label" "perf should map to type/perf"

    test_start "issue_label_to_plan_type: type/perf maps to perf"
    local perf_type
    perf_type=$(issue_label_to_plan_type type/perf)
    assert_equals "perf" "$perf_type" "type/perf should map back to perf"

    test_start "plan_type_to_issue_label: test maps to type/test"
    local test_label
    test_label=$(plan_type_to_issue_label test)
    assert_equals "type/test" "$test_label" "test should map to type/test"

    test_summary
}

run_tests
