#!/bin/bash
# check-doc.sh - Plan Document Quality Check Library
#
# Usage: source this file to use functions
#   source lib/check-doc.sh
#
# Functions:
#   check_doc_plan() - Check Plan document completeness

set -e

# ============================================
# Color Output Constants
# ============================================

readonly CHECK_RED='\033[0;31m'
readonly CHECK_GREEN='\033[0;32m'
readonly CHECK_YELLOW='\033[0;33m'
readonly CHECK_BLUE='\033[0;34m'
readonly CHECK_NC='\033[0m'

_check_info() { echo -e "${CHECK_BLUE}[INFO]${CHECK_NC} $1"; }
_check_success() { echo -e "${CHECK_GREEN}[OK]${CHECK_NC} $1"; }
_check_warn() { echo -e "${CHECK_YELLOW}[WARN]${CHECK_NC} $1"; }
_check_error() { echo -e "${CHECK_RED}[ERROR]${CHECK_NC} $1" >&2; }

# ============================================
# Auto-detect Workspace Root
# ============================================

_check_find_root() {
    local search_dir="${1:-$(pwd)}"
    while [[ "$search_dir" != "/" ]]; do
        if [[ -d "$search_dir/.wopal" ]]; then
            echo "$search_dir"
            return 0
        fi
        if [[ "$(basename "$search_dir")" == ".wopal" ]]; then
            echo "$(dirname "$search_dir")"
            return 0
        fi
        search_dir="$(dirname "$search_dir")"
    done
    git rev-parse --show-toplevel 2>/dev/null || echo "."
}

# ============================================
# Check Functions
# ============================================

# Check Plan document completeness (execution-grade quality gate)
# Usage: check_doc_plan <plan_file>
# Returns: 0 if passed, 1 if failed
# Output: verification results
check_doc_plan() {
    local plan_file="$1"

    if [[ ! -f "$plan_file" ]]; then
        _check_error "Plan file not found: $plan_file"
        return 1
    fi

    local issues=0
    local warnings=0

    echo "Verifying: $plan_file"
    echo ""

    # Get workspace root for file existence checks
    local root_dir
    root_dir=$(_check_find_root)

    # ============================================
    # 1. Check for placeholders
    # ============================================
    local placeholder_found=""
    if grep -nE 'TODO|FIXME|待补充|REQ-xxx|path/to/|\[[^]]*任务名称[^]]*\]' "$plan_file" > /dev/null 2>&1; then
        echo "Found placeholders:"
        grep -nE 'TODO|FIXME|待补充|REQ-xxx|path/to/|\[[^]]*任务名称[^]]*\]' "$plan_file" | head -5
        ((issues++))
        placeholder_found="yes"
    else
        _check_success "No placeholders"
    fi

    # ============================================
    # 2. Check for unclosed HTML comments
    # ============================================
    if grep -n '<!--' "$plan_file" | grep -v '<!--.*-->' > /dev/null 2>&1; then
        echo "Found unclosed HTML comments:"
        grep -n '<!--' "$plan_file" | grep -v '<!--.*-->' | head -5
        ((issues++))
    elif [[ -z "$placeholder_found" ]]; then
        _check_success "No HTML comment placeholders"
    fi

    # ============================================
    # 3. Extract plan type from filename
    # ============================================
    local plan_type=""
    local plan_basename
    plan_basename=$(basename "$plan_file" .md)
    local known_types="feature enhance fix refactor docs test"
    for t in $known_types; do
        if [[ "$plan_basename" =~ -$t- ]] || [[ "$plan_basename" =~ -$t$ ]]; then
            plan_type="$t"
            break
        fi
    done

    # ============================================
    # 4. PRD validation with type-based requirements
    # ============================================
    local prd_line prd_path
    prd_line="$(grep -m1 '^\- \*\*PRD\*\*:' "$plan_file")"
    if [[ "$prd_line" =~ \`([^\`]+)\` ]]; then
        prd_path="${BASH_REMATCH[1]}"
    else
        prd_path=""
    fi

    if [[ "$plan_type" == "feature" ]]; then
        # feature type MUST have PRD
        if [[ -z "$prd_path" || "$prd_path" == *"待关联"* || ! -f "${root_dir}/$prd_path" ]]; then
            echo "feature type plan MUST have PRD: ${prd_path:-<none>}"
            ((issues++))
        else
            _check_success "PRD linked: $prd_path"
        fi
    else
        # Other types: PRD optional
        if [[ -n "$prd_path" && "$prd_path" != *"待关联"* ]]; then
            if [[ ! -f "${root_dir}/$prd_path" ]]; then
                _check_warn "PRD file not found: $prd_path"
                ((warnings++))
            else
                _check_success "PRD linked: $prd_path (optional for $plan_type)"
            fi
        else
            _check_success "No PRD (optional for ${plan_type:-unknown} type)"
        fi
    fi

    # ============================================
    # 5. Required sections
    # ============================================
    local missing_sections=0
    for section in "## 目标" "## In Scope" "## Out of Scope" "## 文件清单" "## 实施步骤" "## 验收标准"; do
        if grep -q "$section" "$plan_file"; then
            _check_success "$section"
        else
            echo "Missing section: $section"
            ((issues++))
            ((missing_sections++))
        fi
    done

    # ============================================
    # 6. File list must not be empty
    # ============================================
    local file_section
    file_section=$(grep -A 10 '^## 文件清单' "$plan_file")
    if echo "$file_section" | grep -qE '(\- `|^\| .*\.|^\| `)' 2>/dev/null; then
        _check_success "File list populated"
    else
        echo "Empty file list"
        ((issues++))
    fi

    # ============================================
    # 7. Tasks must exist
    # ============================================
    local task_count
    task_count="$(grep -c '^### Task ' "$plan_file" || true)"
    if [[ "${task_count:-0}" -eq 0 ]]; then
        echo "No tasks found"
        ((issues++))
    else
        _check_success "Task count: $task_count"
    fi

    # ============================================
    # 8. Each task must have PRD requirement mapping and verification command
    # ============================================
    local prd_req_count verify_count
    prd_req_count="$(grep -c '^\*\*关联 PRD 需求\*\*:' "$plan_file" || true)"
    verify_count="$(grep -c '^\*\*验证\*\*:' "$plan_file" || true)"

    if [[ "${task_count:-0}" -gt 0 ]]; then
        # PRD requirement mapping only required for feature type
        if [[ "$plan_type" == "feature" ]]; then
            if [[ "${prd_req_count:-0}" -lt "${task_count:-0}" ]]; then
                echo "Some tasks are missing PRD requirement mapping ($prd_req_count/$task_count)"
                ((issues++))
            else
                _check_success "All tasks map to PRD requirements"
            fi
        else
            _check_success "PRD mapping not required for ${plan_type:-unknown} type"
        fi

        if [[ "${verify_count:-0}" -lt "${task_count:-0}" ]]; then
            echo "Some tasks are missing verification commands ($verify_count/$task_count)"
            ((issues++))
        else
            _check_success "All tasks have verification commands"
        fi
    fi

    # ============================================
    # 9. Granularity check (heuristic)
    # ============================================
    local checkbox_count
    checkbox_count="$(grep -c '^- \[ \] Step ' "$plan_file" || true)"
    if [[ "${checkbox_count:-0}" -lt "${task_count:-0}" ]]; then
        _check_warn "Task granularity may be too coarse (steps: $checkbox_count, tasks: $task_count)"
        ((warnings++))
    else
        _check_success "Basic step granularity present"
    fi

    # ============================================
    # Summary
    # ============================================
    echo ""
    if [[ $issues -gt 0 ]]; then
        echo "Plan failed verification ($issues issues, $warnings warnings)"
        return 1
    fi

    echo "Plan verification passed ($warnings warnings)"
    return 0
}

# Quick validation (less strict, for draft phase)
# Usage: check_doc_plan_quick <plan_file>
check_doc_plan_quick() {
    local plan_file="$1"

    if [[ ! -f "$plan_file" ]]; then
        _check_error "Plan file not found: $plan_file"
        return 1
    fi

    local issues=0

    echo "Quick validation: $plan_file"

    # Check for obvious placeholders only
    if grep -qE 'REQ-xxx|path/to/' "$plan_file"; then
        echo "  Has obvious placeholders"
        ((issues++))
    else
        echo "  No obvious placeholders"
    fi

    # Check required sections exist
    for section in "## 目标" "## In Scope" "## 文件清单"; do
        if grep -q "$section" "$plan_file"; then
            echo "  Has $section"
        else
            echo "  Missing $section"
            ((issues++))
        fi
    done

    if [[ $issues -gt 0 ]]; then
        return 1
    fi

    return 0
}

# Export functions for use in other scripts
if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
    # Sourced mode - functions are already available
    :
fi