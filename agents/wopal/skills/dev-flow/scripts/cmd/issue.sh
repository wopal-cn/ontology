# cmd_issue: Unified issue create/update command surface
# Usage:
#   flow.sh issue create --title "<title>" --project <name> [--type <type>] [options]
#   flow.sh issue update <issue> [options]

cmd_issue_help() {
    cat << 'EOF'
Issue commands:
  issue create --title "<title>" --project <name> [--type <type>] [options]
      Create structured GitHub Issue
      If --type is omitted, infer from title prefix (e.g. perf(dev-flow): ...)

  issue update <issue>
      Update structured GitHub Issue fields
      Note: implementation is completed in Task 4 of Plan #120

Common create options:
  --goal "<text>"
  --background "<text>"
  --scope "item 1, item 2"
  --out-of-scope "item 1, item 2"
  --reference "<path-or-url>"
  --body "<markdown>"

Perf options:
  --baseline "<current state>"
  --target "<expected state>"

Refactor options:
  --affected-components "a, b, c"
  --refactor-strategy "<strategy>"

Docs options:
  --target-documents "doc1, doc2"
  --audience "<who>"

Test options:
  --test-scope "<scope>"
  --test-strategy "<strategy>"

Fix-specific options:
  --confirmed-bugs "<text>"
  --content-model-defects "<text>"
  --cleanup-scope "<text>"
  --key-findings "<text>"
EOF
}

cmd_issue_create() {
    local title=""
    local project=""
    local type=""
    local body=""
    local goal=""
    local background=""
    local scope=""
    local out_of_scope=""
    local reference=""
    local confirmed_bugs=""
    local content_model_defects=""
    local cleanup_scope=""
    local key_findings=""
    local baseline=""
    local target=""
    local affected_components=""
    local refactor_strategy=""
    local target_documents=""
    local audience=""
    local test_scope=""
    local test_strategy=""

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
            --confirmed-bugs)
                confirmed_bugs="$2"
                shift 2
                ;;
            --content-model-defects)
                content_model_defects="$2"
                shift 2
                ;;
            --cleanup-scope)
                cleanup_scope="$2"
                shift 2
                ;;
            --key-findings)
                key_findings="$2"
                shift 2
                ;;
            --baseline)
                baseline="$2"
                shift 2
                ;;
            --target)
                target="$2"
                shift 2
                ;;
            --affected-components)
                affected_components="$2"
                shift 2
                ;;
            --refactor-strategy)
                refactor_strategy="$2"
                shift 2
                ;;
            --target-documents)
                target_documents="$2"
                shift 2
                ;;
            --audience)
                audience="$2"
                shift 2
                ;;
            --test-scope)
                test_scope="$2"
                shift 2
                ;;
            --test-strategy)
                test_strategy="$2"
                shift 2
                ;;
            -* )
                log_error "Unknown option: $1"
                cmd_issue_help
                exit 1
                ;;
            *)
                log_error "Unexpected positional argument: $1"
                cmd_issue_help
                exit 1
                ;;
        esac
    done

    _ensure_arg "--title" "$title" "Missing --title" || {
        cmd_issue_help
        exit 1
    }
    _ensure_arg "--project" "$project" "Missing --project" || {
        cmd_issue_help
        exit 1
    }

    case "$project" in
        [a-z0-9-]*) ;;
        *)
            log_error "Invalid project name: $project"
            log_error "Project name must be lowercase alphanumeric with hyphens"
            exit 1
            ;;
    esac

    local issue_args=()
    issue_args+=(--title "$title" --project "$project")
    [[ -n "$type" ]] && issue_args+=(--type "$type")
    [[ -n "$body" ]] && issue_args+=(--body "$body")
    [[ -n "$goal" ]] && issue_args+=(--goal "$goal")
    [[ -n "$background" ]] && issue_args+=(--background "$background")
    [[ -n "$scope" ]] && issue_args+=(--scope "$scope")
    [[ -n "$out_of_scope" ]] && issue_args+=(--out-of-scope "$out_of_scope")
    [[ -n "$reference" ]] && issue_args+=(--reference "$reference")
    [[ -n "$confirmed_bugs" ]] && issue_args+=(--confirmed-bugs "$confirmed_bugs")
    [[ -n "$content_model_defects" ]] && issue_args+=(--content-model-defects "$content_model_defects")
    [[ -n "$cleanup_scope" ]] && issue_args+=(--cleanup-scope "$cleanup_scope")
    [[ -n "$key_findings" ]] && issue_args+=(--key-findings "$key_findings")
    [[ -n "$baseline" ]] && issue_args+=(--baseline "$baseline")
    [[ -n "$target" ]] && issue_args+=(--target "$target")
    [[ -n "$affected_components" ]] && issue_args+=(--affected-components "$affected_components")
    [[ -n "$refactor_strategy" ]] && issue_args+=(--refactor-strategy "$refactor_strategy")
    [[ -n "$target_documents" ]] && issue_args+=(--target-documents "$target_documents")
    [[ -n "$audience" ]] && issue_args+=(--audience "$audience")
    [[ -n "$test_scope" ]] && issue_args+=(--test-scope "$test_scope")
    [[ -n "$test_strategy" ]] && issue_args+=(--test-strategy "$test_strategy")

    local issue_url
    issue_url=$(create_issue "${issue_args[@]}") || {
            log_error "Failed to create Issue"
            exit 1
        }

    local issue_number
    issue_number=$(echo "$issue_url" | grep -oE '[0-9]+$')

    echo "Issue #${issue_number}: $issue_url"
    echo "Next: flow.sh plan $issue_number"
}

cmd_issue_update() {
    local issue_number=""
    local title=""
    local type=""
    local project=""
    local goal=""
    local background=""
    local confirmed_bugs=""
    local content_model_defects=""
    local cleanup_scope=""
    local key_findings=""
    local baseline=""
    local target=""
    local affected_components=""
    local refactor_strategy=""
    local target_documents=""
    local audience=""
    local test_scope=""
    local test_strategy=""
    local scope=""
    local out_of_scope=""
    local reference=""
    local acceptance_criteria=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --title)                  title="$2"; shift 2 ;;
            --type)                   type="$2"; shift 2 ;;
            --project)                project="$2"; shift 2 ;;
            --goal)                   goal="$2"; shift 2 ;;
            --background)             background="$2"; shift 2 ;;
            --confirmed-bugs)         confirmed_bugs="$2"; shift 2 ;;
            --content-model-defects)  content_model_defects="$2"; shift 2 ;;
            --cleanup-scope)          cleanup_scope="$2"; shift 2 ;;
            --key-findings)           key_findings="$2"; shift 2 ;;
            --baseline)               baseline="$2"; shift 2 ;;
            --target)                 target="$2"; shift 2 ;;
            --affected-components)    affected_components="$2"; shift 2 ;;
            --refactor-strategy)      refactor_strategy="$2"; shift 2 ;;
            --target-documents)       target_documents="$2"; shift 2 ;;
            --audience)               audience="$2"; shift 2 ;;
            --test-scope)             test_scope="$2"; shift 2 ;;
            --test-strategy)          test_strategy="$2"; shift 2 ;;
            --scope)                  scope="$2"; shift 2 ;;
            --out-of-scope)           out_of_scope="$2"; shift 2 ;;
            --reference)              reference="$2"; shift 2 ;;
            --acceptance-criteria)    acceptance_criteria="$2"; shift 2 ;;
            -* )
                log_error "Unknown option: $1"
                cmd_issue_help
                exit 1
                ;;
            *)
                if [[ -z "$issue_number" ]]; then
                    issue_number="$1"
                    shift
                else
                    log_error "Unexpected positional argument: $1"
                    exit 1
                fi
                ;;
        esac
    done

    _ensure_arg "<issue>" "$issue_number" "Missing issue number" || {
        cmd_issue_help
        exit 1
    }

    local repo
    repo=$(get_space_repo)

    local issue_info current_body updated_body current_title next_title next_type next_project type_label project_label
    issue_info=$(get_issue_info "$issue_number" "$repo") || exit 1
    current_body=$(echo "$issue_info" | jq -r '.body')
    current_title=$(echo "$issue_info" | jq -r '.title')

    next_title="${title:-$current_title}"
    validate_issue_title "$next_title" || exit 1

    next_type="${type:-$(infer_issue_type_from_title "$next_title" 2>/dev/null || true)}"
    [[ -n "$next_type" ]] || {
        log_error "Cannot determine issue type for update"
        exit 1
    }
    next_type=$(normalize_plan_type "$next_type") || exit 1

    next_project="$project"
    if [[ -z "$next_project" ]]; then
        next_project=$(extract_project "$issue_info")
    fi

    local update_args=()
    [[ -n "$goal" ]] && update_args+=(--goal "$goal")
    [[ -n "$background" ]] && update_args+=(--background "$background")
    [[ -n "$confirmed_bugs" ]] && update_args+=(--confirmed-bugs "$confirmed_bugs")
    [[ -n "$content_model_defects" ]] && update_args+=(--content-model-defects "$content_model_defects")
    [[ -n "$cleanup_scope" ]] && update_args+=(--cleanup-scope "$cleanup_scope")
    [[ -n "$key_findings" ]] && update_args+=(--key-findings "$key_findings")
    [[ -n "$baseline" ]] && update_args+=(--baseline "$baseline")
    [[ -n "$target" ]] && update_args+=(--target "$target")
    [[ -n "$affected_components" ]] && update_args+=(--affected-components "$affected_components")
    [[ -n "$refactor_strategy" ]] && update_args+=(--refactor-strategy "$refactor_strategy")
    [[ -n "$target_documents" ]] && update_args+=(--target-documents "$target_documents")
    [[ -n "$audience" ]] && update_args+=(--audience "$audience")
    [[ -n "$test_scope" ]] && update_args+=(--test-scope "$test_scope")
    [[ -n "$test_strategy" ]] && update_args+=(--test-strategy "$test_strategy")
    [[ -n "$scope" ]] && update_args+=(--scope "$scope")
    [[ -n "$out_of_scope" ]] && update_args+=(--out-of-scope "$out_of_scope")
    [[ -n "$reference" ]] && update_args+=(--reference "$reference")
    [[ -n "$acceptance_criteria" ]] && update_args+=(--acceptance-criteria "$acceptance_criteria")

    updated_body=$(update_structured_issue_body "$current_body" "${update_args[@]}") || exit 1

    gh issue edit "$issue_number" --repo "$repo" --title "$next_title" --body "$updated_body" >/dev/null || exit 1

    type_label=$(plan_type_to_issue_label "$next_type") || exit 1
    sync_type_label_group "$issue_number" "$type_label" "$repo"

    if [[ -n "$next_project" ]]; then
        project_label=$(plan_project_to_issue_label "$next_project")
        [[ -n "$project_label" ]] && sync_project_label_group "$issue_number" "$project_label" "$repo"
    fi

    log_success "Issue #$issue_number updated"
}

cmd_issue() {
    local subcommand="${1:-help}"
    shift || true

    case "$subcommand" in
        create)
            cmd_issue_create "$@"
            ;;
        update)
            cmd_issue_update "$@"
            ;;
        help|--help|-h)
            cmd_issue_help
            ;;
        *)
            log_error "Unknown issue subcommand: $subcommand"
            cmd_issue_help
            exit 1
            ;;
    esac
}
