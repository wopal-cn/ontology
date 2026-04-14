# Issue operations (space repo)
close_issue() {
    local issue_number="$1"
    shift
    local repo
    repo=$(get_space_repo)
    gh issue close "$issue_number" --repo "$repo" "$@"
}

# Helper functions for decompose-prd

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

# cmd_reset: Reset plan to planning (3-state model)
# Usage: flow.sh reset <issue-or-plan>
cmd_reset() {
    local input="$1"

    if [[ -z "$input" ]]; then
        log_error "Issue number or Plan name required"
        echo "Usage: flow.sh reset <issue-or-plan>"
        exit 1
    fi

    local plan_file
    plan_file=$(find_plan "$input") || {
        log_error "No plan found for: $input"
        exit 1
    }

    local plan_name
    plan_name=$(get_plan_name "$plan_file")

    log_warn "This will reset plan '$plan_name' to planning status"
    log_warn "This is a destructive operation that will lose current progress"
    echo ""
    read -p "Are you sure? (y/N): " confirm

    if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
        echo "Aborted."
        exit 0
    fi

    set_plan_status "$plan_file" "planning"

    echo ""
    log_success "Plan reset to planning: $plan_file"
}

# cmd_help: Show help
cmd_help() {
    cat << 'EOF'
dev-flow — 统一开发工作流 (3-state model)

Usage: flow.sh <command> <issue> [options]

生命周期命令:
  new-issue --title "<title>" --project <name> --type <type> [options]
                                          创建规范化 Issue
                                          可选: --goal, --background, --scope, --out-of-scope, --reference, --body
  plan <issue> [--project <name>] [--prd <path>] [--check]
                                          创建 Plan 并进入规划阶段（含调查）
  approve <issue> --confirm [--worktree]
                                          审批通过 → 进入执行阶段
  complete <issue> [--pr]           完成开发，等待验收
  archive <issue> [--confirm]       归档（PR merged 或用户确认）

查询命令:
  status <issue>                   查看任务状态
  list                             列出进行中任务
  decompose-prd <prd> [--dry-run] [--project <n>]
                                          从 PRD 创建 Issue

其他:
  reset <issue>                    重置到 planning 状态
  help                             显示帮助

状态机 (3-state): planning -> executing -> done
                     ↑               ↑
                创建 Plan       用户确认审批/验证

Label 子状态:
  validation/awaiting - 等待用户验证（叠加，不替换主状态）
  validation/passed   - 用户验证通过（叠加）
  pr/opened           - PR 已创建（叠加）

选项说明:
  --project <name>   目标项目 (如: ontology, wopal-cli, space)
  --type <type>      Issue 类型 (feature, fix, refactor, docs, chore)
  --title "<title>"  Issue 标题
  --body "<body>"    Issue 内容
  --prd <path>       关联的 PRD 文件路径
  --worktree         在隔离的 worktree 中执行
  --pr               完成时创建 PR
  --confirm          确认操作（仅限用户执行）
  --check            仅运行文档检查
  --dry-run          预览模式

示例:
  # 创建 Issue
  flow.sh new-issue --title "feat(cli): add skills remove" --project wopal-cli --type feature
  
  # 完整工作流（无 PR）
  flow.sh plan 42
  flow.sh approve 42 --confirm
  flow.sh complete 42
  flow.sh archive 42 --confirm
  
  # 完整工作流（有 PR）
  flow.sh plan 42
  flow.sh approve 42 --confirm --worktree
  flow.sh complete 42 --pr
  flow.sh archive 42

旧命令兼容:
  create → new-issue
  start → plan
  spike → (已废弃，调查内嵌在 plan)
  dev → (已废弃，approve --confirm 进入 executing)
  validate → (已废弃，archive --confirm 处理验证)
EOF
}