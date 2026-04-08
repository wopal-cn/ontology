# cmd_validate: User validation confirmation (without PR path)
cmd_validate() {
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
        echo "Usage: flow.sh validate <issue> --confirm"
        exit 1
    fi

    local plan_file
    plan_file=$(find_plan_by_issue "$issue_number") || {
        log_error "No plan found for Issue #$issue_number"
        exit 1
    }

    local repo
    repo=$(get_space_repo)

    if ! issue_has_label "$issue_number" "validation/awaiting" "$repo"; then
        log_error "Issue does not have validation/awaiting label"
        echo "This command is for the no-PR validation path."
        echo "If you created a PR, wait for PR merge instead."
        exit 1
    fi

    # If no --confirm, show reminder
    if [[ "$confirm" != true ]]; then
        echo ""
        echo "Issue is awaiting user verification."
        echo ""
        echo "Please verify User Validation items in the Plan:"
        echo "  $plan_file"
        echo ""
        echo "After verification, check the User Validation checkboxes and run:"
        echo "  flow.sh validate $issue_number --confirm"
        exit 0
    fi

    # Check User Validation Acceptance Criteria
    if ! check_user_validation "$plan_file"; then
        echo ""
        log_error "Cannot validate: User Validation not satisfied"
        echo ""
        echo "Please complete the User Validation items in the Plan file:"
        echo "  $plan_file"
        echo ""
        echo "After completing, run: flow.sh validate $issue_number --confirm"
        exit 1
    fi

    # Add validation/passed label
    add_validation_label "$issue_number" "passed" "$repo" >/dev/null 2>&1

    # Sync Plan's checked AC to Issue body
    sync_plan_to_issue "$issue_number" "$plan_file" "$repo" >/dev/null 2>&1

    echo ""
    log_success "Validation passed"
    echo ""
    echo "Next: flow.sh archive $issue_number"
}

# cmd_archive: Archive completed plan
cmd_archive() {
    local issue_number="$1"

    if [[ -z "$issue_number" ]]; then
        log_error "Issue number required"
        echo "Usage: flow.sh archive <issue>"
        exit 1
    fi

    local plan_file
    plan_file=$(find_plan_by_issue "$issue_number") || {
        log_error "No plan found for Issue #$issue_number"
        exit 1
    }

    local repo
    repo=$(get_space_repo)

    # Check archive conditions:
    # 1. PR path: pr/opened label and PR is merged
    # 2. No-PR path: validation/passed label
    local can_archive=false
    local archive_reason=""

    if issue_has_label "$issue_number" "validation/passed" "$repo"; then
        can_archive=true
        archive_reason="validation/passed label present"
    elif issue_has_label "$issue_number" "pr/opened" "$repo"; then
        # Check if PR is merged - parse PR URL from Issue body
        local pr_url
        pr_url=$(get_pr_url_from_issue "$issue_number" "$repo")
        
        if [[ -n "$pr_url" ]]; then
            if is_pr_merged "$pr_url"; then
                can_archive=true
                archive_reason="PR merged: $pr_url"
            else
                log_error "PR exists but not merged yet"
                echo "PR URL: $pr_url"
                echo "Wait for PR to be merged before archiving."
                exit 1
            fi
        else
            # Fallback: try to find PR by branch name in Issue repo
            log_warn "No PR URL found in Issue body, checking Issue repo for merged PRs..."
            local pr_info
            pr_info=$(gh pr list --repo "$repo" --state merged --search "Closes #$issue_number" --json number,url 2>/dev/null || echo "[]")
            
            if [[ "$pr_info" != "[]" && "$pr_info" != "" ]]; then
                can_archive=true
                archive_reason="PR merged (found via search)"
            else
                log_error "Cannot determine PR status"
                echo "No PR URL in Issue body and no merged PR found referencing #$issue_number"
                echo ""
                echo "If PR is in a different repo, ensure PR URL is recorded in Issue body:"
                echo "  | PR | https://github.com/owner/repo/pull/123 |"
                exit 1
            fi
        fi
    fi

    if [[ "$can_archive" != true ]]; then
        log_error "Cannot archive: neither validation/passed nor merged PR found"
        echo "Complete validation first: flow.sh validate $issue_number --confirm"
        echo "Or wait for PR to be merged."
        exit 1
    fi

    # Sync Plan's checked AC to Issue body before archiving
    sync_plan_to_issue "$issue_number" "$plan_file" "$repo" >/dev/null 2>&1

    # Update status to done
    set_plan_status "$plan_file" "done" >/dev/null 2>&1

    # Archive plan file
    local archived_file
    archived_file=$(archive_plan "$plan_file" 2>&1)

    # Close Issue
    close_issue "$issue_number" --repo "$repo" --comment "Plan archived, closing issue." >/dev/null 2>&1

    echo "Status: done"
}
