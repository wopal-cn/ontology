# cmd_approve: Approve plan and transition to executing phase
# 4-state model: planning -> executing -> verifying -> done
# --confirm triggers state transition to executing
# --worktree creates isolated worktree for execution
# Issue sync is automatic when plan has Issue link
#
# CRITICAL: Plan 文件有未提交变更时由 agent 手动 commit, 脚本不生成 commit message
#
# Usage:
#   flow.sh approve <issue> [--confirm] [--worktree]
#   flow.sh approve <plan-name> [--confirm] [--worktree]
cmd_approve() {
    local input=""
    local confirm=false
    local use_worktree=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --confirm)
                confirm=true
                shift
                ;;
            --worktree)
                use_worktree=true
                shift
                ;;
            -*)
                log_error "Unknown option: $1"
                echo "Usage: flow.sh approve <issue-or-plan> [--confirm] [--worktree]"
                exit 1
                ;;
            *)
                if [[ -z "$input" ]]; then
                    input="$1"
                fi
                shift
                ;;
        esac
    done

    if [[ -z "$input" ]]; then
        log_error "Issue number or Plan name required"
        echo "Usage: flow.sh approve <issue-or-plan> [--confirm] [--worktree]"
        exit 1
    fi

    # Smart lookup: Issue number OR Plan name
    local plan_file
    plan_file=$(find_plan "$input") || {
        log_error "No plan found for: $input"
        exit 1
    }

    local plan_name
    plan_name=$(get_plan_name "$plan_file")

    local current_status
    current_status=$(get_current_status "$plan_file")

    # State machine validates transition in update_plan_status

    # Extract Issue number (if plan has Issue link)
    local issue_number
    issue_number=$(grep "Issue.*#" "$plan_file" | grep -oE '#[0-9]+' | tr -d '#' | head -1 || true)

    local plan_relative_path
    plan_relative_path=$(realpath --relative-to="$ROOT_DIR" "$plan_file" 2>/dev/null || \
        echo "${plan_file#$ROOT_DIR/}")

    # Run check-doc first (capture output, only show on failure)
    local check_output
    check_output=$(check_doc_plan "$plan_file" 2>&1)
    if [[ $? -ne 0 ]]; then
        echo "$check_output"
        echo ""
        log_error "Plan failed check-doc validation"
        echo "Fix the issues and retry: flow.sh approve $input"
        exit 1
    fi

    # ============================================
    # Plan 文件检查（无论 confirm 与否都必须通过）
    # ============================================
    # Plan 变更必须由 agent 手动 commit（agent 了解方案内容，由它写 commit message）。
    # 脚本检测到 Plan 有未提交变更时阻断，提示 agent 先手动 commit。
    # ============================================

    local plan_git_status
    plan_git_status=$(git -C "$ROOT_DIR" status --porcelain -- "$plan_relative_path" 2>/dev/null || echo "")

    if [[ -n "$plan_git_status" ]]; then
        log_error "方案文件有未提交变更，必须先手动 commit 才能继续审批"
        echo ""
        echo "未提交文件:"
        echo "$plan_git_status" | while read -r line; do
            echo "  $line"
        done
        echo ""
        echo "请根据方案内容编写 commit message 后手动提交:"
        echo "  cd $ROOT_DIR"
        echo "  git add $(echo "$plan_relative_path" | sed 's/ /\\ /g')"
        echo "  git commit -m \"你的 commit message\""
        echo "然后重新执行: flow.sh approve $input"
        echo ""
        exit 1
    fi

    # ============================================
    # Plan push 检测（Issue link 需要文件存在于 GitHub）
    # 使用文件级 commit 可达性判断，而非仓库级 ahead 数
    # ============================================
    
    if [[ -n "$issue_number" ]]; then
        # 使用 is_file_pushed 判断 Plan 文件最后修改的 commit 是否已进入 origin/main
        is_file_pushed "$plan_relative_path" "origin/main"
        local push_status=$?
        
        if [[ $push_status -eq 2 ]]; then
            # 文件有未提交变更（但前面已检测过未提交变更并阻断，这里是意外路径）
            log_error "Plan 文件状态异常，请先提交后再审批"
            exit 1
        elif [[ $push_status -eq 1 ]]; then
            # Plan commit 未进入 origin/main
            log_error "方案文件已 commit 但未 push，Issue 链接无法打开"
            echo ""
            echo "请先 push 后再审批:"
            echo "  cd $ROOT_DIR && git push"
            echo ""
            echo "然后重新执行: flow.sh approve $input"
            exit 1
        fi
        # push_status -eq 0: Plan 已 push，继续审批流程
    fi

    # If no --confirm, wait for user confirmation
    if [[ "$confirm" != true ]]; then
        echo "Status: awaiting approval"
        echo "Plan validated. Next: flow.sh approve $input --confirm"
        echo ""
        echo "收到用户审批授权后，由 agent 执行:"
        echo "  flow.sh approve $input --confirm"
        exit 0
    fi

    # ============================================
    # PRE-FLIGHT CHECKS (before state transition)
    # ============================================

    local repo
    repo=$(get_space_repo)

    local project
    project=$(get_plan_project "$plan_file")

    # --- Pre-flight Check 1: Target Project dirty workspace ---
    local project_dir="$ROOT_DIR/projects/$project"
    local dirty_workspace=false

    if [[ -n "$project" && -d "$project_dir" ]]; then
        local git_status
        git_status=$(cd "$project_dir" && git status --porcelain 2>/dev/null || echo "")
        if [[ -n "$git_status" ]]; then
            dirty_workspace=true
        fi
    fi

    # --- Pre-flight Check 2: Worktree creation (if requested) ---
    local worktree_created=false
    local stashed=false
    local branch=""

    if [[ "$use_worktree" == true ]]; then
        if [[ -z "$project" ]]; then
            log_error "Cannot create worktree: no Target Project in plan"
            exit 1
        fi

        local slug
        slug=$(extract_slug "$plan_name")

        if [[ -n "$issue_number" ]]; then
            branch="issue-${issue_number}-${slug}"
        else
            branch="${slug}"
        fi

        # Stash dirty workspace changes before worktree creation
        if [[ "$dirty_workspace" == true ]]; then
            log_warn "目标项目 $project 有未提交的变更，自动 stash 以创建 worktree"
            if ! (cd "$project_dir" && git stash push -m "dev-flow: stash before worktree for #$issue_number" >/dev/null 2>&1); then
                log_error "Stash 失败，无法继续创建 worktree"
                exit 1
            fi
            stashed=true
            log_success "已 stash 未提交变更"
        fi

        local worktree_script="$SKILL_DIR/../git-worktrees/scripts/worktree.sh"
        if [[ ! -f "$worktree_script" ]]; then
            log_warn "git-worktrees skill not found, skipping worktree creation"
        else
            log_step "Pre-flight: creating worktree..."
            log_info "Project: $project, Branch: $branch"

            if bash "$worktree_script" create "$project" "$branch" --no-install --no-test 2>&1; then
                worktree_created=true
                log_success "Worktree created successfully"

                # Restore stashed changes to main workspace
                if [[ "$stashed" == true ]]; then
                    if (cd "$project_dir" && git stash pop >/dev/null 2>&1); then
                        log_success "已恢复之前 stash 的变更"
                    else
                        log_warn "Stash restore 失败，变更仍在 stash 中: cd $project_dir && git stash list"
                    fi
                fi
            else
                log_error "Worktree creation failed - aborting approve"

                # Restore stashed changes on failure
                if [[ "$stashed" == true ]]; then
                    (cd "$project_dir" && git stash pop >/dev/null 2>&1) || true
                    log_warn "已恢复之前 stash 的变更"
                fi

                echo ""
                echo "Plan 状态保持 planning，未进入 executing"
                echo "请检查 worktree 创建失败原因后重试"
                exit 1
            fi
        fi
    elif [[ "$dirty_workspace" == true ]]; then
        # No --worktree but dirty workspace: block and warn
        local git_status
        git_status=$(cd "$project_dir" && git status --porcelain 2>/dev/null || echo "")

        log_error "目标项目 $project 有未提交的变更"
        echo ""
        echo "未提交文件列表:"
        echo "$git_status" | head -10 | while read -r line; do
            echo "  $line"
        done
        echo ""
        echo "风险: 新任务与旧变更混在一起会污染当前 Issue，增加回滚与验证成本"
        echo ""
        echo "建议处理方式:"
        echo "  1. 先提交当前变更: cd $project_dir && git add . && git commit"
        echo "  2. 改用 worktree 隔离: flow.sh approve $input --confirm --worktree（会自动 stash 旧变更）"
        echo ""
        exit 1
    fi

    # ============================================
    # STATE TRANSITION (only after all checks pass)
    # ============================================

    log_step "Transitioning state: planning -> executing"

    # Update status to executing (using state machine)
    update_plan_status "$plan_file" "executing" >/dev/null 2>&1

    # Sync Issue if plan has Issue link
    if [[ -n "$issue_number" ]]; then
        # Sync Issue status label (planning -> in-progress)
        local status_label
        status_label=$(plan_status_to_issue_label "executing")
        sync_status_label_group "$issue_number" "$status_label" "$repo" >/dev/null 2>&1

        # Sync approved plan to Issue body (automatic)
        sync_plan_to_issue "$issue_number" "$plan_file" "$repo" >/dev/null 2>&1

        # Ensure Issue labels are correct
        ensure_issue_labels "$issue_number" "$plan_file" "$repo" >/dev/null 2>&1
    fi

    echo "Status: executing"
    if [[ -n "$issue_number" ]]; then
        echo "Issue: #$issue_number"
    fi
    if [[ "$worktree_created" == true ]]; then
        echo "Worktree: $ROOT_DIR/.worktrees/${branch}"
    fi
    echo ""
    echo "Next: flow.sh complete $plan_name"
    echo ""
    echo "实施完成后，执行: flow.sh complete $plan_name"
}
