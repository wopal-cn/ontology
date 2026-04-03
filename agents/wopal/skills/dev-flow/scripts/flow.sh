#!/bin/bash
# dev-flow — 统一开发工作流 (5-state model)
# Usage: flow.sh <command> <issue> [options]
#
# Commands:
#   create              创建规范化的 Issue
#   start <issue>       创建 Plan 并进入调查阶段
#   spike <issue>       调查研究阶段
#   plan <issue>        进入计划阶段
#   approve <issue>     提交审批
#   dev <issue>         开始执行
#   complete <issue>    标记完成
#   validate <issue>    用户验证确认
#   archive <issue>     归档并清理
#   status <issue>      查看任务状态
#   list                列出进行中任务
#   decompose-prd <prd> 从 PRD 创建 Issue
#   reset <issue>       重置到 investigating 状态
#   help                显示帮助

set -e

# ============================================
# Path Detection & Library Loading
# ============================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"

# Load shared utilities first
source "$SKILL_DIR/lib/common.sh"

# Load libraries
source "$SKILL_DIR/lib/state-machine.sh"
source "$SKILL_DIR/lib/issue.sh"
source "$SKILL_DIR/lib/plan.sh"
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

_project_from_plan() {
    local plan_file="$1"
    grep -m1 '^\- \*\*Target Project\*\*:' "$plan_file" 2>/dev/null | sed 's/^.*: //' || true
}

_create_phase_issue() {
    local phase_num="$1"
    local phase_title="$2"
    local project="$3"
    local prd_path="$4"
    local issue_body="## Source

From PRD: [$prd_path](../$prd_path)

## Phase Description

$phase_title

---

This Issue was auto-created by dev-flow decompose-prd."

    create_issue \
        --title "[Phase $phase_num] $phase_title" \
        --project "${project:-space}" \
        --type "feature" \
        --body "$issue_body" 2>/dev/null | grep -oE '[0-9]+$'
}

_process_phase_lines() {
    local input_source="$1"
    local dry_run="$2"
    local project="$3"
    local prd_path="$4"
    local created_issues=()
    local line

    while IFS= read -r line; do
        [[ "$line" =~ ^###\ Phase\ ([0-9]+):?\ (.*) ]] || continue

        local phase_num="${BASH_REMATCH[1]}"
        local phase_title="${BASH_REMATCH[2]}"

        echo ""
        echo "Phase $phase_num: $phase_title"

        if [[ "$dry_run" == true ]]; then
            echo "  Would create Issue: [Phase $phase_num] $phase_title"
            continue
        fi

        local issue_num
        issue_num=$(_create_phase_issue "$phase_num" "$phase_title" "$project" "$prd_path")
        if [[ -n "$issue_num" ]]; then
            created_issues+=("#$issue_num")
            log_success "Issue #$issue_num created: [Phase $phase_num] $phase_title"
        else
            log_error "Failed to create Issue for Phase $phase_num"
        fi
    done <<< "$input_source"

    if [[ "$dry_run" != true && ${#created_issues[@]} -gt 0 ]]; then
        echo ""
        log_success "Created ${#created_issues[@]} Issues: ${created_issues[*]}"
    fi
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
    echo "$plan_name" | sed -E 's/.*-[a-z]+-([a-z0-9-]+)$/\1/'
}

# Get plan name from file path
get_plan_name() {
    local plan_file="$1"
    basename "$plan_file" .md
}

# ============================================
# Command Implementations
# ============================================

# cmd_start: Create Plan and enter investigating phase
cmd_start() {
    local issue_number=""
    local project=""
    local prd_path=""
    local deep_mode=false

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
            --deep)
                deep_mode=true
                shift
                ;;
            -*)
                log_error "Unknown option: $1"
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

    _ensure_arg "Issue number" "$issue_number" || {
        echo "Usage: flow.sh start <issue> [--project <name>] [--prd <path>]"
        exit 1
    }

    local repo issue_info title plan_type slug plan_name plan_dir plan_file deep_flag plan_rel_path
    repo=$(get_space_repo)
    issue_info=$(get_issue_info "$issue_number" "$repo")
    title=$(echo "$issue_info" | jq -r '.title')

    if [[ -z "$project" ]]; then
        project=$(extract_project "$issue_info")
        if [[ -z "$project" ]]; then
            log_error "Cannot determine project from Issue #$issue_number"
            log_error "Please add a 'project/<name>' label to the Issue"
            return 1
        fi
    fi

    PLAN_PROJECT="$project"

    plan_type=$(_resolve_plan_type_from_issue "$title" "$issue_info")
    slug=$(title_to_slug "$title")
    slug=$(echo "$slug" | sed -E 's/^(fix|feat|feature|enhance|refactor|docs|chore|test)-//')

    plan_name="${project}-${plan_type}-${slug}"
    plan_dir=$(resolve_plan_dir --project "$project")
    mkdir -p "$plan_dir"

    plan_file="$plan_dir/${plan_name}.md"

    if [[ -f "$plan_file" ]]; then
        log_error "Plan already exists: $plan_file"
        exit 1
    fi

    deep_flag=""
    [[ "$deep_mode" == true ]] && deep_flag="--deep"

    create_plan "$plan_name" --project "$project" --issue "$issue_number" --type "$plan_type" ${prd_path:+--prd "$prd_path"} ${deep_flag} >/dev/null

    plan_rel_path="docs/products/${project}/plans/${plan_name}.md"
    update_issue_link "$issue_number" "$repo" "plan" "[${plan_name}](../${plan_rel_path})"

    ensure_issue_labels "$issue_number" "$plan_file" "$repo"

    echo "Plan: $plan_file"
    echo "Issue: #$issue_number | Project: $project | Status: investigating"
    echo "Next: flow.sh plan $issue_number"
}

# cmd_spike: Research/spike phase (stay in investigating)
cmd_spike() {
    local issue_number=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            -*)
                log_error "Unknown option: $1"
                echo "Usage: flow.sh spike <issue>"
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
        log_error "Issue number required"
        exit 1
    fi

    local plan_file
    plan_file=$(find_plan_by_issue "$issue_number") || {
        log_error "No plan found for Issue #$issue_number"
        exit 1
    }

    local plan_name
    plan_name=$(get_plan_name "$plan_file")

    log_info "Found plan: $plan_name"

    local current_status
    current_status=$(get_current_status "$plan_file")

    log_info "Current status: $current_status"

    # Allow spike from investigating or planning
    if [[ "$current_status" != "investigating" && "$current_status" != "planning" ]]; then
        log_error "Spike phase only valid in investigating or planning state"
        echo "Current status: $current_status"
        exit 1
    fi

    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "SPIKE / INVESTIGATION MODE"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    echo "Plan file: $plan_file"
    echo ""
    echo "Phase 1: Deep Codebase Investigation"
    echo "─────────────────────────────────────"
    echo ""
    echo "1. IDENTIFY COMPONENTS"
    echo "   - Which modules/subsystems are involved?"
    echo "   - Don't guess from names — read code to confirm"
    echo ""
    echo "2. READ SOURCE FILES THOROUGHLY"
    echo "   - Not just grep — understand the logic"
    echo "   - Follow call chains from entry point"
    echo ""
    echo "3. MAP CURRENT ARCHITECTURE"
    echo "   - How do components interact?"
    echo "   - What's the data flow? Where are boundaries?"
    echo ""
    echo "4. IDENTIFY EXACT CODE PATHS TO CHANGE"
    echo "   - Provide file paths AND line numbers"
    echo "   - Name functions, structs, modules"
    echo ""
    echo "5. ASSESS COMPLEXITY"
    echo "   - Low: Isolated change, <3 files, clear path"
    echo "   - Medium: Multiple files, some design decisions"
    echo "   - High: Cross-cutting, architectural decisions, unknowns"
    echo ""
    echo "6. IDENTIFY RISKS & EDGE CASES"
    echo "   - What could go wrong?"
    echo "   - What trade-offs exist?"
    echo "   - What decisions need human input?"
    echo ""
    echo "7. CHECK EXISTING PATTERNS"
    echo "   - How are similar features implemented?"
    echo "   - Implementation should be consistent"
    echo ""
    echo "8. LOOK AT TESTS"
    echo "   - What test patterns exist?"
    echo "   - What coverage is expected?"
    echo ""
    echo "9. CHECK ARCHITECTURE DOCS"
    echo "   - Review relevant docs in docs/"
    echo ""
    echo "10. DETERMINE ISSUE TYPE"
    echo "    - feat / fix / refactor / chore / perf / docs"
    echo ""
    echo "Phase 2: Update Plan Document"
    echo "─────────────────────────────────────"
    echo ""
    echo "Fill in these sections:"
    echo ""
    echo "## Scope Assessment"
    echo "- Complexity: Low|Medium|High"
    echo "- Confidence: High|Medium|Low"
    echo ""
    echo "## Technical Context"
    echo "- Current architecture in affected area"
    echo "- Why a change is needed"
    echo ""
    echo "## Affected Components"
    echo "| Component | Key Files | Role |"
    echo "|-----------|-----------|------|"
    echo ""
    echo "## Code References"
    echo "| Location | Description |"
    echo "|----------|-------------|"
    echo "| file:line | what this does |"
    echo ""
    echo "## Risks & Open Questions"
    echo "- Risk or unknown that needs human judgment"
    echo "- Design decision that could go either way"
    echo ""
    echo "## Test Considerations"
    echo "- Testing strategy"
    echo "- Test levels needed: unit, integration, e2e"
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "When investigation complete:"
    echo "  flow.sh plan $issue_number"
    echo "═══════════════════════════════════════════════════════════════"
}

# cmd_plan: Move from investigating to planning phase
cmd_plan() {
    local issue_number=""
    local check_only=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --check)
                check_only=true
                shift
                ;;
            -*)
                log_error "Unknown option: $1"
                echo "Usage: flow.sh plan <issue> [--check]"
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
        log_error "Issue number required"
        exit 1
    fi

    local plan_file
    plan_file=$(find_plan_by_issue "$issue_number") || {
        log_error "No plan found for Issue #$issue_number"
        exit 1
    }

    local plan_name
    plan_name=$(get_plan_name "$plan_file")

    log_info "Found plan: $plan_name"

    # --check mode: just run check-doc
    if [[ "$check_only" == true ]]; then
        log_step "Running document quality check..."
        echo ""
        if check_doc_plan "$plan_file"; then
            echo ""
            log_success "Plan passes validation!"
            echo ""
            echo "Ready for approval: flow.sh approve $issue_number"
        else
            echo ""
            log_error "Plan has issues. Fix and run: flow.sh plan $issue_number --check"
        fi
        exit 0
    fi

    local current_status
    current_status=$(get_current_status "$plan_file")

    log_info "Current status: $current_status"

    # Validate transition
    if ! validate_transition "$current_status" "planning"; then
        exit 1
    fi

    # Update status
    set_plan_status "$plan_file" "planning"

    # Ensure Issue labels are correct
    local repo
    repo=$(get_space_repo)
    log_step "Ensuring Issue labels..."
    ensure_issue_labels "$issue_number" "$plan_file" "$repo"

    echo ""
    log_success "Plan status: planning"
    echo ""
    echo "Planning workflow:"
    echo "  1. Fill in all sections (Goal, Scope, Files, Tasks)"
    echo "  2. Run: flow.sh plan $issue_number --check  (validate anytime)"
    echo "  3. Run: flow.sh approve $issue_number"
    echo ""
    echo "Plan file: $plan_file"
}

# cmd_approve: Submit for approval (planning -> approved)
cmd_approve() {
    local issue_number=""
    local confirm=false
    local update_issue=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --confirm)
                confirm=true
                shift
                ;;
            --update-issue)
                update_issue=true
                shift
                ;;
            -*)
                log_error "Unknown option: $1"
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
        log_error "Issue number required"
        echo "Usage: flow.sh approve <issue> [--confirm] [--update-issue]"
        exit 1
    fi

    local plan_file
    plan_file=$(find_plan_by_issue "$issue_number") || {
        log_error "No plan found for Issue #$issue_number"
        exit 1
    }

    local plan_name
    plan_name=$(get_plan_name "$plan_file")

    log_info "Found plan: $plan_name"

    local current_status
    current_status=$(get_current_status "$plan_file")

    log_info "Current status: $current_status"

    # Validate transition
    if ! validate_transition "$current_status" "approved"; then
        exit 1
    fi

    # Run check-doc first
    log_step "Running document quality check..."
    if ! check_doc_plan "$plan_file"; then
        echo ""
        log_error "Plan failed check-doc validation"
        echo "Fix the issues and retry: flow.sh approve $issue_number"
        exit 1
    fi

    # If no --confirm, wait for user confirmation
    if [[ "$confirm" != true ]]; then
        echo ""
        echo "═══════════════════════════════════════════════════════════════"
        echo "PLAN READY FOR APPROVAL"
        echo "═══════════════════════════════════════════════════════════════"
        echo ""
        echo "Plan file: $plan_file"
        echo ""
        echo "After user (Sam) reviews and approves, run:"
        echo "  flow.sh approve $issue_number --confirm"
        echo ""
        echo "═══════════════════════════════════════════════════════════════"
        exit 0
    fi

    # Update status
    set_plan_status "$plan_file" "approved"

    # Sync approved plan to Issue (only when --update-issue is set)
    local repo
    repo=$(get_space_repo)
    if [[ "$update_issue" == true ]]; then
        log_step "Syncing approved plan to Issue..."
        sync_plan_to_issue "$issue_number" "$plan_file" "$repo"
    else
        log_info "Skipping Issue update (use --update-issue to sync)"
    fi
    
    # Ensure Issue labels are correct
    log_step "Ensuring Issue labels..."
    ensure_issue_labels "$issue_number" "$plan_file" "$repo"

    # Sync Issue label
    sync_issue_label "$plan_file" "approved"

    echo ""
    log_success "Plan status: approved (user approved)"
    echo ""
    echo "Next: flow.sh dev $issue_number [--worktree]"
}

# cmd_dev: Start execution (approved -> executing)
cmd_dev() {
    local issue_number=""
    local use_worktree=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --worktree)
                use_worktree=true
                shift
                ;;
            -*)
                log_error "Unknown option: $1"
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
        log_error "Issue number required"
        echo "Usage: flow.sh dev <issue> [--worktree]"
        exit 1
    fi

    local plan_file
    plan_file=$(find_plan_by_issue "$issue_number") || {
        log_error "No plan found for Issue #$issue_number"
        exit 1
    }

    local plan_name
    plan_name=$(get_plan_name "$plan_file")

    log_info "Found plan: $plan_name"

    local current_status
    current_status=$(get_current_status "$plan_file")

    log_info "Current status: $current_status"

    # Validate transition
    if ! validate_transition "$current_status" "executing"; then
        exit 1
    fi

    # Update status
    set_plan_status "$plan_file" "executing"

    # Sync Issue label
    sync_issue_label "$plan_file" "executing"

    # Create worktree if requested
    if [[ "$use_worktree" == true ]]; then
        local project_line
        project_line=$(grep -m1 '^\- \*\*Target Project\*\*:' "$plan_file" || true)
        local project=""
        if [[ -n "$project_line" ]]; then
            project=$(echo "$project_line" | sed 's/^.*: //')
        fi

        if [[ -z "$project" ]]; then
            log_error "Cannot create worktree: no Target Project in plan"
            exit 1
        fi

        local slug
        slug=$(extract_slug "$plan_name")
        local branch="issue-${issue_number}-${slug}"

        local worktree_script="$SKILL_DIR/../git-worktrees/scripts/worktree.sh"
        if [[ ! -f "$worktree_script" ]]; then
            log_warn "git-worktrees skill not found, skipping worktree creation"
        else
            log_step "Creating worktree..."
            log_info "Project: $project, Branch: $branch"
            bash "$worktree_script" create "$project" "$branch" --no-install --no-test
        fi
    fi

    echo ""
    log_success "Plan status: executing"
    echo ""
    echo "Execute the plan, then run: flow.sh complete $issue_number"
    echo ""
    echo "Plan file: $plan_file"
}

# cmd_complete: Mark execution complete (with validation path)
cmd_complete() {
    local issue_number=""
    local create_pr=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --pr)
                create_pr=true
                shift
                ;;
            -*)
                log_error "Unknown option: $1"
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
        log_error "Issue number required"
        echo "Usage: flow.sh complete <issue> [--pr]"
        exit 1
    fi

    local plan_file
    plan_file=$(find_plan_by_issue "$issue_number") || {
        log_error "No plan found for Issue #$issue_number"
        exit 1
    }

    local plan_name
    plan_name=$(get_plan_name "$plan_file")

    log_info "Found plan: $plan_name"

    local current_status
    current_status=$(get_current_status "$plan_file")

    log_info "Current status: $current_status"

    # Must be in executing state
    if [[ "$current_status" != "executing" ]]; then
        log_error "Plan must be in executing state to complete"
        echo "Current status: $current_status"
        exit 1
    fi

    # Check Acceptance Criteria
    log_step "Verifying Acceptance Criteria..."
    if ! check_acceptance_criteria "$plan_file"; then
        echo ""
        log_error "Cannot complete: Acceptance Criteria not satisfied"
        echo ""
        echo "Please complete the remaining items and update the Plan file:"
        echo "  $plan_file"
        echo ""
        echo "After completing, run: flow.sh complete $issue_number"
        exit 1
    fi

    local repo
    repo=$(get_space_repo)

    # Extract Target Project from Plan
    local project
    project=$(grep -m1 '^\- \*\*Target Project\*\*:' "$plan_file" 2>/dev/null | sed 's/^.*: //' || true)

    # Two paths: with PR or without PR
    if [[ "$create_pr" == true ]]; then
        # With PR path: add pr/opened label
        if [[ -z "$project" ]]; then
            log_error "Cannot create PR: no Target Project in plan"
            exit 1
        fi
        
        log_step "Creating PR..."
        log_info "Target Project: $project"
        add_pr_label "$issue_number" "$repo"
        create_pr "$issue_number" --project "$project" --base main

        echo ""
        log_success "Execution complete with PR"
        echo ""
        echo "PR Path:"
        echo "  1. Wait for PR review"
        echo "  2. After PR merged, run: flow.sh archive $issue_number"
    else
        # Without PR path: add validation/awaiting label
        add_validation_label "$issue_number" "awaiting" "$repo"

        echo ""
        log_success "Execution complete, awaiting validation"
        echo ""
        echo "═══════════════════════════════════════════════════════════════"
        echo "USER VALIDATION REQUIRED"
        echo "═══════════════════════════════════════════════════════════════"
        echo ""
        echo "The implementation is complete. Please verify:"
        echo "  1. Perform real-world scenario validation"
        echo "  2. Verify the changes work as expected"
        echo ""
        echo "After validation passes, run:"
        echo "  flow.sh validate $issue_number --confirm"
        echo ""
        echo "═══════════════════════════════════════════════════════════════"
    fi
}

# cmd_validate: User validation confirmation (without PR path)
cmd_validate() {
    local issue_number=""
    local confirm=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --confirm)
                confirm=true
                shift
                ;;
            -*)
                log_error "Unknown option: $1"
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
        log_error "Issue number required"
        echo "Usage: flow.sh validate <issue> --confirm"
        exit 1
    fi

    local plan_file
    plan_file=$(find_plan_by_issue "$issue_number") || {
        log_error "No plan found for Issue #$issue_number"
        exit 1
    }

    local plan_name
    plan_name=$(get_plan_name "$plan_file")

    log_info "Found plan: $plan_name"

    # Check for validation/awaiting label (must have been completed without PR)
    local repo
    repo=$(get_space_repo)

    local issue_labels
    issue_labels=$(gh issue view "$issue_number" --repo "$repo" --json labels -q '.labels[].name' 2>/dev/null || true)

    if ! echo "$issue_labels" | grep -q "validation/awaiting"; then
        log_error "Issue does not have validation/awaiting label"
        echo "This command is for the no-PR validation path."
        echo "If you created a PR, wait for PR merge instead."
        exit 1
    fi

    # If no --confirm, show reminder
    if [[ "$confirm" != true ]]; then
        echo ""
        echo "Issue is awaiting user verification."
        echo ""
        echo "After user confirms validation passes, run:"
        echo "  flow.sh validate $issue_number --confirm"
        exit 0
    fi

    # Add validation/passed label
    add_validation_label "$issue_number" "passed" "$repo"

    echo ""
    log_success "Validation passed"
    echo ""
    echo "Next: flow.sh archive $issue_number"
}

# cmd_archive: Archive completed plan
cmd_archive() {
    local issue_number="$1"

    if [[ -z "$issue_number" ]]; then
        log_error "Issue number required"
        echo "Usage: flow.sh archive <issue>"
        exit 1
    fi

    local plan_file
    plan_file=$(find_plan_by_issue "$issue_number") || {
        log_error "No plan found for Issue #$issue_number"
        exit 1
    }

    local plan_name
    plan_name=$(get_plan_name "$plan_file")

    log_info "Found plan: $plan_name"

    local current_status
    current_status=$(get_current_status "$plan_file")

    log_info "Current status: $current_status"

    local repo
    repo=$(get_space_repo)

    # Check archive conditions:
    # 1. PR path: pr/opened label and PR is merged
    # 2. No-PR path: validation/passed label
    local issue_labels
    issue_labels=$(gh issue view "$issue_number" --repo "$repo" --json labels -q '.labels[].name' 2>/dev/null || true)

    local can_archive=false
    local archive_reason=""

    if echo "$issue_labels" | grep -q "validation/passed"; then
        can_archive=true
        archive_reason="validation/passed label present"
    elif echo "$issue_labels" | grep -q "pr/opened"; then
        # Check if PR is merged - parse PR URL from Issue body
        local pr_url
        pr_url=$(get_pr_url_from_issue "$issue_number" "$repo")
        
        if [[ -n "$pr_url" ]]; then
            log_info "Found PR URL: $pr_url"
            
            if is_pr_merged "$pr_url"; then
                can_archive=true
                archive_reason="PR merged: $pr_url"
            else
                log_error "PR exists but not merged yet"
                echo "PR URL: $pr_url"
                echo "Wait for PR to be merged before archiving."
                exit 1
            fi
        else
            # Fallback: try to find PR by branch name in Issue repo
            log_warn "No PR URL found in Issue body, checking Issue repo for merged PRs..."
            local pr_info
            pr_info=$(gh pr list --repo "$repo" --state merged --search "Closes #$issue_number" --json number,url 2>/dev/null || echo "[]")
            
            if [[ "$pr_info" != "[]" && "$pr_info" != "" ]]; then
                can_archive=true
                archive_reason="PR merged (found via search)"
            else
                log_error "Cannot determine PR status"
                echo "No PR URL in Issue body and no merged PR found referencing #$issue_number"
                echo ""
                echo "If PR is in a different repo, ensure PR URL is recorded in Issue body:"
                echo "  | PR | https://github.com/owner/repo/pull/123 |"
                exit 1
            fi
        fi
    fi

    if [[ "$can_archive" != true ]]; then
        log_error "Cannot archive: neither validation/passed nor merged PR found"
        echo "Complete validation first: flow.sh validate $issue_number --confirm"
        echo "Or wait for PR to be merged."
        exit 1
    fi

    log_info "Archive condition met: $archive_reason"

    # Update status to done
    set_plan_status "$plan_file" "done"

    # Archive plan file
    local archived_file
    archived_file=$(archive_plan "$plan_file")

    # Close Issue
    close_issue "$issue_number" --repo "$repo" --comment "Plan archived, closing issue."

    echo ""
    log_success "Plan archived: $archived_file"
    echo ""
    echo "Next: commit the changes"
}

# cmd_status: Show task status
cmd_status() {
    local issue_number="$1"

    if [[ -z "$issue_number" ]]; then
        log_error "Issue number required"
        echo "Usage: flow.sh status <issue>"
        exit 1
    fi

    local repo
    repo=$(get_space_repo)

    log_step "Fetching Issue #$issue_number info..."
    local issue_info
    issue_info=$(get_issue_info "$issue_number" "$repo") || {
        log_error "Issue #$issue_number not found"
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

    local plan_file
    plan_file=$(find_plan_by_issue "$issue_number") || {
        log_warn "No plan linked to this Issue"
        exit 0
    }

    local plan_name
    plan_name=$(get_plan_name "$plan_file")

    local metadata
    metadata=$(get_plan_metadata "$plan_file")

    local status prd project created
    status=$(echo "$metadata" | grep '^status=' | cut -d= -f2)
    prd=$(echo "$metadata" | grep '^prd=' | cut -d= -f2)
    project=$(echo "$metadata" | grep '^project=' | cut -d= -f2 || true)
    created=$(echo "$metadata" | grep '^created=' | cut -d= -f2)

    echo "Plan: $plan_name"
    echo "  File: $plan_file"
    echo "  Status: $status"
    echo "  PRD: ${prd:-<none>}"
    echo "  Created: $created"

    # Check worktree status
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
    echo "State Machine (5-state): investigating -> planning -> approved -> executing -> done"
    echo "               Current: $status"
}

# cmd_list: List active plans
cmd_list() {
    echo "Active Plans (from GitHub Issues)"
    echo "=================================="
    echo ""

    local repo
    repo=$(get_space_repo) || {
        log_error "Cannot get repo info"
        return 1
    }

    local issues
    issues=$(gh issue list --repo "$repo" --state open \
        --search 'label:status/planning OR label:status/approved OR label:status/in-progress' \
        --json number,title,labels \
        --jq '.[] | "\(.number)|\(.title)|\(.labels | map(.name) | join(","))"' 2>/dev/null)

    if [[ -z "$issues" ]]; then
        echo "No active issues found."
        return 0
    fi

    local count=0
    while IFS='|' read -r number title labels; do
        local status_label="unknown"
        for label in ${labels//,/ }; do
            case "$label" in
                status/planning)    status_label="planning" ;;
                status/approved)    status_label="approved" ;;
                status/in-progress) status_label="executing" ;;
            esac
        done

        ((count++))
        echo "[$status_label] #$number: $title"
    done <<< "$issues"

    echo ""
    echo "Total: $count active issue(s)"
}

# cmd_decompose_prd: Create Issues from PRD
cmd_decompose_prd() {
    local prd_path=""
    local dry_run=false
    local project=""

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
                log_error "Unknown option: $1"
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
        log_error "PRD path required"
        echo "Usage: flow.sh decompose-prd <prd-path> [--dry-run] [--project <name>]"
        exit 1
    fi

    local root_dir="$(find_workspace_root)"
    local full_prd_path="$root_dir/$prd_path"

    if [[ ! -f "$full_prd_path" ]]; then
        log_error "PRD file not found: $full_prd_path"
        exit 1
    fi

    log_info "Parsing PRD: $prd_path"

    # Extract Implementation Phases from PRD
    local phases_section
    phases_section=$(sed -n '/## Implementation Phases/,/^## /p' "$full_prd_path" | head -n -1)

    if [[ -z "$phases_section" ]]; then
        log_warn "No '## Implementation Phases' section found in PRD"
        echo "Looking for Phase sections..."
        _process_phase_lines "$(cat "$full_prd_path")" "$dry_run" "$project" "$prd_path"
    else
        echo ""
        log_info "Found Implementation Phases section"
        echo ""

        if [[ "$dry_run" == true ]]; then
            echo "$phases_section"
        else
            _process_phase_lines "$phases_section" "$dry_run" "$project" "$prd_path"
        fi
    fi
}

# cmd_reset: Reset plan to investigating
cmd_reset() {
    local issue_number="$1"

    if [[ -z "$issue_number" ]]; then
        log_error "Issue number required"
        echo "Usage: flow.sh reset <issue>"
        exit 1
    fi

    local plan_file
    plan_file=$(find_plan_by_issue "$issue_number") || {
        log_error "No plan found for Issue #$issue_number"
        exit 1
    }

    local plan_name
    plan_name=$(get_plan_name "$plan_file")

    log_warn "This will reset plan '$plan_name' to investigating status"
    log_warn "This is a destructive operation that will lose current progress"
    echo ""
    read -p "Are you sure? (y/N): " confirm

    if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
        echo "Aborted."
        exit 0
    fi

    set_plan_status "$plan_file" "investigating"

    echo ""
    log_success "Plan reset to investigating: $plan_file"
}

# cmd_create: Create a new Issue with proper labels
# Usage: flow.sh create --title "<title>" --project <name> --type <type> [options]
cmd_create() {
    local title=""
    local project=""
    local type=""
    local body=""
    local goal=""
    local background=""
    local scope=""
    local out_of_scope=""
    local reference=""
    
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --title)
                title="$2"
                shift 2
                ;;
            --project)
                project="$2"
                shift 2
                ;;
            --type)
                type="$2"
                shift 2
                ;;
            --body)
                body="$2"
                shift 2
                ;;
            --goal)
                goal="$2"
                shift 2
                ;;
            --background)
                background="$2"
                shift 2
                ;;
            --scope)
                scope="$2"
                shift 2
                ;;
            --out-of-scope)
                out_of_scope="$2"
                shift 2
                ;;
            --reference)
                reference="$2"
                shift 2
                ;;
            -*)
                log_error "Unknown option: $1"
                echo "Usage: flow.sh create --title \"<title>\" --project <name> --type <type>"
                echo "                     [--body \"<body>\"] [--goal \"<text>\"] [--background \"<text>\"]"
                echo "                     [--scope \"<items>\"] [--out-of-scope \"<items>\"] [--reference \"<path>\"]"
                exit 1
                ;;
            *)
                shift
                ;;
        esac
    done
    
    # Validate required args
    _ensure_arg "--title" "$title" "Missing --title" || {
        echo "Usage: flow.sh create --title \"<title>\" --project <name> --type <type>"
        exit 1
    }
    _ensure_arg "--project" "$project" "Missing --project" || {
        echo "Example: --project ontology"
        echo "Optional: --goal, --background, --scope, --out-of-scope, --reference"
        exit 1
    }
    _ensure_arg "--type" "$type" "Missing --type" || {
        echo "Available types: feature, fix, refactor, docs, chore, test"
        exit 1
    }
    
    # Validate project name format (allow any valid name)
    case "$project" in
        [a-z0-9-]*)
            ;;
        *)
            log_error "Invalid project name: $project"
            log_error "Project name must be lowercase alphanumeric with hyphens"
            exit 1
            ;;
    esac
    
    normalize_plan_type "$type" >/dev/null 2>&1 || {
        log_error "Invalid type: $type"
        echo "Available types: feature, fix, refactor, docs, chore, test"
        exit 1
    }
    
    # Build default body from template if not provided
    # Only use template when no body AND no structured params
    if [[ -z "$body" && -z "$goal" && -z "$background" && -z "$scope" && -z "$out_of_scope" && -z "$reference" ]]; then
        local template_file="$SKILL_DIR/templates/issue.md"
        if [[ -f "$template_file" ]]; then
            body=$(cat "$template_file")
        else
            log_error "Issue template not found: $template_file"
            exit 1
        fi
    fi
    
    # Create Issue using library function
    local issue_url
    issue_url=$(create_issue \
        --title "$title" \
        --project "$project" \
        --type "$type" \
        --body "$body" \
        ${goal:+--goal "$goal"} \
        ${background:+--background "$background"} \
        ${scope:+--scope "$scope"} \
        ${out_of_scope:+--out-of-scope "$out_of_scope"} \
        ${reference:+--reference "$reference"} \
        2>/dev/null)
    
    if [[ -z "$issue_url" ]]; then
        log_error "Failed to create Issue"
        exit 1
    fi
    
    # Extract issue number
    local issue_number
    issue_number=$(echo "$issue_url" | grep -oE '[0-9]+$')
    
    echo "Issue #${issue_number}: $issue_url"
    echo "Next: flow.sh start $issue_number"
}

# cmd_help: Show help
cmd_help() {
    cat << 'EOF'
dev-flow — 统一开发工作流 (5-state model)

Usage: flow.sh <command> <issue> [options]

生命周期命令:
  create --title "<title>" --project <name> --type <type> [options]
                                    创建规范化的 Issue
                                    可选: --goal, --background, --scope, --out-of-scope, --reference, --body
  start <issue> [--project <name>] [--prd <path>]
                                    创建 Plan 并进入调查阶段
  spike <issue>                    调查研究阶段（保持 investigating）
  plan <issue> [--check]           进入计划阶段
  approve <issue> [--confirm] [--update-issue]
                                    提交审批（用户确认后执行）
  dev <issue> [--worktree]         开始执行
  complete <issue> [--pr]          标记完成
  validate <issue> --confirm       用户验证确认（无 PR 路径）
  archive <issue>                  归档并清理

查询命令:
  status <issue>                   查看任务状态
  list                             列出进行中任务
  decompose-prd <prd> [--dry-run] [--project <n>]
                                    从 PRD 创建 Issue

其他:
  reset <issue>                    重置到 investigating 状态
  help                             显示帮助

状态机 (5-state): investigating -> planning -> approved -> executing -> done
                                              ↑                      ↑
                                         用户确认审批              验证通过后归档

选项说明:
  --project <name>   目标项目 (如: ontology, wopal-cli, space)
  --type <type>      Issue 类型 (feature, fix, refactor, docs, chore)
  --title "<title>"  Issue 标题
  --body "<body>"    Issue 内容
  --prd <path>       关联的 PRD 文件路径
  --worktree         在隔离的 worktree 中执行
  --pr               完成时创建 PR
  --confirm          确认操作（仅限用户执行）
  --update-issue     同步 Plan 到 Issue（Goal/Scope 有调整时使用）
  --check            仅运行文档检查
  --dry-run          预览模式

示例:
  # 创建 Issue（推荐方式）
  flow.sh create --title "feat(wopal-cli): add skills remove" --project wopal-cli --type feature
  
  # 完整工作流
  flow.sh start 42 --project ontology
  flow.sh spike 42
  flow.sh plan 42
  flow.sh approve 42 --confirm
  flow.sh dev 42 --worktree
  flow.sh complete 42 --pr
  flow.sh archive 42
EOF
}

# ============================================
# Main Entry Point
# ============================================

case "${1:-help}" in
    create)         shift; cmd_create "$@" ;;
    start)          shift; cmd_start "$@" ;;
    spike)          shift; cmd_spike "$@" ;;
    plan)           shift; cmd_plan "$@" ;;
    approve)        shift; cmd_approve "$@" ;;
    dev)            shift; cmd_dev "$@" ;;
    complete)       shift; cmd_complete "$@" ;;
    validate)       shift; cmd_validate "$@" ;;
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
