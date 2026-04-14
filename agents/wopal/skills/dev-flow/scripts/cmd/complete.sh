# cmd_complete: Mark execution complete with validation label overlay
# Label change: validation/awaiting is added as overlay (main status preserved)
# Usage:
#   flow.sh complete <issue> [--pr]
#   flow.sh complete <plan-name> [--pr]
cmd_complete() {
    local input=""
    local create_pr=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --pr)
                create_pr=true
                shift
                ;;
            -*)
                log_error "Unknown option: $1"
                echo "Usage: flow.sh complete <issue-or-plan> [--pr]"
                exit 1
                ;;
            *)
                if [[ -z "$input" ]]; then
                    input="$1"
                fi
                shift
                ;;
        esac
    done

    if [[ -z "$input" ]]; then
        log_error "Issue number or Plan name required"
        echo "Usage: flow.sh complete <issue-or-plan> [--pr]"
        exit 1
    fi

    # Smart lookup: Issue number OR Plan name
    local plan_file
    plan_file=$(find_plan "$input") || {
        log_error "No plan found for: $input"
        exit 1
    }

    local plan_name
    plan_name=$(get_plan_name "$plan_file")

    local current_status
    current_status=$(get_current_status "$plan_file")

    # Must be in executing state
    if [[ "$current_status" != "executing" ]]; then
        log_error "Plan must be in executing state to complete"
        echo "Current status: $current_status"
        exit 1
    fi

    # Check Acceptance Criteria
    if ! check_acceptance_criteria "$plan_file"; then
        echo ""
        log_error "Cannot complete: Acceptance Criteria not satisfied"
        echo ""
        echo "Please complete the remaining items and update the Plan file:"
        echo "  $plan_file"
        echo ""
        echo "After completing, run: flow.sh complete $input"
        exit 1
    fi

    local repo
    repo=$(get_space_repo)

    # Extract Target Project from Plan
    local project
    project=$(get_plan_project "$plan_file")

    # Extract Issue number (if plan has Issue link)
    local issue_number
    issue_number=$(grep "Issue.*#" "$plan_file" | grep -oE '#[0-9]+' | tr -d '#' | head -1 || true)

    # Two paths: with PR or without PR
    if [[ "$create_pr" == true ]]; then
        # With PR path: add pr/opened label (overlay)
        if [[ -z "$project" ]]; then
            log_error "Cannot create PR: no Target Project in plan"
            exit 1
        fi
        
        if [[ -n "$issue_number" ]]; then
            add_pr_label "$issue_number" "$repo" >/dev/null 2>&1
            create_pr "$issue_number" --project "$project" --base main >/dev/null 2>&1
        else
            # No Issue: create PR without Issue reference
            create_pr_for_plan "$plan_name" --project "$project" --base main >/dev/null 2>&1
        fi

        echo "Status: complete (PR opened)"
        echo "Next: flow.sh archive $plan_name"
    else
        # Without PR path: add validation/awaiting label as overlay (keep status/in-progress)
        if [[ -n "$issue_number" ]]; then
            add_validation_overlay_label "$issue_number" "awaiting" "$repo" >/dev/null 2>&1
        fi

        echo "Status: complete (awaiting validation)"
        echo "Next: flow.sh archive $plan_name --confirm"
    fi
}