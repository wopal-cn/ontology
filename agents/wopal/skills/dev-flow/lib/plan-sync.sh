#!/bin/bash
# plan-sync.sh - Plan to Issue Synchronization Library
#
# Usage: source this file to use functions
#   source lib/plan-sync.sh
#
# Provides:
#   - Plan content extraction and normalization
#   - Issue body construction from approved plan
#   - Plan-to-Issue sync operations (including AC checkboxes)
#   - Issue label synchronization from Plan metadata
#
# Dependencies: common.sh, plan.sh, labels.sh
# Guard: DEV_FLOW_PLAN_SYNC_LOADED

# Prevent duplicate loading
if [[ -n "${DEV_FLOW_PLAN_SYNC_LOADED:-}" ]]; then
    return 0
fi
readonly DEV_FLOW_PLAN_SYNC_LOADED=1

set -e

# Load dependencies
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
source "$SKILL_DIR/lib/common.sh"
source "$SKILL_DIR/lib/plan.sh"
source "$SKILL_DIR/lib/labels.sh"

# ============================================
# Plan Content Extraction
# ============================================

# Extract a markdown section body from a plan file
# Handles fenced code blocks (```) — only matches ## headings outside code blocks
# Usage: _extract_plan_section <plan_file> <section> [limit]
_extract_plan_section() {
    local plan_file="$1"
    local section="$2"
    local limit="$3"

    awk -v sec="^## $section" -v lim="$limit" '
    BEGIN { in_code = 0; found = 0; count = 0 }
    /^```/ { in_code = !in_code; next }
    !in_code && $0 ~ sec { found = 1; next }
    found && !in_code && /^##[^#]/ { exit }
    found && !in_code { print; count++; if (count >= lim) exit }
    ' "$plan_file"
}

# Extract Acceptance Criteria section (including Agent/User sub-sections)
# Usage: _extract_acceptance_criteria <plan_file>
# Output: full Acceptance Criteria section content
_extract_acceptance_criteria() {
    local plan_file="$1"
    
    # Extract from ## Acceptance Criteria to next ## heading
    sed -n '/^## Acceptance Criteria/,/^##[^#]/{ /^## Acceptance Criteria/d; /^##[^#]/d; p; }' "$plan_file"
}

# Normalize a section value with placeholder fallback
# Usage: _issue_section_value <value> <placeholder_pattern> <fallback> [require_marker]
# When placeholder_pattern is empty, skip placeholder check
_issue_section_value() {
    local value="$1"
    local placeholder_pattern="$2"
    local fallback="$3"
    local require_marker="${4:-}"

    if [[ -n "$require_marker" ]] && ! echo "$value" | grep -qF -- "$require_marker"; then
        printf '%s\n' "$fallback"
        return 0
    fi

    if [[ -z "$value" ]]; then
        printf '%s\n' "$fallback"
    elif [[ -n "$placeholder_pattern" ]] && echo "$value" | grep -qF -- "$placeholder_pattern"; then
        printf '%s\n' "$fallback"
    else
        printf '%s\n' "$value"
    fi
}

# ============================================
# Issue Body Construction
# ============================================

# Build normalized issue body from approved plan content
# Usage: build_issue_body_from_plan <plan_file> <plan_name>
# This preserves checkbox states from Agent Verification
build_issue_body_from_plan() {
    local plan_file="$1"
    local plan_name="$2"
    local repo="${3:-}"
    local goal background in_scope out_of_scope acceptance_criteria project plan_path

    goal=$(_issue_section_value "$(_extract_plan_section "$plan_file" "Goal" 5 | sed '/^$/d')" "一句话描述" "<目标描述>")
    background=$(_issue_section_value "$(_extract_plan_section "$plan_file" "Technical Context" 20 | sed '/^$/d')" "<当前架构" "<背景描述>")
    in_scope=$(_issue_section_value "$(_extract_plan_section "$plan_file" "In Scope" 50)" "" "- 范围项 1" "-")
    out_of_scope=$(_issue_section_value "$(_extract_plan_section "$plan_file" "Out of Scope" 20)" "<本次不做" "- 不做的项（原因）")
    
    # Extract full Acceptance Criteria section (preserves checkboxes)
    acceptance_criteria=$(_extract_acceptance_criteria "$plan_file")
    if [[ -z "$acceptance_criteria" ]]; then
        acceptance_criteria="- 验收条件 1"
    fi
    
    project=$(get_plan_project "$plan_file")

    # Build Plan link: use GitHub blob URL for clickable link in Issue
    repo=$(_resolve_repo "${repo:-}")
    if [[ -n "$project" ]]; then
        plan_path="docs/products/${project}/plans/${plan_name}.md"
    else
        plan_path="docs/products/plans/${plan_name}.md"
    fi
    local github_url="https://github.com/${repo}/blob/main/${plan_path}"

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
| Plan | [$plan_name]($github_url) |
EOF
}

# ============================================
# Plan to Issue Sync
# ============================================

# Sync approved plan to Issue body (called at approve and complete)
# Usage: sync_plan_to_issue <issue_number> <plan_file> [repo]
# This replaces the entire Issue body with normalized content from Plan
# Preserves Agent Verification checkbox states
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
    
    log_info "Syncing plan to Issue #$issue_number..."
    
    local plan_name
    plan_name=$(basename "$plan_file" .md)
    local new_body
    new_body=$(build_issue_body_from_plan "$plan_file" "$plan_name" "$repo")
    
    # Update Issue body (replace entire body)
    gh issue edit "$issue_number" --repo "$repo" --body "$new_body" >/dev/null && \
        log_success "Issue #$issue_number updated with plan content" || \
        log_warn "Failed to update Issue #$issue_number"
}

# ============================================
# Issue Label Sync
# ============================================

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
    
    # Extract metadata from Plan using plan.sh accessors
    local plan_type plan_project plan_status
    
    plan_type=$(get_plan_type "$plan_file")
    plan_project=$(get_plan_project "$plan_file")
    plan_status=$(get_plan_status_value "$plan_file")
    
    local status_label=""
    local type_label=""
    local project_label=""
    
    # Status label using shared helper (4-state model)
    status_label=$(plan_status_to_issue_label "$plan_status")
    
    # Type label
    if [[ -n "$plan_type" ]]; then
        local normalized_type
        normalized_type=$(normalize_plan_type "$plan_type" 2>/dev/null || true)
        if [[ -n "$normalized_type" ]]; then
            type_label=$(plan_type_to_issue_label "$normalized_type")
        fi
    fi
    
    # Project label using shared helper
    project_label=$(plan_project_to_issue_label "$plan_project")

    # Use shared group sync helpers
    sync_status_label_group "$issue_number" "$status_label" "$repo"
    sync_type_label_group "$issue_number" "$type_label" "$repo"
    sync_project_label_group "$issue_number" "$project_label" "$repo"
}

# ============================================
# Plan Link Update (after archive)
# ============================================

# Update Issue Plan link after archive
# Usage: update_issue_plan_link <issue_number> <archived_file> [repo]
# This updates the Plan link in Related Resources table to the archived path
update_issue_plan_link() {
    local issue_number="$1"
    local archived_file="$2"
    local repo
    repo=$(_resolve_repo "${3:-}")
    
    if [[ ! -f "$archived_file" ]]; then
        log_warn "Archived plan file not found: $archived_file"
        return 1
    fi
    
    if ! command -v gh &> /dev/null; then
        log_warn "gh CLI not available, skipping Plan link update"
        return 0
    fi
    
    local plan_name
    plan_name=$(basename "$archived_file" .md)
    
    # Build relative path from docs/products
    # archived_file is like: /path/to/docs/products/ontology/plans/done/20260414-plan.md
    # We need: ontology/plans/done/20260414-plan.md
    local relative_path
    local root_dir
    root_dir=$(find_workspace_root)
    relative_path=$(realpath --relative-to="$root_dir/docs/products" "$archived_file" 2>/dev/null || \
        echo "ontology/plans/done/$(basename "$archived_file")")
    
    # Build GitHub blob URL for clickable link in Issue
    local github_url="https://github.com/${repo}/blob/main/docs/products/${relative_path}"
    
    # Get current Issue body
    local current_body
    current_body=$(gh issue view "$issue_number" --repo "$repo" --json body --jq '.body')
    
    # Update Plan link in Related Resources table
    # Pattern: | Plan | [plan-name](old-url-or-path) |
    # Use # as sed delimiter to avoid conflict with table |
    local new_body
    new_body=$(echo "$current_body" | sed -E "s#\[$plan_name\]\([^)]*\)#[$plan_name]($github_url)#")

    # If Plan link not found by name, try updating the whole row
    if [[ "$new_body" == "$current_body" ]]; then
        # Pattern: | Plan | [any-name](any-url-or-path) |
        new_body=$(echo "$current_body" | sed -E "s#(\| Plan \| \[)[^]]+\]\([^)]*\)#\1$plan_name]($github_url)#")
    fi
    
    gh issue edit "$issue_number" --repo "$repo" --body "$new_body" >/dev/null && \
        log_success "Issue #$issue_number Plan link updated to archived path" || \
        log_warn "Failed to update Issue #$issue_number Plan link"
}

# Export marker for sourced mode
true