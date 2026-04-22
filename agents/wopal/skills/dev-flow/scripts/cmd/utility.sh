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

# cmd_reset: Reset plan to planning (4-state model)
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

    log_warn "Resetting plan '$plan_name' to planning status (destructive)"
    update_plan_status "$plan_file" "planning"

    # Sync Issue label back to status/planning (if Issue exists)
    # Also clear old verification/verifying labels
    local issue_number
    issue_number=$(extract_primary_plan_issue "$plan_file")
    
    if [[ -n "$issue_number" ]]; then
        local repo
        repo=$(get_space_repo)
        sync_status_label_group "$issue_number" "status/planning" "$repo" >/dev/null 2>&1
        log_info "Issue #$issue_number label reset to status/planning"
        
        # Clear PR label if present
        remove_issue_label "$issue_number" "pr/opened" "$repo" >/dev/null 2>&1 || true
    fi

    echo ""
    log_success "Plan reset to planning: $plan_file"
}

# cmd_help: Show help
cmd_help() {
    cat << 'EOF'
dev-flow — 统一开发工作流 (4-state model)

Usage: flow.sh <command> <issue> [options]

生命周期命令:
  issue create --title "<title>" --project <name> [--type <type>] [options]
                                            创建规范化 Issue
                                            可选: --goal, --background, --scope, --out-of-scope, --reference, --body
                                            类型专属: --baseline/--target, --affected-components/--refactor-strategy,
                                                       --target-documents/--audience, --test-scope/--test-strategy
                                            不传 --type 时从 title 前缀推断
  issue update <issue> [options]           更新结构化 Issue（Task 4 实现）
  sync <issue> [--body-only|--labels-only]
                                            手动同步 Plan 内容/labels 到 Issue（不推进状态）
  plan <issue> [--project <name>] [--prd <path>] [--check]
                                           创建 Plan 并进入规划阶段（含调查）
  approve <issue> --confirm [--worktree]
                                           审批通过 → 进入执行阶段
                                           ⚠️ 收到用户审批授权后由 agent 执行
  complete <issue> [--pr]           完成开发 → 进入验证阶段
  verify <issue> --confirm          用户验证通过 → 完成
                                           ⚠️ 收到用户验证授权后由 agent 执行
  archive <issue>                   归档收尾（Plan 已 done）

查询命令:
  status <issue>                   查看任务状态
  list                             列出进行中任务
  decompose-prd <prd> [--dry-run] [--project <n>]
                                           从 PRD 创建 Issue

其他:
  reset <issue>                    重置到 planning 状态
  help                             显示帮助

状态机 (4-state): planning -> executing -> verifying -> done
                      ↑               ↑               ↑
                 创建 Plan       审批通过        用户验证通过

Label 状态映射:
  planning   -> status/planning
  executing  -> status/in-progress
  verifying  -> status/verifying
  done       -> Issue closed

Overlay Labels:
  pr/opened  - PR 已创建（叠加在 verifying 上）

选项说明:
  --project <name>   目标项目 (如: ontology, wopal-cli, space)
  --type <type>      Issue 类型 (feature, fix, perf, refactor, docs, test, chore, enhance)
  --title "<title>"  Issue 标题
  --body "<body>"    Issue 内容
  --reference <path>  Research 文档或外部引用
  --prd <path>       关联的 PRD 文件路径
  --worktree         在隔离的 worktree 中执行（前置检查优先）
  --pr               完成时创建 PR
  --confirm          用户授权确认（由 agent 执行，不是让用户执行脚本）

示例:
  # 创建 Issue
  flow.sh issue create --title "feat(cli): add skills remove" --project wopal-cli

  # 手动同步 Plan 到 Issue（不改变状态）
  flow.sh sync 42
  
  # 完整工作流（无 PR）
  flow.sh plan 42
  flow.sh approve 42 --confirm
  flow.sh complete 42
  flow.sh verify 42 --confirm
  flow.sh archive 42
  
  # 完整工作流（有 PR）
  flow.sh plan 42
  flow.sh approve 42 --confirm --worktree
  flow.sh complete 42 --pr
  # 等待 PR merge 且用户确认后
  flow.sh verify 42 --confirm
  flow.sh archive 42

EOF
}
