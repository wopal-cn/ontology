# cmd_plan: Create Plan and enter planning phase (merged start + spike + plan)
# The plan command creates a new Plan file and sets status to planning.
# Investigation (spike) is embedded in the planning phase - no separate command.
# Usage:
#   flow.sh plan <issue> [--project <name>] [--prd <path>] [--deep] [--check]
#   flow.sh plan --title "<title>" --project <name> --type <type> [--prd <path>] [--deep] [--check]
cmd_plan() {
    local issue_number=""
    local project=""
    local prd_path=""
    local deep_mode=false
    local check_only=false
    local title=""
    local plan_type=""
    local scope=""

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
            --title)
                title="$2"
                shift 2
                ;;
            --type)
                plan_type="$2"
                shift 2
                ;;
            --scope)
                scope="$2"
                PLAN_SCOPE="$scope"
                shift 2
                ;;
            -*)
                log_error "Unknown option: $1"
                echo "Usage: flow.sh plan <issue> [--project <name>] [--prd <path>] [--deep] [--check]"
                echo "   or: flow.sh plan --title \"<title>\" --project <name> --type <type> [--scope <scope>] [--deep] [--check]"
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

    # Validate: either Issue number OR title+project+type
    if [[ -z "$issue_number" && -z "$title" ]]; then
        log_error "Either Issue number or --title required"
        echo "Usage: flow.sh plan <issue> [--project <name>] [--prd <path>] [--deep] [--check]"
        echo "   or: flow.sh plan --title \"<title>\" --project <name> --type <type> [--deep] [--check]"
        exit 1
    fi

    # No-issue mode: require title, project, and type
    if [[ -n "$title" ]]; then
        if [[ -z "$project" ]]; then
            log_error "--project required when using --title"
            exit 1
        fi
        if [[ -z "$plan_type" ]]; then
            log_error "--type required when using --title"
            echo "Available types: feature, enhance, fix, refactor, docs, chore, test"
            exit 1
        fi
        normalize_plan_type "$plan_type" >/dev/null 2>&1 || {
            log_error "Invalid type: $plan_type"
            echo "Available types: feature, enhance, fix, refactor, docs, chore, test"
            exit 1
        }
    fi

    local repo issue_info slug plan_name plan_dir plan_file deep_flag plan_rel_path
    repo=$(get_space_repo)

    # --check mode: find plan and validate
    if [[ "$check_only" == true ]]; then
        if [[ -n "$issue_number" ]]; then
            plan_file=$(find_plan_by_issue "$issue_number" 2>/dev/null || true)
        else
            # For no-issue plans, find by title slug
            slug=$(title_to_slug "$title")
            plan_name="${plan_type}-${slug}"
            plan_dir=$(resolve_plan_dir --project "$project")
            plan_file="$plan_dir/${plan_name}.md"
        fi
        
        if [[ -z "$plan_file" || ! -f "$plan_file" ]]; then
            log_error "No plan found"
            if [[ -n "$issue_number" ]]; then
                echo "Create plan first: flow.sh plan $issue_number"
            else
                echo "Create plan first: flow.sh plan --title \"$title\" --project $project --type $plan_type"
            fi
            exit 1
        fi
        
        if check_doc_plan "$plan_file" >/dev/null 2>&1; then
            echo "Plan passes validation"
            if [[ -n "$issue_number" ]]; then
                echo "Next: flow.sh approve $issue_number"
            else
                echo "Next: flow.sh approve $plan_name"
            fi
        else
            check_doc_plan "$plan_file"
            echo ""
            log_error "Plan has issues. Fix and re-run with --check"
        fi
        exit 0
    fi
    
    # Find existing plan (by Issue) or check if plan exists (no-issue)
    if [[ -n "$issue_number" ]]; then
        plan_file=$(find_plan_by_issue "$issue_number" 2>/dev/null || true)
        if [[ -n "$plan_file" && -f "$plan_file" ]]; then
            echo "Plan: $plan_file"
            echo "Status: planning"
            echo "Next: flow.sh approve $issue_number"
            return 0
        fi
    fi
    
    # Create new plan
    if [[ -n "$issue_number" ]]; then
        # With Issue: fetch info from Issue
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

        plan_type=$(_resolve_plan_type_from_issue "$title" "$issue_info")
        
        # Extract scope from title (mandatory)
        local scope
        scope=$(extract_scope "$title")
        if [[ -z "$scope" ]]; then
            log_error "Issue title missing scope: $title"
            log_error "Expected format: <type>(<scope>): <description>"
            exit 1
        fi
        
        slug=$(title_to_slug "$title")
        slug=$(echo "$slug" | sed -E 's/^(fix|feat|feature|enhance|refactor|docs|chore|test)-//')
        plan_name="${issue_number}-${plan_type}-${scope}-${slug}"
    else
        # No Issue: use provided title, project, type
        PLAN_PROJECT="$project"
        
        # Scope must be provided via --scope option or extracted from title pattern
        local scope=""
        if [[ -n "$PLAN_SCOPE" ]]; then
            scope="$PLAN_SCOPE"
        else
            # Bash 3.x compatibility: use variable for regex with parentheses
            local scope_pattern='^[a-z]+\(([^)]+)\):'
            if [[ "$title" =~ $scope_pattern ]]; then
                scope="${BASH_REMATCH[1]}"
            fi
        fi
        
        if [[ -z "$scope" ]]; then
            log_error "Scope required for no-issue plans. Add --scope <name> or use title pattern: type(scope): description"
            exit 1
        fi
        
        slug=$(title_to_slug "$title")
        slug=$(echo "$slug" | sed -E 's/^(fix|feat|feature|enhance|refactor|docs|chore|test)-//')
        plan_name="${plan_type}-${scope}-${slug}"
    fi

    plan_dir=$(resolve_plan_dir --project "$project")
    mkdir -p "$plan_dir"

    plan_file="$plan_dir/${plan_name}.md"

    if [[ -f "$plan_file" ]]; then
        log_error "Plan already exists: $plan_file"
        exit 1
    fi

    deep_flag=""
    [[ "$deep_mode" == true ]] && deep_flag="--deep"

    if [[ -n "$issue_number" ]]; then
        create_plan "$plan_name" --project "$project" --issue "$issue_number" --type "$plan_type" ${prd_path:+--prd "$prd_path"} ${deep_flag} >/dev/null

        plan_rel_path="docs/products/${project}/plans/${plan_name}.md"
        update_issue_link "$issue_number" "$repo" "plan" "[${plan_name}](${plan_rel_path})"
        ensure_issue_labels "$issue_number" "$plan_file" "$repo"

        echo "Plan: $plan_file"
        echo "Issue: #$issue_number | Project: $project | Status: planning"
        echo "Next: flow.sh approve $issue_number"
    else
        create_plan "$plan_name" --project "$project" --type "$plan_type" ${prd_path:+--prd "$prd_path"} ${deep_flag} >/dev/null

        echo "Plan: $plan_file"
        echo "Project: $project | Status: planning"
        echo "Next: flow.sh approve $plan_name"
    fi
}