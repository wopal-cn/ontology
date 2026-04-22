# cmd_archive: Archive completed plan (final cleanup)
# 4-state model: done -> archive (file movement only)
# This is a cleanup action, not a state transition
# Two paths:
#   1. PR path: archive after PR merged (Plan already in done state from verify)
#   2. No-PR path: archive after verify --confirm (Plan already in done state)
# Usage:
#   flow.sh archive <issue>
#   flow.sh archive <plan-name>
cmd_archive() {
    local input=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            -*)
                log_error "Unknown option: $1"
                echo "Usage: flow.sh archive <issue-or-plan>"
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
        echo "Usage: flow.sh archive <issue-or-plan>"
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

    local repo
    repo=$(get_space_repo)

    # Extract Issue number (if plan has Issue link)
    local issue_number
    issue_number=$(extract_primary_plan_issue "$plan_file")

    local current_status
    current_status=$(get_current_status "$plan_file")

    # Check archive conditions (4-state model)
    # Plan must be in done state to archive
    if [[ "$current_status" != "done" ]]; then
        log_error "Plan must be in done state to archive"
        echo "Current status: $current_status"
        echo ""
        case "$current_status" in
            planning)
                echo "Run: flow.sh approve $input --confirm"
                ;;
            executing)
                echo "Run: flow.sh complete $input"
                ;;
            verifying)
                echo "Run: flow.sh verify $input --confirm"
                ;;
        esac
        exit 1
    fi

    # Sync Plan's checked AC to Issue body before archiving (if Issue exists)
    if [[ -n "$issue_number" ]]; then
        sync_plan_to_issue "$issue_number" "$plan_file" "$repo" >/dev/null 2>&1
    fi

    # Stage verify's status modification before git mv
    # This ensures one commit contains both status change and file rename
    local root_dir
    root_dir=$(find_workspace_root)
    local plan_file_rel="$plan_file"
    if [[ "$plan_file_rel" == "$root_dir/"* ]]; then
        plan_file_rel="${plan_file_rel#$root_dir/}"
    fi

    if command -v git &> /dev/null && [[ -d "$root_dir/.git" ]] && git -C "$root_dir" ls-files --error-unmatch -- "$plan_file_rel" >/dev/null 2>&1; then
        git -C "$root_dir" add -- "$plan_file_rel" >/dev/null 2>&1 || log_warn "Failed to stage plan modifications"
    fi

    # Archive plan file
    local archived_file
    archived_file=$(archive_plan "$plan_file")

    # Update Issue Plan link to archived path (if Issue exists)
    if [[ -n "$issue_number" && -n "$archived_file" ]]; then
        if ! update_issue_plan_link "$issue_number" "$archived_file" "$repo" 2>&1; then
            log_warn "Failed to update Issue Plan link"
        fi
    fi

    # Check if project has uncommitted changes (prompt agent to commit manually)
    local project
    project=$(get_plan_project "$archived_file")
    local project_has_changes=false
    if [[ -n "$project" ]]; then
        local project_dir="$root_dir/projects/$project"
        if [[ -d "$project_dir/.git" ]]; then
            local project_status
            project_status=$(git -C "$project_dir" status --porcelain 2>/dev/null || echo "")
            if [[ -n "$project_status" ]]; then
                project_has_changes=true
            fi
        fi
    fi

    # Commit + push archived plan in space repo so the GitHub link works
    # archive_plan() uses git mv when possible, so rename should already be staged
    if command -v git &> /dev/null && [[ -d "$root_dir/.git" ]]; then
        local diff_rc=0
        git -C "$root_dir" diff --cached --quiet 2>/dev/null || diff_rc=$?

        if [[ "$diff_rc" -eq 0 ]]; then
            log_warn "No staged changes for archived plan"
        elif [[ "$diff_rc" -eq 1 ]]; then
            local archive_commit_msg
            if [[ -n "$issue_number" ]]; then
                archive_commit_msg="chore: archive plan #$issue_number"
            else
                archive_commit_msg="chore: archive plan $(basename "$archived_file" .md)"
            fi

            if git -C "$root_dir" commit -m "$archive_commit_msg" >/dev/null 2>&1; then
                git -C "$root_dir" push >/dev/null 2>&1 || log_warn "Failed to push archived plan"
            else
                log_warn "Failed to commit archived plan"
            fi
        else
            log_warn "Failed to inspect staged changes for archived plan"
        fi
    fi

    # Close Issue (clears all flow labels) - if Issue exists
    if [[ -n "$issue_number" ]]; then
        if ! close_issue "$issue_number" --repo "$repo" --comment "Plan archived. Closing issue."; then
            log_warn "Failed to close Issue #$issue_number"
        fi
    fi

    echo "Status: archived"
    echo "File: $archived_file"
    if [[ -n "$issue_number" ]]; then
        echo "Issue: #$issue_number (closed)"
    fi

    if [[ "$project_has_changes" == true ]]; then
        local plan_type
        plan_type=$(get_plan_type "$archived_file")
        echo ""
        echo "⚠️  Project $project has uncommitted changes. Please commit and push manually:"
        echo "  cd $root_dir/projects/$project"
        if [[ -n "$issue_number" ]]; then
            echo "  git add <files> && git commit -m \"${plan_type}: #$issue_number <description>\" && git push"
        else
            echo "  git add <files> && git commit -m \"${plan_type}: <description>\" && git push"
        fi
    fi
}
