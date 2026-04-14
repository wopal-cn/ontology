# cmd_new_issue: Create a new Issue with proper labels
# Usage: flow.sh new-issue --title "<title>" --project <name> --type <type> [options]
cmd_new_issue() {
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
                echo "Usage: flow.sh new-issue --title \"<title>\" --project <name> --type <type>"
                echo "                       [--body \"<body>\"] [--goal \"<text>\"] [--background \"<text>\"]"
                echo "                       [--scope \"<items>\"] [--out-of-scope \"<items>\"] [--reference \"<path>\"]"
                exit 1
                ;;
            *)
                shift
                ;;
        esac
    done
    
    # Validate required args
    _ensure_arg "--title" "$title" "Missing --title" || {
        echo "Usage: flow.sh new-issue --title \"<title>\" --project <name> --type <type>"
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
    echo "Next: flow.sh plan $issue_number"
}