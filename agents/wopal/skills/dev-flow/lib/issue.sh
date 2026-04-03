#!/bin/bash
# issue.sh - GitHub Issue Operations Library
#
# Usage: source this file to use functions
#   source lib/issue.sh
#
# Functions:
#   get_issue_info()      - Get Issue info (gh issue view wrapper)
#   extract_project()     - Extract Target Project from Issue body
#   update_issue_link()   - Update Issue body link table
#   create_issue()        - Create Issue
#   close_issue()         - Close Issue
#   create_pr()           - Create PR
#   get_space_repo()      - Get space repo info
#   title_to_slug()       - Generate slug from title

set -euo pipefail

# Load shared utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
source "$SKILL_DIR/lib/common.sh"

# ============================================
# Issue Functions
# ============================================

# Get space repo info (owner/repo)
# Usage: get_space_repo
# Output: owner/repo string
get_space_repo() {
    local workspace_root
    workspace_root=$(find_workspace_root)

    if ! command -v gh &> /dev/null; then
        log_error "gh CLI not available"
        return 1
    fi

    cd "$workspace_root"
    gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || {
        log_error "Cannot get repo info. Ensure you're in a git repo with gh CLI configured"
        return 1
    }
}

# Generate slug from title (kebab-case)
# Usage: title_to_slug "<title>"
# Output: kebab-case slug (max 50 chars)
title_to_slug() {
    local title="$1"
    
    # Remove type prefix, keep scope: "feat(scope): title" → "(scope): title" → "scope-title"
    title=$(echo "$title" | sed -E 's/^([a-z]+)(\([^)]+\))?:\s*/\2/')
    title=$(echo "$title" | tr -d '()')
    
    # Convert to slug
    local slug
    slug=$(echo "$title" | tr '[:upper:]' '[:lower:]' | \
        sed 's/[^a-z0-9]/-/g' | \
        sed 's/--*/-/g' | \
        sed 's/^-//' | \
        sed 's/-$//' | \
        cut -c1-50)
    
    # If slug is empty or too short, use md5 hash fallback
    if [[ -z "$slug" || ${#slug} -lt 3 ]]; then
        slug=$(echo "$1" | md5 | cut -c1-8)
    fi
    
    echo "$slug"
}

# Resolve repo argument or use space repo
_resolve_repo() {
    local repo="${1:-}"
    if [[ -n "$repo" ]]; then
        echo "$repo"
    else
        get_space_repo
    fi
}

# Normalize plan/issue type to canonical value
# Usage: normalize_plan_type <raw_type>
# Output: feature|enhance|fix|refactor|docs|chore|test
normalize_plan_type() {
    local raw
    raw=$(echo "${1:-}" | tr '[:upper:]' '[:lower:]')

    case "$raw" in
        feat|feature)            echo "feature" ;;
        enhance|enhancement)     echo "enhance" ;;
        fix|bug)                 echo "fix" ;;
        refactor)                echo "refactor" ;;
        docs|doc|documentation)  echo "docs" ;;
        chore|ci)                echo "chore" ;;
        test)                    echo "test" ;;
        *)                       return 1 ;;
    esac
}

# Map canonical plan type to GitHub issue label
# Usage: plan_type_to_issue_label <plan_type>
plan_type_to_issue_label() {
    case "$1" in
        feature|enhance) echo "type/feature" ;;
        fix)             echo "type/bug" ;;
        refactor)        echo "type/refactor" ;;
        docs)            echo "type/docs" ;;
        chore|test)      echo "type/chore" ;;
        *)               return 1 ;;
    esac
}

# Map GitHub issue label back to canonical plan type
# Usage: issue_label_to_plan_type <issue_label>
issue_label_to_plan_type() {
    case "$1" in
        type/feature)  echo "feature" ;;
        type/bug)      echo "fix" ;;
        type/refactor) echo "refactor" ;;
        type/docs)     echo "docs" ;;
        type/chore)    echo "chore" ;;
        *)             return 1 ;;
    esac
}

# Format comma-separated items as markdown list
_format_issue_list() {
    local raw_items="$1"
    local prefix="$2"
    local fallback="$3"
    local output=""
    local item

    if [[ -z "$raw_items" ]]; then
        printf '%s' "$fallback"
        return 0
    fi

    IFS=',' read -ra items <<< "$raw_items"
    for item in "${items[@]}"; do
        item=$(echo "$item" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
        [[ -z "$item" ]] && continue
        output+="${prefix}${item}"$'\n'
    done

    printf '%s' "${output%$'\n'}"
}

# Build structured issue body from individual fields
build_structured_issue_body() {
    local goal="${1:-}"
    local background="${2:-}"
    local scope="${3:-}"
    local out_of_scope="${4:-}"
    local reference="${5:-}"
    local in_scope_text
    local out_of_scope_text
    local body

    in_scope_text=$(_format_issue_list "$scope" "- [ ] " $'- [ ] 范围项 1\n- [ ] 范围项 2')
    out_of_scope_text=$(_format_issue_list "$out_of_scope" "- " "- 不做的项（原因）")

    body="## Goal

${goal:-<一句话描述目标>}

## Background

${background:-<背景和问题描述>}

## In Scope

$in_scope_text

## Out of Scope

$out_of_scope_text

## Acceptance Criteria

- [ ] 待 plan 细化后填充

## Related Resources

| Resource | Link |
|----------|------|"

    if [[ -n "$reference" ]]; then
        body+=$'\n| Research | '
        body+="$reference"
        body+=$' |'
    fi

    body+=$'\n| Plan | _待关联_ |'
    printf '%s\n' "$body"
}

# Extract a markdown section body from a plan file
_extract_plan_section() {
    local plan_file="$1"
    local section="$2"
    local limit="$3"

    sed -n "/^## $section/,/^##[^#]/{ /^## $section/d; /^##[^#]/d; p; }" "$plan_file" | head -n "$limit"
}

# Normalize a section value with placeholder fallback
_issue_section_value() {
    local value="$1"
    local placeholder_pattern="$2"
    local fallback="$3"
    local require_marker="${4:-}"

    if [[ -n "$require_marker" ]] && ! echo "$value" | grep -qF -- "$require_marker"; then
        printf '%s\n' "$fallback"
        return 0
    fi

    if [[ -z "$value" ]] || echo "$value" | grep -qF -- "$placeholder_pattern"; then
        printf '%s\n' "$fallback"
    else
        printf '%s\n' "$value"
    fi
}

# Build normalized issue body from approved plan content
build_issue_body_from_plan() {
    local plan_file="$1"
    local plan_name="$2"
    local goal background in_scope out_of_scope acceptance_criteria

    goal=$(_issue_section_value "$(_extract_plan_section "$plan_file" "Goal" 5 | sed '/^$/d')" "一句话描述" "<目标描述>")
    background=$(_issue_section_value "$(_extract_plan_section "$plan_file" "Technical Context" 20 | sed '/^$/d')" "<当前架构" "<背景描述>")
    in_scope=$(_issue_section_value "$(_extract_plan_section "$plan_file" "In Scope" 15)" "" "- [ ] 范围项 1" "-")
    out_of_scope=$(_issue_section_value "$(_extract_plan_section "$plan_file" "Out of Scope" 10)" "<本次不做" "- 不做的项（原因）")
    acceptance_criteria=$(_issue_section_value "$(_extract_plan_section "$plan_file" "Acceptance Criteria" 15)" "" "- [ ] 验收条件 1" "-")

    cat <<EOF
## Goal

$goal

## Background

$background

## In Scope

$in_scope

## Out of Scope

$out_of_scope

## Acceptance Criteria

$acceptance_criteria

## Related Resources

| Resource | Link |
|----------|------|
| Plan | [$plan_name](../docs/products/plans/$plan_name.md) |
EOF
}

# Get current labels for an issue
get_issue_labels() {
    local issue_number="$1"
    local repo
    repo=$(_resolve_repo "${2:-}")

    if ! command -v gh &> /dev/null; then
        echo ""
        return 0
    fi

    gh issue view "$issue_number" --repo "$repo" --json labels -q '.labels[].name' 2>/dev/null | tr '\n' ' ' || true
}

# Check whether an issue already has a label
issue_has_label() {
    local issue_number="$1"
    local label="$2"
    local labels
    labels=$(get_issue_labels "$issue_number" "${3:-}")
    echo "$labels" | grep -qF "$label"
}

# Ensure an issue has a specific label
ensure_issue_label() {
    local issue_number="$1"
    local label="$2"
    local repo
    repo=$(_resolve_repo "${3:-}")

    ensure_label_exists "$label" "$repo"
    if issue_has_label "$issue_number" "$label" "$repo"; then
        return 0
    fi

    gh issue edit "$issue_number" --repo "$repo" --add-label "$label" >/dev/null 2>/dev/null || {
        log_warn "Failed to add label to Issue #$issue_number: $label"
        return 1
    }
}

# Remove a label from an issue if present
remove_issue_label() {
    local issue_number="$1"
    local label="$2"
    local repo
    repo=$(_resolve_repo "${3:-}")

    gh issue edit "$issue_number" --repo "$repo" --remove-label "$label" >/dev/null 2>/dev/null || true
}

# Sync a mutually exclusive label group to a single target label
sync_issue_label_group() {
    local issue_number="$1"
    local desired_label="$2"
    local repo
    repo=$(_resolve_repo "${3:-}")
    shift 3

    local label
    for label in "$@"; do
        [[ "$label" == "$desired_label" ]] && continue
        remove_issue_label "$issue_number" "$label" "$repo"
    done

    [[ -z "$desired_label" ]] || ensure_issue_label "$issue_number" "$desired_label" "$repo"
}

# Get Issue info
# Usage: get_issue_info <issue_number> [repo]
# Output: JSON with title, body, number, state, labels
get_issue_info() {
    local issue_number="$1"
    local repo
    repo=$(_resolve_repo "${2:-}")

    if ! command -v gh &> /dev/null; then
        log_error "gh CLI not available"
        return 1
    fi

    gh issue view "$issue_number" --repo "$repo" --json title,body,number,state,labels
}

# Extract Target Project from Issue labels
# Usage: extract_project "<issue_info_json>"
# Output: project name or empty string
extract_project() {
    local issue_info="$1"
    
    # Extract project from labels with project/* pattern
    local labels
    labels=$(echo "$issue_info" | jq -r '.labels[].name' 2>/dev/null || true)
    for label in $labels; do
        if [[ "$label" =~ ^project/(.+)$ ]]; then
            echo "${BASH_REMATCH[1]}"
            return 0
        fi
    done
    
    echo ""
}

# Update Issue body link table
# Usage: update_issue_link <issue_number> <repo> <link_type> <link_value>
# Link types: prd, plan, pr
update_issue_link() {
    local issue_number="$1"
    local repo="$2"
    local link_type="$3"
    local link_value="$4"

    if ! command -v gh &> /dev/null; then
        log_warn "gh CLI not available, skipping issue link update"
        return 0
    fi

    local current_body
    current_body=$(gh issue view "$issue_number" --repo "$repo" --json body -q .body)

    # Escape special characters for sed
    local escaped_value
    escaped_value=$(echo "$link_value" | sed 's/#/\\#/g')
    local new_body="$current_body"
    local placeholder=""
    local label=""

    case "$link_type" in
        prd)
            placeholder="| PRD | _待关联_ |"
            label="PRD"
            ;;
        plan)
            placeholder="| Plan | _待关联_ |"
            label="Plan"
            ;;
        pr)
            placeholder="| PR | _待关联_ |"
            label="PR"
            ;;
        *)
            log_error "Invalid link type: $link_type"
            return 1
            ;;
    esac

    # Check if placeholder exists
    if echo "$current_body" | grep -qF "$placeholder"; then
        # Replace placeholder
        new_body=$(echo "$current_body" | sed "s#$placeholder#| $label | $escaped_value |#")
    elif echo "$current_body" | grep -q "## 关联资源"; then
        # Has section but no placeholder, append line
        new_body=$(echo "$current_body" | sed "/## 关联资源/a| $label | $escaped_value |")
    else
        # No section, append entire section
        local link_section="

---

## 关联资源

| 资源 | 链接 |
|------|------|
| $label | $escaped_value |"
        new_body="${current_body}${link_section}"
    fi

    gh issue edit "$issue_number" --repo "$repo" --body "$new_body" >/dev/null
}

# Create Issue
# Usage: create_issue --title "<title>" --project <project> --type <type> [options]
# Options:
#   --body "<body>"         Issue body content (fallback if no structured params)
#   --label "<label>"       Additional labels (can be used multiple times)
#   --assignee "<user>"     Assignee
#   --goal "<text>"         One-line goal (structured)
#   --background "<text>"   Background description (structured)
#   --scope "<items>"       In-scope items, comma-separated (structured)
#   --out-of-scope "<items>" Out-of-scope items, comma-separated (structured)
#   --reference "<path>"    Research document path (structured)
# Output: created issue URL
create_issue() {
    local title=""
    local project=""
    local type=""
    local body=""
    local labels=()
    local assignee=""
    local goal=""
    local background=""
    local scope=""
    local out_of_scope=""
    local reference=""

    while [[ $# -gt 0 ]]; do
        case $1 in
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
            --label)
                labels+=("$2")
                shift 2
                ;;
            --assignee)
                assignee="$2"
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
            *)
                log_error "Unknown parameter: $1"
                return 1
                ;;
        esac
    done

    [[ -z "$title" ]] && { log_error "Missing --title"; return 1; }
    [[ -z "$project" ]] && { log_error "Missing --project"; return 1; }
    [[ -z "$type" ]] && { log_error "Missing --type"; return 1; }

    local plan_type
    plan_type=$(normalize_plan_type "$type") || {
        log_error "Invalid --type: $type"
        return 1
    }

    local type_label
    type_label=$(plan_type_to_issue_label "$plan_type") || {
        log_error "Unsupported type mapping: $plan_type"
        return 1
    }

    # Build structured body if any structured params provided
    if [[ -n "$goal" || -n "$background" || -n "$scope" || -n "$out_of_scope" || -n "$reference" ]]; then
        body=$(build_structured_issue_body "$goal" "$background" "$scope" "$out_of_scope" "$reference")
    fi

    local repo
    repo=$(get_space_repo)

    ensure_flow_labels_exist "$repo"
    ensure_label_exists "$type_label" "$repo"
    ensure_label_exists "project/$project" "$repo"

    # Build labels
    labels+=("status/planning" "$type_label" "project/$project")

    # Build gh command arguments array
    local gh_args=()
    gh_args+=(--repo "$repo" --title "$title" --body "$body")
    for label in "${labels[@]}"; do
        gh_args+=(--label "$label")
    done
    if [[ -n "$assignee" ]]; then
        gh_args+=(--assignee "$assignee")
    fi

    local issue_url
    issue_url=$(gh issue create "${gh_args[@]}")

    echo "$issue_url"
}

# Close Issue
# Usage: close_issue <issue_number> [--repo <repo>] [--comment "<message>"]
close_issue() {
    local issue_number="$1"
    shift || true
    local repo=""
    local comment=""

    # Parse optional args
    while [[ $# -gt 0 ]]; do
        case $1 in
            --repo)
                repo="$2"
                shift 2
                ;;
            --comment)
                comment="$2"
                shift 2
                ;;
            *)
                # Legacy: positional repo argument
                if [[ -z "$repo" && "$1" != -* ]]; then
                    repo="$1"
                fi
                shift
                ;;
        esac
    done

    if [[ -z "$repo" ]]; then
        repo=$(get_space_repo)
    fi

    log_info "Closing Issue #$issue_number..."

    if [[ -n "$comment" ]]; then
        gh issue comment "$issue_number" --repo "$repo" --body "$comment" >/dev/null
    fi

    gh issue close "$issue_number" --repo "$repo" >/dev/null

    # Clean up all flow state labels
    for label in "status/planning" "status/approved" "status/in-progress" "status/in-review"; do
        remove_issue_label "$issue_number" "$label" "$repo"
    done
    for label in "pr/opened" "validation/awaiting" "validation/passed"; do
        remove_issue_label "$issue_number" "$label" "$repo"
    done
    ensure_issue_label "$issue_number" "status/done" "$repo"

    log_success "Issue #$issue_number closed"
}

# Get project repo from project name
# Usage: get_project_repo <project_name>
# Output: owner/repo string
get_project_repo() {
    local project="$1"
    local workspace_root
    workspace_root=$(find_workspace_root)
    
    local project_dir="$workspace_root/projects/$project"
    
    if [[ ! -d "$project_dir" ]]; then
        log_error "Project directory not found: $project_dir"
        return 1
    fi
    
    cd "$project_dir"
    gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || {
        log_error "Cannot get repo info for project: $project"
        return 1
    }
}

# Create PR
# Usage: create_pr <issue_number> --project <project> [--base <branch>] [--draft]
# Note: PR is created in project repo, Issue is updated in space repo
create_pr() {
    local issue_number="$1"
    shift || true
    local project=""
    local base="main"
    local draft=false

    while [[ $# -gt 0 ]]; do
        case $1 in
            --project)
                project="$2"
                shift 2
                ;;
            --base)
                base="$2"
                shift 2
                ;;
            --draft)
                draft=true
                shift
                ;;
            *)
                shift
                ;;
        esac
    done

    [[ -z "$project" ]] && { log_error "Missing --project"; return 1; }

    local space_repo
    space_repo=$(get_space_repo)

    log_info "Getting Issue #$issue_number info..."

    local issue_info
    issue_info=$(get_issue_info "$issue_number" "$space_repo")

    local title
    title=$(echo "$issue_info" | jq -r '.title')

    # Get project repo (PR target)
    local pr_repo
    pr_repo=$(get_project_repo "$project") || return 1

    # Get current branch from project directory
    local workspace_root project_dir
    workspace_root=$(find_workspace_root)
    project_dir="$workspace_root/projects/$project"
    
    local current_branch
    current_branch=$(cd "$project_dir" && git branch --show-current)

    if [[ -z "$current_branch" || "$current_branch" == "main" || "$current_branch" == "master" ]]; then
        log_error "Please run this command on a feature branch in project: $project (current: ${current_branch:-detached})"
        return 1
    fi

    # Generate PR body
    local pr_body
    pr_body=$(cat << EOF
## Summary

Implements #$issue_number

## Related Issue

Refs $space_repo#$issue_number

## Changes

- Change item 1
- Change item 2

## Test Plan

- [ ] Test item 1
- [ ] Test item 2
EOF
)

    log_info "Creating PR in $pr_repo..."
    log_info "Title: $title"
    log_info "Branch: $current_branch -> $base"

    local pr_url
    if [[ "$draft" == true ]]; then
        pr_url=$(cd "$project_dir" && gh pr create --repo "$pr_repo" --base "$base" --title "$title" --body "$pr_body" --draft)
    else
        pr_url=$(cd "$project_dir" && gh pr create --repo "$pr_repo" --base "$base" --title "$title" --body "$pr_body")
    fi

    log_success "PR created: $pr_url"

    # Update Issue in space repo
    gh issue edit "$issue_number" --repo "$space_repo" --add-label "status/in-review" >/dev/null 2>/dev/null || true
    update_issue_link "$issue_number" "$space_repo" "pr" "$pr_url"
}

# ============================================
# Label Management (bash 3.x compatible)
# ============================================

# Get label properties: color and description
# Usage: _get_label_props <label_name>
# Output: tab-separated "color<TAB>description"
_get_label_props() {
    local label_name="$1"
    case "$label_name" in
        # Status labels (main)
        status/planning)    printf 'fbca04\tPlanning or investigating\n' ;;
        status/approved)    printf '0e8a16\tPlan approved, ready to execute\n' ;;
        status/in-progress) printf '1d76db\tCurrently in progress\n' ;;
        status/done)        printf '5319e7\tCompleted\n' ;;
        # Validation sub-labels
        validation/awaiting) printf 'fef2c0\tAwaiting user validation\n' ;;
        validation/passed)   printf 'c2e0c6\tUser validation passed\n' ;;
        # PR sub-labels
        pr/opened)          printf 'bfdadc\tPR created, awaiting review\n' ;;
        # Type labels
        type/feature)       printf '1d76db\tNew feature\n' ;;
        type/bug)           printf 'd73a4a\tBug fix\n' ;;
        type/refactor)      printf 'cfd3d0\tCode refactoring\n' ;;
        type/docs)          printf '0075ca\tDocumentation\n' ;;
        type/chore)         printf 'f9d0c4\tChore/maintenance\n' ;;
        # Project labels
        project/ontology)    printf '5319e7\tontology project\n' ;;
        project/wopal-cli)   printf '1d76db\twopal-cli project\n' ;;
        project/space)       printf '0e8a16\tspace-level changes\n' ;;
        # Unknown label - generic color
        *)                  printf 'dddddd\t\n' ;;
    esac
}

# Get list of all dev-flow label names
# Usage: _get_flow_label_names
_get_flow_label_names() {
    echo "status/planning status/approved status/in-progress status/done validation/awaiting validation/passed pr/opened"
}

# Ensure a label exists in the repo
# Usage: ensure_label_exists <label_name> [repo]
# Returns: 0 on success, 1 on failure
ensure_label_exists() {
    local label_name="$1"
    local repo="${2:-}"

    if [[ -z "$repo" ]]; then
        repo=$(get_space_repo)
    fi

    if ! command -v gh &> /dev/null; then
        log_warn "gh CLI not available, skipping label creation"
        return 0
    fi

    # Silent check - return early if label already exists
    if gh label list --repo "$repo" --json name -q '.[].name' 2>/dev/null | grep -qxF "$label_name"; then
        return 0
    fi

    # Get label definition
    local label_def
    label_def=$(_get_label_props "$label_name")
    local color description
    IFS=$'\t' read -r color description <<< "$label_def"

    gh label create "$label_name" --repo "$repo" --color "$color" --description "$description" 2>/dev/null || true

    return 0
}

# Ensure all dev-flow labels exist
# Usage: ensure_flow_labels_exist [repo]
ensure_flow_labels_exist() {
    local repo="${1:-}"

    if [[ -z "$repo" ]]; then
        repo=$(get_space_repo)
    fi

    local label_names
    label_names=$(_get_flow_label_names)
    for label_name in $label_names; do
        ensure_label_exists "$label_name" "$repo"
    done
}

# Add validation label to issue
# Usage: add_validation_label <issue_number> <label_type> [repo]
# label_type: awaiting or passed
add_validation_label() {
    local issue_number="$1"
    local label_type="$2"
    local repo
    repo=$(_resolve_repo "${3:-}")

    case "$label_type" in
        awaiting|passed) ;;
        *)
            log_error "Invalid validation label type: $label_type"
            return 1
            ;;
    esac

    local label="validation/$label_type"
    
    # Remove other validation labels first
    remove_issue_label "$issue_number" "validation/awaiting" "$repo"
    remove_issue_label "$issue_number" "validation/passed" "$repo"
    
    # Add new label
    ensure_issue_label "$issue_number" "$label" "$repo"
}

# Add PR label to issue
# Usage: add_pr_label <issue_number> [repo]
add_pr_label() {
    local issue_number="$1"
    local repo
    repo=$(_resolve_repo "${2:-}")

    ensure_issue_label "$issue_number" "pr/opened" "$repo"
}

# ============================================
# PR URL Parsing and Status Check
# ============================================

# Extract PR URL from Issue body
# Usage: get_pr_url_from_issue <issue_number> [repo]
# Output: PR URL or empty string
get_pr_url_from_issue() {
    local issue_number="$1"
    local repo="${2:-}"
    
    if [[ -z "$repo" ]]; then
        repo=$(get_space_repo)
    fi
    
    local issue_body
    issue_body=$(gh issue view "$issue_number" --repo "$repo" --json body -q .body 2>/dev/null || echo "")
    
    # Match PR URL pattern: | PR | https://github.com/owner/repo/pull/123 |
    echo "$issue_body" | grep -oE 'https://github\.com/[^/]+/[^/]+/pull/[0-9]+' | head -1
}

# Parse PR info from URL
# Usage: parse_pr_url <pr_url>
# Output: "owner/repo pr_number" or empty
parse_pr_url() {
    local pr_url="$1"
    
    # Extract owner/repo and PR number from URL
    # https://github.com/owner/repo/pull/123
    if [[ "$pr_url" =~ github\.com/([^/]+/[^/]+)/pull/([0-9]+) ]]; then
        echo "${BASH_REMATCH[1]} ${BASH_REMATCH[2]}"
    fi
}

# Check if PR is merged
# Usage: is_pr_merged <pr_url>
# Returns: 0 if merged, 1 if not merged or not found
is_pr_merged() {
    local pr_url="$1"
    
    local prlog_info
    prlog_info=$(parse_pr_url "$pr_url")
    
    if [[ -z "$prlog_info" ]]; then
        return 1
    fi
    
    local pr_repo pr_number
    read -r pr_repo pr_number <<< "$prlog_info"
    
    # Check PR mergedAt field
    local merged_at
    merged_at=$(gh pr view "$pr_number" --repo "$pr_repo" --json mergedAt -q .mergedAt 2>/dev/null || echo "null")
    
    if [[ "$merged_at" != "null" && -n "$merged_at" ]]; then
        return 0
    else
        return 1
    fi
}

# ============================================
# Sync Approved Plan to Issue
# ============================================

# Sync approved plan to Issue body (called at approve --confirm --update-issue)
# Usage: sync_plan_to_issue <issue_number> <plan_file> [repo]
# This replaces the entire Issue body with normalized content from Plan
sync_plan_to_issue() {
    local issue_number="$1"
    local plan_file="$2"
    local repo
    repo=$(_resolve_repo "${3:-}")
    
    if [[ ! -f "$plan_file" ]]; then
        log_warn "Plan file not found: $plan_file"
        return 1
    fi
    
    if ! command -v gh &> /dev/null; then
        log_warn "gh CLI not available, skipping issue sync"
        return 0
    fi
    
    log_info "Syncing approved plan to Issue #$issue_number..."
    
    local plan_name
    plan_name=$(basename "$plan_file" .md)
    local new_body
    new_body=$(build_issue_body_from_plan "$plan_file" "$plan_name")
    
    # Update Issue body (replace entire body)
    gh issue edit "$issue_number" --repo "$repo" --body "$new_body" >/dev/null && \
        log_success "Issue #$issue_number updated with approved plan" || \
        log_warn "Failed to update Issue #$issue_number"
}

# Ensure Issue has correct labels based on Plan metadata
# Usage: ensure_issue_labels <issue_number> <plan_file> [repo]
# This ensures status, type, and project labels are correct
ensure_issue_labels() {
    local issue_number="$1"
    local plan_file="$2"
    local repo
    repo=$(_resolve_repo "${3:-}")
    
    if [[ ! -f "$plan_file" ]]; then
        log_warn "Plan file not found: $plan_file"
        return 1
    fi
    
    if ! command -v gh &> /dev/null; then
        log_warn "gh CLI not available, skipping label sync"
        return 0
    fi
    
    # Extract metadata from Plan
    local plan_type plan_project plan_status
    
    plan_type=$(grep -m1 '^\- \*\*Type\*\*:' "$plan_file" | sed 's/^.*: //' | tr '[:upper:]' '[:lower:]')
    plan_project=$(grep -m1 '^\- \*\*Target Project\*\*:' "$plan_file" | sed 's/^.*: //')
    plan_status=$(grep -m1 '^\- \*\*Status\*\*:' "$plan_file" | sed 's/^.*: //')
    
    local status_label=""
    local type_label=""
    local project_label=""
    
    # Status label based on plan status
    case "$plan_status" in
        investigating|planning)
            status_label="status/planning"
            ;;
        approved)
            status_label="status/approved"
            ;;
        executing)
            status_label="status/in-progress"
            ;;
        done)
            status_label="status/done"
            ;;
    esac
    
    # Type label
    if [[ -n "$plan_type" ]]; then
        local normalized_type
        normalized_type=$(normalize_plan_type "$plan_type" 2>/dev/null || true)
        if [[ -n "$normalized_type" ]]; then
            type_label=$(plan_type_to_issue_label "$normalized_type")
        fi
    fi
    
    # Project label
    if [[ -n "$plan_project" ]]; then
        case "$plan_project" in
            ontology|wopal-cli|space)
                project_label="project/$plan_project"
                ;;
        esac
    fi

    sync_issue_label_group "$issue_number" "$status_label" "$repo" \
        "status/planning" "status/approved" "status/in-progress" "status/done"

    sync_issue_label_group "$issue_number" "$type_label" "$repo" \
        "type/feature" "type/bug" "type/refactor" "type/docs" "type/chore"

    sync_issue_label_group "$issue_number" "$project_label" "$repo" \
        "project/ontology" "project/wopal-cli" "project/space"
}

# Export functions for use in other scripts
# (no-op: functions are available when sourced)
true
