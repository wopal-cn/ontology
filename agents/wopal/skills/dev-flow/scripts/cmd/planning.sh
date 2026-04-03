# cmd_spike: Research/spike phase (stay in investigating)
cmd_spike() {
    local issue_number=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            -*)
                log_error "Unknown option: $1"
                echo "Usage: flow.sh spike <issue>"
                exit 1
                ;;
            *)
                if [[ -z "$issue_number" ]]; then
                    issue_number="$1"
                fi
                shift
                ;;
        esac
    done

    if [[ -z "$issue_number" ]]; then
        log_error "Issue number required"
        exit 1
    fi

    local plan_file
    plan_file=$(find_plan_by_issue "$issue_number") || {
        log_error "No plan found for Issue #$issue_number"
        exit 1
    }

    local current_status
    current_status=$(get_current_status "$plan_file")

    # Allow spike from investigating or planning
    if [[ "$current_status" != "investigating" && "$current_status" != "planning" ]]; then
        log_error "Spike phase only valid in investigating or planning state"
        echo "Current status: $current_status"
        exit 1
    fi

    echo "Plan: $plan_file"
    echo "Next: flow.sh plan $issue_number"
}

# cmd_plan: Move from investigating to planning phase
cmd_plan() {
    local issue_number=""
    local check_only=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --check)
                check_only=true
                shift
                ;;
            -*)
                log_error "Unknown option: $1"
                echo "Usage: flow.sh plan <issue> [--check]"
                exit 1
                ;;
            *)
                if [[ -z "$issue_number" ]]; then
                    issue_number="$1"
                fi
                shift
                ;;
        esac
    done

    if [[ -z "$issue_number" ]]; then
        log_error "Issue number required"
        exit 1
    fi

    local plan_file
    plan_file=$(find_plan_by_issue "$issue_number") || {
        log_error "No plan found for Issue #$issue_number"
        exit 1
    }

    # --check mode: just run check-doc
    if [[ "$check_only" == true ]]; then
        if check_doc_plan "$plan_file" >/dev/null 2>&1; then
            echo "Plan passes validation"
            echo "Next: flow.sh approve $issue_number"
        else
            check_doc_plan "$plan_file"
            echo ""
            log_error "Plan has issues. Fix and run: flow.sh plan $issue_number --check"
        fi
        exit 0
    fi

    local current_status
    current_status=$(get_current_status "$plan_file")

    # Validate transition
    if ! validate_transition "$current_status" "planning"; then
        exit 1
    fi

    # Update status
    set_plan_status "$plan_file" "planning" >/dev/null 2>&1

    # Ensure Issue labels are correct
    local repo
    repo=$(get_space_repo)
    ensure_issue_labels "$issue_number" "$plan_file" "$repo" >/dev/null 2>&1

    echo "Status: planning"
    echo "Next: flow.sh approve $issue_number"
}