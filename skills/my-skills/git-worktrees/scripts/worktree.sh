#!/usr/bin/env bash
# -*- coding: utf-8 -*-
#
# worktree.sh — Git Worktree 管理工具
#
# 用法：
#   ./scripts/worktree.sh create <branch> [--dir <dir>] [--no-install] [--no-test]
#   ./scripts/worktree.sh list
#   ./scripts/worktree.sh remove <branch>
#   ./scripts/worktree.sh prune
#
# 示例：
#   ./scripts/worktree.sh create feature-auth
#   ./scripts/worktree.sh create bugfix-123 --dir ../worktrees
#   ./scripts/worktree.sh remove feature-auth

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
WORKTREE_DIR=".worktrees"
INSTALL_DEPS=true
RUN_TESTS=true

# 获取 Git 仓库根目录
git_root() {
    git rev-parse --show-toplevel 2>/dev/null || error "不在 Git 仓库中"
}

# 查找工作空间根目录（包含 .workspace.md 的目录）
find_workspace_root() {
    local dir=$(pwd)
    while [ "$dir" != "/" ]; do
        if [ -f "$dir/.workspace.md" ]; then
            echo "$dir"
            return 0
        fi
        dir=$(dirname "$dir")
    done
    return 1
}

# 从 .workspace.md 提取可用项目列表
get_available_projects() {
    local workspace_root="$1"
    local workspace_md="$workspace_root/.workspace.md"
    
    if [ ! -f "$workspace_md" ]; then
        error "未找到 .workspace.md 文件"
    fi
    
    # 提取 | `projects/<name>/` | 中的 <name>
    grep -E '^\| `projects/[^/]+/`' "$workspace_md" | \
        sed -E 's/.*`projects\/([^/]+)\/`.*/\1/' | \
        tr '\n' ' '
}

# 验证项目名是否在可用项目列表中
validate_project() {
    local project="$1"
    local workspace_root="$2"
    
    local available_projects
    available_projects=$(get_available_projects "$workspace_root")
    
    if ! echo " $available_projects " | grep -q " $project "; then
        error "无效项目名: $project\n\n可用项目: $available_projects"
    fi
}

# 检查目录是否被 gitignore
is_ignored() {
    local dir="$1"
    git check-ignore -q "$dir" 2>/dev/null
}

# 检测项目类型并安装依赖
install_dependencies() {
    local dir="$1"

    info "检测项目类型..."

    if [ -f "$dir/package.json" ]; then
        info "检测到 Node.js 项目，运行 pnpm install..."
        cd "$dir"
        if command -v pnpm &>/dev/null; then
            pnpm install
        elif command -v npm &>/dev/null; then
            npm install
        else
            warn "未找到 pnpm 或 npm，跳过依赖安装"
            return 0
        fi
    elif [ -f "$dir/pyproject.toml" ] || [ -f "$dir/requirements.txt" ] || [ -f "$dir/uv.lock" ]; then
        info "检测到 Python 项目，跳过依赖安装（假设环境已配置）"
    elif [ -f "$dir/Cargo.toml" ]; then
        info "检测到 Rust 项目，运行 cargo build..."
        cd "$dir"
        cargo build
    elif [ -f "$dir/go.mod" ]; then
        info "检测到 Go 项目，运行 go mod download..."
        cd "$dir"
        go mod download
    else
        info "未识别到项目类型，跳过依赖安装"
    fi

    success "依赖处理完成"
}

# 运行测试验证基线
run_tests() {
    local dir="$1"

    info "运行测试验证基线..."

    cd "$dir"

    if [ -f "package.json" ]; then
        if grep -q '"test"' package.json; then
            if command -v pnpm &>/dev/null; then
                pnpm test || warn "测试失败，请检查"
            else
                npm test || warn "测试失败，请检查"
            fi
        else
            info "未配置测试脚本，跳过"
        fi
    elif [ -f "pyproject.toml" ] && command -v pytest &>/dev/null; then
        pytest || warn "测试失败，请检查"
    elif [ -f "Cargo.toml" ]; then
        cargo test || warn "测试失败，请检查"
    elif [ -f "go.mod" ]; then
        go test ./... || warn "测试失败，请检查"
    else
        info "未找到测试命令，跳过"
    fi
}

# 创建 worktree
cmd_create() {
    local project="$1"
    local branch="$2"
    shift 2
    
    [ -z "$project" ] && error "请指定项目名称"
    [ -z "$branch" ] && error "请指定分支名称"
    
    local create_branch=true

    # 解析参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            --dir)
                WORKTREE_DIR="$2"
                shift 2
                ;;
            --no-install)
                INSTALL_DEPS=false
                shift
                ;;
            --no-test)
                RUN_TESTS=false
                shift
                ;;
            --existing)
                create_branch=false
                shift
                ;;
            *)
                error "未知参数: $1"
                ;;
        esac
    done

    # 查找工作空间根目录
    local workspace_root
    workspace_root=$(find_workspace_root) || error "未找到工作空间根目录（缺少 .workspace.md）"
    
    # 验证项目名
    validate_project "$project" "$workspace_root"
    
    # 切换到子项目目录
    local project_dir="$workspace_root/projects/$project"
    if [ ! -d "$project_dir" ]; then
        error "项目目录不存在: $project_dir"
    fi
    cd "$project_dir"
    
    local root
    root="$(git_root)"

    # 检查 worktree 目录是否被忽略（工作空间级）
    local worktree_base="$workspace_root/.worktrees"
    if [ ! -d "$worktree_base" ]; then
        info "创建工作空间级 worktree 目录: $worktree_base"
        mkdir -p "$worktree_base"
    fi

    # 转换分支名中的 / 为 -
    local branch_path=$(echo "$branch" | sed 's/\//-/g')
    local worktree_path="$worktree_base/${project}-${branch_path}"

    # 检查是否已存在
    if [ -d "$worktree_path" ]; then
        error "Worktree 已存在: $worktree_path"
    fi

    info "创建 worktree: $worktree_path"
    info "项目: $project, 分支: $branch"

    # 创建 worktree
    if [ "$create_branch" = true ]; then
        git worktree add "$worktree_path" -b "$branch"
    else
        git worktree add "$worktree_path" "$branch"
    fi

    success "Worktree 创建成功"

    # 安装依赖
    if [ "$INSTALL_DEPS" = true ]; then
        install_dependencies "$worktree_path"
    fi

    # 运行测试
    if [ "$RUN_TESTS" = true ]; then
        run_tests "$worktree_path"
    fi

    echo ""
    success "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    success "Worktree 就绪: $worktree_path"
    success "切换命令: cd $worktree_path"
    success "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# 列出 worktree
cmd_list() {
    local filter_project=""
    local show_all=false
    
    # 解析参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            --all)
                show_all=true
                shift
                ;;
            *)
                filter_project="$1"
                shift
                ;;
        esac
    done
    
    # 查找工作空间根目录
    local workspace_root
    workspace_root=$(find_workspace_root) || error "未找到工作空间根目录（缺少 .workspace.md）"
    
    local worktree_base="$workspace_root/.worktrees"
    
    if [ "$show_all" = true ]; then
        info "列出所有项目的 worktree："
    elif [ -n "$filter_project" ]; then
        validate_project "$filter_project" "$workspace_root"
        info "列出项目 '$filter_project' 的 worktree："
    else
        info "列出所有项目的 worktree："
        show_all=true
    fi
    
    echo ""
    
    # 列出 worktree 并根据过滤条件筛选
    if [ -d "$worktree_base" ]; then
        local found=false
        for wt_dir in "$worktree_base"/*; do
            if [ -d "$wt_dir" ]; then
                local wt_name=$(basename "$wt_dir")
                
                # 如果指定了项目，只显示该项目的 worktree
                if [ -n "$filter_project" ] && [ "$show_all" = false ]; then
                    if [[ ! "$wt_name" == "${filter_project}-"* ]]; then
                        continue
                    fi
                fi
                
                # 检查是否为有效的 git worktree
                if [ -d "$wt_dir/.git" ] || [ -f "$wt_dir/.git" ]; then
                    echo "  $wt_name"
                    found=true
                fi
            fi
        done
        
        if [ "$found" = false ]; then
            echo "  (无)"
        fi
    else
        echo "  (worktree 目录不存在)"
    fi
    
    echo ""
    
    # 显示详细的 git worktree 信息
    if [ "$show_all" = true ]; then
        info "Git worktree 详细信息："
        for project_dir in "$workspace_root/projects"/*; do
            if [ -d "$project_dir" ] && [ -d "$project_dir/.git" ]; then
                local project_name=$(basename "$project_dir")
                echo ""
                echo "项目: $project_name"
                cd "$project_dir"
                git worktree list 2>/dev/null | sed 's/^/  /'
            fi
        done
    fi
}

# 删除 worktree
cmd_remove() {
    local project="$1"
    local branch="$2"
    
    [ -z "$project" ] && error "请指定项目名称"
    [ -z "$branch" ] && error "请指定要删除的分支名称"
    
    # 查找工作空间根目录
    local workspace_root
    workspace_root=$(find_workspace_root) || error "未找到工作空间根目录（缺少 .workspace.md）"
    
    # 验证项目名
    validate_project "$project" "$workspace_root"
    
    # 切换到子项目目录
    local project_dir="$workspace_root/projects/$project"
    if [ ! -d "$project_dir" ]; then
        error "项目目录不存在: $project_dir"
    fi
    cd "$project_dir"
    
    local root
    root="$(git_root)"
    
    # 转换分支名中的 / 为 -
    local branch_path=$(echo "$branch" | sed 's/\//-/g')
    local worktree_path="$workspace_root/.worktrees/${project}-${branch_path}"
    
    if [ ! -d "$worktree_path" ]; then
        error "未找到 worktree: $worktree_path"
    fi

    info "删除 worktree: $worktree_path"

    # 确认
    read -p "确认删除？[y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        info "已取消"
        exit 0
    fi

    git worktree remove "$worktree_path"
    success "Worktree 已删除"

    # 询问是否删除分支
    read -p "是否同时删除分支 '$branch'？[y/N] " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git branch -d "$branch" 2>/dev/null || git branch -D "$branch"
        success "分支已删除"
    fi
}

# 清理已删除分支的 worktree
cmd_prune() {
    local project="$1"
    
    [ -z "$project" ] && error "请指定项目名称"
    
    # 查找工作空间根目录
    local workspace_root
    workspace_root=$(find_workspace_root) || error "未找到工作空间根目录（缺少 .workspace.md）"
    
    # 验证项目名
    validate_project "$project" "$workspace_root"
    
    # 切换到子项目目录
    local project_dir="$workspace_root/projects/$project"
    if [ ! -d "$project_dir" ]; then
        error "项目目录不存在: $project_dir"
    fi
    cd "$project_dir"
    
    info "清理项目 '$project' 的 worktree..."
    git worktree prune
    success "清理完成"
}

# 显示帮助
cmd_help() {
    cat << EOF
Git Worktree 管理工具 - 工作空间级管理

用法：
  $0 create <project> <branch> [选项]
  $0 list [project|--all]
  $0 remove <project> <branch>
  $0 prune <project>
  $0 help

命令：
  create <project> <branch>    创建新的 worktree
                                <project>: 项目名（从 .workspace.md 读取）
                                <branch>: 分支名（分支中的 / 会转换为 -）
  
  list [project|--all]          列出 worktree
                                无参数或 --all: 列出所有项目的 worktree
                                <project>: 只列出指定项目的 worktree
  
  remove <project> <branch>     删除指定的 worktree
  prune <project>               清理已删除分支的 worktree
  help                          显示此帮助

选项（仅 create 命令）：
  --no-install      跳过依赖安装
  --no-test         跳过测试运行
  --existing        使用已存在的分支而非创建新分支

路径规则：
  worktree 统一创建在工作空间级的 .worktrees/ 目录下
  路径格式: <workspace>/.worktrees/<project>-<branch>
  
  示例:
    项目: agent-tools, 分支: feature/auth
    路径: .worktrees/agent-tools-feature-auth

示例：
  # 创建新分支的 worktree
  $0 create agent-tools feature/wopal-cli-scan
  $0 create wopal bugfix-123
  
  # 使用已存在的分支
  $0 create agent-tools hotfix --existing
  
  # 列出 worktree
  $0 list                    # 列出所有
  $0 list agent-tools        # 只列出 agent-tools 的
  $0 list --all              # 列出所有（详细模式）
  
  # 删除 worktree
  $0 remove agent-tools feature/wopal-cli-scan
  
  # 清理
  $0 prune agent-tools

注意事项：
  - 项目名必须从 .workspace.md 中的项目列表选择
  - worktree 创建后会自动安装依赖并运行测试（可跳过）
  - 完成后务必使用 remove 清理，避免僵尸目录
  - worktree 内的提交直接写入子项目 Git 历史
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
        list|ls)
            cmd_list
            ;;
        remove|rm)
            cmd_remove "$@"
            ;;
        prune)
            cmd_prune
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
