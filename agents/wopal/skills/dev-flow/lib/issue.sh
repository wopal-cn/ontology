#!/bin/bash
# issue.sh - GitHub Issue Operations Library
#
# Usage: source this file to use functions
#   source lib/issue.sh
#
# Functions:
#   get_issue_info()      - Get Issue info (gh issue view wrapper)
#   extract_project()     - Extract Target Project from Issue body
#   update_issue_label()  - Update Issue Label
#   update_issue_link()   - Update Issue body link table
#   create_issue()        - Create Issue
#   close_issue()         - Close Issue
#   create_pr()           - Create PR
#   get_space_repo()      - Get space repo info
#   title_to_slug()       - Generate slug from title

set -euo pipefail

# ============================================
# Color Output Constants
# ============================================

readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[0;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
_success() { echo -e "${GREEN}[OK]${NC} $1"; }
_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
_error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }

# ============================================
# Find Workspace Root
# ============================================

_find_workspace_root() {
    local dir="${1:-$(pwd)}"
    while [[ "$dir" != "/" ]]; do
        if [[ -f "$dir/.workspace.md" ]]; then
            echo "$dir"
            return 0
        fi
        # Also check for .wopal
        if [[ -d "$dir/.wopal" ]]; then
            echo "$dir"
            return 0
        fi
        dir=$(dirname "$dir")
    done
    # Fallback to git root
    git rev-parse --show-toplevel 2>/dev/null || echo "."
}

# ============================================
# Issue Functions
# ============================================

# Get space repo info (owner/repo)
# Usage: get_space_repo
# Output: owner/repo string
get_space_repo() {
    local workspace_root
    workspace_root=$(_find_workspace_root)

    if ! command -v gh &> /dev/null; then
        _error "gh CLI not available"
        return 1
    fi

    cd "$workspace_root"
    gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || {
        _error "Cannot get repo info. Ensure you're in a git repo with gh CLI configured"
        return 1
    }
}

# Generate slug from title (kebab-case)
# Usage: title_to_slug "<title>"
# Output: kebab-case slug (max 50 chars)
title_to_slug() {
    local title="$1"
    echo "$title" | tr '[:upper:]' '[:lower:]' | \
        sed 's/[^a-z0-9]/-/g' | \
        sed 's/--*/-/g' | \
        sed 's/^-//' | \
        sed 's/-$//' | \
        cut -c1-50
}

# Get Issue info
# Usage: get_issue_info <issue_number> [repo]
# Output: JSON with title, body, number, state, labels
get_issue_info() {
    local issue_number="$1"
    local repo="${2:-}"

    if [[ -z "$repo" ]]; then
        repo=$(get_space_repo)
    fi

    if ! command -v gh &> /dev/null; then
        _error "gh CLI not available"
        return 1
    fi

    gh issue view "$issue_number" --repo "$repo" --json title,body,number,state,labels
}

# Extract Target Project from Issue body
# Usage: extract_project "<body>"
# Output: project name or empty string
extract_project() {
    local body="$1"

    # Match "- [x] agent-tools" format
    if echo "$body" | grep -q '\- \[x\] agent-tools'; then
        echo "agent-tools"
    elif echo "$body" | grep -q '\- \[x\] wopal-cli'; then
        echo "wopal-cli"
    elif echo "$body" | grep -q '\- \[x\] space'; then
        echo "space"
    elif echo "$body" | grep -q '\- \[x\] other:'; then
        # Extract project name from "other: `name`"
        echo "$body" | grep '\- \[x\] other:' | sed 's/.*other: `\([^`]*\)`.*/\1/' | head -1
    else
        echo ""
    fi
}

# Update Issue Label
# Usage: update_issue_label <issue_number> <action> <label> [repo]
# Action: add or remove
update_issue_label() {
    local issue_number="$1"
    local action="$2"
    local label="$3"
    local repo="${4:-}"

    if [[ -z "$repo" ]]; then
        repo=$(get_space_repo)
    fi

    if ! command -v gh &> /dev/null; then
        _warn "gh CLI not available, skipping label update"
        return 0
    fi

    case "$action" in
        add)
            gh issue edit "$issue_number" --repo "$repo" --add-label "$label" 2>/dev/null && \
                _success "Issue #$issue_number label added: $label" || \
                _warn "Failed to add label to Issue #$issue_number"
            ;;
        remove)
            gh issue edit "$issue_number" --repo "$repo" --remove-label "$label" 2>/dev/null || true
            ;;
        *)
            _error "Invalid action: $action (use 'add' or 'remove')"
            return 1
            ;;
    esac
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
        _warn "gh CLI not available, skipping issue link update"
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
            _error "Invalid link type: $link_type"
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

    gh issue edit "$issue_number" --repo "$repo" --body "$new_body"
}

# Create Issue
# Usage: create_issue --title "<title>" --project <project> --type <type> [options]
# Options:
#   --body "<body>"      Issue body content
#   --label "<label>"    Additional labels (can be used multiple times)
#   --assignee "<user>"  Assignee
create_issue() {
    local title=""
    local project=""
    local type=""
    local body=""
    local labels=()
    local assignee=""

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
            *)
                _error "Unknown parameter: $1"
                return 1
                ;;
        esac
    done

    [[ -z "$title" ]] && { _error "Missing --title"; return 1; }
    [[ -z "$project" ]] && { _error "Missing --project"; return 1; }
    [[ -z "$type" ]] && { _error "Missing --type"; return 1; }

    local repo
    repo=$(get_space_repo)

    # Build labels
    labels+=("status/planning" "type/$type" "project/$project")

    _info "Creating Issue: $title"
    _info "Project: $project, Type: $type"

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

    _success "Issue created: $issue_url"

    # Extract Issue number
    local issue_number
    issue_number=$(echo "$issue_url" | grep -oE '[0-9]+$')
    echo ""
    echo "Issue Number: #$issue_number"

    echo "$issue_number"
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

    _info "Closing Issue #$issue_number..."

    if [[ -n "$comment" ]]; then
        gh issue comment "$issue_number" --repo "$repo" --body "$comment"
    fi

    gh issue close "$issue_number" --repo "$repo"

    # Clean up all flow state labels
    for label in "status/planning" "status/approved" "status/in-progress" "status/in-review"; do
        gh issue edit "$issue_number" --repo "$repo" --remove-label "$label" 2>/dev/null || true
    done
    for label in "pr/opened" "validation/awaiting" "validation/passed"; do
        gh issue edit "$issue_number" --repo "$repo" --remove-label "$label" 2>/dev/null || true
    done
    gh issue edit "$issue_number" --repo "$repo" --add-label "status/done" 2>/dev/null || true

    _success "Issue #$issue_number closed"
}

# Get project repo from project name
# Usage: get_project_repo <project_name>
# Output: owner/repo string
get_project_repo() {
    local project="$1"
    local workspace_root
    workspace_root=$(_find_workspace_root)
    
    local project_dir="$workspace_root/projects/$project"
    
    if [[ ! -d "$project_dir" ]]; then
        _error "Project directory not found: $project_dir"
        return 1
    fi
    
    cd "$project_dir"
    gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || {
        _error "Cannot get repo info for project: $project"
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

    [[ -z "$project" ]] && { _error "Missing --project"; return 1; }

    local space_repo
    space_repo=$(get_space_repo)

    _info "Getting Issue #$issue_number info..."

    local issue_info
    issue_info=$(get_issue_info "$issue_number" "$space_repo")

    local title
    title=$(echo "$issue_info" | jq -r '.title')

    # Get project repo (PR target)
    local pr_repo
    pr_repo=$(get_project_repo "$project") || return 1

    # Get current branch from project directory
    local workspace_root project_dir
    workspace_root=$(_find_workspace_root)
    project_dir="$workspace_root/projects/$project"
    
    local current_branch
    current_branch=$(cd "$project_dir" && git branch --show-current)

    if [[ -z "$current_branch" || "$current_branch" == "main" || "$current_branch" == "master" ]]; then
        _error "Please run this command on a feature branch in project: $project (current: ${current_branch:-detached})"
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

    _info "Creating PR in $pr_repo..."
    _info "Title: $title"
    _info "Branch: $current_branch -> $base"

    local pr_url
    if [[ "$draft" == true ]]; then
        pr_url=$(cd "$project_dir" && gh pr create --repo "$pr_repo" --base "$base" --title "$title" --body "$pr_body" --draft)
    else
        pr_url=$(cd "$project_dir" && gh pr create --repo "$pr_repo" --base "$base" --title "$title" --body "$pr_body")
    fi

    _success "PR created: $pr_url"

    # Update Issue in space repo
    gh issue edit "$issue_number" --repo "$space_repo" --add-label "status/in-review" 2>/dev/null || true
    update_issue_link "$issue_number" "$space_repo" "pr" "$pr_url"
}

# Check if gh CLI is available
# Usage: check_gh_cli
check_gh_cli() {
    if ! command -v gh &> /dev/null; then
        _error "gh CLI is required but not installed"
        _info "Install: brew install gh"
        return 1
    fi

    # Check if authenticated
    if ! gh auth status &> /dev/null; then
        _error "gh CLI is not authenticated"
        _info "Run: gh auth login"
        return 1
    fi

    return 0
}

# ============================================
# Label Management (bash 3.x compatible)
# ============================================

# Get label properties: color and description
# Usage: _get_label_props <label_name>
# Output: "color:description"
_get_label_props() {
    local label_name="$1"
    case "$label_name" in
        # Status labels (main)
        status/planning)    echo "fbca04:Planning or investigating" ;;
        status/approved)    echo "0e8a16:Plan approved, ready to execute" ;;
        status/in-progress) echo "1d76db:Currently in progress" ;;
        status/done)        echo "5319e7:Completed" ;;
        # Validation sub-labels
        validation/awaiting) echo "fef2c0:Awaiting user validation" ;;
        validation/passed)   echo "c2e0c6:User validation passed" ;;
        # PR sub-labels
        pr/opened)          echo "bfdadc:PR created, awaiting review" ;;
        # Type labels
        type/feature)       echo "1d76db:New feature" ;;
        type/bug)           echo "d73a4a:Bug fix" ;;
        type/refactor)      echo "cfd3d0:Code refactoring" ;;
        type/docs)          echo "0075ca:Documentation" ;;
        type/chore)         echo "f9d0c4:Chore/maintenance" ;;
        # Project labels
        project/agent-tools) echo "5319e7:agent-tools project" ;;
        project/wopal-cli)   echo "1d76db:wopal-cli project" ;;
        project/space)       echo "0e8a16:space-level changes" ;;
        # Unknown label - generic color
        *)                  echo "dddddd:" ;;
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
        _warn "gh CLI not available, skipping label creation"
        return 0
    fi

    # Check if label exists
    if gh label view "$label_name" --repo "$repo" &> /dev/null; then
        return 0
    fi

    # Get label definition
    local label_def
    label_def=$(_get_label_props "$label_name")
    local color="${label_def%%:*}"
    local description="${label_def#*:}"

    _info "Creating label: $label_name"
    gh label create "$label_name" --repo "$repo" --color "$color" --description "$description" 2>/dev/null && \
        _success "Label created: $label_name" || \
        _warn "Failed to create label: $label_name (may already exist)"

    return 0
}

# Ensure all dev-flow labels exist
# Usage: ensure_flow_labels_exist [repo]
ensure_flow_labels_exist() {
    local repo="${1:-}"

    if [[ -z "$repo" ]]; then
        repo=$(get_space_repo)
    fi

    _info "Ensuring dev-flow labels exist in $repo..."

    local label_names
    label_names=$(_get_flow_label_names)
    for label_name in $label_names; do
        ensure_label_exists "$label_name" "$repo"
    done

    _success "All dev-flow labels ready"
}

# Add validation label to issue
# Usage: add_validation_label <issue_number> <label_type> [repo]
# label_type: awaiting or passed
add_validation_label() {
    local issue_number="$1"
    local label_type="$2"
    local repo="${3:-}"

    if [[ -z "$repo" ]]; then
        repo=$(get_space_repo)
    fi

    local label="validation/$label_type"
    ensure_label_exists "$label" "$repo"
    
    # Remove other validation labels first
    gh issue edit "$issue_number" --repo "$repo" --remove-label "validation/awaiting" 2>/dev/null || true
    gh issue edit "$issue_number" --repo "$repo" --remove-label "validation/passed" 2>/dev/null || true
    
    # Add new label
    gh issue edit "$issue_number" --repo "$repo" --add-label "$label" 2>/dev/null && \
        _success "Issue #$issue_number label added: $label" || \
        _warn "Failed to add label to Issue #$issue_number"
}

# Add PR label to issue
# Usage: add_pr_label <issue_number> [repo]
add_pr_label() {
    local issue_number="$1"
    local repo="${2:-}"

    if [[ -z "$repo" ]]; then
        repo=$(get_space_repo)
    fi

    local label="pr/opened"
    ensure_label_exists "$label" "$repo"
    
    gh issue edit "$issue_number" --repo "$repo" --add-label "$label" 2>/dev/null && \
        _success "Issue #$issue_number label added: $label" || \
        _warn "Failed to add label to Issue #$issue_number"
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
    
    local pr_info
    pr_info=$(parse_pr_url "$pr_url")
    
    if [[ -z "$pr_info" ]]; then
        return 1
    fi
    
    local pr_repo pr_number
    read -r pr_repo pr_number <<< "$pr_info"
    
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

# Sync approved plan to Issue body (called at approve --confirm)
# Usage: sync_plan_to_issue <issue_number> <plan_file> [repo]
# This updates Issue body with confirmed requirements/solution from Plan
sync_plan_to_issue() {
    local issue_number="$1"
    local plan_file="$2"
    local repo="${3:-}"
    
    if [[ -z "$repo" ]]; then
        repo=$(get_space_repo)
    fi
    
    if [[ ! -f "$plan_file" ]]; then
        _warn "Plan file not found: $plan_file"
        return 1
    fi
    
    if ! command -v gh &> /dev/null; then
        _warn "gh CLI not available, skipping issue sync"
        return 0
    fi
    
    _info "Syncing approved plan to Issue #$issue_number..."
    
    # Get current Issue body
    local current_body
    current_body=$(gh issue view "$issue_number" --repo "$repo" --json body -q .body)
    
    # Extract sections from Plan (requirements/solution level, not implementation details)
    local goal scope_assessment technical_context affected_components in_scope out_of_scope risks
    
    # Extract Goal
    goal=$(sed -n '/^## Goal/,/^##[^#]/{ /^## Goal/d; /^##[^#]/d; p; }' "$plan_file" | sed '/^$/d' | head -5)
    
    # Extract Scope Assessment
    scope_assessment=$(sed -n '/^## Scope Assessment/,/^##[^#]/{ /^## Scope Assessment/d; /^##[^#]/d; p; }' "$plan_file")
    
    # Extract Technical Context
    technical_context=$(sed -n '/^## Technical Context/,/^##[^#]/{ /^## Technical Context/d; /^##[^#]/d; p; }' "$plan_file" | sed '/^$/d' | head -20)
    
    # Extract Affected Components
    affected_components=$(sed -n '/^## Affected Components/,/^##[^#]/{ /^## Affected Components/d; /^##[^#]/d; p; }' "$plan_file" | head -15)
    
    # Extract In Scope
    in_scope=$(sed -n '/^## In Scope/,/^##[^#]/{ /^## In Scope/d; /^##[^#]/d; p; }' "$plan_file" | head -15)
    
    # Extract Out of Scope
    out_of_scope=$(sed -n '/^## Out of Scope/,/^##[^#]/{ /^## Out of Scope/d; /^##[^#]/d; p; }' "$plan_file" | head -10)
    
    # Extract Risks & Open Questions
    risks=$(sed -n '/^## Risks \& Open Questions/,/^##[^#]/{ /^## Risks \& Open Questions/d; /^##[^#]/d; p; }' "$plan_file" | head -10)
    
    # Build approved plan section
    local plan_section=""
    local has_content=false
    
    # Goal (skip placeholder)
    if [[ -n "$goal" ]] && ! echo "$goal" | grep -qF "一句话描述"; then
        plan_section+="
## Goal

$goal
"
        has_content=true
    fi
    
    # Scope Assessment (skip placeholder)
    if [[ -n "$scope_assessment" ]] && ! echo "$scope_assessment" | grep -qF "Low|Medium|High"; then
        plan_section+="
## Scope Assessment

$scope_assessment
"
        has_content=true
    fi
    
    # Technical Context (skip placeholder)
    if [[ -n "$technical_context" ]] && ! echo "$technical_context" | grep -qF "<当前架构"; then
        plan_section+="
## Technical Context

$technical_context
"
        has_content=true
    fi
    
    # Affected Components
    if [[ -n "$affected_components" ]] && echo "$affected_components" | grep -qF '|'; then
        plan_section+="
## Affected Components

$affected_components
"
        has_content=true
    fi
    
    # In Scope
    if [[ -n "$in_scope" ]] && echo "$in_scope" | grep -qF '-'; then
        plan_section+="
## In Scope

$in_scope
"
        has_content=true
    fi
    
    # Out of Scope
    if [[ -n "$out_of_scope" ]] && ! echo "$out_of_scope" | grep -qF "<本次不做"; then
        plan_section+="
## Out of Scope

$out_of_scope
"
        has_content=true
    fi
    
    # Risks (skip placeholder)
    if [[ -n "$risks" ]] && ! echo "$risks" | grep -qF "<风险"; then
        plan_section+="
## Risks

$risks
"
        has_content=true
    fi
    
    if [[ "$has_content" != true ]]; then
        _warn "No plan content found to sync"
        return 0
    fi
    
    # Check if approved plan section already exists
    local marker="<!-- APPROVED_PLAN_START -->"
    local marker_end="<!-- APPROVED_PLAN_END -->"
    local new_body
    
    if echo "$current_body" | grep -qF "$marker"; then
        # Replace existing section using awk
        local temp_file section_file
        temp_file=$(mktemp)
        section_file=$(mktemp)
        echo "$current_body" > "$temp_file"
        {
            echo "$marker"
            echo "$plan_section"
            echo "$marker_end"
        } > "$section_file"
        
        new_body=$(awk '
            BEGIN { in_marker=0; }
            /<!-- APPROVED_PLAN_START -->/ { 
                in_marker=1; 
                while ((getline line < "'"$section_file"'") > 0) print line;
                close("'"$section_file"'");
                next; 
            }
            /<!-- APPROVED_PLAN_END -->/ { in_marker=0; next; }
            in_marker { next; }
            { print; }
        ' "$temp_file")
        
        rm -f "$temp_file" "$section_file"
    else
        # Append section before "关联资源" or at the end
        if echo "$current_body" | grep -q "## 关联资源"; then
            local temp_file section_file
            temp_file=$(mktemp)
            section_file=$(mktemp)
            echo "$current_body" > "$temp_file"
            {
                echo "$marker"
                echo "$plan_section"
                echo "$marker_end"
            } > "$section_file"
            
            new_body=$(awk '
                /## 关联资源/ {
                    while ((getline line < "'"$section_file"'") > 0) print line;
                    close("'"$section_file"'");
                }
                { print; }
            ' "$temp_file")
            
            rm -f "$temp_file" "$section_file"
        else
            new_body="$current_body

---

$marker
$plan_section
$marker_end"
        fi
    fi
    
    # Update Issue body
    gh issue edit "$issue_number" --repo "$repo" --body "$new_body" && \
        _success "Issue #$issue_number updated with approved plan" || \
        _warn "Failed to update Issue #$issue_number"
}

# Ensure Issue has correct labels based on Plan metadata
# Usage: ensure_issue_labels <issue_number> <plan_file> [repo]
# This ensures status, type, and project labels are correct
ensure_issue_labels() {
    local issue_number="$1"
    local plan_file="$2"
    local repo="${3:-}"
    
    if [[ -z "$repo" ]]; then
        repo=$(get_space_repo)
    fi
    
    if [[ ! -f "$plan_file" ]]; then
        _warn "Plan file not found: $plan_file"
        return 1
    fi
    
    if ! command -v gh &> /dev/null; then
        _warn "gh CLI not available, skipping label sync"
        return 0
    fi
    
    _info "Ensuring Issue #$issue_number labels are correct..."
    
    # Extract metadata from Plan
    local plan_type plan_project plan_status
    
    plan_type=$(grep -m1 '^\- \*\*Type\*\*:' "$plan_file" | sed 's/^.*: //' | tr '[:upper:]' '[:lower:]')
    plan_project=$(grep -m1 '^\- \*\*Target Project\*\*:' "$plan_file" | sed 's/^.*: //')
    plan_status=$(grep -m1 '^\- \*\*Status\*\*:' "$plan_file" | sed 's/^.*: //')
    
    # Get current labels
    local current_labels
    current_labels=$(gh issue view "$issue_number" --repo "$repo" --json labels -q '.labels[].name' 2>/dev/null | tr '\n' ' ')
    
    # Labels to add
    local labels_to_add=()
    
    # Status label based on plan status
    case "$plan_status" in
        investigating|planning)
            labels_to_add+=("status/planning")
            ;;
        approved)
            labels_to_add+=("status/approved")
            ;;
        executing)
            labels_to_add+=("status/in-progress")
            ;;
        done)
            labels_to_add+=("status/done")
            ;;
    esac
    
    # Type label
    if [[ -n "$plan_type" ]]; then
        case "$plan_type" in
            feature|enhance)
                labels_to_add+=("type/feature")
                ;;
            fix)
                labels_to_add+=("type/bug")
                ;;
            refactor)
                labels_to_add+=("type/refactor")
                ;;
            docs)
                labels_to_add+=("type/docs")
                ;;
            test|chore)
                labels_to_add+=("type/chore")
                ;;
        esac
    fi
    
    # Project label
    if [[ -n "$plan_project" ]]; then
        case "$plan_project" in
            agent-tools|wopal-cli|space)
                labels_to_add+=("project/$plan_project")
                ;;
        esac
    fi
    
    # Ensure labels exist and add them
    local added_count=0
    for label in "${labels_to_add[@]}"; do
        # Ensure label exists
        ensure_label_exists "$label" "$repo"
        
        # Check if already has this label
        if echo "$current_labels" | grep -qF "$label"; then
            continue
        fi
        
        # Add label
        if gh issue edit "$issue_number" --repo "$repo" --add-label "$label" 2>/dev/null; then
            _success "Added label: $label"
            ((added_count++))
        fi
    done
    
    if [[ $added_count -eq 0 ]]; then
        _info "All labels already correct"
    else
        _success "Updated $added_count labels on Issue #$issue_number"
    fi
}

# Export functions for use in other scripts
# (no-op: functions are available when sourced)
true