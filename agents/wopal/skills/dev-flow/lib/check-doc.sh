#!/bin/bash
# check-doc.sh - Plan Document Quality Check Library
#
# Usage: source this file to use functions
#   source lib/check-doc.sh
#
# Provides:
#   - Plan document completeness validation
#   - Placeholder detection
#   - Required section verification
#
# Dependencies: common.sh, plan.sh, labels.sh
# Guard: DEV_FLOW_CHECK_DOC_LOADED

# Prevent duplicate loading
if [[ -n "${DEV_FLOW_CHECK_DOC_LOADED:-}" ]]; then
    return 0
fi
readonly DEV_FLOW_CHECK_DOC_LOADED=1

set -e

# Load dependencies
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
source "$SKILL_DIR/lib/common.sh"
source "$SKILL_DIR/lib/plan.sh"
source "$SKILL_DIR/lib/labels.sh"

# ============================================
# Helper Functions
# ============================================

# Extract plan type from metadata (priority) or filename (fallback)
# Uses shared helpers from plan.sh and labels.sh
# Usage: _extract_plan_type <plan_file>
# Output: plan type (feature/fix/enhance/refactor/docs/test) or empty string
_extract_plan_type() {
    local plan_file="$1"
    
    # Priority 1: Read from metadata using shared accessor
    local type_value
    type_value=$(get_plan_type "$plan_file" 2>/dev/null || true)
    
    if [[ -n "$type_value" ]]; then
        # Normalize using shared helper
        local normalized
        normalized=$(normalize_plan_type "$type_value" 2>/dev/null || true)
        if [[ -n "$normalized" ]]; then
            echo "$normalized"
            return 0
        fi
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
        log_error "Plan file not found: $plan_file"
        return 1
    fi

    local issues=0
    local warnings=0

    echo "Verifying: $plan_file"
    echo ""

    # Get workspace root for file existence checks
    local root_dir
    root_dir=$(find_workspace_root)

    # ============================================
    # 0. File name validation (new naming convention)
    # ============================================
    local plan_basename
    plan_basename=$(basename "$plan_file" .md)

    # Check file name matches format: <issue_number>-<type>-<slug>
    if [[ "$plan_basename" =~ ^([0-9]+)-(feature|enhance|fix|refactor|docs|chore|test)-([a-z0-9-]+)$ ]]; then
        local filename_issue="${BASH_REMATCH[1]}"
        log_success "File name format: valid (issue #${filename_issue})"

        # Verify issue number matches Plan metadata
        local metadata_issue
        metadata_issue=$(grep -m1 '^\- \*\*Issue\*\*: #' "$plan_file" | sed 's/.*#//; s/[^0-9].*//' || true)

        if [[ -n "$metadata_issue" ]]; then
            if [[ "$filename_issue" == "$metadata_issue" ]]; then
                log_success "Issue number consistency: filename #${filename_issue} = metadata #${metadata_issue}"
            else
                echo "Issue number mismatch: filename has #${filename_issue}, metadata has #${metadata_issue}"
                ((issues++))
            fi
        else
            log_warn "Cannot verify issue number: no '**Issue**: #N' found in metadata"
            ((warnings++))
        fi
    else
        echo "File name does not match format '<issue_number>-<type>-<slug>.md': $plan_basename"
        ((issues++))
    fi

    # ============================================
    # 1. Check for placeholders (exclude code blocks)
    # ============================================
    local placeholder_found=""
    # Remove code blocks before checking for placeholders
    local plan_content_no_codeblocks
    plan_content_no_codeblocks=$(_remove_code_blocks "$(cat "$plan_file")")
    
    local placeholder_pattern='(<!\-\- *(TODO|FIXME)|\- \[ \] *(TODO|FIXME)|\*\*(TODO|FIXME)|^[[:space:]]*(TODO|FIXME)[：:])|待补充|REQ-xxx|path/to/|\[[^]]*任务名称[^]]*\]'
    if echo "$plan_content_no_codeblocks" | grep -nE "$placeholder_pattern" > /dev/null 2>&1; then
        echo "Found placeholders:"
        echo "$plan_content_no_codeblocks" | grep -nE "$placeholder_pattern" | head -5
        ((issues++))
        placeholder_found="yes"
    else
        log_success "No placeholders"
    fi

    # ============================================
    # 2. Check for unclosed HTML comments
    # ============================================
    # Count total <!-- and --> using grep -c (avoids option parsing issues)
    local total_opens
    total_opens=$(grep -c '<!--' "$plan_file" 2>/dev/null | tr -d '\n' || echo "0")
    local total_closes
    total_closes=$(grep -c '\-\->' "$plan_file" 2>/dev/null | tr -d '\n' || echo "0")
    local unclosed_count=$((total_opens - total_closes))
    
    if [[ "$unclosed_count" -gt 0 ]]; then
        echo "Found unclosed HTML comments (missing -->):"
        grep -n '<!--' "$plan_file" | head -5
        ((issues++))
    elif [[ -z "$placeholder_found" ]]; then
        log_success "No HTML comment placeholders"
    fi

    # ============================================
    # 3. Extract plan type (metadata priority, filename fallback)
    # ============================================
    local plan_type
    plan_type=$(_extract_plan_type "$plan_file")
    
    if [[ -n "$plan_type" ]]; then
        log_success "Plan type: $plan_type"
    else
        log_warn "Plan type not detected (no Type metadata or filename pattern)"
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
            log_warn "PRD file not found: $prd_path"
            ((warnings++))
        else
            log_success "PRD linked: $prd_path"
        fi
    else
        log_success "No PRD (optional)"
    fi

    # ============================================
    # 5. Required sections (all English titles)
    # ============================================
    local missing_sections=0
    for section in "## Goal" "## In Scope" "## Out of Scope" "## Files" "## Implementation" "## Acceptance Criteria"; do
        if grep -q "$section" "$plan_file"; then
            log_success "$section"
        else
            echo "Missing section: $section"
            ((issues++))
            ((missing_sections++))
        fi
    done

    # ============================================
    # 5.1 Spike investigation sections (recommended)
    # ============================================
    for section in "## Technical Context" "## Affected Components"; do
        if grep -q "$section" "$plan_file"; then
            log_success "$section (spike investigation)"
        else
            log_warn "Missing $section (recommended for spike investigation)"
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
            log_success "## Scope Assessment"
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
        log_success "File list populated"
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
        log_success "Task count: $task_count"
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
            log_success "All tasks have verification commands"
        fi
    fi

    # ============================================
    # 10. Granularity check (heuristic)
    # ============================================
    local checkbox_count
    checkbox_count="$(grep -c '^- \[ \] Step ' "$plan_file" || true)"
    if [[ "${checkbox_count:-0}" -lt "${task_count:-0}" ]]; then
        log_warn "Tasks missing Step checkboxes: use '- [ ] Step N: description' format (found $checkbox_count steps for $task_count tasks)"
        ((warnings++))
    else
        log_success "Basic step granularity present"
    fi

    # ============================================
    # 11. Test Plan section (mandatory with content check)
    # ============================================
    if grep -q '^## Test Plan' "$plan_file"; then
        # Extract Test Plan section content (between ## Test Plan and next ## section)
        local testplan_content
        testplan_content=$(sed -n '/^## Test Plan/,/^## /p' "$plan_file" | sed '1d;$d' | grep -v '^$' || true)

        # Check content is not just N/A or placeholders
        local testplan_lines
        testplan_lines=$(echo "$testplan_content" | grep -vE '^(N/A|n/a|待补充|TODO|- N/A|\- \*\*Unit\*\*: N/A|\- \*\*Integration\*\*: N/A|\- \*\*E2E\*\*: N/A)$' || true)

        if [[ -n "$testplan_lines" ]]; then
            log_success "## Test Plan (has non-empty test descriptions)"
        else
            echo "## Test Plan has no valid content (only N/A or placeholders)"
            ((issues++))
        fi
    else
        echo "Missing ## Test Plan (mandatory for execution-grade plans)"
        ((issues++))
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
        log_error "Plan file not found: $plan_file"
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
