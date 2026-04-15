# cmd_status: Show task status
cmd_status() {
    local issue_number="$1"

    if [[ -z "$issue_number" ]]; then
        log_error "Issue number required"
        echo "Usage: flow.sh status <issue>"
        exit 1
    fi

    local repo
    repo=$(get_space_repo)

    log_step "Fetching Issue #$issue_number info..."
    local issue_info
    issue_info=$(get_issue_info "$issue_number" "$repo") || {
        log_error "Issue #$issue_number not found"
        exit 1
    }

    local title state
    title=$(echo "$issue_info" | jq -r '.title')
    state=$(echo "$issue_info" | jq -r '.state')
    local labels
    labels=$(echo "$issue_info" | jq -r '.labels[].name' | tr '\n' ' ')

    echo ""
    echo "Issue #$issue_number"
    echo "  Title: $title"
    echo "  State: $state"
    echo "  Labels: $labels"
    echo ""

    local plan_file
    plan_file=$(find_plan_by_issue "$issue_number") || {
        log_warn "No plan linked to this Issue"
        exit 0
    }

    local plan_name
    plan_name=$(get_plan_name "$plan_file")

    local metadata
    metadata=$(get_plan_metadata "$plan_file")

    local status prd project created
    status=$(echo "$metadata" | grep '^status=' | cut -d= -f2)
    prd=$(echo "$metadata" | grep '^prd=' | cut -d= -f2)
    project=$(echo "$metadata" | grep '^project=' | cut -d= -f2 || true)
    created=$(echo "$metadata" | grep '^created=' | cut -d= -f2)

    echo "Plan: $plan_name"
    echo "  File: $plan_file"
    echo "  Status: $status"
    echo "  PRD: ${prd:-<none>}"
    echo "  Created: $created"

    # Check worktree status
    local slug
    slug=$(extract_slug "$plan_name")
    local worktree_path="$ROOT_DIR/.worktrees/issue-${issue_number}-${slug}"

    if [[ -d "$worktree_path" ]]; then
        echo ""
        echo "Worktree: $worktree_path"
        local wt_branch
        wt_branch=$(cd "$worktree_path" && git branch --show-current 2>/dev/null || echo "detached")
        echo "  Branch: $wt_branch"
    fi

    echo ""
    echo "State Machine (3-state): planning -> executing -> done"
    echo "               Current: $status"
}

# cmd_list: List active plans
cmd_list() {
    echo "Active Plans (from GitHub Issues)"
    echo "=================================="
    echo ""

    local repo
    repo=$(get_space_repo) || {
        log_error "Cannot get repo info"
        return 1
    }

    local issues
    issues=$(gh issue list --repo "$repo" --state open \
        --search 'label:status/planning OR label:status/in-progress' \
        --json number,title,labels \
        --jq '.[] | "\(.number)|\(.title)|\(.labels | map(.name) | join(","))"' 2>/dev/null)

    if [[ -z "$issues" ]]; then
        echo "No active issues found."
        return 0
    fi

    local count=0
    while IFS='|' read -r number title labels; do
        local status_label="unknown"
        for label in ${labels//,/ }; do
            case "$label" in
                status/planning)    status_label="planning" ;;
                status/in-progress) status_label="executing" ;;
            esac
        done

        ((count++))
        echo "[$status_label] #$number: $title"
    done <<< "$issues"

    echo ""
    echo "Total: $count active issue(s)"
}
