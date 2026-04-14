#!/bin/bash
# labels.sh - Dev-Flow Label Domain Library
#
# Usage: source this file to use functions
#   source lib/labels.sh
#
# Provides:
#   - Label catalog (status/type/project/validation/pr)
#   - Type normalization and mapping
#   - Status/Project to label mapping
#   - Label CRUD and group sync operations
#   - Validation/PR label helpers
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
# Label Catalog (bash 3.x compatible)
# ============================================

# Status label names (3-state model)
get_status_label_names() {
    echo "status/planning status/in-progress"
}

# Type label names
get_type_label_names() {
    echo "type/feature type/bug type/refactor type/docs type/chore"
}

# Validation label names
get_validation_label_names() {
    echo "validation/awaiting validation/passed"
}

# PR label names
get_pr_label_names() {
    echo "pr/opened"
}

# All dev-flow label names
get_all_flow_label_names() {
    echo "status/planning status/in-progress validation/awaiting validation/passed pr/opened"
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
        # Status labels (main)
        status/planning)    printf 'fbca04\tPlanning\n' ;;
        status/in-progress) printf '1d76db\tCurrently in progress\n' ;;
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
# Status to Label Mapping
# ============================================

# Map plan status to Issue label (3-state model)
# Usage: plan_status_to_issue_label <plan_status>
# Output: status label or empty string (empty for done/closed)
plan_status_to_issue_label() {
    local plan_status="$1"
    case "$plan_status" in
        planning)  echo "status/planning" ;;
        executing) echo "status/in-progress" ;;
        done)      echo "" ;;  # Issue closed, no status label
        *)         echo "" ;;
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

# Ensure a label exists in the repo
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
# Status Label Group Sync
# ============================================

# Sync status label group (remove all other status labels, add desired)
# Usage: sync_status_label_group <issue_number> <desired_label> [repo]
sync_status_label_group() {
    local issue_number="$1"
    local desired_label="$2"
    local repo="${3:-}"
    sync_issue_label_group "$issue_number" "$desired_label" "$repo" \
        "status/planning" "status/in-progress"
}

# ============================================
# Type Label Group Sync
# ============================================

# Sync type label group (remove all other type labels, add desired)
# Usage: sync_type_label_group <issue_number> <desired_label> [repo]
sync_type_label_group() {
    local issue_number="$1"
    local desired_label="$2"
    local repo="${3:-}"
    sync_issue_label_group "$issue_number" "$desired_label" "$repo" \
        "type/feature" "type/bug" "type/refactor" "type/docs" "type/chore"
}

# ============================================
# Project Label Group Sync
# ============================================

# Sync project label group (remove all other project labels, add desired)
# Usage: sync_project_label_group <issue_number> <desired_label> [repo]
sync_project_label_group() {
    local issue_number="$1"
    local desired_label="$2"
    local repo="${3:-}"
    sync_issue_label_group "$issue_number" "$desired_label" "$repo" \
        "project/ontology" "project/wopal-cli" "project/space"
}

# ============================================
# Validation Label Helpers
# ============================================

# Add validation label to issue
# Usage: add_validation_label <issue_number> <label_type> [repo]
# label_type: awaiting or passed
add_validation_label() {
    local issue_number="$1"
    local label_type="$2"
    local repo
    repo=$(_labels_resolve_repo "${3:-}")

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

# Add validation label as overlay (keep main status)
# Usage: add_validation_overlay_label <issue_number> <label_type> [repo]
# label_type: awaiting or passed
add_validation_overlay_label() {
    local issue_number="$1"
    local label_type="$2"
    local repo
    repo=$(_labels_resolve_repo "${3:-}")
    
    case "$label_type" in
        awaiting|passed) ;;
        *)
            log_error "Invalid validation label type: $label_type"
            return 1
            ;;
    esac
    
    local label="validation/$label_type"
    
    # Remove other validation labels (keep status labels)
    remove_issue_label "$issue_number" "validation/awaiting" "$repo"
    remove_issue_label "$issue_number" "validation/passed" "$repo"
    
    # Add new validation label (overlay, main status preserved)
    ensure_issue_label "$issue_number" "$label" "$repo"
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

    # Remove validation labels
    local validation_labels
    validation_labels=$(get_validation_label_names)
    for label in $validation_labels; do
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