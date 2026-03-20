#!/usr/bin/env bash
# -*- coding: utf-8 -*-
#
# issue.sh — GitHub Issue 工作流管理工具
#
# 用法：
#   ./scripts/issue.sh create --title "<title>" --project <project> --type <type> [选项]
#   ./scripts/issue.sh analyze <issue-number>
#   ./scripts/issue.sh decompose <issue-number> [--into <count>]
#   ./scripts/issue.sh link-prd <issue-number> <prd-path>
#   ./scripts/issue.sh link-plan <issue-number> <plan-path>
#   ./scripts/issue.sh worktree <issue-number>
#   ./scripts/issue.sh pr <issue-number> [--base <branch>] [--draft]
#   ./scripts/issue.sh close <issue-number> [--comment "<message>"]
#   ./scripts/issue.sh status <issue-number>

set -euo pipefail

# 颜色输出
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[0;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

info() { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1" >&2; exit 1; }

# 配置
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
TEMPLATE_DIR="$SKILL_DIR/templates"

# 查找工作空间根目录
find_workspace_root() {
    local dir=$(pwd)
    while [ "$dir" != "/" ]; do
        if [ -f "$dir/.workspace.md" ]; then
            echo "$dir"
            return 0
        fi
        dir=$(dirname "$dir")
    done
    echo "$WORKSPACE_ROOT"
}

# 获取空间仓库信息 (owner/repo)
get_space_repo() {
    local workspace_root=$(find_workspace_root)
    cd "$workspace_root"
    gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || error "无法获取仓库信息，请确保在 Git 仓库中并已安装 gh CLI"
}

# 从标题生成 slug (kebab-case)
title_to_slug() {
    local title="$1"
    echo "$title" | tr '[:upper:]' '[:lower:]' | \
        sed 's/[^a-z0-9]/-/g' | \
        sed 's/--*/-/g' | \
        sed 's/^-//' | \
        sed 's/-$//' | \
        cut -c1-30
}

# 从 Issue body 提取 Target Project
extract_project() {
    local body="$1"
    # 匹配 "- [x] agent-tools" 等格式
    if echo "$body" | grep -q '\- \[x\] agent-tools'; then
        echo "agent-tools"
    elif echo "$body" | grep -q '\- \[x\] wopal-cli'; then
        echo "wopal-cli"
    elif echo "$body" | grep -q '\- \[x\] space'; then
        echo "space"
    elif echo "$body" | grep -q '\- \[x\] other:'; then
        # 提取 other: 后面的项目名
        echo "$body" | grep '\- \[x\] other:' | sed 's/.*other: `\([^`]*\)`.*/\1/' | head -1
    else
        echo ""
    fi
}

# 获取 Issue 信息
get_issue_info() {
    local issue_number="$1"
    local repo="$2"
    gh issue view "$issue_number" --repo "$repo" --json title,body,number,state,labels
}

# 更新 Issue body 的关联表格
update_issue_link() {
    local issue_number="$1"
    local repo="$2"
    local link_type="$3"
    local link_value="$4"
    
    local current_body
    current_body=$(gh issue view "$issue_number" --repo "$repo" --json body -q .body)
    
    # 转义特殊字符
    local escaped_value=$(echo "$link_value" | sed 's/#/\\#/g')
    local new_body="$current_body"
    local placeholder=""
    local label=""
    
    case "$link_type" in
        prd)
            placeholder="| PRD | _待关联_ |"
            label="PRD"
            ;;
        plan)
            placeholder="| Plan | _待关联_ |"
            label="Plan"
            ;;
        pr)
            placeholder="| PR | _待关联_ |"
            label="PR"
            ;;
    esac
    
    # 检查是否存在占位符
    if echo "$current_body" | grep -qF "$placeholder"; then
        # 替换占位符
        new_body=$(echo "$current_body" | sed "s#$placeholder#| $label | $escaped_value |#")
    elif echo "$current_body" | grep -q "## 关联资源"; then
        # 有关联章节但没有对应占位符，追加行
        new_body=$(echo "$current_body" | sed "/## 关联资源/a| $label | $escaped_value |")
    else
        # 没有关联章节，追加整个章节
        local link_section="

---

## 关联资源

| 资源 | 链接 |
|------|------|
| $label | $escaped_value |"
        new_body="${current_body}${link_section}"
    fi
    
    gh issue edit "$issue_number" --repo "$repo" --body "$new_body"
}

# 生成 PR body
generate_pr_body() {
    local issue_number="$1"
    local repo="$2"
    local summary="$3"
    
    cat << EOF
## Summary

$summary

## Related Issue

Refs $repo#$issue_number

## Changes

- 变更项 1
- 变更项 2

## Test Plan

- [ ] 测试项 1
- [ ] 测试项 2
EOF
}

# ============================================
# 命令实现
# ============================================

# create - 创建 Issue
cmd_create() {
    local title=""
    local project=""
    local type=""
    local body=""
    local labels=()
    local assignee=""
    
    while [[ $# -gt 0 ]]; do
        case $1 in
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
            --label)
                labels+=("$2")
                shift 2
                ;;
            --assignee)
                assignee="$2"
                shift 2
                ;;
            *)
                error "未知参数: $1"
                ;;
        esac
    done
    
    [ -z "$title" ] && error "请指定 --title"
    [ -z "$project" ] && error "请指定 --project"
    [ -z "$type" ] && error "请指定 --type"
    
    local repo
    repo=$(get_space_repo)
    
    # 构建标签
    labels+=("status/planning" "type/$type" "project/$project")
    local label_args=""
    for label in "${labels[@]}"; do
        label_args="$label_args --label $label"
    done
    
    # 如果未提供 body，使用模板
    if [ -z "$body" ]; then
        if [ -f "$TEMPLATE_DIR/issue.md" ]; then
            body=$(cat "$TEMPLATE_DIR/issue.md")
            # 替换项目复选框
            body=$(echo "$body" | sed "s/- \[ \] $project/- [x] $project/")
        fi
    fi
    
    info "创建 Issue: $title"
    info "项目: $project, 类型: $type"
    
    local issue_url
    if [ -n "$assignee" ]; then
        issue_url=$(gh issue create --repo "$repo" --title "$title" --body "$body" $label_args --assignee "$assignee")
    else
        issue_url=$(gh issue create --repo "$repo" --title "$title" --body "$body" $label_args)
    fi
    
    success "Issue 创建成功: $issue_url"
    
    # 提取 Issue 编号
    local issue_number=$(echo "$issue_url" | grep -oE '[0-9]+$')
    echo ""
    echo "Issue 编号: #$issue_number"
    echo "下一步: ./scripts/issue.sh analyze $issue_number"
}

# analyze - 分析 Issue
cmd_analyze() {
    local issue_number="$1"
    [ -z "$issue_number" ] && error "请指定 Issue 编号"
    
    local repo
    repo=$(get_space_repo)
    
    info "分析 Issue #$issue_number..."
    
    local issue_info
    issue_info=$(get_issue_info "$issue_number" "$repo")
    
    local title=$(echo "$issue_info" | jq -r '.title')
    local body=$(echo "$issue_info" | jq -r '.body')
    local state=$(echo "$issue_info" | jq -r '.state')
    local labels=$(echo "$issue_info" | jq -r '.labels[].name' | tr '\n' ',' | sed 's/,$//')
    
    local project=$(extract_project "$body")
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Issue #$issue_number 分析结果"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "标题: $title"
    echo "状态: $state"
    echo "标签: $labels"
    echo "目标项目: ${project:-未指定}"
    echo ""
    echo "下一步建议:"
    if [ -z "$project" ]; then
        echo "  1. 编辑 Issue 指定 Target Project"
    else
        echo "  1. ./scripts/issue.sh worktree $issue_number"
    fi
}

# decompose-prd - 从 PRD 分解 Phase 为 Issue
cmd_decompose_prd() {
    local prd_path="$1"
    shift || true
    local dry_run=false
    local project=""

    while [[ $# -gt 0 ]]; do
        case $1 in
            --dry-run)
                dry_run=true
                shift
                ;;
            --project)
                project="$2"
                shift 2
                ;;
            *)
                shift
                ;;
        esac
    done

    [ -z "$prd_path" ] && error "请指定 PRD 路径: ./scripts/issue.sh decompose-prd <prd-path>"

    local workspace_root=$(find_workspace_root)
    local prd_file="$workspace_root/$prd_path"

    if [ ! -f "$prd_file" ]; then
        error "PRD 文件不存在: $prd_file"
    fi

    info "读取 PRD: $prd_path"

    # 解析 Implementation Phases 章节（关闭 pipefail 以正确处理 grep 无匹配）
    local phases_section
    set +o pipefail
    phases_section=$(awk '/^## Implementation Phases/,/^## [^I]/' "$prd_file" | grep -E '^### Phase' || true)
    set -o pipefail

    if [ -z "$phases_section" ]; then
        error "PRD 中未找到 Implementation Phases 章节或无 Phase 定义

PRD 必须包含以下格式的章节：

## Implementation Phases

### Phase 1: <名称>

**目标**: <描述>

**Scope**:
- [ ] <功能点>
"
    fi

    # 统计 Phase 数量
    local phase_count=$(echo "$phases_section" | wc -l | tr -d ' ')

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "PRD 分解计划"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "PRD: $prd_path"
    echo ""
    echo "发现 $phase_count 个 Phase:"
    echo ""

    # 解析每个 Phase
    local i=1
    local phase_names=()
    local phase_goals=()
    local phase_scopes=()

    while IFS= read -r phase_line; do
        # 提取 Phase 名称
        local phase_name=$(echo "$phase_line" | sed 's/^### Phase [0-9]*: //')
        echo "  $i. $phase_name"
        phase_names+=("$phase_name")

        # 获取目标（简单方式：读取下一行）
        local goal=""
        set +o pipefail
        goal=$(grep -A1 "^### Phase [0-9]*: ${phase_name}" "$prd_file" | grep "^\*\*目标\*\*:" | sed 's/^\*\*目标\*\*: //' | head -1 || true)
        set -o pipefail
        phase_goals+=("$goal")

        # 获取 Scope 列表（简单方式：从当前 Phase 到下一个 Phase 或文件末尾）
        local scopes=""
        set +o pipefail
        scopes=$(sed -n "/^### Phase [0-9]*: ${phase_name}/,/^### Phase/p" "$prd_file" | grep -E '^\- \[ \]' || true)
        set -o pipefail
        phase_scopes+=("$scopes")

        ((i++))
    done <<< "$phases_section"

    echo ""

    if [ "$dry_run" = true ]; then
        info "Dry-run 模式，不创建 Issue"
        return 0
    fi

    # 确认创建
    read -p "确认创建 $phase_count 个 Phase Issue? [y/N] " confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        info "已取消"
        return 0
    fi

    local repo
    repo=$(get_space_repo)

    # 从 PRD 提取背景（用于 Problem）
    local prd_background=""
    prd_background=$(awk '/^## /,/^## Implementation Phases/' "$prd_file" | grep -v "^## " | head -20 | tr '\n' ' ')

    # 创建 Phase Issue
    local created_issues=()
    for i in "${!phase_names[@]}"; do
        local phase_name="${phase_names[$i]}"
        local phase_goal="${phase_goals[$i]}"
        local phase_scope="${phase_scopes[$i]}"

        local issue_title="$phase_name"

        # 生成 Issue body（Shape Up Pitch 格式）
        local issue_body
        issue_body=$(cat << EOF
## 方案草案 (Shape Up Pitch)

### Problem

$prd_background

### Appetite

TBD

### Solution

$phase_goal

### Rabbit Holes

- （待分析）

### No-gos

- （待确认）

---

## Scope

$phase_scope

---

## Target Project

- [x] ${project:-agent-tools}

---

## 关联资源

| 资源 | 链接 |
|------|------|
| PRD | \`$prd_path\` |
| Plan | _待关联_ |
| PR | _待关联_ |
EOF
)

        info "创建 Issue: $issue_title"
        local issue_url
        issue_url=$(gh issue create --repo "$repo" \
            --title "$issue_title" \
            --body "$issue_body" \
            --label "status/planning,type/feature,project/${project:-agent-tools}")

        local issue_number=$(echo "$issue_url" | grep -oE '[0-9]+$')
        created_issues+=("#$issue_number")
        success "Issue 创建成功: $issue_url"
    done

    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "分解完成"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "创建的 Issue 列表:"
    printf '  %s\n' "${created_issues[@]}"
    echo ""
    echo "下一步："
    echo "  1. 为每个 Issue 创建 Plan（按需）: ./scripts/plan.sh craft <plan-name> --project <project> --issue <N>"
    echo "  2. 开始开发: ./scripts/issue.sh worktree <N>"
}

# link-prd - 关联 PRD
cmd_link_prd() {
    local issue_number="$1"
    local prd_path="$2"
    
    [ -z "$issue_number" ] && error "请指定 Issue 编号"
    [ -z "$prd_path" ] && error "请指定 PRD 路径"
    
    local repo
    repo=$(get_space_repo)
    
    info "关联 PRD 到 Issue #$issue_number..."
    update_issue_link "$issue_number" "$repo" "prd" "$prd_path"
    success "PRD 已关联: $prd_path"
}

# link-plan - 关联 Plan
cmd_link_plan() {
    local issue_number="$1"
    local plan_path="$2"
    
    [ -z "$issue_number" ] && error "请指定 Issue 编号"
    [ -z "$plan_path" ] && error "请指定 Plan 路径"
    
    local repo
    repo=$(get_space_repo)
    
    info "关联 Plan 到 Issue #$issue_number..."
    update_issue_link "$issue_number" "$repo" "plan" "$plan_path"
    success "Plan 已关联: $plan_path"
}

# worktree - 创建开发环境
cmd_worktree() {
    local issue_number="$1"
    [ -z "$issue_number" ] && error "请指定 Issue 编号"
    
    local repo
    repo=$(get_space_repo)
    
    info "获取 Issue #$issue_number 信息..."
    
    local issue_info
    issue_info=$(get_issue_info "$issue_number" "$repo")
    
    local title=$(echo "$issue_info" | jq -r '.title')
    local body=$(echo "$issue_info" | jq -r '.body')
    
    local project=$(extract_project "$body")
    if [ -z "$project" ]; then
        error "Issue 未指定 Target Project，请先编辑 Issue"
    fi
    
    # 生成分支名
    local slug=$(title_to_slug "$title")
    local branch="issue-${issue_number}-${slug}"
    
    # 更新 Issue 状态标签
    gh issue edit "$issue_number" --repo "$repo" --add-label "status/in-progress" 2>/dev/null || true
    
    info "创建 worktree..."
    info "项目: $project"
    info "分支: $branch"
    
    # 调用 git-worktrees
    local worktree_script="$SCRIPT_DIR/../git-worktrees/scripts/worktree.sh"
    if [ ! -f "$worktree_script" ]; then
        # 尝试其他路径
        worktree_script="$WORKSPACE_ROOT/projects/agent-tools/agents/wopal/skills/git-worktrees/scripts/worktree.sh"
    fi
    
    if [ -f "$worktree_script" ]; then
        bash "$worktree_script" create "$project" "$branch" --no-install --no-test
    else
        warn "未找到 git-worktrees 脚本，手动创建 worktree"
        local workspace_root=$(find_workspace_root)
        local project_dir="$workspace_root/projects/$project"
        local worktree_path="$workspace_root/.worktrees/${project}-${branch}"
        
        if [ -d "$project_dir" ]; then
            cd "$project_dir"
            git worktree add "$worktree_path" -b "$branch"
            success "Worktree 创建成功: $worktree_path"
        else
            error "项目目录不存在: $project_dir"
        fi
    fi
}

# pr - 创建 PR
cmd_pr() {
    local issue_number="$1"
    shift || true
    
    [ -z "$issue_number" ] && error "请指定 Issue 编号"
    
    local base="main"
    local draft=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --base)
                base="$2"
                shift 2
                ;;
            --draft)
                draft=true
                shift
                ;;
            *)
                shift
                ;;
        esac
    done
    
    local repo
    repo=$(get_space_repo)
    
    info "获取 Issue #$issue_number 信息..."
    
    local issue_info
    issue_info=$(get_issue_info "$issue_number" "$repo")
    
    local title=$(echo "$issue_info" | jq -r '.title')
    
    # 获取当前分支
    local current_branch
    current_branch=$(git branch --show-current)
    
    if [ -z "$current_branch" ] || [ "$current_branch" = "main" ] || [ "$current_branch" = "master" ]; then
        error "请在正确的分支上执行此命令（当前: ${current_branch:-detached}）"
    fi
    
    # 生成 PR 标题
    local pr_title="$title"
    
    # 生成 PR body
    local pr_body
    pr_body=$(generate_pr_body "$issue_number" "$repo" "实现 #$issue_number 相关功能")
    
    info "创建 PR..."
    info "标题: $pr_title"
    info "分支: $current_branch -> $base"
    
    local pr_args="--base $base --title \"$pr_title\" --body \"$pr_body\""
    if [ "$draft" = true ]; then
        pr_args="$pr_args --draft"
    fi
    
    local pr_url
    pr_url=$(eval "gh pr create --repo $repo $pr_args")
    
    success "PR 创建成功: $pr_url"
    
    # 更新 Issue
    gh issue edit "$issue_number" --repo "$repo" --add-label "status/in-review" 2>/dev/null || true
    update_issue_link "$issue_number" "$repo" "pr" "$pr_url"
}

# close - 关闭 Issue
cmd_close() {
    local issue_number="$1"
    shift || true
    
    [ -z "$issue_number" ] && error "请指定 Issue 编号"
    
    local comment=""
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --comment)
                comment="$2"
                shift 2
                ;;
            *)
                shift
                ;;
        esac
    done
    
    local repo
    repo=$(get_space_repo)
    
    info "关闭 Issue #$issue_number..."
    
    if [ -n "$comment" ]; then
        gh issue comment "$issue_number" --repo "$repo" --body "$comment"
    fi
    
    gh issue close "$issue_number" --repo "$repo"
    
    # 更新标签
    gh issue edit "$issue_number" --repo "$repo" --add-label "status/done" 2>/dev/null || true
    
    success "Issue #$issue_number 已关闭"
}

# status - 查看 Issue 状态
cmd_status() {
    local issue_number="$1"
    [ -z "$issue_number" ] && error "请指定 Issue 编号"
    
    local repo
    repo=$(get_space_repo)
    
    local issue_info
    issue_info=$(get_issue_info "$issue_number" "$repo")
    
    local title=$(echo "$issue_info" | jq -r '.title')
    local body=$(echo "$issue_info" | jq -r '.body')
    local state=$(echo "$issue_info" | jq -r '.state')
    local labels=$(echo "$issue_info" | jq -r '.labels[].name' | tr '\n' ' ')
    local project=$(extract_project "$body")
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Issue #$issue_number 状态"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "标题: $title"
    echo "状态: $state"
    echo "标签: $labels"
    echo "目标项目: ${project:-未指定}"
    echo ""
    
    # 检查关联
    echo "关联资源:"
    if echo "$body" | grep -q "| PRD | _待关联_"; then
        echo "  PRD: 未关联"
    else
        echo "  PRD: 已关联"
    fi
    
    if echo "$body" | grep -q "| Plan | _待关联_"; then
        echo "  Plan: 未关联"
    else
        echo "  Plan: 已关联"
    fi
    
    if echo "$body" | grep -q "| PR | _待关联_"; then
        echo "  PR: 未关联"
    else
        echo "  PR: 已关联"
    fi
    
    echo ""
    
    # 检查 worktree
    if [ -n "$project" ]; then
        local slug=$(title_to_slug "$title")
        local branch="issue-${issue_number}-${slug}"
        local workspace_root=$(find_workspace_root)
        local worktree_path="$workspace_root/.worktrees/${project}-${branch}"
        
        if [ -d "$worktree_path" ]; then
            echo "开发环境: $worktree_path"
        else
            echo "开发环境: 未创建"
        fi
    fi
}

# help - 显示帮助
cmd_help() {
    cat << EOF
GitHub Issue 工作流管理工具

用法：
  $0 create --title "<title>" --project <project> --type <type> [选项]
  $0 analyze <issue-number>
  $0 decompose-prd <prd-path> [--dry-run] [--project <project>]
  $0 link-prd <issue-number> <prd-path>
  $0 link-plan <issue-number> <plan-path>
  $0 worktree <issue-number>
  $0 pr <issue-number> [--base <branch>] [--draft]
  $0 close <issue-number> [--comment "<message>"]
  $0 status <issue-number>
  $0 help

命令：
  create          创建新的 GitHub Issue
  analyze         分析 Issue 内容
  decompose-prd   从 PRD Implementation Phases 创建 Phase Issue
  link-prd        关联 PRD 文档
  link-plan       关联实施计划
  worktree        为 Issue 创建开发环境
  pr              创建 Pull Request
  close           关闭 Issue
  status          查看 Issue 状态
  help            显示此帮助

create 参数：
  --title <title>       Issue 标题（必需）
  --project <project>   目标项目: agent-tools | wopal-cli | space | <other>
  --type <type>         Issue 类型: feature | bug | refactor | docs | chore
  --body <body>         Issue 内容（可选，默认使用模板）
  --label <label>       额外标签（可多次指定）
  --assignee <user>     指派人员

decompose-prd 参数：
  --dry-run             预览模式，不创建 Issue
  --project <project>   目标项目（默认 agent-tools）

pr 参数：
  --base <branch>       目标分支（默认 main）
  --draft               创建为 Draft PR

close 参数：
  --comment <message>   添加关闭评论

PRD 格式要求：
  PRD 必须包含 ## Implementation Phases 章节
  每个 Phase 对应一个 Issue

分支命名规则：
  issue-{N}-{slug}
  
  示例:
    Issue #42: "添加 Issue 工作流技能"
    分支: issue-42-add-issue-workflow-skill

跨仓 PR 规则：
  PR body 自动包含: Refs <owner>/<repo>#<issue-number>

示例：
  # 创建 Issue
  $0 create --title "添加 Issue 工作流技能" --project agent-tools --type feature

  # 从 PRD 分解 Phase
  $0 decompose-prd docs/products/PRD-wopalspace.md --dry-run

  # 分析 Issue
  $0 analyze 42

  # 创建开发环境
  $0 worktree 42

  # 创建 PR
  $0 pr 42

  # 关闭 Issue
  $0 close 42 --comment "功能已上线"
EOF
}

# 主入口
main() {
    local cmd="${1:-help}"
    shift || true

    case "$cmd" in
        create)
            cmd_create "$@"
            ;;
        analyze)
            cmd_analyze "$@"
            ;;
        decompose-prd)
            cmd_decompose_prd "$@"
            ;;
        link-prd)
            cmd_link_prd "$@"
            ;;
        link-plan)
            cmd_link_plan "$@"
            ;;
        worktree)
            cmd_worktree "$@"
            ;;
        pr)
            cmd_pr "$@"
            ;;
        close)
            cmd_close "$@"
            ;;
        status)
            cmd_status "$@"
            ;;
        help|--help|-h)
            cmd_help
            ;;
        *)
            error "未知命令: $cmd（使用 'help' 查看帮助）"
            ;;
    esac
}

main "$@"