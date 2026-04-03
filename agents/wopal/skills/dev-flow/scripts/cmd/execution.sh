# cmd_dev: Start execution (approved -> executing)
cmd_dev() {
    local issue_number=""
    local use_worktree=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --worktree)
                use_worktree=true
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
        echo "Usage: flow.sh dev <issue> [--worktree]"
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
    if ! validate_transition "$current_status" "executing"; then
        exit 1
    fi

    # Update status
    set_plan_status "$plan_file" "executing" >/dev/null 2>&1

    # Sync Issue status label
    local repo
    repo=$(get_space_repo)
    local status_label
    status_label=$(plan_status_to_issue_label "executing")
    sync_status_label_group "$issue_number" "$status_label" "$repo" >/dev/null 2>&1

    # Create worktree if requested
    if [[ "$use_worktree" == true ]]; then
        local project
        project=$(get_plan_project "$plan_file")

        if [[ -z "$project" ]]; then
            log_error "Cannot create worktree: no Target Project in plan"
            exit 1
        fi

        local plan_name
        plan_name=$(get_plan_name "$plan_file")
        local slug
        slug=$(extract_slug "$plan_name")
        local branch="issue-${issue_number}-${slug}"

        local worktree_script="$SKILL_DIR/../git-worktrees/scripts/worktree.sh"
        if [[ ! -f "$worktree_script" ]]; then
            log_warn "git-worktrees skill not found, skipping worktree creation"
        else
            log_step "Creating worktree..."
            log_info "Project: $project, Branch: $branch"
            bash "$worktree_script" create "$project" "$branch" --no-install --no-test
        fi
    fi

    echo "Status: executing"
    echo "Next: flow.sh complete $issue_number"
}

# cmd_complete: Mark execution complete (with validation path)
cmd_complete() {
    local issue_number=""
    local create_pr=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --pr)
                create_pr=true
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
        echo "Usage: flow.sh complete <issue> [--pr]"
        exit 1
    fi

    local plan_file
    plan_file=$(find_plan_by_issue "$issue_number") || {
        log_error "No plan found for Issue #$issue_number"
        exit 1
    }

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
        echo "After completing, run: flow.sh complete $issue_number"
        exit 1
    fi

    local repo
    repo=$(get_space_repo)

    # Extract Target Project from Plan
    local project
    project=$(get_plan_project "$plan_file")

    # Two paths: with PR or without PR
    if [[ "$create_pr" == true ]]; then
        # With PR path: add pr/opened label
        if [[ -z "$project" ]]; then
            log_error "Cannot create PR: no Target Project in plan"
            exit 1
        fi
        
        add_pr_label "$issue_number" "$repo" >/dev/null 2>&1
        create_pr "$issue_number" --project "$project" --base main >/dev/null 2>&1

        echo "Status: complete (PR opened)"
        echo "Next: flow.sh archive $issue_number"
    else
        # Without PR path: add validation/awaiting label
        add_validation_label "$issue_number" "awaiting" "$repo" >/dev/null 2>&1

        echo "Status: complete (awaiting validation)"
        echo "Next: flow.sh validate $issue_number --confirm"
    fi
}