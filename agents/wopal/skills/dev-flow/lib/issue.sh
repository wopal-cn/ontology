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
# Output: kebab-case slug (max 30 chars)
title_to_slug() {
    local title="$1"
    echo "$title" | tr '[:upper:]' '[:lower:]' | \
        sed 's/[^a-z0-9]/-/g' | \
        sed 's/--*/-/g' | \
        sed 's/^-//' | \
        sed 's/-$//' | \
        cut -c1-30
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
    local label_args=""
    for label in "${labels[@]}"; do
        label_args="$label_args --label $label"
    done

    _info "Creating Issue: $title"
    _info "Project: $project, Type: $type"

    local issue_url
    if [[ -n "$assignee" ]]; then
        issue_url=$(gh issue create --repo "$repo" --title "$title" --body "$body" $label_args --assignee "$assignee")
    else
        issue_url=$(gh issue create --repo "$repo" --title "$title" --body "$body" $label_args)
    fi

    _success "Issue created: $issue_url"

    # Extract Issue number
    local issue_number
    issue_number=$(echo "$issue_url" | grep -oE '[0-9]+$')
    echo ""
    echo "Issue Number: #$issue_number"

    echo "$issue_number"
}

# Close Issue
# Usage: close_issue <issue_number> [--comment "<message>"] [repo]
close_issue() {
    local issue_number="$1"
    shift || true
    local repo="${1:-}"
    local comment=""

    # Parse optional args
    while [[ $# -gt 0 ]]; do
        case $1 in
            --comment)
                comment="$2"
                shift 2
                ;;
            *)
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

    # Update label
    gh issue edit "$issue_number" --repo "$repo" --add-label "status/done" 2>/dev/null || true

    _success "Issue #$issue_number closed"
}

# Create PR
# Usage: create_pr <issue_number> [--base <branch>] [--draft]
create_pr() {
    local issue_number="$1"
    shift || true
    local base="main"
    local draft=false

    while [[ $# -gt 0 ]]; do
        case $1 in
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

    local repo
    repo=$(get_space_repo)

    _info "Getting Issue #$issue_number info..."

    local issue_info
    issue_info=$(get_issue_info "$issue_number" "$repo")

    local title
    title=$(echo "$issue_info" | jq -r '.title')

    # Get current branch
    local current_branch
    current_branch=$(git branch --show-current)

    if [[ -z "$current_branch" || "$current_branch" == "main" || "$current_branch" == "master" ]]; then
        _error "Please run this command on a feature branch (current: ${current_branch:-detached})"
        return 1
    fi

    # Generate PR body
    local pr_body
    pr_body=$(cat << EOF
## Summary

Implements #$issue_number

## Related Issue

Refs $repo#$issue_number

## Changes

- Change item 1
- Change item 2

## Test Plan

- [ ] Test item 1
- [ ] Test item 2
EOF
)

    _info "Creating PR..."
    _info "Title: $title"
    _info "Branch: $current_branch -> $base"

    local pr_url
    if [[ "$draft" == true ]]; then
        pr_url=$(gh pr create --repo "$repo" --base "$base" --title "$title" --body "$pr_body" --draft)
    else
        pr_url=$(gh pr create --repo "$repo" --base "$base" --title "$title" --body "$pr_body")
    fi

    _success "PR created: $pr_url"

    # Update Issue
    gh issue edit "$issue_number" --repo "$repo" --add-label "status/in-review" 2>/dev/null || true
    update_issue_link "$issue_number" "$repo" "pr" "$pr_url"
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

# Export functions for use in other scripts
if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
    # Sourced mode - functions are already available
    :
fi