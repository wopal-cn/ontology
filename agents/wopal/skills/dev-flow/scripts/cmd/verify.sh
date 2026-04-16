# cmd_verify: User verification gate - transition verifying -> done
# 4-state model: verifying -> done
# This is the human gate for user validation in BOTH paths (PR and no-PR)
# Usage:
#   flow.sh verify <issue> [--confirm]
#   flow.sh verify <plan-name> [--confirm]
cmd_verify() {
    local input=""
    local confirm=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --confirm)
                confirm=true
                shift
                ;;
            -*)
                log_error "Unknown option: $1"
                echo "Usage: flow.sh verify <issue-or-plan> [--confirm]"
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
        echo "Usage: flow.sh verify <issue-or-plan> [--confirm]"
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

    # Must be in verifying state (4-state model)
    if [[ "$current_status" != "verifying" ]]; then
        log_error "Plan must be in verifying state to verify"
        echo "Current status: $current_status"
        echo ""
        if [[ "$current_status" == "executing" ]]; then
            echo "Run: flow.sh complete $input"
        elif [[ "$current_status" == "done" ]]; then
            echo "Plan already done. Run: flow.sh archive $input"
        fi
        exit 1
    fi

    local repo
    repo=$(get_space_repo)

    # Extract Issue number (if plan has Issue link)
    local issue_number
    issue_number=$(grep "Issue.*#" "$plan_file" | grep -oE '#[0-9]+' | tr -d '#' | head -1 || true)

    # Check if this is PR path (pr/opened label present)
    local is_pr_path=false
    local pr_merged=false
    if [[ -n "$issue_number" ]] && issue_has_label "$issue_number" "pr/opened" "$repo"; then
        is_pr_path=true
        
        # Check PR merge status
        local pr_url
        pr_url=$(get_pr_url_from_issue "$issue_number" "$repo")
        
        if [[ -n "$pr_url" ]]; then
            if is_pr_merged "$pr_url"; then
                pr_merged=true
                log_success "PR merged: $pr_url"
            else
                log_error "PR not merged yet"
                echo "PR URL: $pr_url"
                echo ""
                echo "Wait for PR to be merged before verifying."
                exit 1
            fi
        else
            # Try to find merged PR via search
            log_info "No PR URL in Issue body, searching for merged PR..."
            local pr_info
            pr_info=$(gh pr list --repo "$repo" --state merged --search "Closes #$issue_number" --json number,url 2>/dev/null || echo "[]")
            
            if [[ "$pr_info" != "[]" && "$pr_info" != "" ]]; then
                pr_merged=true
                log_success "Found merged PR referencing #$issue_number"
            else
                log_error "Cannot find merged PR"
                echo "No PR URL in Issue body and no merged PR found referencing #$issue_number"
                echo ""
                echo "If PR is in a different repo, ensure PR URL is recorded in Issue body:"
                echo "  | PR | https://github.com/owner/repo/pull/123 |"
                exit 1
            fi
        fi
    fi

    # ============================================
    # BOTH paths require --confirm for user authorization
    # ============================================
    
    if [[ "$confirm" != true ]]; then
        echo ""
        if [[ "$is_pr_path" == true && "$pr_merged" == true ]]; then
            echo "Status: verifying (PR merged, awaiting user confirmation)"
            echo ""
            echo "PR 已 merged，等待用户确认验证通过。"
        else
            echo "Status: verifying (awaiting user confirmation)"
            echo ""
            echo "Please verify User Validation items in the Plan:"
            echo "  $plan_file"
        fi
        echo ""
        echo "用户验证完成后，由 agent 执行:"
        echo "  flow.sh verify $input --confirm"
        exit 0
    fi

    # --confirm received: user authorization gate passed
    
    # HARD GATE: User Validation must pass before proceeding
    # No warn-and-proceed — this is a strict gate
    if ! check_user_validation "$plan_file"; then
        echo ""
        log_error "User Validation gate failed — cannot proceed with verify --confirm"
        echo "Please complete the user validation scenarios and check the final confirmation checkbox:"
        echo "  1. Perform the scenarios described in ### User Validation section"
        echo "  2. Check the final checkbox: - [x] 用户已完成上述功能验证并确认结果符合预期"
        echo "  3. Re-run: flow.sh verify $input --confirm"
        exit 1
    fi

    # ============================================
    # STATE TRANSITION: verifying -> done
    # ============================================
    
    log_step "Transitioning state: verifying -> done"
    log_success "User validation passed"
    
    # Update Plan status to done
    update_plan_status "$plan_file" "done" >/dev/null 2>&1

    # Sync Issue if exists
    if [[ -n "$issue_number" ]]; then
        # Sync status label to status/done
        sync_status_label_group "$issue_number" "status/done" "$repo" >/dev/null 2>&1

        # Sync final state to Issue body
        sync_plan_to_issue "$issue_number" "$plan_file" "$repo" >/dev/null 2>&1
    fi

    echo "Status: done"
    if [[ "$is_pr_path" == true && "$pr_merged" == true ]]; then
        echo "Reason: PR merged + user validation confirmed"
    else
        echo "Reason: user validation confirmed"
    fi
    echo ""
    echo "Next: flow.sh archive $plan_name"
    echo ""
    echo "归档收尾，由 agent 执行:"
    echo "  flow.sh archive $plan_name"
}
