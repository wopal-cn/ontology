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