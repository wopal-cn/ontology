#!/bin/bash
# labels.sh - Dev-Flow Label Domain Library
#
# Usage: source this file to use functions
#   source lib/labels.sh
#
# Provides:
#   - Label catalog (status/type/project/pr)
#   - Type normalization and mapping
#   - Status/Project to label mapping
#   - Label CRUD and group sync operations
#   - PR label helpers
#
# Guard: DEV_FLOW_LABELS_LOADED

# Prevent duplicate loading
if [[ -n "${DEV_FLOW_LABELS_LOADED:-}" ]]; then
    return 0
fi
readonly DEV_FLOW_LABELS_LOADED=1

# Load shared utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
source "$SKILL_DIR/lib/common.sh"

# ============================================
# Label Cache (bash 3.x compatible)
# ============================================

# Global cache: stores label names for a single repo (newline-separated)
# Cache is per-process — lasts for one script invocation
_LABELS_CACHE=""
_LABELS_CACHE_REPO=""

# Get all labels from cache, populating on first access
# Usage: _get_all_labels_cached <repo>
# Output: newline-separated label names
_get_all_labels_cached() {
    local repo="$1"

    if [[ -z "$repo" ]]; then
        return 0
    fi

    if [[ -n "${_LABELS_CACHE:-}" && "${_LABELS_CACHE_REPO:-}" == "$repo" ]]; then
        echo "$_LABELS_CACHE"
        return 0
    fi

    _LABELS_CACHE=$(gh label list --repo "$repo" --json name -q '.[].name' 2>/dev/null || echo "")
    _LABELS_CACHE_REPO="$repo"
    echo "${_LABELS_CACHE:-}"
}

# ============================================
# Label Catalog (bash 3.x compatible)
# ============================================

# Status label names (4-state model + done for closed state)
get_status_label_names() {
    echo "status/planning status/in-progress status/verifying status/done"
}

# Type label names
get_type_label_names() {
    echo "type/feature type/bug type/refactor type/docs type/chore"
}

# PR label names
get_pr_label_names() {
    echo "pr/opened"
}

# All dev-flow label names
get_all_flow_label_names() {
    echo "status/planning status/in-progress status/verifying status/done pr/opened"
}

# ============================================
# Label Properties (color + description)
# ============================================

# Get label properties: color and description
# Usage: _get_label_props <label_name>
# Output: tab-separated "color<TAB>description"
_get_label_props() {
    local label_name="$1"
    case "$label_name" in
        # Status labels (main - 4-state + done)
        status/planning)    printf 'fbca04\tPlanning\n' ;;
        status/in-progress) printf '1d76db\tCurrently in progress\n' ;;
        status/verifying)   printf '5319e7\tAwaiting user verification\n' ;;
        status/done)        printf '0e8a16\tUser validation passed\n' ;;
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

# ============================================
# Type Normalization and Mapping
# ============================================

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

# ============================================
# Status to Label Mapping (4-state model)
# ============================================

# Map plan status to Issue label (4-state model + done)
# Usage: plan_status_to_issue_label <plan_status>
# Output: status label
plan_status_to_issue_label() {
    local plan_status="$1"
    case "$plan_status" in
        planning)   echo "status/planning" ;;
        executing)  echo "status/in-progress" ;;
        verifying)  echo "status/verifying" ;;
        done)       echo "status/done" ;;
        *)          echo "" ;;
    esac
}

# ============================================
# Project to Label Mapping
# ============================================

# Map project name to Issue label
# Usage: plan_project_to_issue_label <project_name>
# Output: project label or empty string
plan_project_to_issue_label() {
    local project="$1"
    case "$project" in
        ontology|wopal-cli|space)
            echo "project/$project"
            ;;
        *)
            echo ""
            ;;
    esac
}

# ============================================
# Label CRUD Operations
# ============================================

# Resolve repo argument - labels.sh does NOT depend on issue.sh
# If repo not provided, returns empty string (caller must handle)
_labels_resolve_repo() {
    echo "${1:-}"
}

# Ensure a label exists in the repo (using cache)
# Usage: ensure_label_exists <label_name> [repo]
# Returns: 0 on success, 1 on failure
ensure_label_exists() {
    local label_name="$1"
    local repo
    repo=$(_labels_resolve_repo "${2:-}")

    if [[ -z "$repo" ]]; then
        log_warn "No repo specified, skipping label creation"
        return 0
    fi

    if ! command -v gh &> /dev/null; then
        log_warn "gh CLI not available, skipping label creation"
        return 0
    fi

    # Check cache first (zero network overhead if cached)
    if echo "$(_get_all_labels_cached "$repo")" | grep -qxF "$label_name"; then
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
    local repo
    repo=$(_labels_resolve_repo "${1:-}")

    if [[ -z "$repo" ]]; then
        return 0
    fi

    local label_names
    label_names=$(get_all_flow_label_names)
    for label_name in $label_names; do
        ensure_label_exists "$label_name" "$repo"
    done
}

# ============================================
# Issue Label Query Operations
# ============================================

# Get current labels for an issue
# Usage: get_issue_labels <issue_number> [repo]
get_issue_labels() {
    local issue_number="$1"
    local repo
    repo=$(_labels_resolve_repo "${2:-}")

    if ! command -v gh &> /dev/null; then
        echo ""
        return 0
    fi

    gh issue view "$issue_number" --repo "$repo" --json labels -q '.labels[].name' 2>/dev/null | tr '\n' ' ' || true
}

# Check whether an issue already has a label
# Usage: issue_has_label <issue_number> <label> [repo]
issue_has_label() {
    local issue_number="$1"
    local label="$2"
    local labels
    labels=$(get_issue_labels "$issue_number" "${3:-}")
    echo "$labels" | grep -qF "$label"
}

# ============================================
# Issue Label Modification Operations
# ============================================

# Ensure an issue has a specific label
# Usage: ensure_issue_label <issue_number> <label> [repo]
ensure_issue_label() {
    local issue_number="$1"
    local label="$2"
    local repo
    repo=$(_labels_resolve_repo "${3:-}")

    if [[ -z "$repo" ]]; then
        log_warn "No repo specified, cannot add label"
        return 1
    fi

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
# Usage: remove_issue_label <issue_number> <label> [repo]
remove_issue_label() {
    local issue_number="$1"
    local label="$2"
    local repo
    repo=$(_labels_resolve_repo "${3:-}")

    if [[ -z "$repo" ]]; then
        return 0
    fi

    gh issue edit "$issue_number" --repo "$repo" --remove-label "$label" >/dev/null 2>/dev/null || true
}

# ============================================
# Batch Label Operations (bash 3.x compatible)
# ============================================

# Batch sync labels on an issue (single API call)
# Usage: batch_sync_issue_labels <issue_number> <repo> <add_labels> <remove_labels>
# add_labels/remove_labels: space-separated label names
batch_sync_issue_labels() {
    local issue_number="$1"
    local repo="$2"
    local add_labels="$3"
    local remove_labels="$4"

    if [[ -z "$repo" ]]; then
        return 0
    fi

    # Use subshell + set to build args (bash 3.x compatible, no arrays)
    local has_ops=0
    for label in $remove_labels; do
        has_ops=1
    done
    for label in $add_labels; do
        has_ops=1
    done

    if [[ "$has_ops" -eq 0 ]]; then
        return 0
    fi

    # Build args in subshell, execute single gh call
    (
        set --
        for label in $remove_labels; do
            set -- "$@" --remove-label "$label"
        done
        for label in $add_labels; do
            set -- "$@" --add-label "$label"
        done
        gh issue edit "$issue_number" --repo "$repo" "$@" >/dev/null 2>/dev/null || true
    )
}

# Sync a mutually exclusive label group to a single target label
# Usage: sync_issue_label_group <issue_number> <desired_label> [repo] <group_labels...>
sync_issue_label_group() {
    local issue_number="$1"
    local desired_label="$2"
    local repo
    repo=$(_labels_resolve_repo "${3:-}")
    shift 3

    local label
    for label in "$@"; do
        [[ "$label" == "$desired_label" ]] && continue
        remove_issue_label "$issue_number" "$label" "$repo"
    done

    [[ -z "$desired_label" ]] || ensure_issue_label "$issue_number" "$desired_label" "$repo"
}

# ============================================
# Status Label Group Sync (4-state model)
# ============================================

# Sync status label group (single API call via batch)
# Usage: sync_status_label_group <issue_number> <desired_label> [repo]
sync_status_label_group() {
    local issue_number="$1"
    local desired_label="$2"
    local repo="${3:-}"

    local add_labels=""
    local remove_labels=""

    [[ -n "$desired_label" ]] && add_labels="$desired_label"

    local current
    current=$(get_issue_labels "$issue_number" "$repo")
    for label in status/planning status/in-progress status/verifying status/done; do
        [[ "$label" == "$desired_label" ]] && continue
        echo "$current" | grep -qF "$label" && remove_labels="$remove_labels $label"
    done

    batch_sync_issue_labels "$issue_number" "$repo" "$add_labels" "$remove_labels"
}

# ============================================
# Type Label Group Sync
# ============================================

# Sync type label group (single API call via batch)
# Usage: sync_type_label_group <issue_number> <desired_label> [repo]
sync_type_label_group() {
    local issue_number="$1"
    local desired_label="$2"
    local repo="${3:-}"

    local add_labels=""
    local remove_labels=""

    [[ -n "$desired_label" ]] && add_labels="$desired_label"

    local current
    current=$(get_issue_labels "$issue_number" "$repo")
    for label in type/feature type/bug type/refactor type/docs type/chore; do
        [[ "$label" == "$desired_label" ]] && continue
        echo "$current" | grep -qF "$label" && remove_labels="$remove_labels $label"
    done

    batch_sync_issue_labels "$issue_number" "$repo" "$add_labels" "$remove_labels"
}

# ============================================
# Project Label Group Sync
# ============================================

# Sync project label group (single API call via batch)
# Usage: sync_project_label_group <issue_number> <desired_label> [repo]
sync_project_label_group() {
    local issue_number="$1"
    local desired_label="$2"
    local repo="${3:-}"

    local add_labels=""
    local remove_labels=""

    [[ -n "$desired_label" ]] && add_labels="$desired_label"

    local current
    current=$(get_issue_labels "$issue_number" "$repo")
    for label in project/ontology project/wopal-cli project/space; do
        [[ "$label" == "$desired_label" ]] && continue
        echo "$current" | grep -qF "$label" && remove_labels="$remove_labels $label"
    done

    batch_sync_issue_labels "$issue_number" "$repo" "$add_labels" "$remove_labels"
}

# ============================================
# PR Label Helpers
# ============================================

# Add PR label to issue
# Usage: add_pr_label <issue_number> [repo]
add_pr_label() {
    local issue_number="$1"
    local repo
    repo=$(_labels_resolve_repo "${2:-}")

    ensure_issue_label "$issue_number" "pr/opened" "$repo"
}

# ============================================
# Cleanup Helpers
# ============================================

# Clear all flow state labels from an issue (used when closing)
# Usage: clear_all_flow_labels <issue_number> [repo]
clear_all_flow_labels() {
    local issue_number="$1"
    local repo
    repo=$(_labels_resolve_repo "${2:-}")

    if [[ -z "$repo" ]]; then
        return 0
    fi

    # Remove status labels
    local status_labels
    status_labels=$(get_status_label_names)
    for label in $status_labels; do
        remove_issue_label "$issue_number" "$label" "$repo"
    done

    # Remove PR labels
    local pr_labels
    pr_labels=$(get_pr_label_names)
    for label in $pr_labels; do
        remove_issue_label "$issue_number" "$label" "$repo"
    done
}

# Export marker for sourced mode
true