#!/bin/bash
# run-tests.sh - Test runner for dev-flow skill
#
# Usage:
#   ./run-tests.sh              # Run all tests
#   ./run-tests.sh unit         # Run unit tests only
#   ./run-tests.sh integration  # Run integration tests only
#   ./run-tests.sh <test_file>  # Run specific test file
#
# Environment:
#   - Creates self-contained git fixtures in /tmp/dev-flow-test-<pid>/
#   - Uses stub gh CLI (no real GitHub dependency)
#   - Pure bash assertions (no BATS)
#

set -euo pipefail

# Get test directory (where this script lives)
TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$TESTS_DIR")"

# Source test helpers
source "$TESTS_DIR/lib/test-helpers.sh"
source "$TESTS_DIR/lib/git-fixture.sh"

# ============================================
# Test Discovery
# ============================================

discover_tests() {
    local category="${1:-all}"
    
    local tests=()
    
    case "$category" in
        all)
            tests+=("$TESTS_DIR/unit"/*.sh)
            tests+=("$TESTS_DIR/integration"/*.sh)
            ;;
        unit)
            tests+=("$TESTS_DIR/unit"/*.sh)
            ;;
        integration)
            tests+=("$TESTS_DIR/integration"/*.sh)
            ;;
        *)
            # Specific test file
            if [[ -f "$category" ]]; then
                tests+=("$category")
            else
                log_error "Test file not found: $category"
                exit 1
            fi
            ;;
    esac
    
    # Filter out non-existent files
    local valid_tests=()
    for test in "${tests[@]}"; do
        if [[ -f "$test" ]]; then
            valid_tests+=("$test")
        fi
    done
    
    echo "${valid_tests[@]}"
}

# ============================================
# Test Execution
# ============================================

run_test_file() {
    local test_file="$1"
    
    echo ""
    echo "============================================"
    echo "Running: $(basename "$test_file")"
    echo "============================================"
    
    # Set SKILL_DIR for sourced library files
    export SKILL_DIR="$SKILL_DIR"
    
    # Source and run the test file
    # Each test file should define run_tests() function
    source "$test_file"
    
    if declare -f run_tests >/dev/null 2>&1; then
        run_tests
    else
        log_error "Test file missing run_tests function: $test_file"
        return 1
    fi
}

# ============================================
# Main
# ============================================

main() {
    local category="${1:-all}"
    
    echo "============================================"
    echo "dev-flow Test Suite"
    echo "============================================"
    echo "Skill directory: $SKILL_DIR"
    echo "Test directory:  $TESTS_DIR"
    echo ""
    
    # Discover tests
    local tests
    tests=$(discover_tests "$category")
    
    if [[ -z "$tests" ]]; then
        log_error "No tests found"
        exit 1
    fi
    
    # Setup fixture environment
    setup_fixture
    
    # Run each test file
    local total_tests="$tests"
    local overall_failed=0
    
    for test_file in $total_tests; do
        if ! run_test_file "$test_file"; then
            overall_failed=1
        fi
        
        # Cleanup after each test file to avoid contamination
        cleanup_fixture
        setup_fixture
    done
    
    # Final cleanup
    cleanup_fixture
    
    echo ""
    echo "============================================"
    if [[ "$overall_failed" -eq 0 ]]; then
        echo -e "${TEST_GREEN}All tests passed!${TEST_NC}"
        exit 0
    else
        echo -e "${TEST_RED}Some tests failed${TEST_NC}"
        exit 1
    fi
}

main "$@"