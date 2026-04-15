# cmd_approve: Approve plan and transition to executing phase
# 3-state model: planning -> executing -> done
# --confirm triggers state transition to executing
# --worktree creates isolated worktree for execution
# Issue sync is automatic when plan has Issue link
# Usage:
#   flow.sh approve <issue> [--confirm] [--worktree]
#   flow.sh approve <plan-name> [--confirm] [--worktree]
cmd_approve() {
    local input=""
    local confirm=false
    local use_worktree=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --confirm)
                confirm=true
                shift
                ;;
            --worktree)
                use_worktree=true
                shift
                ;;
            -*)
                log_error "Unknown option: $1"
                echo "Usage: flow.sh approve <issue-or-plan> [--confirm] [--worktree]"
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
        echo "Usage: flow.sh approve <issue-or-plan> [--confirm] [--worktree]"
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

    # State machine validates transition in update_plan_status

    # Run check-doc first (capture output, only show on failure)
    local check_output
    check_output=$(check_doc_plan "$plan_file" 2>&1)
    if [[ $? -ne 0 ]]; then
        echo "$check_output"
        echo ""
        log_error "Plan failed check-doc validation"
        echo "Fix the issues and retry: flow.sh approve $input"
        exit 1
    fi

    # If no --confirm, wait for user confirmation
    if [[ "$confirm" != true ]]; then
        echo "Status: awaiting approval"
        echo "Plan validated. Next: flow.sh approve $input --confirm"
        exit 0
    fi

    local repo
    repo=$(get_space_repo)

    # Update status to executing (using state machine)
    update_plan_status "$plan_file" "executing" >/dev/null 2>&1

    # Sync Issue if plan has Issue link
    local issue_number
    issue_number=$(grep "Issue.*#" "$plan_file" | grep -oE '#[0-9]+' | tr -d '#' | head -1 || true)

    if [[ -n "$issue_number" ]]; then
        # Sync Issue status label (planning -> in-progress)
        local status_label
        status_label=$(plan_status_to_issue_label "executing")
        sync_status_label_group "$issue_number" "$status_label" "$repo" >/dev/null 2>&1

        # Sync approved plan to Issue body (automatic)
        sync_plan_to_issue "$issue_number" "$plan_file" "$repo" >/dev/null 2>&1

        # Ensure Issue labels are correct
        ensure_issue_labels "$issue_number" "$plan_file" "$repo" >/dev/null 2>&1
    fi

    # Create worktree if requested
    if [[ "$use_worktree" == true ]]; then
        local project
        project=$(get_plan_project "$plan_file")

        if [[ -z "$project" ]]; then
            log_error "Cannot create worktree: no Target Project in plan"
            exit 1
        fi

        local slug
        slug=$(extract_slug "$plan_name")

        # Branch naming: with Issue prefix or just slug
        local branch
        if [[ -n "$issue_number" ]]; then
            branch="issue-${issue_number}-${slug}"
        else
            branch="${slug}"
        fi

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
    if [[ -n "$issue_number" ]]; then
        echo "Issue: #$issue_number"
    fi
    echo "Next: flow.sh complete $plan_name"
}