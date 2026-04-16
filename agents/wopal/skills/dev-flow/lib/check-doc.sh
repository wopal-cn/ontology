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
    # 0. File name validation (dual naming convention)
    # ============================================
    local plan_basename
    plan_basename=$(basename "$plan_file" .md)

    # Check file name matches one of two formats (scope is mandatory):
    # 1. Issue format: <issue_number>-<type>-<scope>-<slug>
    # 2. No-issue format: <type>-<scope>-<slug>
    local valid_types="feature|enhance|fix|refactor|docs|chore|test"

    # Try Issue format first
    if [[ "$plan_basename" =~ ^([0-9]+)-($valid_types)-([a-z0-9]+)-([a-z0-9-]+)$ ]]; then
        local filename_issue="${BASH_REMATCH[1]}"
        local filename_type="${BASH_REMATCH[2]}"
        local filename_scope="${BASH_REMATCH[3]}"
        log_success "File name format: valid (issue #${filename_issue}, type $filename_type, scope $filename_scope)"

        # Verify issue number matches Plan metadata (only for issue format)
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
    # Try no-issue format
    elif [[ "$plan_basename" =~ ^($valid_types)-([a-z0-9]+)-([a-z0-9-]+)$ ]]; then
        local filename_type="${BASH_REMATCH[1]}"
        local filename_scope="${BASH_REMATCH[2]}"
        log_success "File name format: valid (no-issue, type $filename_type, scope $filename_scope)"
        # No issue number consistency check for no-issue format
    else
        echo "File name does not match valid formats (scope is mandatory):"
        echo "  - '<issue_number>-<type>-<scope>-<slug>.md' (with Issue)"
        echo "  - '<type>-<scope>-<slug>.md' (no Issue)"
        echo "  Got: $plan_basename"
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
    for section in "## Goal" "## In Scope" "## Out of Scope" "## Affected Files" "## Implementation" "## Acceptance Criteria"; do
        if grep -q "$section" "$plan_file"; then
            log_success "$section"
        else
            echo "Missing section: $section"
            ((issues++))
            ((missing_sections++))
        fi
    done

    # ============================================
    # 5.1 Spike investigation sections (required for investigation completeness)
    # ============================================
    for section in "## Technical Context" "## Affected Files"; do
        if grep -q "$section" "$plan_file"; then
            # Check section content is non-empty (extract between section header and next ##)
            local section_content
            section_content=$(sed -n "/^$section/,/^##[^#]/p" "$plan_file" | sed '1d;$d' | grep -v '^$' || true)
            if [[ -z "$section_content" ]]; then
                echo "$section is empty (required for investigation completeness)"
                ((issues++))
            else
                log_success "$section (spike investigation)"
            fi
        else
            echo "Missing $section (required for spike investigation)"
            ((issues++))
        fi
    done

    # ============================================
    # 6. Check Scope Assessment section (non-placeholder)
    # ============================================
    if grep -q '^## Scope Assessment' "$plan_file"; then
        # Extract Complexity and Confidence values
        local complexity_line
        complexity_line=$(grep '^\- \*\*Complexity\*\*:' "$plan_file" || true)
        local confidence_line
        confidence_line=$(grep '^\- \*\*Confidence\*\*:' "$plan_file" || true)
        
        if [[ -z "$complexity_line" || -z "$confidence_line" ]]; then
            echo "Scope Assessment missing Complexity or Confidence"
            ((issues++))
        else
            # Check for placeholder values (Low|Medium|High pattern)
            local complexity_value
            complexity_value=$(echo "$complexity_line" | sed 's/^.*: //')
            local confidence_value
            confidence_value=$(echo "$confidence_line" | sed 's/^.*: //')
            
            # Placeholder check: exact match of "Low|Medium|High" (template pattern)
            if [[ "$complexity_value" == "Low|Medium|High" ]]; then
                echo "Complexity not evaluated (placeholder: '$complexity_value')"
                ((issues++))
            elif [[ "$complexity_value" != "Low" && "$complexity_value" != "Medium" && "$complexity_value" != "High" ]]; then
                echo "Complexity invalid: '$complexity_value' (expected: Low/Medium/High)"
                ((issues++))
            fi
            
            if [[ "$confidence_value" == "High|Medium|Low" ]]; then
                echo "Confidence not evaluated (placeholder: '$confidence_value')"
                ((issues++))
            elif [[ "$confidence_value" != "High" && "$confidence_value" != "Medium" && "$confidence_value" != "Low" ]]; then
                echo "Confidence invalid: '$confidence_value' (expected: High/Medium/Low)"
                ((issues++))
            fi
            
            if [[ $issues -eq 0 ]]; then
                log_success "## Scope Assessment (Complexity: $complexity_value, Confidence: $confidence_value)"
            fi
        fi
    else
        echo "Missing section: ## Scope Assessment"
        ((issues++))
    fi

# ============================================
# 7. Affected Files table must not be empty
# ============================================
local affected_files_section
affected_files_section=$(grep -A 10 '^## Affected Files' "$plan_file" || true)
if echo "$affected_files_section" | grep -qE '^\| .*`|^\| .*file' 2>/dev/null; then
    log_success "Affected Files table populated"
else
    echo "Empty Affected Files table"
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
    # 10. Changes structure check (per-task)
    # Verify each Task's **Changes** block uses '- [ ] Step N:' format
    # ============================================
    local changes_issues=0
    local task_idx=0
    
    # Process each task section
    while IFS= read -r task_header_line; do
        ((task_idx++))
        local task_title
        task_title=$(echo "$task_header_line" | sed 's/^### Task [0-9]*: //')
        
        # Extract content from this task header to next ### or ## section
        local task_content
        task_content=$(awk -v task="$task_idx" '
            /^### Task /{ if (++count == task) { found=1; next } else { found=0 } }
            /^##[^#]/ || (/^### Task / && count != task) { found=0 }
            found { print }
        ' "$plan_file")
        
        # Extract **Changes** block: from **Changes**: to **Verification**:
        local changes_block
        changes_block=$(echo "$task_content" | awk '
            /^\*\*Changes\*\*:/{ found=1; next }
            /^\*\*Verification\*\*:/{ found=0 }
            found { print }
        ')
        
        # Skip if no Changes block (some tasks may not have one)
        if [[ -z "$changes_block" ]]; then
            continue
        fi
        
        # Get non-empty lines in changes block
        local changes_lines
        changes_lines=$(echo "$changes_block" | grep -vE '^[[:space:]]*$' || true)
        
        if [[ -z "$changes_lines" ]]; then
            continue
        fi
        
        # Check: all non-empty lines in Changes must be '- [ ] Step N:' or '- [x] Step N:'
        local bad_lines
        bad_lines=$(echo "$changes_lines" | grep -vE '^\s*-\s+\[[ x]\]\s+Step\s+[0-9]+:' || true)
        
        if [[ -n "$bad_lines" ]]; then
            local bad_count
            bad_count=$(echo "$bad_lines" | grep -cE '^\s*[0-9]+[\.\)]\s' || echo "0")
            if [[ "$bad_count" -gt 0 ]]; then
                echo "Task $task_idx '$task_title': **Changes** uses numbered list instead of '- [ ] Step N:' format"
                ((changes_issues++))
            else
                # Other non-step content (comments, blank lines OK, but actual content items must be steps)
                local non_step_content
                non_step_content=$(echo "$bad_lines" | grep -vE '^\s*(' || true)
                if [[ -n "$non_step_content" ]]; then
                    echo "Task $task_idx '$task_title': **Changes** contains non-step items (must use '- [ ] Step N:' format)"
                    ((changes_issues++))
                fi
            fi
        fi
    done < <(grep -n '^### Task ' "$plan_file" | sed 's/^[0-9]*://')
    
    if [[ "$changes_issues" -gt 0 ]]; then
        ((issues += changes_issues))
    elif [[ "${task_count:-0}" -gt 0 ]]; then
        log_success "All **Changes** blocks use '- [ ] Step N:' format"
    fi

    # ============================================
    # 11. Test Plan structural validation
    # Each non-N/A test case must have Goal + Fixture + Execution + Expected Evidence + Step checkbox
    # ============================================
    if grep -q '^## Test Plan' "$plan_file"; then
        # Extract Test Plan section content (between ## Test Plan and next ## section)
        local testplan_content
        testplan_content=$(sed -n '/^## Test Plan/,/^## [^#]/p' "$plan_file" | sed '1d;$d')
        
        # Check for N/A category markers (e.g., "#### 单元测试" followed by "N/A — 理由")
        local testplan_stripped
        testplan_stripped=$(echo "$testplan_content" | grep -vE '^[[:space:]]*$' | grep -v '<!--' | grep -v '^-->' || true)
        
        # Check if entire test plan is N/A (rare but possible)
        local testplan_real_lines
        testplan_real_lines=$(echo "$testplan_stripped" | grep -vE '^(N/A|n/a|N/A —)' || true)
        
        if [[ -z "$testplan_real_lines" ]]; then
            echo "## Test Plan: all content is N/A without reason"
            ((issues++))
        else
            # Count test cases (##### Case ... pattern)
            local test_case_count
            test_case_count=$(echo "$testplan_real_lines" | grep -cE '^#####\s+Case\s+' || echo "0")
            
            if [[ "$test_case_count" -ge 1 ]]; then
                # Validate each Case has minimum structure
                local case_structure_issues=0
                
                # Check each case section for required fields
                local case_idx=0
                while IFS= read -r case_header; do
                    ((case_idx++))
                    local case_name
                    case_name=$(echo "$case_header" | sed 's/^#####\s*Case\s*//' | head -1)
                    
                    # Extract content from this case to next ##### or #### or ### section
                    local case_content
                    case_content=$(echo "$testplan_real_lines" | awk -v ci="$case_idx" '
                        /^#####[[:space:]]*Case[[:space:]]/{ if (++count == ci) { found=1; next } else { found=0 } }
                        /^####[^#]/ || (/^#####[[:space:]]*Case[[:space:]]/ && count != ci) { found=0 }
                        found { print }
                    ')
                    
                    # Check for required structural elements (use grep -q to avoid count parsing issues)
                    local has_goal=0 has_fixture=0 has_execution=0 has_evidence=0 has_step=0
                    if echo "$case_content" | grep -qE '^- Goal:'; then has_goal=1; fi
                    if echo "$case_content" | grep -qE '^- Fixture:'; then has_fixture=1; fi
                    if echo "$case_content" | grep -qE '^- Execution:'; then has_execution=1; fi
                    if echo "$case_content" | grep -qE '^- Expected Evidence:'; then has_evidence=1; fi
                    if echo "$case_content" | grep -qE '^\s*-\s+\[[ x]\]\s+Step'; then has_step=1; fi
                    
                    if [[ "$has_goal" -eq 0 ]]; then
                        echo "Test Case $case_idx '$case_name': missing '- Goal:'"
                        ((case_structure_issues++))
                    fi
                    if [[ "$has_fixture" -eq 0 ]]; then
                        echo "Test Case $case_idx '$case_name': missing '- Fixture:'"
                        ((case_structure_issues++))
                    fi
                    if [[ "$has_execution" -eq 0 ]]; then
                        echo "Test Case $case_idx '$case_name': missing '- Execution:' with step checkboxes"
                        ((case_structure_issues++))
                    fi
                    if [[ "$has_evidence" -eq 0 ]]; then
                        echo "Test Case $case_idx '$case_name': missing '- Expected Evidence:'"
                        ((case_structure_issues++))
                    fi
                    if [[ "$has_step" -eq 0 ]]; then
                        echo "Test Case $case_idx '$case_name': missing '- [ ] Step N:' in Execution"
                        ((case_structure_issues++))
                    fi
                done < <(echo "$testplan_real_lines" | grep -E '^#####\s+Case\s+')
                
                if [[ "$case_structure_issues" -gt 0 ]]; then
                    ((issues += case_structure_issues))
                else
                    log_success "## Test Plan: $test_case_count cases with valid structure"
                fi
            else
                # No Case headings found — check for old-style bullet format or N/A markers
                local has_na_markers
                has_na_markers=$(echo "$testplan_real_lines" | grep -cE 'N/A\s*—' || echo "0")
                
                # Count non-comment, non-heading lines that look like test items
                local test_item_lines
                test_item_lines=$(echo "$testplan_real_lines" | grep -vE '^(####|###|N/A)' | grep -vE '^\s*$' | grep -cE '^\s*-' || echo "0")
                
                if [[ "$test_item_lines" -gt 0 && "$has_na_markers" -eq 0 ]]; then
                    echo "## Test Plan has test items but no '##### Case' structure (use Case skeleton format)"
                    echo "  Each test case must have: Goal / Fixture / Execution / Expected Evidence + Step checkbox"
                    ((issues++))
                elif [[ "$has_na_markers" -gt 0 ]]; then
                    log_success "## Test Plan: N/A categories with reasons"
                else
                    echo "## Test Plan has no test cases or N/A markers"
                    ((issues++))
                fi
            fi
        fi
    else
        echo "Missing ## Test Plan (mandatory for execution-grade plans)"
        ((issues++))
    fi

    # ============================================
    # 12. User Validation structural validation
    # Must have at least one scenario + final confirmation checkbox
    # ============================================
    local user_val_section
    user_val_section=$(awk '/^### User Validation/{found=1;next} /^#{2,3}[^#]/{found=0} found{print}' "$plan_file")
    
    if [[ -n "$user_val_section" ]]; then
        local uv_trimmed
        uv_trimmed=$(echo "$user_val_section" | sed '/^[[:space:]]*$/d')
        
        # Gate 1: Must have at least one scenario heading (#### Scenario or #### 场景)
        local uv_scenario_count
        uv_scenario_count=$(echo "$uv_trimmed" | grep -cE '^####\s+(Scenario|场景)' || echo "0")
        
        if [[ "$uv_scenario_count" -lt 1 ]]; then
            echo "### User Validation: must have at least one named user scenario (#### Scenario N:)"
            ((issues++))
        fi
        
        # Gate 2: Must have final confirmation checkbox
        local uv_final_checkbox
        uv_final_checkbox=$(echo "$uv_trimmed" | grep -E '^\s*-\s+\[[ x]\]\s+用户已完成' || true)
        
        if [[ -z "$uv_final_checkbox" ]]; then
            echo "### User Validation: must contain final confirmation checkbox"
            echo "  Required: - [ ] 用户已完成上述功能验证并确认结果符合预期"
            ((issues++))
        else
            log_success "### User Validation: $uv_scenario_count scenarios + final confirmation checkbox"
        fi
    else
        # No User Validation section — only a warning (backward compat for old plans)
        log_warn "No ### User Validation section found (recommended for execution-grade plans)"
        ((warnings++))
    fi

    # ============================================
    # 13. Delegation Strategy validation (mandatory for complex plans)
    # ============================================
    local task_count_val
    task_count_val=$(grep -c '^### Task ' "$plan_file" || echo "0")
    
    local complexity_line
    complexity_line=$(grep '^\- \*\*Complexity\*\*:' "$plan_file" || true)
    local complexity_value
    complexity_value=$(echo "$complexity_line" | sed 's/^.*: //' || true)
    
# Check if delegation strategy is required
    local needs_delegation_strategy=false
    if [[ "$task_count_val" -ge 3 ]]; then
        needs_delegation_strategy=true
    elif [[ "$task_count_val" -ge 2 ]] && [[ "$complexity_value" == "High" || "$complexity_value" == "Medium" ]]; then
        needs_delegation_strategy=true
    fi
    
    if [[ "$needs_delegation_strategy" == true ]]; then
        local delegation_section
        delegation_section=$(sed -n '/^## Delegation Strategy/,/^##[^#]/{ /^## Delegation Strategy/d; /^##[^#]/d; p; }' "$plan_file")
        
        # Check if section exists and is not N/A placeholder
        if [[ -z "$delegation_section" ]]; then
            echo "## Delegation Strategy: section required for complex plans ($task_count_val tasks, Complexity: $complexity_value)"
            ((issues++))
        elif echo "$delegation_section" | grep -qE '^(N/A|n/a|N/A —|简单任务)'; then
            echo "## Delegation Strategy: must be filled (not N/A) for complex plans ($task_count_val tasks, Complexity: $complexity_value)"
            ((issues++))
        elif ! echo "$delegation_section" | grep -qE '^\|.*Task.*执行者'; then
            echo "## Delegation Strategy: missing delegation table (required format: table with Task/执行者 columns)"
            ((issues++))
        else
            log_success "## Delegation Strategy: present for complex plan"
        fi
    else
        # Optional for simple plans
        if grep -q '^## Delegation Strategy' "$plan_file"; then
            log_success "## Delegation Strategy: present (optional for simple plan)"
        fi
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
    for section in "## Goal" "## In Scope" "## Affected Files"; do
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
