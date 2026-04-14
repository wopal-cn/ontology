# cmd_plan: Create Plan and enter planning phase (merged start + spike + plan)
# The plan command creates a new Plan file and sets status to planning.
# Investigation (spike) is embedded in the planning phase - no separate command.
# Usage: flow.sh plan <issue> [--project <name>] [--prd <path>] [--deep] [--check]
cmd_plan() {
    local issue_number=""
    local project=""
    local prd_path=""
    local deep_mode=false
    local check_only=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --project)
                project="$2"
                shift 2
                ;;
            --prd)
                prd_path="$2"
                shift 2
                ;;
            --deep)
                deep_mode=true
                shift
                ;;
            --check)
                check_only=true
                shift
                ;;
            -*)
                log_error "Unknown option: $1"
                echo "Usage: flow.sh plan <issue> [--project <name>] [--prd <path>] [--deep] [--check]"
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

    _ensure_arg "Issue number" "$issue_number" || {
        echo "Usage: flow.sh plan <issue> [--project <name>] [--prd <path>] [--check]"
        exit 1
    }

    local repo issue_info title plan_type slug plan_name plan_dir plan_file deep_flag plan_rel_path
    repo=$(get_space_repo)
    
    # Find existing plan or create new one
    plan_file=$(find_plan_by_issue "$issue_number" 2>/dev/null || true)
    
    # --check mode: just run check-doc on existing plan
    if [[ "$check_only" == true ]]; then
        if [[ -z "$plan_file" ]]; then
            log_error "No plan found for Issue #$issue_number"
            echo "Create plan first: flow.sh plan $issue_number"
            exit 1
        fi
        
        if check_doc_plan "$plan_file" >/dev/null 2>&1; then
            echo "Plan passes validation"
            echo "Next: flow.sh approve $issue_number"
        else
            check_doc_plan "$plan_file"
            echo ""
            log_error "Plan has issues. Fix and run: flow.sh plan $issue_number --check"
        fi
        exit 0
    fi
    
    # If plan already exists, skip creation
    if [[ -n "$plan_file" && -f "$plan_file" ]]; then
        echo "Plan: $plan_file"
        echo "Status: planning"
        echo "Next: flow.sh approve $issue_number"
        return 0
    fi
    
    # Create new plan (from original cmd_start logic)
    issue_info=$(get_issue_info "$issue_number" "$repo")
    title=$(echo "$issue_info" | jq -r '.title')

    if [[ -z "$project" ]]; then
        project=$(extract_project "$issue_info")
        if [[ -z "$project" ]]; then
            log_error "Cannot determine project from Issue #$issue_number"
            log_error "Please add a 'project/<name>' label to the Issue"
            return 1
        fi
    fi

    PLAN_PROJECT="$project"

    plan_type=$(_resolve_plan_type_from_issue "$title" "$issue_info")
    slug=$(title_to_slug "$title")
    slug=$(echo "$slug" | sed -E 's/^(fix|feat|feature|enhance|refactor|docs|chore|test)-//')

    plan_name="${issue_number}-${plan_type}-${slug}"
    plan_dir=$(resolve_plan_dir --project "$project")
    mkdir -p "$plan_dir"

    plan_file="$plan_dir/${plan_name}.md"

    if [[ -f "$plan_file" ]]; then
        log_error "Plan already exists: $plan_file"
        exit 1
    fi

    deep_flag=""
    [[ "$deep_mode" == true ]] && deep_flag="--deep"

    create_plan "$plan_name" --project "$project" --issue "$issue_number" --type "$plan_type" ${prd_path:+--prd "$prd_path"} ${deep_flag} >/dev/null

    plan_rel_path="docs/products/${project}/plans/${plan_name}.md"
    update_issue_link "$issue_number" "$repo" "plan" "[${plan_name}](../${plan_rel_path})"

    ensure_issue_labels "$issue_number" "$plan_file" "$repo"

    echo "Plan: $plan_file"
    echo "Issue: #$issue_number | Project: $project | Status: planning"
    echo "Next: flow.sh approve $issue_number"
}