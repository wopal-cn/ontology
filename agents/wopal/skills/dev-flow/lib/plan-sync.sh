#!/bin/bash
# plan-sync.sh - Plan to Issue Synchronization Library
#
# Usage: source this file to use functions
#   source lib/plan-sync.sh
#
# Provides:
#   - Plan content extraction and normalization
#   - Issue body construction from approved plan
#   - Plan-to-Issue sync operations
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

# ============================================
# Plan to Issue Sync
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
    
    # Status label using shared helper
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

# Export marker for sourced mode
true