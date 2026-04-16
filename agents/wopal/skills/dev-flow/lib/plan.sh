#!/bin/bash
# plan.sh - Plan File Operations Library
#
# Usage: source this file to use functions
#   source lib/plan.sh
#
# Provides:
#   - Plan file CRUD operations
#   - Plan metadata accessors (status, type, project, issues)
#   - Plan directory resolution
#   - Acceptance Criteria validation
#
# Dependencies: common.sh
# Guard: DEV_FLOW_PLAN_LOADED

# Prevent duplicate loading
if [[ -n "${DEV_FLOW_PLAN_LOADED:-}" ]]; then
    return 0
fi
readonly DEV_FLOW_PLAN_LOADED=1

set -e

# Load shared utilities
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
source "$SKILL_DIR/lib/common.sh"

# Global project context
PLAN_PROJECT=""

# ============================================
# Path Resolution Functions
# ============================================

# Resolve Plan directory path
# Usage: resolve_plan_dir [--project <name> | --global]
# Output: absolute path to plans directory
resolve_plan_dir() {
    local project="${PLAN_PROJECT:-}"
    local root_dir
    root_dir=$(find_workspace_root)

    # Parse args
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --project)
                project="$2"
                shift 2
                ;;
            --global)
                project=""
                shift
                ;;
            *)
                shift
                ;;
        esac
    done

    if [[ -n "$project" ]]; then
        echo "${root_dir}/docs/products/${project}/plans"
    else
        echo "${root_dir}/docs/products/plans"
    fi
}

# Resolve Plan file path
# Usage: resolve_plan_file <pattern> [--project <name> | --global]
# Output: absolute path to plan file
resolve_plan_file() {
    local input="$1"
    shift || true
    local project="${PLAN_PROJECT:-}"
    local root_dir
    root_dir=$(find_workspace_root)

    # Parse args
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --project)
                project="$2"
                shift 2
                ;;
            --global)
                project=""
                shift
                ;;
            *)
                shift
                ;;
        esac
    done

    if [[ -z "$input" ]]; then
        log_error "Plan name/pattern required"
        return 1
    fi

    # If input is already a file path
    if [[ -f "$input" ]]; then
        echo "$input"
        return 0
    fi

    # Determine plan directory
    local plan_dir
    if [[ -n "$project" ]]; then
        plan_dir="${root_dir}/docs/products/${project}/plans"
    else
        plan_dir="${root_dir}/docs/products/plans"
    fi

    # Search for matching file
    local matches=("$plan_dir"/*"$input"*.md)

    if [[ ! -e "${matches[0]}" ]]; then
        log_error "No plan found matching: $input"
        echo "   Searched in: $plan_dir" >&2
        return 1
    fi

    if [[ ${#matches[@]} -gt 1 ]]; then
        log_error "Multiple plans matched: $input"
        printf '  - %s\n' "${matches[@]}" >&2
        return 1
    fi

    echo "${matches[0]}"
}

# ============================================
# Plan File Operations
# ============================================

# Validate Plan naming convention
# Usage: validate_plan_name <name>
# Naming: <issue_number>-<type>-<slug>.md OR <type>-<slug>.md (no Issue)
# Types: feature, enhance, fix, refactor, docs, chore, test
validate_plan_name() {
    local name="$1"

    # Support two formats: with Issue prefix or without
    if [[ ! "$name" =~ ^([0-9]+)?-?(feature|enhance|fix|refactor|docs|chore|test)-([a-z0-9-]+)$ ]]; then
        log_error "Invalid plan name: $name"
        echo ""
        echo "Plan naming convention:"
        echo "  <issue_number>-<type>-<slug>.md  (with Issue)"
        echo "  <type>-<slug>.md                 (no Issue)"
        echo ""
        echo "Types: feature, enhance, fix, refactor, docs, chore, test"
        echo "  - feature: new functionality"
        echo "  - enhance: improvement/optimization"
        echo "  - fix: bug fix"
        echo "  - refactor: code refactoring"
        echo "Slug: short lowercase with hyphens"
        echo ""
        echo "Examples:"
        echo "  42-fix-task-wait-bug"
        echo "  15-feature-session-messages"
        echo "  refactor-optimize-files-table (no Issue)"
        return 1
    fi

    return 0
}

# Create Plan file from template
# Usage: create_plan <plan_name> [options]
# Options:
#   --project <name>    Project-level plan
#   --global            Space-level plan
#   --prd <path>        Link to PRD file
#   --issue <N>         Link to Issue number (can be used multiple times)
#   --type <type>       Plan type (fix/feature/enhance/refactor/docs/chore/test)
#   --deep              Deep analysis mode
create_plan() {
    local plan_name="$1"
    shift || true

    local project=""
    local prd_path=""
    local plan_type=""
    local deep_mode=false
    local issue_numbers=()

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --project)
                project="$2"
                shift 2
                ;;
            --global)
                project=""
                shift
                ;;
            --prd)
                prd_path="$2"
                shift 2
                ;;
            --issue)
                issue_numbers+=("$2")
                shift 2
                ;;
            --type)
                plan_type="$2"
                shift 2
                ;;
            --deep)
                deep_mode=true
                shift
                ;;
            *)
                shift
                ;;
        esac
    done

    if [[ -z "$plan_name" ]]; then
        log_error "Plan name required"
        return 1
    fi

    # Validate naming convention
    if ! validate_plan_name "$plan_name"; then
        return 1
    fi

    local root_dir
    root_dir=$(find_workspace_root)

    # Determine plan directory
    local plan_dir
    if [[ -n "$project" ]]; then
        plan_dir="${root_dir}/docs/products/${project}/plans"
    else
        plan_dir="${root_dir}/docs/products/plans"
    fi

    mkdir -p "$plan_dir"

    local plan_file="$plan_dir/${plan_name}.md"
    if [[ -f "$plan_file" ]]; then
        log_error "Plan already exists: $plan_file"
        return 1
    fi

    # Validate PRD path if provided
    if [[ -n "$prd_path" && ! -f "${root_dir}/${prd_path}" ]]; then
        log_error "PRD file not found: $prd_path"
        return 1
    fi

    # Build Issue line
    local issue_line=""
    if [[ ${#issue_numbers[@]} -gt 0 ]]; then
        local formatted_issues=""
        for issue in "${issue_numbers[@]}"; do
            if [[ -n "$formatted_issues" ]]; then
                formatted_issues+=", #${issue}"
            else
                formatted_issues="#${issue}"
            fi
        done
        issue_line="- **Issue**: ${formatted_issues}"
    fi

    # Build Target Project line
    local project_line=""
    if [[ -n "$project" ]]; then
        project_line="- **Target Project**: ${project}"
    fi

    # Build Type line (extract from plan_name if not provided)
    if [[ -z "$plan_type" ]]; then
        # Extract type from plan name prefix (e.g., "fix-xxx" -> "fix")
        plan_type=$(echo "$plan_name" | sed -E 's/^[0-9]+-([a-z]+)-.*/\1/')
        case "$plan_type" in
            fix|feature|enhance|refactor|docs|chore|test)
                ;;
            *)
                plan_type="feature"  # Default
                ;;
        esac
    fi
    local type_line="- **Type**: ${plan_type}"

    # Create plan file from external template
    local template_file="$SKILL_DIR/templates/plan.md"
    sed -e "s/{plan_name}/${plan_name}/g" \
        -e "s/{issue_line}/${issue_line}/g" \
        -e "s/{type_line}/${type_line}/g" \
        -e "s/{project_line}/${project_line}/g" \
        -e "s/{date}/$(date +%Y-%m-%d)/g" \
        "$template_file" > "$plan_file"

    # Remove empty lines in Metadata section (when issue/project not provided)
    # macOS sed requires -i '' while Linux uses -i alone
    sed -i '' '/^$/N;/^\n$/D' "$plan_file" 2>/dev/null || \
    sed -i '/^$/N;/^\n$/D' "$plan_file"

    echo "$plan_file"
}

# Get Plan status
# Usage: get_plan_status <plan_file>
# Output: status string
get_plan_status() {
    local plan_file="$1"

    if [[ ! -f "$plan_file" ]]; then
        log_error "Plan file not found: $plan_file"
        return 1
    fi

    local status
    status=$(grep -m1 '^\- \*\*Status\*\*:' "$plan_file" | sed 's/^.*: //')

    if [[ -z "$status" ]]; then
        echo "draft"
    else
        echo "$status"
    fi
}

# Set Plan status
# Usage: set_plan_status <plan_file> <status>
set_plan_status() {
    local plan_file="$1"
    local new_status="$2"

    if [[ ! -f "$plan_file" ]]; then
        log_error "Plan file not found: $plan_file"
        return 1
    fi

    if grep -q '^\- \*\*Status\*\*:' "$plan_file"; then
        # macOS and Linux compatible sed
        sed -i '' "s/^\- \*\*Status\*\*: .*/- **Status**: $new_status/" "$plan_file" 2>/dev/null || \
        sed -i "s/^\- \*\*Status\*\*: .*/- **Status**: $new_status/" "$plan_file"
        log_success "Status updated: $new_status"
    else
        log_error "Status line not found in plan file"
        return 1
    fi
}

# Link PRD to Plan
# Usage: link_prd <plan_file> <prd_path>
link_prd() {
    local plan_file="$1"
    local prd_path="$2"

    if [[ ! -f "$plan_file" ]]; then
        log_error "Plan file not found: $plan_file"
        return 1
    fi

    local root_dir
    root_dir=$(find_workspace_root)

    if [[ -n "$prd_path" && ! -f "${root_dir}/${prd_path}" ]]; then
        log_warn "PRD file not found: $prd_path (linking anyway)"
    fi

    # Update PRD line
    if grep -q '^\- \*\*PRD\*\*:' "$plan_file"; then
        sed -i '' "s|^\- \*\*PRD\*\*: .*|- **PRD**: \`${prd_path}\`|" "$plan_file" 2>/dev/null || \
        sed -i "s|^\- \*\*PRD\*\*: .*|- **PRD**: \`${prd_path}\`|" "$plan_file"
        log_success "PRD linked: $prd_path"
    else
        log_error "PRD line not found in plan file"
        return 1
    fi
}

# Archive Plan (move to done/)
# Usage: archive_plan <plan_file>
archive_plan() {
    local plan_file="$1"

    if [[ ! -f "$plan_file" ]]; then
        log_error "Plan file not found: $plan_file"
        return 1
    fi

    local current_status
    current_status=$(get_plan_status "$plan_file")

    # Archive from executing or done state
    if [[ "$current_status" != "executing" && "$current_status" != "done" ]]; then
        log_error "Plan must be in executing state (after validation) before archiving"
        echo "   Current status: $current_status" >&2
        return 1
    fi

    # Move to done/ directory
    local plan_dir
    plan_dir=$(dirname "$plan_file")
    local done_dir="$plan_dir/done"
    mkdir -p "$done_dir"

    local plan_name
    plan_name=$(basename "$plan_file")
    local archive_date
    archive_date=$(date '+%Y%m%d')
    local archived_file="$done_dir/${archive_date}-${plan_name}"
    mv "$plan_file" "$archived_file"

    log_success "Plan archived: $archived_file" >&2

    echo "$archived_file"
}

# Extract Issue numbers from Plan
# Usage: extract_plan_issues <plan_file>
# Output: space-separated issue numbers
extract_plan_issues() {
    local plan_file="$1"

    if [[ ! -f "$plan_file" ]]; then
        return 1
    fi

    local issue_line
    issue_line="$(grep -m1 '^\- \*\*Issue\*\*:' "$plan_file")"
    local issue_numbers=()

    while [[ "$issue_line" =~ \#([0-9]+) ]]; do
        issue_numbers+=("${BASH_REMATCH[1]}")
        issue_line="${issue_line#*#${BASH_REMATCH[1]}}"
    done

    echo "${issue_numbers[*]}"
}

# Get Plan metadata
# Usage: get_plan_metadata <plan_file>
# Output: key=value pairs
get_plan_metadata() {
    local plan_file="$1"

    if [[ ! -f "$plan_file" ]]; then
        log_error "Plan file not found: $plan_file"
        return 1
    fi

    local status prd issue created mode

    status=$(grep -m1 '^\- \*\*Status\*\*:' "$plan_file" | sed 's/^.*: //')
    prd=$(grep -m1 '^\- \*\*PRD\*\*:' "$plan_file" | sed 's/^.*: `\(.*\)`.*/\1/' | sed 's/^.*: //')
    issue=$(grep -m1 '^\- \*\*Issue\*\*:' "$plan_file" | sed 's/^.*: //')
    created=$(grep -m1 '^\- \*\*Created\*\*:' "$plan_file" | sed 's/^.*: //')
    mode=$(grep -m1 '^\- \*\*Mode\*\*:' "$plan_file" | sed 's/^.*: //')

    echo "status=${status:-draft}"
    echo "prd=${prd:-}"
    echo "issue=${issue:-}"
    echo "created=${created:-}"
    echo "mode=${mode:-lite}"
}

# ============================================
# Unified Metadata Accessors
# ============================================

# Get a specific field from Plan metadata
# Usage: get_plan_field <plan_file> <field_name>
# Output: field value or empty string
get_plan_field() {
    local plan_file="$1"
    local field_name="$2"

    if [[ ! -f "$plan_file" ]]; then
        return 1
    fi

    local value
    value=$(grep -m1 "^\- \*\*${field_name}\*\*:" "$plan_file" 2>/dev/null | sed 's/^.*: //' || true)
    echo "$value"
}

# Get Plan Type (normalized lowercase)
# Usage: get_plan_type <plan_file>
# Output: type value (feature/fix/refactor/docs/chore/test) or empty
get_plan_type() {
    local plan_file="$1"
    local type
    type=$(get_plan_field "$plan_file" "Type")
    echo "$type" | tr '[:upper:]' '[:lower:]'
}

# Get Plan Target Project
# Usage: get_plan_project <plan_file>
# Output: project name or empty
get_plan_project() {
    local plan_file="$1"
    get_plan_field "$plan_file" "Target Project"
}

# Get Plan Status (uses existing get_plan_status for compatibility)
# Usage: get_plan_status_value <plan_file>
# Output: status value or "draft"
get_plan_status_value() {
    local plan_file="$1"
    get_plan_status "$plan_file"
}

# ============================================
# Acceptance Criteria Validation
# ============================================

# Check if all Acceptance Criteria are completed (Agent Verification only)
# Usage: check_acceptance_criteria <plan_file>
# Returns: 0 if all completed or no criteria found, 1 if incomplete
# Output: incomplete items (if any)
#
# Behavior:
#   - If `### Agent Verification` sub-section exists: only check that section
#   - If no sub-section: fallback to checking entire `## Acceptance Criteria` (backward compat)
check_acceptance_criteria() {
    local plan_file="$1"
    
    if [[ ! -f "$plan_file" ]]; then
        log_error "Plan file not found: $plan_file"
        return 1
    fi
    
    # First, try to extract `### Agent Verification` sub-section
    local agent_ac_section
    agent_ac_section=$(awk '/^### Agent Verification/{found=1;next} /^###{1,2}[^#]/{found=0} found{print}' "$plan_file")
    
    local ac_section
    local section_name
    
    # Check if `### Agent Verification` exists and has content
    if [[ -n "$agent_ac_section" ]] && echo "$agent_ac_section" | grep -qE '^\s*-\s+\['; then
        ac_section="$agent_ac_section"
        section_name="Agent Verification"
    else
        # Fallback: extract entire Acceptance Criteria section (backward compat)
        ac_section=$(sed -n '/^## Acceptance Criteria/,/^##[^#]/{ /^## Acceptance Criteria/d; /^##[^#]/d; p; }' "$plan_file")
        section_name="Acceptance Criteria"
    fi
    
    # If no section or empty, pass
    if [[ -z "$ac_section" ]] || ! echo "$ac_section" | grep -q '\-'; then
        log_info "No $section_name found in plan"
        return 0
    fi
    
    # Check for unchecked items: - [ ]
    local unchecked
    unchecked=$(echo "$ac_section" | grep -E '^\s*-\s+\[\s*\]' || true)
    
    if [[ -n "$unchecked" ]]; then
        log_error "$section_name not completed:"
        echo ""
        echo "$unchecked" | while read -r line; do
            echo "  $line"
        done
        echo ""
        return 1
    fi
    
    # Check if there are any checked items
    local checked
    checked=$(echo "$ac_section" | grep -E '^\s*-\s+\[x\]' || true)
    
    if [[ -z "$checked" ]]; then
        log_warn "No $section_name items found (checked or unchecked)"
        return 0
    fi
    
    local checked_count
    checked_count=$(echo "$checked" | wc -l | tr -d ' ')
    log_success "All $checked_count $section_name completed"
    return 0
}

# Get incomplete Acceptance Criteria count
# Usage: get_incomplete_ac_count <plan_file>
# Output: number of incomplete items
get_incomplete_ac_count() {
    local plan_file="$1"
    
    if [[ ! -f "$plan_file" ]]; then
        echo "0"
        return
    fi
    
    local ac_section
    ac_section=$(sed -n '/^## Acceptance Criteria/,/^##[^#]/{ /^## Acceptance Criteria/d; /^##[^#]/d; p; }' "$plan_file")
    
    if [[ -z "$ac_section" ]]; then
        echo "0"
        return
    fi
    
    echo "$ac_section" | grep -cE '^\s*-\s+\[\s*\]' || echo "0"
}

# Check if User Validation section passes the hard gate
# Usage: check_user_validation <plan_file>
# Returns: 0 only if final user confirmation checkbox is checked, 1 otherwise
#
# Gate rules (strict — no warn-and-proceed):
#   1. `### User Validation` section must exist
#   2. Must contain at least one named user scenario (#### Scenario N: or similar heading)
#   3. Must contain a final confirmation checkbox: `- [ ] 用户已完成...`
#   4. The final confirmation checkbox must be checked (`[x]`) — unchecked = block
#   5. No "plain text passes" loophole: content without scenario structure + final checkbox is invalid
#
# Backward compat: old plans with no User Validation section still pass (they don't have this gate)
check_user_validation() {
    local plan_file="$1"
    
    if [[ ! -f "$plan_file" ]]; then
        log_error "Plan file not found: $plan_file"
        return 1
    fi
    
    # Extract `### User Validation` sub-section
    local user_ac_section
    user_ac_section=$(awk '/^### User Validation/{found=1;next} /^#{2,3}[^#]/{found=0} found{print}' "$plan_file")
    
    # If no section exists, pass (backward compat — old plans don't have this gate)
    if [[ -z "$user_ac_section" ]]; then
        log_info "No User Validation section found in plan (backward compat)"
        return 0
    fi
    
    # Trim whitespace-only lines
    local trimmed_content
    trimmed_content=$(echo "$user_ac_section" | sed '/^[[:space:]]*$/d')
    
    # Gate 1: Must contain at least one named user scenario (#### Scenario or #### 场景)
    local scenario_count
    scenario_count=$(echo "$trimmed_content" | grep -cE '^####\s+(Scenario|场景)' || echo "0")
    
    if [[ "$scenario_count" -lt 1 ]]; then
        log_error "User Validation must contain at least one named user scenario (#### Scenario N:)"
        echo "  Current content has no scenario headings — add scenario skeleton before proceeding" >&2
        return 1
    fi
    
    # Gate 2: Must contain a final confirmation checkbox pattern
    # Accepted patterns: "- [ ] 用户已完成..." or "- [x] 用户已完成..."
    local final_checkbox_lines
    final_checkbox_lines=$(echo "$trimmed_content" | grep -E '^\s*-\s+\[[ x]\]\s+用户已完成' || true)
    
    if [[ -z "$final_checkbox_lines" ]]; then
        log_error "User Validation must contain a final confirmation checkbox"
        echo "  Required format: - [ ] 用户已完成上述功能验证并确认结果符合预期" >&2
        echo "  Only the user can check this checkbox after real validation" >&2
        return 1
    fi
    
    # Gate 3: Final confirmation checkbox must be checked [x]
    local checked_final
    checked_final=$(echo "$final_checkbox_lines" | grep -E '^\s*-\s+\[x\]\s+用户已完成' || true)
    
    if [[ -z "$checked_final" ]]; then
        log_error "User Validation final confirmation checkbox is NOT checked"
        echo "  The final checkbox '- [ ] 用户已完成...' must be checked by the user before verify --confirm" >&2
        echo "  Agent cannot check this checkbox — user must do it after real validation" >&2
        return 1
    fi
    
    local scenario_count_val
    scenario_count_val=$(echo "$scenario_count" | tr -d ' ')
    log_success "User Validation gate passed: $scenario_count_val scenarios, final confirmation checkbox checked"
    return 0
}

# Export functions for use in other scripts
if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
    # Sourced mode - functions are already available
    :
fi
