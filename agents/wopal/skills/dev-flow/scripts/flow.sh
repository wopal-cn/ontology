#!/bin/bash
# dev-flow — 统一开发工作流
# Usage: flow.sh <command> <issue> [options]
#
# Commands:
#   start <issue>        创建 Plan 并关联 Issue
#   refine <issue>       进入研究阶段
#   review <issue>       提交评审
#   dev <issue>          开始执行
#   complete <issue>     标记完成
#   validate <issue>     用户验证确认
#   archive <issue>      归档并清理
#   status <issue>       查看任务状态
#   list                 列出进行中任务
#   decompose-prd <prd>  从 PRD 创建 Issue
#   reset <issue>        重置到 draft 状态
#   help                 显示帮助

set -e

# ============================================
# Path Detection & Library Loading
# ============================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"

# Load libraries
source "$SKILL_DIR/lib/state-machine.sh"
source "$SKILL_DIR/lib/issue.sh"
source "$SKILL_DIR/lib/plan.sh"
source "$SKILL_DIR/lib/check-doc.sh"

# ============================================
# Global Variables
# ============================================

PLAN_PROJECT=""
DATE=$(date +%Y-%m-%d)

# Find workspace root
FLOW_ROOT=""
_find_flow_root() {
    if [[ -n "$FLOW_ROOT" ]]; then
        echo "$FLOW_ROOT"
        return
    fi
    local search_dir="${1:-$(pwd)}"
    while [[ "$search_dir" != "/" ]]; do
        if [[ -d "$search_dir/.wopal" ]]; then
            FLOW_ROOT="$search_dir"
            echo "$FLOW_ROOT"
            return
        fi
        if [[ "$(basename "$search_dir")" == ".wopal" ]]; then
            FLOW_ROOT="$(dirname "$search_dir")"
            echo "$FLOW_ROOT"
            return
        fi
        search_dir="$(dirname "$search_dir")"
    done
    FLOW_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo ".")"
    echo "$FLOW_ROOT"
}

ROOT_DIR="$(_find_flow_root)"
PLAN_FILE="${PLAN_FILE:-${ROOT_DIR}/memory/PLAN.md}"

# ============================================
# Color Output
# ============================================

readonly FLOW_RED='\033[0;31m'
readonly FLOW_GREEN='\033[0;32m'
readonly FLOW_YELLOW='\033[0;33m'
readonly FLOW_BLUE='\033[0;34m'
readonly FLOW_CYAN='\033[0;36m'
readonly FLOW_NC='\033[0m'

_flow_info() { echo -e "${FLOW_BLUE}[INFO]${FLOW_NC} $1"; }
_flow_success() { echo -e "${FLOW_GREEN}[OK]${FLOW_NC} $1"; }
_flow_warn() { echo -e "${FLOW_YELLOW}[WARN]${FLOW_NC} $1"; }
_flow_error() { echo -e "${FLOW_RED}[ERROR]${FLOW_NC} $1" >&2; }
_flow_step() { echo -e "${FLOW_CYAN}[STEP]${FLOW_NC} $1"; }

# ============================================
# Helper Functions
# ============================================

# Find Plan file by Issue number
# Usage: find_plan_by_issue <issue_number>
# Output: plan file path or empty string
find_plan_by_issue() {
    local issue_number="$1"
    local root_dir="$(_find_flow_root)"

    # Search in both project-level and global plans directories
    local search_dirs=(
        "$root_dir/docs/products/plans"
        "$root_dir/docs/products/agent-tools/plans"
        "$root_dir/docs/products/wopal-cli/plans"
        "$root_dir/docs/products/space/plans"
    )

    for search_dir in "${search_dirs[@]}"; do
        if [[ ! -d "$search_dir" ]]; then
            continue
        fi

        # Search for plan files matching the issue number
        while IFS= read -r -d '' plan_file; do
            local issue_line
            issue_line=$(grep -m1 '^\- \*\*Issue\*\*:' "$plan_file" 2>/dev/null || true)
            if [[ "$issue_line" =~ \#$issue_number([^0-9]|$) ]]; then
                echo "$plan_file"
                return 0
            fi
        done < <(find "$search_dir" -name "*.md" -not -path "*/done/*" -print0 2>/dev/null)
    done

    return 1
}

# Update PLAN.md status for a plan
# Usage: update_plan_md_status <plan_name> <status>
update_plan_md_status() {
    local plan_name="$1"
    local status="$2"

    if [[ ! -f "$PLAN_FILE" ]]; then
        return 0
    fi

    # Match format: - [ ] plan-name [status] (added: ...)
    if grep -q "\- \[ \].*${plan_name}" "$PLAN_FILE"; then
        # Check if status marker exists
        if grep -q "\- \[ \].*${plan_name}.*\[" "$PLAN_FILE"; then
            # Update existing status
            sed -i '' "s|\(\- \[ \].*${plan_name}.*\[\)[a-z]*\]|\1${status}]|" "$PLAN_FILE" 2>/dev/null || \
            sed -i "s|\(\- \[ \].*${plan_name}.*\[\)[a-z]*\]|\1${status}]|" "$PLAN_FILE"
        else
            # Add status marker after plan name
            sed -i '' "s|\(\- \[ \] \)${plan_name}\(.*\)|\1${plan_name} [${status}]\2|" "$PLAN_FILE" 2>/dev/null || \
            sed -i "s|\(\- \[ \] \)${plan_name}\(.*\)|\1${plan_name} [${status}]\2|" "$PLAN_FILE"
        fi
        # Update date
        sed -i '' "s/\*Last updated:.*\*/*Last updated: $DATE*/" "$PLAN_FILE" 2>/dev/null || \
        sed -i "s/\*Last updated:.*\*/*Last updated: $DATE*/" "$PLAN_FILE"
        _flow_success "PLAN.md status updated: $status"
    fi
}

# Mark PLAN.md task as done
# Usage: mark_plan_md_done <plan_name>
mark_plan_md_done() {
    local plan_name="$1"

    if [[ ! -f "$PLAN_FILE" ]]; then
        return 0
    fi

    # Find and move the item to Done section
    if grep -q "\- \[ \].*${plan_name}" "$PLAN_FILE"; then
        # Extract the item text
        local item
        item=$(grep -m1 "\- \[ \].*${plan_name}" "$PLAN_FILE" | sed 's/- \[ \] //' | sed 's/ (added:.*//' | sed 's/ \[.*//')

        # Remove from current location
        sed -i '' "/\- \[ \].*${plan_name}/d" "$PLAN_FILE" 2>/dev/null || \
        sed -i "/\- \[ \].*${plan_name}/d" "$PLAN_FILE"

        # Add to Done section
        local done_entry="- [x] $item (done: $DATE)"
        awk -v section="## ✅ Done" -v entry="$done_entry" '
            $0 == section { print; print entry; next }
            { print }
        ' "$PLAN_FILE" > "$PLAN_FILE.tmp" && mv "$PLAN_FILE.tmp" "$PLAN_FILE"

        # Update date
        sed -i '' "s/\*Last updated:.*\*/*Last updated: $DATE*/" "$PLAN_FILE" 2>/dev/null || \
        sed -i "s/\*Last updated:.*\*/*Last updated: $DATE*/" "$PLAN_FILE"

        _flow_success "PLAN.md task marked done: $item"
    fi
}

# Add item to PLAN.md
# Usage: add_to_plan_md <plan_name> [priority]
add_to_plan_md() {
    local plan_name="$1"
    local priority="${2:-medium}"
    local root_dir="$(_find_flow_root)"
    local plan_file="${PLAN_FILE:-${root_dir}/memory/PLAN.md}"

    # Ensure PLAN.md exists
    if [[ ! -f "$plan_file" ]]; then
        cat > "$plan_file" << 'EOF'
# PLANS

*Last updated: DATE_PLACEHOLDER*

## 🔴 High Priority

## 🟡 Medium Priority

## 🟢 Nice to Have

## ✅ Done

---

## Notes

EOF
        sed -i '' "s/DATE_PLACEHOLDER/$DATE/" "$plan_file" 2>/dev/null || \
        sed -i "s/DATE_PLACEHOLDER/$DATE/" "$plan_file"
    fi

    local section=""
    case "$priority" in
        high)   section="## 🔴 High Priority" ;;
        medium) section="## 🟡 Medium Priority" ;;
        low)    section="## 🟢 Nice to Have" ;;
        *)      section="## 🟡 Medium Priority" ;;
    esac

    local entry="- [ ] $plan_name [draft] (added: $DATE)"

    # Use awk to insert after the section header
    awk -v section="$section" -v entry="$entry" '
        $0 == section { print; print entry; next }
        { print }
    ' "$plan_file" > "$plan_file.tmp" && mv "$plan_file.tmp" "$plan_file"

    # Update date
    sed -i '' "s/\*Last updated:.*\*/*Last updated: $DATE*/" "$plan_file" 2>/dev/null || \
    sed -i "s/\*Last updated:.*\*/*Last updated: $DATE*/" "$plan_file"

    _flow_success "Added to PLAN.md ($priority): $plan_name"
}

# Extract slug from plan name (last segment)
# Usage: extract_slug <plan_name>
extract_slug() {
    local plan_name="$1"
    echo "$plan_name" | sed -E 's/.*-[a-z]+-([a-z0-9-]+)$/\1/'
}

# Get plan name from file path
# Usage: get_plan_name <plan_file>
get_plan_name() {
    local plan_file="$1"
    basename "$plan_file" .md
}

# ============================================
# Command Implementations
# ============================================

# cmd_start: Create Plan and link to Issue
cmd_start() {
    local issue_number=""
    local project=""
    local prd_path=""
    local priority="medium"
    local deep_mode=false

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --project)
                project="$2"
                shift 2
                ;;
            --prd)
                prd_path="$2"
                shift 2
                ;;
            --priority)
                priority="$2"
                shift 2
                ;;
            --deep)
                deep_mode=true
                shift
                ;;
            -*)
                _flow_error "Unknown option: $1"
                cmd_help
                exit 1
                ;;
            *)
                if [[ -z "$issue_number" ]]; then
                    issue_number="$1"
                fi
                shift
                ;;
        esac
    done

    if [[ -z "$issue_number" ]]; then
        _flow_error "Issue number required"
        echo "Usage: flow.sh start <issue> [--project <name>] [--prd <path>] [--priority <level>] [--deep]"
        exit 1
    fi

    _flow_info "Starting workflow for Issue #$issue_number"

    # 1. Get Issue information
    local repo
    repo=$(get_space_repo)

    _flow_step "Fetching Issue #$issue_number info..."
    local issue_info
    issue_info=$(get_issue_info "$issue_number" "$repo")

    local title
    title=$(echo "$issue_info" | jq -r '.title')

    _flow_info "Issue title: $title"

    # 2. Determine project from Issue if not specified
    if [[ -z "$project" ]]; then
        local body
        body=$(echo "$issue_info" | jq -r '.body')
        project=$(extract_project "$body")

        if [[ -z "$project" ]]; then
            _flow_warn "Could not determine project from Issue. Using 'space' as default."
            project="space"
        fi
    fi

    PLAN_PROJECT="$project"
    _flow_info "Target project: $project"

    # 3. Generate Plan name from title
    local slug
    slug=$(title_to_slug "$title")

    # Determine plan type from labels
    local labels
    labels=$(echo "$issue_info" | jq -r '.labels[].name' 2>/dev/null || true)
    local plan_type="feature"
    if echo "$labels" | grep -q "type/bug"; then
        plan_type="fix"
    elif echo "$labels" | grep -q "type/enhancement"; then
        plan_type="enhance"
    elif echo "$labels" | grep -q "type/refactor"; then
        plan_type="refactor"
    elif echo "$labels" | grep -q "type/docs"; then
        plan_type="docs"
    elif echo "$labels" | grep -q "type/test"; then
        plan_type="test"
    fi

    local plan_name="${project}-${plan_type}-${slug}"

    _flow_info "Generated plan name: $plan_name"

    # 4. Create Plan file
    local plan_dir
    plan_dir=$(resolve_plan_dir --project "$project")
    mkdir -p "$plan_dir"

    local plan_file="$plan_dir/${plan_name}.md"

    if [[ -f "$plan_file" ]]; then
        _flow_error "Plan already exists: $plan_file"
        exit 1
    fi

    _flow_step "Creating plan file..."

    # Use plan.sh create_plan function
    local deep_flag=""
    if [[ "$deep_mode" == true ]]; then
        deep_flag="--deep"
    fi

    create_plan "$plan_name" --project "$project" --issue "$issue_number" ${prd_path:+--prd "$prd_path"} ${deep_flag}

    # 5. Update Issue link
    _flow_step "Linking Plan to Issue..."
    local plan_rel_path="docs/products/${project}/plans/${plan_name}.md"
    update_issue_link "$issue_number" "$repo" "plan" "[${plan_name}](../${plan_rel_path})"

    # 6. Add to PLAN.md
    _flow_step "Adding to PLAN.md tracking..."
    add_to_plan_md "$plan_name" "$priority"

    echo ""
    _flow_success "Plan created: $plan_file"
    echo "  Issue: #$issue_number"
    echo "  Project: $project"
    echo "  Status: draft"
    echo ""
    echo "Next: flow.sh refine $issue_number"
}

# cmd_refine: Enter research phase
cmd_refine() {
    local issue_number="$1"

    if [[ -z "$issue_number" ]]; then
        _flow_error "Issue number required"
        echo "Usage: flow.sh refine <issue>"
        exit 1
    fi

    # 1. Find Plan file
    local plan_file
    plan_file=$(find_plan_by_issue "$issue_number") || {
        _flow_error "No plan found for Issue #$issue_number"
        exit 1
    }

    local plan_name
    plan_name=$(get_plan_name "$plan_file")

    _flow_info "Found plan: $plan_name"

    # 2. Get current status and validate transition
    local current_status
    current_status=$(get_current_status "$plan_file")

    _flow_info "Current status: $current_status"

    # 3. Validate state transition
    if ! validate_transition "$current_status" "refining"; then
        exit 1
    fi

    # 4. Update status
    set_plan_status "$plan_file" "refining"

    # 5. Sync PLAN.md
    update_plan_md_status "$plan_name" "refining"

    echo ""
    _flow_success "Plan status: refining"
    echo ""
    echo "Refine workflow:"
    echo "  1. Research codebase, understand context"
    echo "  2. Fill in all sections (Goal, Scope, Files, Tasks)"
    echo "  3. Run: flow.sh review $issue_number"
    echo ""
    echo "Plan file: $plan_file"
}

# cmd_review: Submit for review
cmd_review() {
    local issue_number=""
    local confirm=false

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --confirm)
                confirm=true
                shift
                ;;
            -*)
                _flow_error "Unknown option: $1"
                exit 1
                ;;
            *)
                if [[ -z "$issue_number" ]]; then
                    issue_number="$1"
                fi
                shift
                ;;
        esac
    done

    if [[ -z "$issue_number" ]]; then
        _flow_error "Issue number required"
        echo "Usage: flow.sh review <issue> [--confirm]"
        exit 1
    fi

    # 1. Find Plan file
    local plan_file
    plan_file=$(find_plan_by_issue "$issue_number") || {
        _flow_error "No plan found for Issue #$issue_number"
        exit 1
    }

    local plan_name
    plan_name=$(get_plan_name "$plan_file")

    _flow_info "Found plan: $plan_name"

    # 2. Get current status and validate transition
    local current_status
    current_status=$(get_current_status "$plan_file")

    _flow_info "Current status: $current_status"

    # 3. Validate state transition
    if ! validate_transition "$current_status" "reviewed"; then
        exit 1
    fi

    # 4. Run check-doc first
    _flow_step "Running document quality check..."
    if ! check_doc_plan "$plan_file"; then
        echo ""
        _flow_error "Plan failed check-doc validation"
        echo "Fix the issues above and retry: flow.sh review $issue_number"
        exit 1
    fi

    # 5. If no --confirm, wait for user confirmation
    if [[ "$confirm" != true ]]; then
        echo ""
        echo "Plan ready for review: $plan_file"
        echo ""
        echo "After reviewing, confirm with:"
        echo "  flow.sh review $issue_number --confirm"
        exit 0
    fi

    # 6. Update status
    set_plan_status "$plan_file" "reviewed"

    # 7. Sync PLAN.md
    update_plan_md_status "$plan_name" "reviewed"

    echo ""
    _flow_success "Plan status: reviewed"
    echo ""
    echo "Next: flow.sh dev $issue_number [--worktree]"
}

# cmd_dev: Start execution
cmd_dev() {
    local issue_number=""
    local use_worktree=false

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --worktree)
                use_worktree=true
                shift
                ;;
            -*)
                _flow_error "Unknown option: $1"
                exit 1
                ;;
            *)
                if [[ -z "$issue_number" ]]; then
                    issue_number="$1"
                fi
                shift
                ;;
        esac
    done

    if [[ -z "$issue_number" ]]; then
        _flow_error "Issue number required"
        echo "Usage: flow.sh dev <issue> [--worktree]"
        exit 1
    fi

    # 1. Find Plan file
    local plan_file
    plan_file=$(find_plan_by_issue "$issue_number") || {
        _flow_error "No plan found for Issue #$issue_number"
        exit 1
    }

    local plan_name
    plan_name=$(get_plan_name "$plan_file")

    _flow_info "Found plan: $plan_name"

    # 2. Get current status and validate transition
    local current_status
    current_status=$(get_current_status "$plan_file")

    _flow_info "Current status: $current_status"

    # 3. Validate state transition
    if ! validate_transition "$current_status" "executing"; then
        exit 1
    fi

    # 4. Update status
    set_plan_status "$plan_file" "executing"

    # 5. Sync Issue label
    sync_issue_label "$plan_file" "executing"

    # 6. Sync PLAN.md
    update_plan_md_status "$plan_name" "executing"

    # 7. Create worktree if requested
    if [[ "$use_worktree" == true ]]; then
        # Extract project from plan
        local project_line
        project_line=$(grep -m1 '^\- \*\*Target Project\*\*:' "$plan_file" || true)
        local project=""
        if [[ -n "$project_line" ]]; then
            project=$(echo "$project_line" | sed 's/^.*: //')
        fi

        if [[ -z "$project" ]]; then
            _flow_error "Cannot create worktree: no Target Project in plan"
            exit 1
        fi

        local slug
        slug=$(extract_slug "$plan_name")
        local branch="issue-${issue_number}-${slug}"

        local worktree_script="$SKILL_DIR/../git-worktrees/scripts/worktree.sh"
        if [[ ! -f "$worktree_script" ]]; then
            _flow_warn "git-worktrees skill not found, skipping worktree creation"
        else
            _flow_step "Creating worktree..."
            _flow_info "Project: $project, Branch: $branch"
            bash "$worktree_script" create "$project" "$branch" --no-install --no-test
        fi
    fi

    echo ""
    _flow_success "Plan status: executing"
    echo ""
    echo "Execute the plan, then run: flow.sh complete $issue_number"
    echo ""
    echo "Plan file: $plan_file"
}

# cmd_complete: Mark execution complete
cmd_complete() {
    local issue_number=""
    local create_pr=false

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --pr)
                create_pr=true
                shift
                ;;
            -*)
                _flow_error "Unknown option: $1"
                exit 1
                ;;
            *)
                if [[ -z "$issue_number" ]]; then
                    issue_number="$1"
                fi
                shift
                ;;
        esac
    done

    if [[ -z "$issue_number" ]]; then
        _flow_error "Issue number required"
        echo "Usage: flow.sh complete <issue> [--pr]"
        exit 1
    fi

    # 1. Find Plan file
    local plan_file
    plan_file=$(find_plan_by_issue "$issue_number") || {
        _flow_error "No plan found for Issue #$issue_number"
        exit 1
    }

    local plan_name
    plan_name=$(get_plan_name "$plan_file")

    _flow_info "Found plan: $plan_name"

    # 2. Get current status and validate transition
    local current_status
    current_status=$(get_current_status "$plan_file")

    _flow_info "Current status: $current_status"

    # 3. Validate state transition
    if ! validate_transition "$current_status" "completed"; then
        exit 1
    fi

    # 4. Update status
    set_plan_status "$plan_file" "completed"

    # 5. Sync Issue label
    sync_issue_label "$plan_file" "completed"

    # 6. Sync PLAN.md
    update_plan_md_status "$plan_name" "completed"

    # 7. Create PR if requested
    if [[ "$create_pr" == true ]]; then
        _flow_step "Creating PR..."
        local repo
        repo=$(get_space_repo)
        create_pr "$issue_number" --base main
    fi

    echo ""
    _flow_success "Plan status: completed"
    echo ""
    echo "Validate with real scenario, then: flow.sh validate $issue_number --confirm"
}

# cmd_validate: User validation confirmation
cmd_validate() {
    local issue_number=""
    local confirm=false

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --confirm)
                confirm=true
                shift
                ;;
            -*)
                _flow_error "Unknown option: $1"
                exit 1
                ;;
            *)
                if [[ -z "$issue_number" ]]; then
                    issue_number="$1"
                fi
                shift
                ;;
        esac
    done

    if [[ -z "$issue_number" ]]; then
        _flow_error "Issue number required"
        echo "Usage: flow.sh validate <issue> --confirm"
        exit 1
    fi

    # 1. Find Plan file
    local plan_file
    plan_file=$(find_plan_by_issue "$issue_number") || {
        _flow_error "No plan found for Issue #$issue_number"
        exit 1
    }

    local plan_name
    plan_name=$(get_plan_name "$plan_file")

    _flow_info "Found plan: $plan_name"

    # 2. Get current status and validate transition
    local current_status
    current_status=$(get_current_status "$plan_file")

    _flow_info "Current status: $current_status"

    # 3. Validate state transition
    if ! validate_transition "$current_status" "validated"; then
        exit 1
    fi

    # 4. If no --confirm, prompt for validation
    if [[ "$confirm" != true ]]; then
        echo ""
        echo "VALIDATION REQUIRED"
        echo ""
        echo "The plan execution is complete. Before archiving, you MUST:"
        echo "  1. Perform real-world scenario validation"
        echo "  2. Verify the changes work as expected"
        echo "  3. Confirm with the user (Sam)"
        echo ""
        echo "After validation passes, run:"
        echo "  flow.sh validate $issue_number --confirm"
        exit 0
    fi

    # 5. Update status
    set_plan_status "$plan_file" "validated"

    # 6. Sync Issue label
    sync_issue_label "$plan_file" "validated"

    # 7. Sync PLAN.md
    update_plan_md_status "$plan_name" "validated"

    echo ""
    _flow_success "Plan status: validated"
    echo ""
    echo "Next: flow.sh archive $issue_number"
}

# cmd_archive: Archive completed plan
cmd_archive() {
    local issue_number="$1"

    if [[ -z "$issue_number" ]]; then
        _flow_error "Issue number required"
        echo "Usage: flow.sh archive <issue>"
        exit 1
    fi

    # 1. Find Plan file
    local plan_file
    plan_file=$(find_plan_by_issue "$issue_number") || {
        _flow_error "No plan found for Issue #$issue_number"
        exit 1
    }

    local plan_name
    plan_name=$(get_plan_name "$plan_file")

    _flow_info "Found plan: $plan_name"

    # 2. Get current status and validate transition
    local current_status
    current_status=$(get_current_status "$plan_file")

    _flow_info "Current status: $current_status"

    # 3. Validate state transition
    if ! validate_transition "$current_status" "done"; then
        exit 1
    fi

    # Note: state-machine allows * -> draft, but we need validated -> done
    if [[ "$current_status" != "validated" ]]; then
        _flow_error "Plan must be validated before archiving"
        echo "Current status: $current_status"
        exit 1
    fi

    # 4. Archive plan (move to done/)
    local archived_file
    archived_file=$(archive_plan "$plan_file")

    # 5. Close Issue
    local repo
    repo=$(get_space_repo)
    close_issue "$issue_number" "$repo" --comment "Plan archived, closing issue."

    # 6. Mark PLAN.md done
    mark_plan_md_done "$plan_name"

    echo ""
    _flow_success "Plan archived: $archived_file"
    echo ""
    echo "Next: commit the changes"
}

# cmd_status: Show task status
cmd_status() {
    local issue_number="$1"

    if [[ -z "$issue_number" ]]; then
        _flow_error "Issue number required"
        echo "Usage: flow.sh status <issue>"
        exit 1
    fi

    # 1. Get Issue info
    local repo
    repo=$(get_space_repo)

    _flow_step "Fetching Issue #$issue_number info..."
    local issue_info
    issue_info=$(get_issue_info "$issue_number" "$repo") || {
        _flow_error "Issue #$issue_number not found"
        exit 1
    }

    local title state
    title=$(echo "$issue_info" | jq -r '.title')
    state=$(echo "$issue_info" | jq -r '.state')
    local labels
    labels=$(echo "$issue_info" | jq -r '.labels[].name' | tr '\n' ' ')

    echo ""
    echo "Issue #$issue_number"
    echo "  Title: $title"
    echo "  State: $state"
    echo "  Labels: $labels"
    echo ""

    # 2. Find Plan file
    local plan_file
    plan_file=$(find_plan_by_issue "$issue_number") || {
        _flow_warn "No plan linked to this Issue"
        exit 0
    }

    local plan_name
    plan_name=$(get_plan_name "$plan_file")

    # 3. Get Plan metadata
    local metadata
    metadata=$(get_plan_metadata "$plan_file")

    local status prd project created mode
    status=$(echo "$metadata" | grep '^status=' | cut -d= -f2)
    prd=$(echo "$metadata" | grep '^prd=' | cut -d= -f2)
    project=$(echo "$metadata" | grep '^project=' | cut -d= -f2 || true)
    created=$(echo "$metadata" | grep '^created=' | cut -d= -f2)
    mode=$(echo "$metadata" | grep '^mode=' | cut -d= -f2)

    local status_icon
    case "$status" in
        draft)     status_icon="draft" ;;
        refining)  status_icon="refining" ;;
        reviewed)  status_icon="reviewed" ;;
        executing) status_icon="executing" ;;
        completed) status_icon="completed" ;;
        validated) status_icon="validated" ;;
        *)         status_icon="?" ;;
    esac

    echo "Plan: $plan_name"
    echo "  File: $plan_file"
    echo "  Status: $status_icon"
    echo "  PRD: ${prd:-<none>}"
    echo "  Created: $created"
    echo "  Mode: $mode"

    # 4. Check worktree status
    local slug
    slug=$(extract_slug "$plan_name")
    local worktree_path="$ROOT_DIR/.worktrees/issue-${issue_number}-${slug}"

    if [[ -d "$worktree_path" ]]; then
        echo ""
        echo "Worktree: $worktree_path"
        local wt_branch
        wt_branch=$(cd "$worktree_path" && git branch --show-current 2>/dev/null || echo "detached")
        echo "  Branch: $wt_branch"
    fi

    echo ""
    echo "State Machine: draft -> refining -> reviewed -> executing -> completed -> validated -> done"
    echo "               Current: $status"
}

# cmd_list: List active plans
cmd_list() {
    local root_dir="$(_find_flow_root)"

    echo "Active Plans"
    echo "============"
    echo ""

    local found=0

    # Search in all plan directories
    local search_dirs=(
        "$root_dir/docs/products/plans"
        "$root_dir/docs/products/agent-tools/plans"
        "$root_dir/docs/products/wopal-cli/plans"
        "$root_dir/docs/products/space/plans"
    )

    for search_dir in "${search_dirs[@]}"; do
        if [[ ! -d "$search_dir" ]]; then
            continue
        fi

        while IFS= read -r -d '' plan_file; do
            # Skip done/ directory
            if [[ "$plan_file" == *"/done/"* ]]; then
                continue
            fi

            local status
            status=$(grep -m1 '^\- \*\*Status\*\*:' "$plan_file" 2>/dev/null | sed 's/^.*: //' || echo "draft")

            # Skip done status
            if [[ "$status" == "done" ]]; then
                continue
            fi

            local plan_name
            plan_name=$(basename "$plan_file" .md)

            local issue_line
            issue_line=$(grep -m1 '^\- \*\*Issue\*\*:' "$plan_file" 2>/dev/null || true)
            local issue_nums=""
            while [[ "$issue_line" =~ \#([0-9]+) ]]; do
                issue_nums+="#${BASH_REMATCH[1]} "
                issue_line="${issue_line#*#${BASH_REMATCH[1]}}"
            done

            local project
            project=$(grep -m1 '^\- \*\*Target Project\*\*:' "$plan_file" 2>/dev/null | sed 's/^.*: //' || echo "space")

            ((found++))
            echo "[$status] $plan_name"
            echo "  Issue: ${issue_nums:-<none>}"
            echo "  Project: $project"
            echo "  File: $plan_file"
            echo ""
        done < <(find "$search_dir" -name "*.md" -print0 2>/dev/null)
    done

    if [[ $found -eq 0 ]]; then
        echo "No active plans found."
    else
        echo "Total: $found active plan(s)"
    fi
}

# cmd_decompose_prd: Create Issues from PRD
cmd_decompose_prd() {
    local prd_path=""
    local dry_run=false
    local project=""

    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --dry-run)
                dry_run=true
                shift
                ;;
            --project)
                project="$2"
                shift 2
                ;;
            -*)
                _flow_error "Unknown option: $1"
                exit 1
                ;;
            *)
                if [[ -z "$prd_path" ]]; then
                    prd_path="$1"
                fi
                shift
                ;;
        esac
    done

    if [[ -z "$prd_path" ]]; then
        _flow_error "PRD path required"
        echo "Usage: flow.sh decompose-prd <prd-path> [--dry-run] [--project <name>]"
        exit 1
    fi

    local root_dir="$(_find_flow_root)"
    local full_prd_path="$root_dir/$prd_path"

    if [[ ! -f "$full_prd_path" ]]; then
        _flow_error "PRD file not found: $full_prd_path"
        exit 1
    fi

    _flow_info "Parsing PRD: $prd_path"

    # Extract Implementation Phases from PRD
    local phases_section
    phases_section=$(sed -n '/## Implementation Phases/,/^## /p' "$full_prd_path" | head -n -1)

    if [[ -z "$phases_section" ]]; then
        _flow_warn "No '## Implementation Phases' section found in PRD"
        echo "Looking for Phase sections..."

        # Alternative: look for ### Phase headers
        while IFS= read -r line; do
            if [[ "$line" =~ ^###\ Phase\ ([0-9]+):?\ (.*) ]]; then
                local phase_num="${BASH_REMATCH[1]}"
                local phase_title="${BASH_REMATCH[2]}"

                echo ""
                echo "Phase $phase_num: $phase_title"
                echo "  Would create Issue: [Phase $phase_num] $phase_title"

                if [[ "$dry_run" != true ]]; then
                    # TODO: Implement Issue creation
                    _flow_warn "Issue creation not yet implemented. Use --dry-run to preview."
                fi
            fi
        done < "$full_prd_path"
    else
        echo ""
        echo "Found Implementation Phases section"
        echo "Dry run: $dry_run"
        echo ""

        if [[ "$dry_run" == true ]]; then
            echo "$phases_section"
        else
            _flow_warn "Issue creation not yet implemented. Use --dry-run to preview."
        fi
    fi
}

# cmd_reset: Reset plan to draft
cmd_reset() {
    local issue_number="$1"

    if [[ -z "$issue_number" ]]; then
        _flow_error "Issue number required"
        echo "Usage: flow.sh reset <issue>"
        exit 1
    fi

    # 1. Find Plan file
    local plan_file
    plan_file=$(find_plan_by_issue "$issue_number") || {
        _flow_error "No plan found for Issue #$issue_number"
        exit 1
    }

    local plan_name
    plan_name=$(get_plan_name "$plan_file")

    _flow_warn "This will reset plan '$plan_name' to draft status"
    _flow_warn "This is a destructive operation that will lose current progress"
    echo ""
    read -p "Are you sure? (y/N): " confirm

    if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
        echo "Aborted."
        exit 0
    fi

    # 2. Reset status
    set_plan_status "$plan_file" "draft"

    # 3. Sync PLAN.md
    update_plan_md_status "$plan_name" "draft"

    echo ""
    _flow_success "Plan reset to draft: $plan_file"
}

# cmd_help: Show help
cmd_help() {
    cat << 'EOF'
dev-flow — 统一开发工作流

Usage: flow.sh <command> <issue> [options]

生命周期命令:
  start <issue> [--project <name>] [--prd <path>] [--priority <level>] [--deep]
                                    创建 Plan 并关联 Issue
  refine <issue>                    进入研究阶段
  review <issue> [--confirm]        提交评审
  dev <issue> [--worktree]          开始执行
  complete <issue> [--pr]           标记完成
  validate <issue> --confirm        用户验证确认
  archive <issue>                   归档并清理

查询命令:
  status <issue>                    查看任务状态
  list                              列出进行中任务
  decompose-prd <prd> [--dry-run] [--project <n>]
                                    从 PRD 创建 Issue

其他:
  reset <issue>                     重置到 draft 状态
  help                              显示帮助

状态机: draft → refining → reviewed → executing → completed → validated → done

选项说明:
  --project <name>   目标项目 (agent-tools, wopal-cli, space)
  --prd <path>       关联的 PRD 文件路径
  --priority <level> 优先级 (high, medium, low)
  --deep             深度分析模式
  --worktree         在隔离的 worktree 中执行
  --pr               完成时创建 PR
  --confirm          确认操作
  --dry-run          预览模式，不实际创建

示例:
  flow.sh start 42 --project agent-tools --prd docs/products/PRD-xxx.md
  flow.sh refine 42
  flow.sh review 42 --confirm
  flow.sh dev 42 --worktree
  flow.sh complete 42 --pr
  flow.sh validate 42 --confirm
  flow.sh archive 42
EOF
}

# ============================================
# Main Entry Point
# ============================================

case "${1:-help}" in
    start) shift; cmd_start "$@" ;;
    refine) shift; cmd_refine "$@" ;;
    review) shift; cmd_review "$@" ;;
    dev) shift; cmd_dev "$@" ;;
    complete) shift; cmd_complete "$@" ;;
    validate) shift; cmd_validate "$@" ;;
    archive) shift; cmd_archive "$@" ;;
    status) shift; cmd_status "$@" ;;
    list) shift; cmd_list "$@" ;;
    decompose-prd) shift; cmd_decompose_prd "$@" ;;
    reset) shift; cmd_reset "$@" ;;
    help|--help|-h) cmd_help ;;
    *)
        _flow_error "Unknown command: $1"
        cmd_help
        exit 1
        ;;
esac