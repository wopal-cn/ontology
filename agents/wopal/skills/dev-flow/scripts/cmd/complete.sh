# cmd_complete: Mark execution complete and transition to verifying phase
# 4-state model: executing -> verifying
# Label change: status/in-progress -> status/verifying
# Agent Verification AC synced to Issue body
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

    # Must be in executing state (4-state model)
    if [[ "$current_status" != "executing" ]]; then
        log_error "Plan must be in executing state to complete"
        echo "Current status: $current_status"
        echo ""
        if [[ "$current_status" == "planning" ]]; then
            echo "Run: flow.sh approve $input --confirm"
        elif [[ "$current_status" == "verifying" ]]; then
            echo "Run: flow.sh verify $input --confirm"
        fi
        exit 1
    fi

    # Check step checkboxes in Implementation and Test Plan (hard gate)
    if ! check_step_completion "$plan_file"; then
        echo ""
        log_error "Cannot complete: Implementation/Test Plan steps not satisfied"
        echo ""
        echo "Please check the completed steps and update the Plan file:"
        echo "  $plan_file"
        echo ""
        echo "After completing, run: flow.sh complete $input"
        exit 1
    fi

    # Check Agent Verification Acceptance Criteria
    if ! check_acceptance_criteria "$plan_file"; then
        echo ""
        log_error "Cannot complete: Agent Verification not satisfied"
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
        if [[ -z "$project" ]]; then
            log_error "Cannot create PR: no Target Project in plan"
            exit 1
        fi

        local pr_url=""
        
        if [[ -n "$issue_number" ]]; then
            pr_url=$(create_pr "$issue_number" --project "$project" --base main | tail -n 1) || {
                log_error "Failed to create PR"
                exit 1
            }

            # ============================================
            # STATE TRANSITION: executing -> verifying
            # ============================================
            log_step "Transitioning state: executing -> verifying"
            update_plan_status "$plan_file" "verifying" >/dev/null 2>&1

            set_plan_field "$plan_file" "PR" "$pr_url"

            # Sync Issue status label to verifying
            local status_label
            status_label=$(plan_status_to_issue_label "verifying")
            sync_status_label_group "$issue_number" "$status_label" "$repo" >/dev/null 2>&1
            
            # Add PR label overlay
            add_pr_label "$issue_number" "$repo" >/dev/null 2>&1
            
            # Sync Agent Verification AC to Issue body
            sync_plan_to_issue "$issue_number" "$plan_file" "$repo" >/dev/null 2>&1
        else
            # No Issue: create PR without Issue reference, then persist PR URL in Plan metadata
            pr_url=$(create_pr_for_plan "$plan_name" --project "$project" --base main --plan-file "$plan_file" | tail -n 1) || {
                log_error "Failed to create PR"
                exit 1
            }

            log_step "Transitioning state: executing -> verifying"
            update_plan_status "$plan_file" "verifying" >/dev/null 2>&1
            set_plan_field "$plan_file" "PR" "$pr_url"
        fi

        echo "Status: verifying (PR opened)"
        echo ""
        echo "等待 PR merge，用户确认后，由 agent 执行:"
        echo "  flow.sh verify $plan_name --confirm"
    else
        # ============================================
        # STATE TRANSITION: executing -> verifying
        # ============================================
        
        log_step "Transitioning state: executing -> verifying"
        
        # Update Plan status to verifying
        update_plan_status "$plan_file" "verifying" >/dev/null 2>&1

        # Without PR path: transition to verifying (main state)
        if [[ -n "$issue_number" ]]; then
            # Sync Issue status label to verifying
            local status_label
            status_label=$(plan_status_to_issue_label "verifying")
            sync_status_label_group "$issue_number" "$status_label" "$repo" >/dev/null 2>&1
            
            # Sync Agent Verification AC to Issue body
            sync_plan_to_issue "$issue_number" "$plan_file" "$repo" >/dev/null 2>&1
        fi

        echo "Status: verifying"
        echo ""
        echo "实施完成，等待用户验证。"
        echo ""
        echo "用户验证 User Validation 后，由 agent 执行:"
        echo "  flow.sh verify $plan_name --confirm"
        echo ""
        if [[ -n "$issue_number" ]]; then
            echo "Issue: #$issue_number"
        fi
    fi
}
