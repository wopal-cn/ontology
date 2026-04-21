# cmd_sync: Manually sync Plan content back to Issue without state transition
# Usage: flow.sh sync <issue-or-plan> [--body-only] [--labels-only]
cmd_sync() {
    local input=""
    local body_only=false
    local labels_only=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --body-only)
                body_only=true
                shift
                ;;
            --labels-only)
                labels_only=true
                shift
                ;;
            -*)
                log_error "Unknown option: $1"
                echo "Usage: flow.sh sync <issue-or-plan> [--body-only] [--labels-only]"
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
        echo "Usage: flow.sh sync <issue-or-plan> [--body-only] [--labels-only]"
        exit 1
    fi

    if [[ "$body_only" == true && "$labels_only" == true ]]; then
        log_error "--body-only and --labels-only cannot be used together"
        exit 1
    fi

    local plan_file
    plan_file=$(find_plan "$input") || {
        log_error "No plan found for: $input"
        exit 1
    }

    local issue_number
    issue_number=$(extract_primary_plan_issue "$plan_file")
    if [[ -z "$issue_number" ]]; then
        log_error "Plan has no linked Issue: $plan_file"
        exit 1
    fi

    local repo
    repo=$(get_space_repo)

    if [[ "$labels_only" != true ]]; then
        sync_plan_to_issue "$issue_number" "$plan_file" "$repo" || exit 1
    fi

    if [[ "$body_only" != true ]]; then
        ensure_issue_labels "$issue_number" "$plan_file" "$repo" || exit 1
    fi

    echo "Synced Issue: #$issue_number"
    echo "Plan: $plan_file"
    if [[ "$body_only" == true ]]; then
        echo "Mode: body only"
    elif [[ "$labels_only" == true ]]; then
        echo "Mode: labels only"
    else
        echo "Mode: body + labels"
    fi
}
