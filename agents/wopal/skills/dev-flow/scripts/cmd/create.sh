# cmd_start: Create Plan and enter investigating phase
cmd_start() {
    local issue_number=""
    local project=""
    local prd_path=""
    local deep_mode=false

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
            -*)
                log_error "Unknown option: $1"
                cmd_help
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
        echo "Usage: flow.sh start <issue> [--project <name>] [--prd <path>]"
        exit 1
    }

    local repo issue_info title plan_type slug plan_name plan_dir plan_file deep_flag plan_rel_path
    repo=$(get_space_repo)
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
    echo "Issue: #$issue_number | Project: $project | Status: investigating"
    echo "Next: flow.sh plan $issue_number"
}

# cmd_create: Create a new Issue with proper labels
# Usage: flow.sh create --title "<title>" --project <name> --type <type> [options]
cmd_create() {
    local title=""
    local project=""
    local type=""
    local body=""
    local goal=""
    local background=""
    local scope=""
    local out_of_scope=""
    local reference=""
    
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --title)
                title="$2"
                shift 2
                ;;
            --project)
                project="$2"
                shift 2
                ;;
            --type)
                type="$2"
                shift 2
                ;;
            --body)
                body="$2"
                shift 2
                ;;
            --goal)
                goal="$2"
                shift 2
                ;;
            --background)
                background="$2"
                shift 2
                ;;
            --scope)
                scope="$2"
                shift 2
                ;;
            --out-of-scope)
                out_of_scope="$2"
                shift 2
                ;;
            --reference)
                reference="$2"
                shift 2
                ;;
            -*)
                log_error "Unknown option: $1"
                echo "Usage: flow.sh create --title \"<title>\" --project <name> --type <type>"
                echo "                     [--body \"<body>\"] [--goal \"<text>\"] [--background \"<text>\"]"
                echo "                     [--scope \"<items>\"] [--out-of-scope \"<items>\"] [--reference \"<path>\"]"
                exit 1
                ;;
            *)
                shift
                ;;
        esac
    done
    
    # Validate required args
    _ensure_arg "--title" "$title" "Missing --title" || {
        echo "Usage: flow.sh create --title \"<title>\" --project <name> --type <type>"
        exit 1
    }
    _ensure_arg "--project" "$project" "Missing --project" || {
        echo "Example: --project ontology"
        echo "Optional: --goal, --background, --scope, --out-of-scope, --reference"
        exit 1
    }
    _ensure_arg "--type" "$type" "Missing --type" || {
        echo "Available types: feature, fix, refactor, docs, chore, test"
        exit 1
    }
    
    # Validate project name format (allow any valid name)
    case "$project" in
        [a-z0-9-]*)
            ;;
        *)
            log_error "Invalid project name: $project"
            log_error "Project name must be lowercase alphanumeric with hyphens"
            exit 1
            ;;
    esac
    
    normalize_plan_type "$type" >/dev/null 2>&1 || {
        log_error "Invalid type: $type"
        echo "Available types: feature, fix, refactor, docs, chore, test"
        exit 1
    }
    
    # Build default body from template if not provided
    # Only use template when no body AND no structured params
    if [[ -z "$body" && -z "$goal" && -z "$background" && -z "$scope" && -z "$out_of_scope" && -z "$reference" ]]; then
        local template_file="$SKILL_DIR/templates/issue.md"
        if [[ -f "$template_file" ]]; then
            body=$(cat "$template_file")
        else
            log_error "Issue template not found: $template_file"
            exit 1
        fi
    fi
    
    # Create Issue using library function
    local issue_url
    issue_url=$(create_issue \
        --title "$title" \
        --project "$project" \
        --type "$type" \
        --body "$body" \
        ${goal:+--goal "$goal"} \
        ${background:+--background "$background"} \
        ${scope:+--scope "$scope"} \
        ${out_of_scope:+--out-of-scope "$out_of_scope"} \
        ${reference:+--reference "$reference"} \
        2>/dev/null)
    
    if [[ -z "$issue_url" ]]; then
        log_error "Failed to create Issue"
        exit 1
    fi
    
    # Extract issue number
    local issue_number
    issue_number=$(echo "$issue_url" | grep -oE '[0-9]+$')
    
    echo "Issue #${issue_number}: $issue_url"
    echo "Next: flow.sh start $issue_number"
}