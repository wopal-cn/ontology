#!/usr/bin/env bash
# -*- coding: utf-8 -*-
#
# worktree.sh — 项目级 Git Worktree 管理工具
#
# 用法：
#   ./scripts/worktree.sh create <branch> [--no-install] [--no-test] [--checkout]
#   ./scripts/worktree.sh list
#   ./scripts/worktree.sh remove <branch> [--force]
#   ./scripts/worktree.sh prune
#
# 示例：
#   ./scripts/worktree.sh create feature-auth
#   ./scripts/worktree.sh create bugfix-123 --no-install
#   ./scripts/worktree.sh remove feature-auth --force

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
FORCE_REMOVE=false

# 获取 Git 仓库根目录
git_root() {
    git rev-parse --show-toplevel 2>/dev/null || error "不在 Git 仓库中"
}

# 检测项目类型并安装依赖
install_dependencies() {
    local dir="$1"

    info "检测项目类型..."

    if [ -f "$dir/package.json" ]; then
        cd "$dir"
        
        # 优先检测锁文件确定包管理器
        if [ -f "pnpm-lock.yaml" ]; then
            info "检测到 pnpm-lock.yaml，运行 pnpm install..."
            pnpm install
        elif [ -f "package-lock.json" ]; then
            info "检测到 package-lock.json，运行 npm install..."
            npm install
        elif [ -f "yarn.lock" ]; then
            info "检测到 yarn.lock，运行 yarn install..."
            yarn install
        elif [ -f "bun.lockb" ]; then
            info "检测到 bun.lockb，运行 bun install..."
            bun install
        elif command -v pnpm &>/dev/null; then
            info "无锁文件，使用 pnpm install..."
            pnpm install
        elif command -v npm &>/dev/null; then
            info "无锁文件，使用 npm install..."
            npm install
        else
            warn "未找到可用的包管理器，跳过依赖安装"
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
            if [ -f "pnpm-lock.yaml" ] && command -v pnpm &>/dev/null; then
                pnpm test || warn "测试失败，请检查"
            elif command -v npm &>/dev/null; then
                npm test || warn "测试失败，请检查"
            else
                warn "未找到可用的测试运行器"
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
    local branch="$1"
    shift || true
    
    [ -z "$branch" ] && error "请指定分支名称"
    
    local create_branch=true

    # 解析参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            --no-install)
                INSTALL_DEPS=false
                shift
                ;;
            --no-test)
                RUN_TESTS=false
                shift
                ;;
            --checkout)
                create_branch=false
                shift
                ;;
            *)
                error "未知参数: $1"
                ;;
        esac
    done

    local root
    root="$(git_root)"

    # 检查 worktree 目录是否存在
    local worktree_base="$root/$WORKTREE_DIR"
    if [ ! -d "$worktree_base" ]; then
        info "创建 worktree 目录: $worktree_base"
        mkdir -p "$worktree_base"
    fi

    # 转换分支名中的 / 为 -
    local branch_path=$(echo "$branch" | sed 's/\//-/g')
    local worktree_path="$worktree_base/$branch_path"

    # 检查是否已存在
    if [ -d "$worktree_path" ]; then
        error "Worktree 已存在: $worktree_path"
    fi

    info "创建 worktree: $worktree_path"
    info "分支: $branch"

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
    local root
    root="$(git_root)"
    
    local worktree_base="$root/$WORKTREE_DIR"
    
    info "列出当前项目的 worktree："
    echo ""
    
    if [ -d "$worktree_base" ]; then
        local found=false
        for wt_dir in "$worktree_base"/*; do
            if [ -d "$wt_dir" ]; then
                local wt_name=$(basename "$wt_dir")
                
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
    info "Git worktree 详细信息："
    git worktree list 2>/dev/null | sed 's/^/  /'
}

# 删除 worktree
cmd_remove() {
    local branch="$1"
    shift || true
    
    [ -z "$branch" ] && error "请指定要删除的分支名称"
    
    # 解析参数
    while [[ $# -gt 0 ]]; do
        case $1 in
            --force|-f)
                FORCE_REMOVE=true
                shift
                ;;
            *)
                error "未知参数: $1"
                ;;
        esac
    done
    
    local root
    root="$(git_root)"
    
    # 转换分支名中的 / 为 -
    local branch_path=$(echo "$branch" | sed 's/\//-/g')
    local worktree_path="$root/$WORKTREE_DIR/$branch_path"
    
    if [ ! -d "$worktree_path" ]; then
        error "未找到 worktree: $worktree_path"
    fi

    info "删除 worktree: $worktree_path"

    # 确认（除非 --force）
    if [ "$FORCE_REMOVE" = false ]; then
        read -p "确认删除？[y/N] " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            info "已取消"
            exit 0
        fi
    fi

    git worktree remove "$worktree_path"
    success "Worktree 已删除"

    # 询问是否删除分支（--force 时也询问）
    if [ "$FORCE_REMOVE" = false ]; then
        read -p "是否同时删除分支 '$branch'？[y/N] " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            git branch -d "$branch" 2>/dev/null || git branch -D "$branch"
            success "分支已删除"
        fi
    else
        # --force 模式下，自动删除分支（如果存在且未合并则强制删除）
        if git show-ref --verify --quiet "refs/heads/$branch"; then
            git branch -d "$branch" 2>/dev/null || git branch -D "$branch"
            success "分支已删除"
        fi
    fi
}

# 清理已删除分支的 worktree
cmd_prune() {
    info "清理 worktree..."
    git worktree prune
    success "清理完成"
}

# 显示帮助
cmd_help() {
    cat << EOF
项目级 Git Worktree 管理工具

用法：
  $0 create <branch> [选项]
  $0 list
  $0 remove <branch> [选项]
  $0 prune
  $0 help

命令：
  create <branch>     创建新的 worktree
                      <branch>: 分支名（分支中的 / 会转换为 -）
  
  list                列出当前项目的所有 worktree
  
  remove <branch>     删除指定的 worktree
                      <branch>: 分支名（与创建时一致）
  
  prune               清理已删除分支的 worktree 记录
  help                显示此帮助

选项（仅 create 命令）：
  --no-install        跳过依赖安装
  --no-test           跳过测试运行
  --checkout          使用已存在的分支（不创建新分支）

选项（仅 remove 命令）：
  --force, -f         跳过确认直接删除

路径规则：
  worktree 创建在项目根目录的 .worktrees/ 目录下
  路径格式: <project>/.worktrees/<branch>
  
  示例:
    分支: feature/auth
    路径: .worktrees/feature-auth

示例：
  # 创建新分支的 worktree（完整流程）
  $0 create feature/new-thing

  # 创建 worktree，跳过依赖安装和测试
  $0 create hotfix-123 --no-install --no-test

  # 使用已存在的分支创建 worktree
  $0 create feature/auth --checkout

  # 列出 worktree
  $0 list

  # 删除 worktree（交互确认）
  $0 remove feature-auth

  # 删除 worktree（跳过确认，适合 Agent 使用）
  $0 remove feature-auth --force

  # 清理
  $0 prune

依赖检测：
  脚本会根据锁文件自动选择包管理器：
  - pnpm-lock.yaml → pnpm install
  - package-lock.json → npm install
  - yarn.lock → yarn install
  - bun.lockb → bun install
  - 无锁文件时优先使用 pnpm（如果可用）

注意事项：
  - worktree 创建后会自动安装依赖并运行测试（可跳过）
  - 完成后务必使用 remove 清理，避免僵尸目录
  - worktree 内的提交直接写入当前项目 Git 历史
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
