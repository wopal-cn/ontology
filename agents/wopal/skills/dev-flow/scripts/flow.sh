#!/bin/bash
# dev-flow — 统一开发工作流 (3-state model)
# Usage: flow.sh <command> <issue> [options]
#
# Commands:
#   new-issue           创建规范化的 Issue
#   plan <issue>        创建 Plan 并进入规划阶段
#   approve <issue>     提交审批 → 执行
#   complete <issue>    标记完成
#   archive <issue>     归档
#   status <issue>      查看任务状态
#   list                列出进行中任务
#   decompose-prd <prd> 从 PRD 创建 Issue
#   reset <issue>       重置到 planning 状态
#   help                显示帮助

set -e

# ============================================
# Path Detection & Library Loading
# ============================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"

# Load libraries in correct dependency order:
# common -> plan -> labels -> issue -> plan-sync -> state-machine -> check-doc
source "$SKILL_DIR/lib/common.sh"
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
        local issue_line
        if grep -q "Issue.*#$issue_number" "$plan_file" 2>/dev/null; then
            echo "$plan_file"
            return 0
        fi
    done < <(find "$search_dir" -name "*.md" -not -path "*/done/*" -print0 2>/dev/null)

    return 1
}

# Extract slug from plan name (last segment)
extract_slug() {
    local plan_name="$1"
    echo "$plan_name" | sed -E 's/^[0-9]+-[a-z]+-([a-z0-9-]+)$/\1/'
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
source "$SKILL_DIR/scripts/cmd/new-issue.sh"
source "$SKILL_DIR/scripts/cmd/plan.sh"
source "$SKILL_DIR/scripts/cmd/approve.sh"
source "$SKILL_DIR/scripts/cmd/complete.sh"
source "$SKILL_DIR/scripts/cmd/archive.sh"
source "$SKILL_DIR/scripts/cmd/query.sh"

# ============================================
# Main Entry Point
# ============================================

case "${1:-help}" in
    new-issue)      shift; cmd_new_issue "$@" ;;
    plan)           shift; cmd_plan "$@" ;;
    approve)        shift; cmd_approve "$@" ;;
    complete)       shift; cmd_complete "$@" ;;
    archive)        shift; cmd_archive "$@" ;;
    status)         shift; cmd_status "$@" ;;
    list)           shift; cmd_list "$@" ;;
    decompose-prd)  shift; cmd_decompose_prd "$@" ;;
    reset)          shift; cmd_reset "$@" ;;
    help|--help|-h) cmd_help ;;
    # Old command compatibility (deprecated)
    create)         shift; log_warn "'create' is deprecated, use 'new-issue'"; cmd_new_issue "$@" ;;
    start)          shift; log_warn "'start' is deprecated, use 'plan'"; cmd_plan "$@" ;;
    spike)          shift; log_warn "'spike' is deprecated (embedded in plan)"; exit 0 ;;
    dev)            shift; log_warn "'dev' is deprecated, use 'approve --confirm'"; exit 0 ;;
    validate)       shift; log_warn "'validate' is deprecated, use 'archive --confirm'"; exit 0 ;;
    *)
        log_error "Unknown command: $1"
        cmd_help
        exit 1
        ;;
esac
