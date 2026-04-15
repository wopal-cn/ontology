#!/bin/bash
# state-machine.sh - Plan Status State Machine (bash 3.x compatible)
#
# Usage: source this file to use functions
#   source lib/state-machine.sh
#
# Functions:
#   validate_transition()  - Validate state transition
#   get_current_status()   - Read current status from Plan file
#   update_plan_status()   - Update Plan file status
#   sync_issue_label()     - Sync Issue Label with status
#
# Dependencies: common.sh, plan.sh, labels.sh
# Guard: DEV_FLOW_STATE_MACHINE_LOADED

# Prevent duplicate loading
if [[ -n "${DEV_FLOW_STATE_MACHINE_LOADED:-}" ]]; then
    return 0
fi
readonly DEV_FLOW_STATE_MACHINE_LOADED=1

set -e

# Load dependencies
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
source "$SKILL_DIR/lib/common.sh"
source "$SKILL_DIR/lib/plan.sh"
source "$SKILL_DIR/lib/labels.sh"

# ============================================
# State Constants (bash 3.x compatible)
# ============================================

# Valid states in order (colon-separated for easy parsing)
# 3-state model: planning → executing → done
STATES_LIST="planning:executing:done"

# Check if a state is valid
_is_valid_state() {
    local state="$1"
    case "$state" in
        planning|executing|done)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

# Get state order (1-3)
_get_state_order() {
    local state="$1"
    case "$state" in
        planning)   echo 1 ;;
        executing)  echo 2 ;;
        done)       echo 3 ;;
        *)          echo 0 ;;
    esac
}

# ============================================
# State Machine Functions
# ============================================

# Validate state transition (bash 3.x compatible)
# Usage: validate_transition <current_status> <new_status>
# Returns: 0 if valid, 1 if invalid
validate_transition() {
    local current_status="$1"
    local new_status="$2"

    if [[ -z "$current_status" || -z "$new_status" ]]; then
        echo "Error: Both current and new status required" >&2
        return 1
    fi

    # Check if states are valid
    if ! _is_valid_state "$current_status"; then
        echo "Error: Invalid current status: $current_status" >&2
        echo "Valid states: $STATES_LIST" >&2
        return 1
    fi

    if ! _is_valid_state "$new_status"; then
        echo "Error: Invalid new status: $new_status" >&2
        echo "Valid states: $STATES_LIST" >&2
        return 1
    fi

    # Same state is allowed (no-op)
    if [[ "$current_status" == "$new_status" ]]; then
        return 0
    fi

    # Check wildcard transition (any -> planning, for reset)
    if [[ "$new_status" == "planning" ]]; then
        return 0
    fi

    # Check specific transitions using case (3-state model)
    case "${current_status}:${new_status}" in
        planning:executing|executing:done)
            return 0
            ;;
        *)
            echo "Error: Invalid transition: $current_status -> $new_status" >&2
            echo "Valid transitions from '$current_status':" >&2
            case "$current_status" in
                planning)  echo "  planning -> executing (requires --confirm)" >&2 ;;
                executing) echo "  executing -> done (after validation)" >&2 ;;
                done)      echo "  (no further transitions)" >&2 ;;
            esac
            echo "  * -> planning (reset)" >&2
            return 1
            ;;
    esac
}

# Get current status from Plan file
# Usage: get_current_status <plan_file>
# Output: status string (e.g., "planning", "executing")
get_current_status() {
    local plan_file="$1"

    if [[ ! -f "$plan_file" ]]; then
        echo "Error: Plan file not found: $plan_file" >&2
        return 1
    fi

    local status
    status=$(grep -m1 '^\- \*\*Status\*\*:' "$plan_file" | sed 's/^.*: //')

    if [[ -z "$status" ]]; then
        echo "planning"  # Default to planning
    else
        echo "$status"
    fi
}

# Update Plan file status
# Usage: update_plan_status <plan_file> <new_status>
# Returns: 0 on success, 1 on failure
update_plan_status() {
    local plan_file="$1"
    local new_status="$2"

    if [[ ! -f "$plan_file" ]]; then
        echo "Error: Plan file not found: $plan_file" >&2
        return 1
    fi

    local current_status
    current_status=$(get_current_status "$plan_file")

    # Validate transition
    if ! validate_transition "$current_status" "$new_status"; then
        return 1
    fi

    # Update status line
    if grep -q '^\- \*\*Status\*\*:' "$plan_file"; then
        # macOS and Linux compatible sed
        sed -i '' "s/^\- \*\*Status\*\*: .*/- **Status**: $new_status/" "$plan_file" 2>/dev/null || \
        sed -i "s/^\- \*\*Status\*\*: .*/- **Status**: $new_status/" "$plan_file"
    else
        echo "Error: Status line not found in plan file" >&2
        return 1
    fi

    return 0
}

# Sync Issue Label based on plan status
# Usage: sync_issue_label <plan_file> <status>
# Status mapping (3-state model):
#   planning  -> status/planning
#   executing -> status/in-progress
#   done      -> Issue closed
sync_issue_label() {
    local plan_file="$1"
    local new_status="$2"

    if [[ ! -f "$plan_file" ]]; then
        log_warn "Plan file not found, skipping Issue label sync"
        return 0
    fi

    # Extract all Issue numbers from plan metadata (e.g., "#9, #10, #11")
    local issue_numbers
    issue_numbers=$(extract_plan_issues "$plan_file")

    if [[ -z "$issue_numbers" ]]; then
        return 0  # No Issue linked, skip
    fi

    # Map plan status to Issue label using shared helper
    local label
    label=$(plan_status_to_issue_label "$new_status")

    if [[ -z "$label" ]]; then
        return 0  # Unknown status, skip
    fi

    # Check if gh CLI is available
    if ! command -v gh &> /dev/null; then
        log_warn "gh CLI not available, skipping Issue label sync"
        return 0
    fi

    # Get repo for label operations
    local repo
    repo=$(get_space_repo 2>/dev/null || true)
    if [[ -z "$repo" ]]; then
        log_warn "Cannot determine repo, skipping Issue label sync"
        return 0
    fi

    # Update all linked Issues using shared helper
    for issue_number in $issue_numbers; do
        sync_status_label_group "$issue_number" "$label" "$repo"
        log_info "Issue #$issue_number label updated: $label"
    done
}

# Get status display info (bash 3.x compatible)
# Usage: get_status_info <status>
# Output: "order:name:color"
get_status_info() {
    local status="$1"
    local order
    order=$(_get_state_order "$status")

    case "$status" in
        planning)  echo "$order:planning:📝" ;;
        executing) echo "$order:executing:🚀" ;;
        done)      echo "$order:done:📦" ;;
        *)         echo "0:unknown:❓" ;;
    esac
}

# List all valid states in order
# Usage: list_valid_states
list_valid_states() {
    echo "Valid states (in order):"
    echo "  1. planning  - Writing plan document (includes investigation)"
    echo "  2. executing - Currently being executed"
    echo "  3. done      - Archived"
    echo ""
    echo "Special transitions:"
    echo "  * -> planning - Reset from any state"
}

# Export functions for use in other scripts
if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
    # Sourced mode - functions are already available
    :
fi