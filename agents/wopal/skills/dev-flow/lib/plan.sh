#!/bin/bash
# plan.sh - Plan File Operations Library
#
# Usage: source this file to use functions
#   source lib/plan.sh
#
# Functions:
#   resolve_plan_dir()    - Resolve Plan directory path
#   resolve_plan_file()   - Resolve Plan file path
#   create_plan()         - Create Plan file from template
#   get_plan_status()     - Read Plan status
#   set_plan_status()     - Set Plan status
#   link_prd()            - Link PRD to Plan
#   archive_plan()        - Archive Plan (move to done/)
#   validate_plan_name()  - Validate Plan naming convention

set -e

# ============================================
# Color Output Constants
# ============================================

readonly PLAN_RED='\033[0;31m'
readonly PLAN_GREEN='\033[0;32m'
readonly PLAN_YELLOW='\033[0;33m'
readonly PLAN_BLUE='\033[0;34m'
readonly PLAN_NC='\033[0m'

_plan_info() { echo -e "${PLAN_BLUE}[INFO]${PLAN_NC} $1"; }
_plan_success() { echo -e "${PLAN_GREEN}[OK]${PLAN_NC} $1"; }
_plan_warn() { echo -e "${PLAN_YELLOW}[WARN]${PLAN_NC} $1"; }
_plan_error() { echo -e "${PLAN_RED}[ERROR]${PLAN_NC} $1" >&2; }

# ============================================
# Auto-detect Workspace Root
# ============================================

_plan_find_root() {
    local search_dir="${1:-$(pwd)}"
    while [[ "$search_dir" != "/" ]]; do
        # Check for .wopal directory (WopalSpace specific)
        if [[ -d "$search_dir/.wopal" ]]; then
            echo "$search_dir"
            return 0
        fi
        # Check if we're inside .wopal
        if [[ "$(basename "$search_dir")" == ".wopal" ]]; then
            echo "$(dirname "$search_dir")"
            return 0
        fi
        search_dir="$(dirname "$search_dir")"
    done

    # Fallback to git root
    git rev-parse --show-toplevel 2>/dev/null || echo "."
}

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
    root_dir=$(_plan_find_root)

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
    root_dir=$(_plan_find_root)

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
        _plan_error "Plan name/pattern required"
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
        _plan_error "No plan found matching: $input"
        echo "   Searched in: $plan_dir" >&2
        return 1
    fi

    if [[ ${#matches[@]} -gt 1 ]]; then
        _plan_error "Multiple plans matched: $input"
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
# Naming: <component>-<type>-<description>.md
# Types: feature, enhance, fix, refactor, docs, test
validate_plan_name() {
    local name="$1"

    if [[ ! "$name" =~ ^([a-z0-9-]+)-(feature|enhance|fix|refactor|docs|test)-([a-z0-9-]+)$ ]]; then
        _plan_error "Invalid plan name: $name"
        echo ""
        echo "Plan naming convention:"
        echo "  <component>-<type>-<description>.md"
        echo ""
        echo "Components: plan-master, fae, wopal-cli, agent-tools, etc."
        echo "Types: feature, enhance, fix, refactor, docs, test"
        echo "  - feature: new functionality"
        echo "  - enhance: improvement/optimization"
        echo "  - fix: bug fix"
        echo "  - refactor: code refactoring"
        echo "Description: short lowercase with hyphens"
        echo ""
        echo "Examples:"
        echo "  fae-fix-task-wait-bug"
        echo "  wopal-cli-feature-session-messages"
        echo "  plan-master-enhance-validate-phase"
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
#   --deep              Deep analysis mode
create_plan() {
    local plan_name="$1"
    shift || true

    local project=""
    local prd_path=""
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
        _plan_error "Plan name required"
        return 1
    fi

    # Validate naming convention
    if ! validate_plan_name "$plan_name"; then
        return 1
    fi

    local root_dir
    root_dir=$(_plan_find_root)

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
        _plan_error "Plan already exists: $plan_file"
        return 1
    fi

    # Validate PRD path if provided
    if [[ -n "$prd_path" && ! -f "${root_dir}/${prd_path}" ]]; then
        _plan_error "PRD file not found: $prd_path"
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

    # Create plan file from template
    cat > "$plan_file" << EOF
# ${plan_name}

## 元数据

- **PRD**: \`${prd_path:-待关联（执行前必填）}\`
${issue_line}${project_line}- **Created**: $(date +%Y-%m-%d)
- **Status**: draft
- **Mode**: $( [[ "$deep_mode" == true ]] && echo "deep" || echo "lite" )

## 目标

<!-- 继承自 Issue 或 PRD Problem Statement，一句话描述 -->

## Problem

<!-- 问题陈述 -->

## Appetite

<!-- 时间预算 -->

## In Scope

- [ ] 待补充

## Out of Scope

- [ ] 待补充（需与 PRD Non-Goals 对齐）

## 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| \`path/to/file\` | 创建/修改 | 说明 |

## 实施步骤

### Task 1: [任务名称]

**关联 PRD 需求**: REQ-xxx
**Files**:
- Modify: \`path/to/file\`

- [ ] Step 1: 具体操作
- [ ] Step 2: 验证

**验证**: \`npm test -- path/to/test\`

## 验收标准

- [ ] 对应 Issue/PRD 成功标准逐项覆盖
- [ ] 所有测试通过
- [ ] 功能验证通过

## 风险与依赖

- 待补充
EOF

    _plan_success "Created plan: $plan_file"

    if [[ ${#issue_numbers[@]} -gt 0 ]]; then
        local linked_issues=""
        for issue in "${issue_numbers[@]}"; do
            if [[ -n "$linked_issues" ]]; then
                linked_issues+=", #${issue}"
            else
                linked_issues="#${issue}"
            fi
        done
        echo "Linked to Issue: ${linked_issues}"
    fi

    if [[ "$deep_mode" == true ]]; then
        echo "Deep mode: continue filling this file using the analysis checklist"
    fi

    echo "$plan_file"
}

# Get Plan status
# Usage: get_plan_status <plan_file>
# Output: status string
get_plan_status() {
    local plan_file="$1"

    if [[ ! -f "$plan_file" ]]; then
        _plan_error "Plan file not found: $plan_file"
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
        _plan_error "Plan file not found: $plan_file"
        return 1
    fi

    if grep -q '^\- \*\*Status\*\*:' "$plan_file"; then
        # macOS and Linux compatible sed
        sed -i '' "s/^\- \*\*Status\*\*: .*/- **Status**: $new_status/" "$plan_file" 2>/dev/null || \
        sed -i "s/^\- \*\*Status\*\*: .*/- **Status**: $new_status/" "$plan_file"
        _plan_success "Status updated: $new_status"
    else
        _plan_error "Status line not found in plan file"
        return 1
    fi
}

# Link PRD to Plan
# Usage: link_prd <plan_file> <prd_path>
link_prd() {
    local plan_file="$1"
    local prd_path="$2"

    if [[ ! -f "$plan_file" ]]; then
        _plan_error "Plan file not found: $plan_file"
        return 1
    fi

    local root_dir
    root_dir=$(_plan_find_root)

    if [[ -n "$prd_path" && ! -f "${root_dir}/${prd_path}" ]]; then
        _plan_warn "PRD file not found: $prd_path (linking anyway)"
    fi

    # Update PRD line
    if grep -q '^\- \*\*PRD\*\*:' "$plan_file"; then
        sed -i '' "s|^\- \*\*PRD\*\*: .*|- **PRD**: \`${prd_path}\`|" "$plan_file" 2>/dev/null || \
        sed -i "s|^\- \*\*PRD\*\*: .*|- **PRD**: \`${prd_path}\`|" "$plan_file"
        _plan_success "PRD linked: $prd_path"
    else
        _plan_error "PRD line not found in plan file"
        return 1
    fi
}

# Archive Plan (move to done/)
# Usage: archive_plan <plan_file>
archive_plan() {
    local plan_file="$1"

    if [[ ! -f "$plan_file" ]]; then
        _plan_error "Plan file not found: $plan_file"
        return 1
    fi

    local current_status
    current_status=$(get_plan_status "$plan_file")

    if [[ "$current_status" != "validated" ]]; then
        _plan_error "Plan must be validated before archiving"
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
    local archived_file="$done_dir/$plan_name"
    mv "$plan_file" "$archived_file"

    _plan_success "Plan archived: $archived_file"

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
        _plan_error "Plan file not found: $plan_file"
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

# Export functions for use in other scripts
if [[ "${BASH_SOURCE[0]}" != "${0}" ]]; then
    # Sourced mode - functions are already available
    :
fi