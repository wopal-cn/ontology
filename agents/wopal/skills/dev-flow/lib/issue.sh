#!/bin/bash
# issue.sh - GitHub Issue/PR Transport Primitives Library
#
# Usage: source this file to use functions
#   source lib/issue.sh
#
# Provides:
#   - GitHub Issue/PR CRUD operations
#   - URL parsing and link management
#   - Issue body construction
#
# Dependencies: common.sh, labels.sh
# Guard: DEV_FLOW_ISSUE_LOADED

# Prevent duplicate loading
if [[ -n "${DEV_FLOW_ISSUE_LOADED:-}" ]]; then
    return 0
fi
readonly DEV_FLOW_ISSUE_LOADED=1

set -euo pipefail

# Load dependencies
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
source "$SKILL_DIR/lib/common.sh"
source "$SKILL_DIR/lib/labels.sh"

# ============================================
# Repo Resolution
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

# Resolve repo argument or use space repo
_resolve_repo() {
    local repo="${1:-}"
    if [[ -n "$repo" ]]; then
        echo "$repo"
    else
        get_space_repo
    fi
}

# ============================================
# Slug Generation
# ============================================

# Generate slug from title description part
# Usage: title_to_slug "<title>"
# Output: kebab-case slug from description (max 50 chars)
title_to_slug() {
    local title="$1"

    # Extract description part: remove type(scope): prefix
    local description
    description=$(echo "$title" | sed -E 's/^[a-z]+(\([^)]+\))?:\s*//')

    # Convert to slug
    local slug
    slug=$(echo "$description" | tr '[:upper:]' '[:lower:]' | \
        sed 's/[^a-z0-9]/-/g' | \
        sed 's/--*/-/g' | \
        sed 's/^-//' | \
        sed 's/-$//' | \
        cut -c1-50)

    # If slug is empty or too short, use md5 hash fallback
    if [[ -z "$slug" || ${#slug} -lt 3 ]]; then
        slug=$(echo "$title" | md5 | cut -c1-8)
    fi

    echo "$slug"
}

# ============================================
# Issue Title Validation
# ============================================

# Validate issue title format and length
# Usage: validate_issue_title "<title>"
# Returns: 0 on valid, 1 on invalid (outputs error message)
# Format: <type>(<scope>): <description>
# Constraints:
#   - type must be valid (feat/fix/refactor/docs/test/chore/enhance)
#   - description ≤ 50 chars
#   - total title ≤ 72 chars
validate_issue_title() {
    local title="$1"
    
    # Check basic format: type(scope): description or type: description
    if ! echo "$title" | grep -qE '^[a-z]+(\([^)]+\))?:\s*.+$'; then
        log_error "Invalid title format. Expected: <type>(<scope>): <description>"
        log_error "Example: feat(cli): add skills remove command"
        log_error "Your title: $title"
        return 1
    fi
    
    # Extract type
    local type
    type=$(echo "$title" | sed -E 's/^([a-z]+)(\([^)]+\))?:.*/\1/')
    
    # Validate type
    case "$type" in
        feat|fix|refactor|docs|test|chore|enhance)
            ;;
        *)
            log_error "Invalid type: $type"
            log_error "Valid types: feat, fix, refactor, docs, test, chore, enhance"
            return 1
            ;;
    esac
    
    # Extract description (after type(scope): )
    local description
    description=$(echo "$title" | sed -E 's/^[a-z]+(\([^)]+\))?:\s*//')
    
    # Check description length (≤ 50 chars)
    if [[ ${#description} -gt 50 ]]; then
        log_error "Description too long: ${#description} chars (max 50)"
        log_error "Description: $description"
        return 1
    fi
    
    # Check total title length (≤ 72 chars)
    if [[ ${#title} -gt 72 ]]; then
        log_error "Title too long: ${#title} chars (max 72)"
        return 1
    fi
    
    # Check description is not empty
    if [[ -z "$description" ]]; then
        log_error "Description cannot be empty"
        return 1
    fi
    
    return 0
}

# ============================================
# Issue Info Retrieval
# ============================================

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

# ============================================
# Issue Body Construction
# ============================================

# Render a single issue section with consistent formatting
# Usage: _render_issue_section <heading> <content> [empty_fallback]
# Output: formatted markdown section
_render_issue_section() {
    local heading="$1"
    local content="$2"
    local fallback="${3:-<待填充>}"
    
    if [[ -z "$content" ]]; then
        printf '## %s\n\n%s\n' "$heading" "$fallback"
    else
        printf '## %s\n\n%s\n' "$heading" "$content"
    fi
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

# Build Related Resources table row
# Usage: _render_related_resources_row <label> <value>
_render_related_resources_row() {
    local label="$1"
    local value="$2"
    
    if [[ -n "$value" ]]; then
        printf '| %s | %s |\n' "$label" "$value"
    fi
}

# Build structured issue body from individual fields
# Usage: build_structured_issue_body [--type <type>] <goal> <background> [fix_sections] <scope> <out_of_scope> <reference>
# fix_sections (for type=fix only): confirmed_bugs, content_model_defects, cleanup_scope, key_findings
# Section order for fix: Goal → Background → Confirmed Bugs → Content Model Defects → Cleanup Scope → Key Findings → In Scope → Out of Scope → Acceptance Criteria → Related Resources
# Section order for others: Goal → Background → In Scope → Out of Scope → Acceptance Criteria → Related Resources
build_structured_issue_body() {
    local issue_type=""
    local goal=""
    local background=""
    local confirmed_bugs=""
    local content_model_defects=""
    local cleanup_scope=""
    local key_findings=""
    local scope=""
    local out_of_scope=""
    local reference=""
    
    # Parse arguments - support both old positional and new --type aware
    if [[ "$1" == "--type" ]]; then
        issue_type="$2"
        shift 2
    fi
    
    # For fix type, expect 9 args: goal, background, confirmed_bugs, content_model_defects, cleanup_scope, key_findings, scope, out_of_scope, reference
    # For other types, expect 5 args: goal, background, scope, out_of_scope, reference
    if [[ "$issue_type" == "fix" ]]; then
        goal="${1:-}"
        background="${2:-}"
        confirmed_bugs="${3:-}"
        content_model_defects="${4:-}"
        cleanup_scope="${5:-}"
        key_findings="${6:-}"
        scope="${7:-}"
        out_of_scope="${8:-}"
        reference="${9:-}"
    else
        # Legacy positional mode (no --type)
        goal="${1:-}"
        background="${2:-}"
        scope="${3:-}"
        out_of_scope="${4:-}"
        reference="${5:-}"
    fi
    
    local in_scope_text out_of_scope_text body
    
    in_scope_text=$(_format_issue_list "$scope" "- " $'- 范围项 1\n- 范围项 2')
    out_of_scope_text=$(_format_issue_list "$out_of_scope" "- " "- 不做的项（原因）")
    
    # Build sections using shared renderer
    local sections=""
    
    # Goal
    sections+=$(_render_issue_section "Goal" "$goal" "<一句话描述目标>")
    sections+=$'\n'
    
    # Background
    sections+=$(_render_issue_section "Background" "$background" "<背景和问题描述>")
    sections+=$'\n'
    
    # Fix-specific audit sections (only for fix type)
    if [[ "$issue_type" == "fix" ]]; then
        sections+=$(_render_issue_section "Confirmed Bugs" "$confirmed_bugs" "<审计确认的具体 bug 列表>")
        sections+=$'\n'
        
        sections+=$(_render_issue_section "Content Model Defects" "$content_model_defects" "<内容模型层面的问题诊断>")
        sections+=$'\n'
        
        sections+=$(_render_issue_section "Cleanup Scope" "$cleanup_scope" "<需要清理的范围>")
        sections+=$'\n'
        
        sections+=$(_render_issue_section "Key Findings" "$key_findings" "<审计关键发现>")
        sections+=$'\n'
    fi
    
    # In Scope
    sections+=$(_render_issue_section "In Scope" "$in_scope_text" $'- 范围项 1\n- 范围项 2')
    sections+=$'\n'
    
    # Out of Scope
    sections+=$(_render_issue_section "Out of Scope" "$out_of_scope_text" "- 不做的项（原因）")
    sections+=$'\n'
    
    # Acceptance Criteria
    sections+=$(_render_issue_section "Acceptance Criteria" "" "待 plan 阶段细化")
    sections+=$'\n'
    
    # Related Resources table
    sections+="## Related Resources"$'\n\n'
    sections+="| Resource | Link |"$'\n'
    sections+="|----------|------|"$'\n'
    sections+=$(_render_related_resources_row "Research" "$reference")
    sections+="| Plan | _待关联_ |"$'\n'
    
    printf '%s\n' "$sections"
}

# ============================================
# Issue Link Management
# ============================================

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
| |------|------|
| $label | $escaped_value |"
        new_body="${current_body}${link_section}"
    fi

    gh issue edit "$issue_number" --repo "$repo" --body "$new_body" >/dev/null
}

# ============================================
# Issue CRUD Operations
# ============================================

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
#   --confirmed-bugs "<text>"    Confirmed bugs section (fix type only)
#   --content-model-defects "<text>" Content model defects section (fix type only)
#   --cleanup-scope "<text>"     Cleanup scope section (fix type only)
#   --key-findings "<text>"      Key findings section (fix type only)
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
    local confirmed_bugs=""
    local content_model_defects=""
    local cleanup_scope=""
    local key_findings=""

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
            *)
                log_error "Unknown parameter: $1"
                return 1
                ;;
        esac
    done

    [[ -z "$title" ]] && { log_error "Missing --title"; return 1; }
    [[ -z "$project" ]] && { log_error "Missing --project"; return 1; }
    [[ -z "$type" ]] && { log_error "Missing --type"; return 1; }

    # Validate title format and length
    validate_issue_title "$title" || return 1

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
    if [[ -n "$goal" || -n "$background" || -n "$scope" || -n "$out_of_scope" || -n "$reference" || -n "$confirmed_bugs" ]]; then
        if [[ "$plan_type" == "fix" ]]; then
            body=$(build_structured_issue_body --type fix "$goal" "$background" "$confirmed_bugs" "$content_model_defects" "$cleanup_scope" "$key_findings" "$scope" "$out_of_scope" "$reference")
        else
            body=$(build_structured_issue_body "$goal" "$background" "$scope" "$out_of_scope" "$reference")
        fi
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

    # Clean up all flow state labels using shared helper
    clear_all_flow_labels "$issue_number" "$repo"
    ensure_issue_label "$issue_number" "status/done" "$repo"

    log_success "Issue #$issue_number closed"
}

# ============================================
# Project Repo Resolution
# ============================================

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

# ============================================
# PR Operations
# ============================================

# Create PR for Issue
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

##### Case P1: PR validation
- Goal: Confirm PR changes work as expected
- Fixture: PR branch with all changes
- Execution:
  - [ ] Step 1: Review PR diff for correctness
  - [ ] Step 2: Verify CI passes
- Expected Evidence: CI green, manual review approved
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
    update_issue_link "$issue_number" "$space_repo" "pr" "$pr_url"
}

# Create PR for Plan (no Issue mode)
# Usage: create_pr_for_plan <plan_name> --project <project> [--base <branch>] [--draft] [--plan-file <path>]
# Note: PR is created in project repo, without Issue reference.
#   When sourced from flow.sh context, --plan-file avoids redundant find_plan() calls.
#   When called standalone, plan_file is resolved from plan_name via resolve_plan_file().
create_pr_for_plan() {
    local plan_name="$1"
    shift || true
    local project=""
    local base="main"
    local draft=false
    local plan_file=""
    local workspace_root

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
            --plan-file)
                plan_file="$2"
                shift 2
                ;;
            *)
                shift
                ;;
        esac
    done

    [[ -z "$project" ]] && { log_error "Missing --project"; return 1; }
    [[ -z "$plan_name" ]] && { log_error "Missing plan_name"; return 1; }

    workspace_root=$(find_workspace_root)

    # Resolve plan_file if not provided
    if [[ -z "$plan_file" ]]; then
        plan_file=$(resolve_plan_file "$plan_name") || {
            log_error "Cannot find Plan: $plan_name"
            return 1
        }
    fi

    # Extract type from Plan metadata
    local plan_type
    plan_type=$(get_plan_type "$plan_file")

    # Capitalize type for PR title prefix
    local title_prefix
    case "$plan_type" in
        feature)  title_prefix="Feature" ;;
        enhance)  title_prefix="Enhance" ;;
        fix)      title_prefix="Fix" ;;
        refactor) title_prefix="Refactor" ;;
        docs)     title_prefix="Docs" ;;
        chore)    title_prefix="Chore" ;;
        test)     title_prefix="Test" ;;
        *)        title_prefix="Feature" ;;
    esac

    # Extract slug from plan_name (inline to avoid dependency on flow.sh helpers)
    # With Issue: 42-fix-task-wait-bug -> task-wait-bug
    # Without Issue: refactor-optimize-files -> optimize-files
    local slug
    slug=$(echo "$plan_name" | sed -E 's/^[0-9]+-//; s/^(feature|enhance|fix|refactor|docs|chore|test)-//')

    # Convert slug to readable text (e.g., "task-wait-bug" -> "task wait bug")
    local readable_slug
    readable_slug=$(echo "$slug" | sed 's/-/ /g')

    local pr_title="$title_prefix: $readable_slug"

    # Get project repo (PR target)
    local pr_repo
    pr_repo=$(get_project_repo "$project") || return 1

    # Get current branch from project directory
    local project_dir
    project_dir="$workspace_root/projects/$project"

    local current_branch
    current_branch=$(cd "$project_dir" && git branch --show-current)

    if [[ -z "$current_branch" || "$current_branch" == "main" || "$current_branch" == "master" ]]; then
        log_error "Please run this command on a feature branch in project: $project (current: ${current_branch:-detached})"
        return 1
    fi

    # Extract Goal from Plan for PR summary
    local plan_goal
    plan_goal=$(sed -n '/^## Goal/,/^##[^#]/{ /^## Goal/d; /^##[^#]/d; p; }' "$plan_file" | head -5 | sed '/^$/d')

    # Generate PR body (no Issue reference)
    local pr_body
    pr_body=$(cat << EOF
## Summary

${plan_goal:-Implement $readable_slug}

## Related Plan

Plan: \`$plan_name\`

## Changes

- Change item 1
- Change item 2

## Test Plan

##### Case P1: PR validation
- Goal: Confirm PR changes work as expected
- Fixture: PR branch with all changes
- Execution:
  - [ ] Step 1: Review PR diff for correctness
  - [ ] Step 2: Verify CI passes
- Expected Evidence: CI green, manual review approved
EOF
)

    log_info "Creating PR in $pr_repo..."
    log_info "Title: $pr_title"
    log_info "Branch: $current_branch -> $base"

    local pr_url
    if [[ "$draft" == true ]]; then
        pr_url=$(cd "$project_dir" && gh pr create --repo "$pr_repo" --base "$base" --title "$pr_title" --body "$pr_body" --draft)
    else
        pr_url=$(cd "$project_dir" && gh pr create --repo "$pr_repo" --base "$base" --title "$pr_title" --body "$pr_body")
    fi

    log_success "PR created: $pr_url"

    echo "$pr_url"
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

# Export marker for sourced mode
true
