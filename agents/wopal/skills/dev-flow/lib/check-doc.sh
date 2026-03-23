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
# Helper Functions
# ============================================

# Extract plan type from metadata (priority) or filename (fallback)
# Usage: _extract_plan_type <plan_file>
# Output: plan type (feature/fix/enhance/refactor/docs/test) or empty string
_extract_plan_type() {
    local plan_file="$1"
    
    # Priority 1: Read from metadata "- **Type**:"
    local type_line
    type_line="$(grep -m1 '^\- \*\*Type\*\*:' "$plan_file" 2>/dev/null || true)"
    if [[ -n "$type_line" ]]; then
        # Extract type value
        local type_value
        type_value=$(echo "$type_line" | sed 's/^\- \*\*Type\*\*: *//' | tr '[:upper:]' '[:lower:]')
        # Validate against known types
        case "$type_value" in
            feature|fix|enhance|refactor|docs|test)
                echo "$type_value"
                return 0
                ;;
        esac
    fi
    
    # Priority 2: Extract from filename
    local plan_basename
    plan_basename=$(basename "$plan_file" .md)
    local known_types="feature enhance fix refactor docs test"
    for t in $known_types; do
        if [[ "$plan_basename" =~ ^$t- ]] || [[ "$plan_basename" =~ -$t- ]] || [[ "$plan_basename" =~ -$t$ ]]; then
            echo "$t"
            return 0
        fi
    done
    
    # Unknown type
    echo ""
}

# Remove code blocks from content for placeholder detection
# Usage: _remove_code_blocks <content>
# Output: content without code blocks
_remove_code_blocks() {
    local content="$1"
    # Remove fenced code blocks (```...```)
    echo "$content" | sed '/^```/,/^```/d'
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
    # 1. Check for placeholders (exclude code blocks)
    # ============================================
    local placeholder_found=""
    # Remove code blocks before checking for placeholders
    local plan_content_no_codeblocks
    plan_content_no_codeblocks=$(_remove_code_blocks "$(cat "$plan_file")")
    
    if echo "$plan_content_no_codeblocks" | grep -nE 'TODO|FIXME|待补充|REQ-xxx|path/to/|\[[^]]*任务名称[^]]*\]' > /dev/null 2>&1; then
        echo "Found placeholders:"
        echo "$plan_content_no_codeblocks" | grep -nE 'TODO|FIXME|待补充|REQ-xxx|path/to/|\[[^]]*任务名称[^]]*\]' | head -5
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
    # 3. Extract plan type (metadata priority, filename fallback)
    # ============================================
    local plan_type
    plan_type=$(_extract_plan_type "$plan_file")
    
    if [[ -n "$plan_type" ]]; then
        _check_success "Plan type: $plan_type"
    else
        _check_warn "Plan type not detected (no Type metadata or filename pattern)"
    fi

    # ============================================
    # 4. PRD validation (optional for all types)
    # ============================================
    local prd_line prd_path
    prd_line="$(grep -m1 '^\- \*\*PRD\*\*:' "$plan_file" || true)"
    if [[ "$prd_line" =~ \`([^\`]+)\` ]]; then
        prd_path="${BASH_REMATCH[1]}"
    else
        prd_path=""
    fi

    # PRD is optional for all plan types (changed from mandatory for feature)
    if [[ -n "$prd_path" && "$prd_path" != *"待关联"* ]]; then
        if [[ ! -f "${root_dir}/$prd_path" ]]; then
            _check_warn "PRD file not found: $prd_path"
            ((warnings++))
        else
            _check_success "PRD linked: $prd_path"
        fi
    else
        _check_success "No PRD (optional)"
    fi

    # ============================================
    # 5. Required sections (all English titles)
    # ============================================
    local missing_sections=0
    for section in "## Goal" "## In Scope" "## Out of Scope" "## Files" "## Implementation" "## Acceptance Criteria"; do
        if grep -q "$section" "$plan_file"; then
            _check_success "$section"
        else
            echo "Missing section: $section"
            ((issues++))
            ((missing_sections++))
        fi
    done

    # ============================================
    # 5.1 Spike investigation sections (recommended)
    # ============================================
    local spike_sections="## Technical Context## Affected Components## Code References"
    for section in "## Technical Context" "## Affected Components" "## Code References"; do
        if grep -q "$section" "$plan_file"; then
            _check_success "$section (spike investigation)"
        else
            _check_warn "Missing $section (recommended for spike investigation)"
            ((warnings++))
        fi
    done

    # ============================================
    # 6. Check Scope Assessment section
    # ============================================
    if grep -q '^## Scope Assessment' "$plan_file"; then
        # Check for Complexity and Confidence
        if grep -q '^\- \*\*Complexity\*\*:' "$plan_file" && \
           grep -q '^\- \*\*Confidence\*\*:' "$plan_file"; then
            _check_success "## Scope Assessment"
        else
            echo "Scope Assessment missing Complexity or Confidence"
            ((issues++))
        fi
    else
        echo "Missing section: ## Scope Assessment"
        ((issues++))
    fi

    # ============================================
    # 7. File list must not be empty
    # ============================================
    local file_section
    file_section=$(grep -A 10 '^## Files' "$plan_file" || true)
    if echo "$file_section" | grep -qE '(\- `|^\| .*\.|^\| `)' 2>/dev/null; then
        _check_success "File list populated"
    else
        echo "Empty file list"
        ((issues++))
    fi

    # ============================================
    # 8. Tasks must exist
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
    # 9. Each task must have verification command
    # ============================================
    local verify_count
    verify_count="$(grep -c '^\*\*Verification\*\*:' "$plan_file" || true)"

    if [[ "${task_count:-0}" -gt 0 ]]; then
        if [[ "${verify_count:-0}" -lt "${task_count:-0}" ]]; then
            echo "Some tasks are missing verification commands ($verify_count/$task_count)"
            ((issues++))
        else
            _check_success "All tasks have verification commands"
        fi
    fi

    # ============================================
    # 10. Granularity check (heuristic)
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
    # 11. Test Plan section (recommended)
    # ============================================
    if grep -q '^## Test Plan' "$plan_file"; then
        _check_success "## Test Plan"
    else
        _check_warn "Missing ## Test Plan (recommended)"
        ((warnings++))
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
    for section in "## Goal" "## In Scope" "## Files"; do
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