#!/bin/bash
# test-helpers.sh - Pure bash assertion functions for dev-flow tests
#
# Usage: source this file to use assertion functions
#   source tests/lib/test-helpers.sh
#
# Provides:
#   - assert_success / assert_failure
#   - assert_equals / assert_contains / assert_matches
#   - assert_file_exists / assert_file_contains
#   - Test lifecycle: test_start, test_pass, test_fail, test_summary
#
# Guard: TEST_HELPERS_LOADED

# Prevent duplicate loading
if [[ -n "${TEST_HELPERS_LOADED:-}" ]]; then
    return 0
fi
readonly TEST_HELPERS_LOADED=1

# ============================================
# Color Output (reuse from common.sh pattern)
# ============================================
readonly TEST_RED='\033[0;31m'
readonly TEST_GREEN='\033[0;32m'
readonly TEST_YELLOW='\033[0;33m'
readonly TEST_CYAN='\033[0;36m'
readonly TEST_NC='\033[0m'

# ============================================
# Test Statistics
# ============================================
TEST_TOTAL=0
TEST_PASSED=0
TEST_FAILED=0
TEST_CURRENT_NAME=""

# ============================================
# Test Lifecycle Functions
# ============================================

# Start a test case
# Usage: test_start "description"
test_start() {
    TEST_TOTAL=$((TEST_TOTAL + 1))
    TEST_CURRENT_NAME="$1"
    echo -e "${TEST_CYAN}[TEST]${TEST_NC} $1"
}

# Mark test as passed
# Usage: test_pass [additional_message]
test_pass() {
    TEST_PASSED=$((TEST_PASSED + 1))
    echo -e "  ${TEST_GREEN}[PASS]${TEST_NC} ${1:-}"
}

# Mark test as failed
# Usage: test_fail [additional_message]
test_fail() {
    TEST_FAILED=$((TEST_FAILED + 1))
    echo -e "  ${TEST_RED}[FAIL]${TEST_NC} ${1:-}"
}

# Print test summary
# Usage: test_summary
test_summary() {
    echo ""
    echo "============================================"
    echo "Test Summary"
    echo "============================================"
    echo -e "Total:   $TEST_TOTAL"
    echo -e "Passed:  ${TEST_GREEN}$TEST_PASSED${TEST_NC}"
    echo -e "Failed:  ${TEST_RED}$TEST_FAILED${TEST_NC}"
    echo "============================================"
    
    if [[ "$TEST_FAILED" -gt 0 ]]; then
        return 1
    fi
    return 0
}

# ============================================
# Assertion Functions (pure bash, no BATS)
# ============================================

# Assert command succeeded (exit code 0)
# Usage: assert_success <command>
# Example: assert_success "some_command arg1 arg2"
assert_success() {
    local cmd="$1"
    eval "$cmd"
    local result=$?
    
    if [[ $result -eq 0 ]]; then
        test_pass
        return 0
    else
        test_fail "Expected success, got exit code $result: $cmd"
        return 1
    fi
}

# Assert command failed (non-zero exit code)
# Usage: assert_failure <command>
assert_failure() {
    local cmd="$1"
    eval "$cmd" 2>/dev/null || true
    local result=$?
    
    if [[ $result -ne 0 ]]; then
        test_pass
        return 0
    else
        test_fail "Expected failure, got success: $cmd"
        return 1
    fi
}

# Assert exit code equals expected
# Usage: assert_exit_code <expected> <actual>
assert_exit_code() {
    local expected="$1"
    local actual="$2"
    
    if [[ "$expected" == "$actual" ]]; then
        test_pass
        return 0
    else
        test_fail "Expected exit code $expected, got $actual"
        return 1
    fi
}

# Assert two values are equal
# Usage: assert_equals <expected> <actual> [message]
assert_equals() {
    local expected="$1"
    local actual="$2"
    local msg="${3:-}"
    
    if [[ "$expected" == "$actual" ]]; then
        test_pass "$msg"
        return 0
    else
        test_fail "Expected '$expected', got '$actual'${msg:+ - $msg}"
        return 1
    fi
}

# Assert string contains substring
# Usage: assert_contains <substring> <string> [message]
assert_contains() {
    local substring="$1"
    local string="$2"
    local msg="${3:-}"
    
    if [[ "$string" == *"$substring"* ]]; then
        test_pass "$msg"
        return 0
    else
        test_fail "Expected '$string' to contain '$substring'${msg:+ - $msg}"
        return 1
    fi
}

# Assert string matches regex
# Usage: assert_matches <pattern> <string> [message]
assert_matches() {
    local pattern="$1"
    local string="$2"
    local msg="${3:-}"
    
    if echo "$string" | grep -qE "$pattern"; then
        test_pass "$msg"
        return 0
    else
        test_fail "Expected '$string' to match '$pattern'${msg:+ - $msg}"
        return 1
    fi
}

# Assert output contains substring
# Usage: assert_output_contains <substring> [message]
# Note: captures output from last command in $LAST_OUTPUT
assert_output_contains() {
    local substring="$1"
    local msg="${2:-}"
    
    if [[ "$LAST_OUTPUT" == *"$substring"* ]]; then
        test_pass "$msg"
        return 0
    else
        test_fail "Expected output to contain '$substring'${msg:+ - $msg}"
        return 1
    fi
}

# Assert file exists
# Usage: assert_file_exists <file_path>
assert_file_exists() {
    local file="$1"
    
    if [[ -f "$file" ]]; then
        test_pass "File exists: $file"
        return 0
    else
        test_fail "File does not exist: $file"
        return 1
    fi
}

# Assert file contains substring
# Usage: assert_file_contains <file_path> <substring>
assert_file_contains() {
    local file="$1"
    local substring="$2"
    
    if [[ ! -f "$file" ]]; then
        test_fail "File does not exist: $file"
        return 1
    fi
    
    if grep -qF "$substring" "$file"; then
        test_pass "File contains '$substring'"
        return 0
    else
        test_fail "File does not contain '$substring': $file"
        return 1
    fi
}

# Assert directory exists
# Usage: assert_dir_exists <dir_path>
assert_dir_exists() {
    local dir="$1"
    
    if [[ -d "$dir" ]]; then
        test_pass "Directory exists: $dir"
        return 0
    else
        test_fail "Directory does not exist: $dir"
        return 1
    fi
}

# Run command and capture output
# Usage: run_cmd <command>
# Sets: LAST_OUTPUT, LAST_EXIT_CODE
run_cmd() {
    local cmd="$1"
    LAST_OUTPUT=$(eval "$cmd" 2>&1)
    LAST_EXIT_CODE=$?
}

# Skip test (mark as passed with note)
# Usage: skip_test "reason"
skip_test() {
    test_pass "SKIPPED: $1"
}

# Export marker
true