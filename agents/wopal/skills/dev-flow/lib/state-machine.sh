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

set -e

# ============================================
# State Constants (bash 3.x compatible)
# ============================================

# Valid states in order (colon-separated for easy parsing)
# 5-state model: investigating → planning → approved → executing → done
STATES_LIST="investigating:planning:approved:executing:done"

# Check if a state is valid
_is_valid_state() {
    local state="$1"
    case "$state" in
        investigating|planning|approved|executing|done)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

# Get state order (1-5)
_get_state_order() {
    local state="$1"
    case "$state" in
        investigating) echo 1 ;;
        planning)      echo 2 ;;
        approved)      echo 3 ;;
        executing)     echo 4 ;;
        done)          echo 5 ;;
        *)             echo 0 ;;
    esac
}

# ============================================
# Auto-detect Workspace Root
# ============================================

_state_machine_find_root() {
    local search_dir="${1:-$(pwd)}"
    while [[ "$search_dir" != "/" ]]; do
        # Check for .wopal directory (WopalSpace specific)
        if [[ -d "$search_dir/.wopal" ]]; then
            echo "$search_dir"
            return 0
        fi
        # Check if we're inside .wopal
        if [[ "$(basename "$search_dir")" == ".wopal" ]]; then
            echo "$(dirname "$search_dir")"
            return 0
        fi
        search_dir="$(dirname "$search_dir")"
    done

    # Fallback to git root
    git rev-parse --show-toplevel 2>/dev/null || echo "."
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

    # Check wildcard transition (any -> investigating, for reset)
    if [[ "$new_status" == "investigating" ]]; then
        return 0
    fi

    # Check specific transitions using case
    case "${current_status}:${new_status}" in
        investigating:planning|planning:approved|approved:executing|executing:done)
            return 0
            ;;
        *)
            echo "Error: Invalid transition: $current_status -> $new_status" >&2
            echo "Valid transitions from '$current_status':" >&2
            case "$current_status" in
                investigating) echo "  investigating -> planning" >&2 ;;
                planning)      echo "  planning -> approved (requires --confirm)" >&2 ;;
                approved)      echo "  approved -> executing" >&2 ;;
                executing)     echo "  executing -> done (after validation)" >&2 ;;
                done)          echo "  (no further transitions)" >&2 ;;
            esac
            echo "  * -> investigating (reset)" >&2
            return 1
            ;;
    esac
}

# Get current status from Plan file
# Usage: get_current_status <plan_file>
# Output: status string (e.g., "investigating", "executing")
get_current_status() {
    local plan_file="$1"

    if [[ ! -f "$plan_file" ]]; then
        echo "Error: Plan file not found: $plan_file" >&2
        return 1
    fi

    local status
    status=$(grep -m1 '^\- \*\*Status\*\*:' "$plan_file" | sed 's/^.*: //')

    if [[ -z "$status" ]]; then
        echo "investigating"  # Default to investigating
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
# Status mapping (5-state model):
#   investigating -> status/planning
#   planning      -> status/planning
#   approved      -> status/approved
#   executing     -> status/in-progress
#   done          -> Issue closed
sync_issue_label() {
    local plan_file="$1"
    local new_status="$2"

    if [[ ! -f "$plan_file" ]]; then
        echo "Warning: Plan file not found, skipping Issue label sync" >&2
        return 0
    fi

    # Extract all Issue numbers from plan metadata (e.g., "#9, #10, #11")
    local issue_line
    issue_line="$(grep -m1 '^\- \*\*Issue\*\*:' "$plan_file")"
    local issue_numbers=()
    while [[ "$issue_line" =~ \#([0-9]+) ]]; do
        issue_numbers+=("${BASH_REMATCH[1]}")
        issue_line="${issue_line#*#${BASH_REMATCH[1]}}"
    done

    if [[ ${#issue_numbers[@]} -eq 0 ]]; then
        return 0  # No Issue linked, skip
    fi

    # Map plan status to Issue label (5-state model)
    local label=""
    case "$new_status" in
        investigating) label="status/planning" ;;
        planning)      label="status/planning" ;;
        approved)      label="status/approved" ;;
        executing)     label="status/in-progress" ;;
        done)          label="status/done" ;;
        *) return 0 ;;
    esac

    # Check if gh CLI is available
    if ! command -v gh &> /dev/null; then
        echo "Warning: gh CLI not available, skipping Issue label sync" >&2
        return 0
    fi

    # Update all linked Issues
    local old_labels="status/planning status/approved status/in-progress status/in-review status/validated status/done status/blocked"
    for issue_number in "${issue_numbers[@]}"; do
        for old_label in $old_labels; do
            gh issue edit "$issue_number" --remove-label "$old_label" 2>/dev/null || true
        done
        gh issue edit "$issue_number" --add-label "$label" 2>/dev/null && \
            echo "Issue #$issue_number label updated: $label" || \
            echo "Warning: Failed to update Issue #$issue_number label" >&2
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
        investigating) echo "$order:investigating:🔍" ;;
        planning)      echo "$order:planning:📝" ;;
        approved)      echo "$order:approved:✅" ;;
        executing)     echo "$order:executing:🚀" ;;
        done)          echo "$order:done:📦" ;;
        *)             echo "0:unknown:❓" ;;
    esac
}

# List all valid states in order
# Usage: list_valid_states
list_valid_states() {
    echo "Valid states (in order):"
    echo "  1. investigating - Research and spike phase"
    echo "  2. planning      - Writing plan document"
    echo "  3. approved      - Plan approved, ready for execution"
    echo "  4. executing     - Currently being executed"
    echo "  5. done          - Archived"
    echo ""
    echo "Special transitions:"
    echo "  * -> investigating - Reset from any state"
}

# Export functions for use in other scripts
if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
    # Sourced mode - functions are already available
    :
fi