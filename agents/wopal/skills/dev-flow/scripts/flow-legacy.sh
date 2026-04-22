#!/bin/bash
# dev-flow — 统一开发工作流 (4-state model)
# Usage: flow.sh <command> <issue-or-plan> [options]
#
# Commands:
#   issue               创建或更新规范化的 Issue
#   sync <issue-or-plan>        手动同步 Plan 到 Issue
#   plan <issue> | plan --title ...        创建/定位 Plan 并进入规划阶段
#   approve <issue-or-plan>     提交审批 → 执行
#   complete <issue-or-plan>    完成开发 → 验证阶段
#   verify <issue-or-plan>      用户验证 → 完成
#   archive <issue-or-plan>     归档
#   status <issue>      查看任务状态
#   list                列出进行中任务
#   decompose-prd <prd> 从 PRD 创建 Issue
#   reset <issue-or-plan>       重置到 planning 状态
#   help                显示帮助

set -e

# ============================================
# Path Detection & Library Loading
# ============================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"

# Load libraries in correct dependency order:
# common -> git -> plan -> labels -> issue -> plan-sync -> state-machine -> check-doc
source "$SKILL_DIR/lib/common.sh"
source "$SKILL_DIR/lib/git.sh"
source "$SKILL_DIR/lib/plan.sh"
source "$SKILL_DIR/lib/labels.sh"
source "$SKILL_DIR/lib/issue.sh"
source "$SKILL_DIR/lib/plan-sync.sh"
source "$SKILL_DIR/lib/state-machine.sh"
source "$SKILL_DIR/lib/check-doc.sh"

# ============================================
# Global Variables
# ============================================

PLAN_PROJECT=""
ROOT_DIR="$(find_workspace_root)"

# ============================================
# Helper Functions
# ============================================

# Extract plan type from Issue title prefix
_extract_type_from_title() {
    local title="$1"
    local lower_title
    lower_title=$(echo "$title" | tr '[:upper:]' '[:lower:]')
    
    case "$lower_title" in
        fix\(*|fix:*)       echo "fix" ;;
        feat\(*|feat:*)     echo "feature" ;;
        feature\(*|feature:*) echo "feature" ;;
        enhance\(*|enhance:*) echo "enhance" ;;
        perf\(*|perf:*)     echo "perf" ;;
        refactor\(*|refactor:*) echo "refactor" ;;
        chore\(*|chore:*|ci\(*|ci:*) echo "chore" ;;
        docs\(*|docs:*)     echo "docs" ;;
        test\(*|test:*)     echo "test" ;;
        *)                  echo "" ;;
    esac
}

_ensure_arg() {
    local name="$1"
    local value="$2"
    local message="${3:-$name required}"
    if [[ -n "$value" ]]; then
        return 0
    fi
    log_error "$message"
    return 1
}

_require_plan_file() {
    local issue_number="$1"
    find_plan_by_issue "$issue_number" || {
        log_error "No plan found for Issue #$issue_number"
        exit 1
    }
}

_load_plan_context() {
    local issue_number="$1"
    PLAN_FILE=$(_require_plan_file "$issue_number")
    PLAN_NAME=$(get_plan_name "$PLAN_FILE")
    PLAN_STATUS=$(get_current_status "$PLAN_FILE")
}

_resolve_plan_type_from_issue() {
    local title="$1"
    local issue_info="$2"
    local plan_type
    local label

    plan_type=$(_extract_type_from_title "$title")
    if [[ -n "$plan_type" ]]; then
        echo "$plan_type"
        return 0
    fi

    while IFS= read -r label; do
        plan_type=$(issue_label_to_plan_type "$label" 2>/dev/null || true)
        if [[ -n "$plan_type" ]]; then
            echo "$plan_type"
            return 0
        fi
    done < <(echo "$issue_info" | jq -r '.labels[].name' 2>/dev/null || true)

    echo "feature"
}

# Find Plan file by Issue number
find_plan_by_issue() {
    local issue_number="$1"
    local root_dir="$(find_workspace_root)"

    # Dynamically find all project plan directories
    local search_dir="$root_dir/docs/products"
    
    if [[ ! -d "$search_dir" ]]; then
        return 1
    fi

    # Search docs/products/plans/ (global) and docs/products/*/plans/ (project-specific)
    while IFS= read -r -d '' plan_file; do
        local matched_issue
        matched_issue=$(extract_primary_plan_issue "$plan_file" 2>/dev/null || true)
        if [[ "$matched_issue" == "$issue_number" ]]; then
            echo "$plan_file"
            return 0
        fi
    done < <(find "$search_dir" -name "*.md" -print0 2>/dev/null)

    return 1
}

# Find Plan by Issue number OR Plan name (smart lookup)
# Usage: find_plan <issue_or_plan_name>
# - If numeric → find_plan_by_issue
# - If string → search all plan directories (global + project)
find_plan() {
    local input="$1"
    
    if [[ -z "$input" ]]; then
        log_error "Issue number or Plan name required"
        return 1
    fi
    
    # Numeric input → Issue lookup
    if [[ "$input" =~ ^[0-9]+$ ]]; then
        find_plan_by_issue "$input"
        return $?
    fi
    
    # String input → search all plan directories (global + project)
    local root_dir
    root_dir=$(find_workspace_root)
    local search_dir="$root_dir/docs/products"
    
    if [[ ! -d "$search_dir" ]]; then
        log_error "No plan directory found"
        return 1
    fi
    
    # Search: docs/products/plans/ and docs/products/*/plans/
    local matches=()
    while IFS= read -r -d '' plan_file; do
        local plan_name
        plan_name=$(basename "$plan_file" .md)
        # Match by full name or substring
        if [[ "$plan_name" == "$input" || "$plan_name" == *"$input"* ]]; then
            matches+=("$plan_file")
        fi
    done < <(find "$search_dir" -name "*.md" -not -path "*/done/*" -print0 2>/dev/null)
    
    if [[ ${#matches[@]} -eq 0 ]]; then
        log_error "No plan found matching: $input"
        echo "   Searched in: $search_dir/*/plans/" >&2
        return 1
    fi
    
    if [[ ${#matches[@]} -gt 1 ]]; then
        log_error "Multiple plans matched: $input"
        printf '  - %s\n' "${matches[@]}" >&2
        return 1
    fi
    
    echo "${matches[0]}"
}

# Extract slug from plan name (last segment, supports both formats)
# With Issue: 42-fix-task-wait-bug → task-wait-bug
# Without Issue: refactor-optimize-files → optimize-files
extract_slug() {
    local plan_name="$1"
    # Remove issue-number prefix (if present) and type prefix
    echo "$plan_name" | sed -E 's/^[0-9]+-//; s/^(feature|enhance|fix|refactor|docs|chore|test)-//'
}

# Get plan name from file path
get_plan_name() {
    local plan_file="$1"
    basename "$plan_file" .md
}

# ============================================
# Command Implementations (sourced from cmd/)
# ============================================

# source cmd/ files (explicit order — utility.sh first)
source "$SKILL_DIR/scripts/cmd/utility.sh"
source "$SKILL_DIR/scripts/cmd/issue.sh"
source "$SKILL_DIR/scripts/cmd/sync.sh"
source "$SKILL_DIR/scripts/cmd/plan.sh"
source "$SKILL_DIR/scripts/cmd/approve.sh"
source "$SKILL_DIR/scripts/cmd/complete.sh"
source "$SKILL_DIR/scripts/cmd/verify.sh"
source "$SKILL_DIR/scripts/cmd/archive.sh"
source "$SKILL_DIR/scripts/cmd/query.sh"

# ============================================
# Main Entry Point
# ============================================

main() {
    case "${1:-help}" in
        issue)          shift; cmd_issue "$@" ;;
        sync)           shift; cmd_sync "$@" ;;
        plan)           shift; cmd_plan "$@" ;;
        approve)        shift; cmd_approve "$@" ;;
        complete)       shift; cmd_complete "$@" ;;
        verify)         shift; cmd_verify "$@" ;;
        archive)        shift; cmd_archive "$@" ;;
        status)         shift; cmd_status "$@" ;;
        list)           shift; cmd_list "$@" ;;
        decompose-prd)  shift; cmd_decompose_prd "$@" ;;
        reset)          shift; cmd_reset "$@" ;;
        help|--help|-h) cmd_help ;;
        *)
            log_error "Unknown command: $1"
            cmd_help
            exit 1
            ;;
    esac
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
    main "$@"
fi
