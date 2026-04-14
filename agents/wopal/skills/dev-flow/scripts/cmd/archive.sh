# cmd_archive: Archive completed plan (merged archive + validate)
# Two paths:
#   1. PR path: auto-archive when PR is merged
#   2. No-PR path: requires validation/awaiting + --confirm (user confirmation)
# Usage: flow.sh archive <issue> [--confirm]
cmd_archive() {
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
        echo "Usage: flow.sh archive <issue> [--confirm]"
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
    # 1. PR path: pr/opened label and PR is merged (auto-archive)
    # 2. No-PR path: validation/awaiting label + --confirm (user confirmation)
    local can_archive=false
    local archive_reason=""
    local needs_confirm=false

    # PR path: check if PR is merged
    if issue_has_label "$issue_number" "pr/opened" "$repo"; then
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

    # No-PR path: check validation/awaiting label
    if issue_has_label "$issue_number" "validation/awaiting" "$repo"; then
        needs_confirm=true
        
        if [[ "$confirm" != true ]]; then
            echo ""
            echo "Issue is awaiting user verification."
            echo ""
            echo "Please verify User Validation items in the Plan:"
            echo "  $plan_file"
            echo ""
            echo "After verification, run:"
            echo "  flow.sh archive $issue_number --confirm"
            exit 0
        fi
        
        # Check User Validation Acceptance Criteria (optional)
        if ! check_user_validation "$plan_file" 2>/dev/null; then
            echo ""
            log_warn "User Validation not fully checked - proceeding with --confirm"
        fi
        
        can_archive=true
        archive_reason="validation confirmed"
        
        # Add validation/passed label
        add_validation_overlay_label "$issue_number" "passed" "$repo" >/dev/null 2>&1
    fi

    if [[ "$can_archive" != true ]]; then
        log_error "Cannot archive: neither merged PR nor validation/awaiting found"
        echo ""
        echo "Complete first: flow.sh complete $issue_number"
        echo "Or if awaiting validation: flow.sh archive $issue_number --confirm"
        exit 1
    fi

    # Sync Plan's checked AC to Issue body before archiving
    sync_plan_to_issue "$issue_number" "$plan_file" "$repo" >/dev/null 2>&1

    # Update status to done
    set_plan_status "$plan_file" "done" >/dev/null 2>&1

    # Archive plan file
    local archived_file
    archived_file=$(archive_plan "$plan_file" 2>&1)

    # Close Issue (clears all flow labels)
    close_issue "$issue_number" --repo "$repo" --comment "Plan archived: $archive_reason. Closing issue." >/dev/null 2>&1

    echo "Status: done"
    echo "Reason: $archive_reason"
}