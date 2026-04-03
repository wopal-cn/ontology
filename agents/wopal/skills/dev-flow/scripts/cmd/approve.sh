# cmd_approve: Submit for approval (planning -> approved)
cmd_approve() {
    local issue_number=""
    local confirm=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --confirm)
                confirm=true
                shift
                ;;
            -*)
                log_error "Unknown option: $1"
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
        echo "Usage: flow.sh approve <issue> [--confirm]"
        exit 1
    fi

    local plan_file
    plan_file=$(find_plan_by_issue "$issue_number") || {
        log_error "No plan found for Issue #$issue_number"
        exit 1
    }

    local current_status
    current_status=$(get_current_status "$plan_file")

    # Validate transition
    if ! validate_transition "$current_status" "approved"; then
        exit 1
    fi

    # Run check-doc first (capture output, only show on failure)
    local check_output
    check_output=$(check_doc_plan "$plan_file" 2>&1)
    if [[ $? -ne 0 ]]; then
        echo "$check_output"
        echo ""
        log_error "Plan failed check-doc validation"
        echo "Fix the issues and retry: flow.sh approve $issue_number"
        exit 1
    fi

    # If no --confirm, wait for user confirmation
    if [[ "$confirm" != true ]]; then
        echo "Status: awaiting approval"
        echo "Next: flow.sh approve $issue_number --confirm"
        exit 0
    fi

    # Update status
    set_plan_status "$plan_file" "approved" >/dev/null 2>&1

    # Sync approved plan to Issue body
    local repo
    repo=$(get_space_repo)
    sync_plan_to_issue "$issue_number" "$plan_file" "$repo" >/dev/null 2>&1
    
    # Ensure Issue labels are correct
    ensure_issue_labels "$issue_number" "$plan_file" "$repo" >/dev/null 2>&1

    echo "Status: approved"
    echo "Next: flow.sh dev $issue_number [--worktree]"
}
