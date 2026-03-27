#!/usr/bin/env bash
# -*- coding: utf-8 -*-
#
# quick-start.sh — 快速启动 OpenSpec 任务（创建 worktree + 启动 OpenCode + 监控完成）
#
# 用法：
#   ./scripts/quick-start.sh <project> <branch> <change> [timeout]
#
# 示例：
#   ./scripts/quick-start.sh ontology feature/auth add-auth
#   ./scripts/quick-start.sh ontology feature/auth add-auth 600

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

show_help() {
    cat << 'EOF'
快速启动 OpenSpec 任务

用法：
  quick-start.sh <project> <branch> <change> [timeout]

参数：
  project   项目名（如 ontology、web）
  branch    分支名（如 feature/auth，/ 自动转换为 -）
  change    OpenSpec 变更名（如 add-auth）
  timeout   监控超时时间（秒），默认 300

示例：
  quick-start.sh ontology feature/auth add-auth
  quick-start.sh ontology feature/auth add-auth 600

说明：
  1. 检查依赖（process-adapter、opencode、worktree 技能）
  2. 创建 worktree：.worktrees/<project>-<branch>/
  3. 清理残余标记文件
  4. 启动 OpenCode 执行 openspec/changes/<change>/tasks.md
  5. 监控任务完成（等待标记文件）
  6. 显示最终日志
EOF
}

# 参数检查
if [ $# -lt 3 ] || [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    show_help
    exit 0
fi

PROJECT=$1
BRANCH=$2
CHANGE=$3
TIMEOUT=${4:-300}

# 路径计算（兼容源码和部署路径，通过 .workspace.md 定位 workspace root）
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
WORKSPACE_ROOT="$SCRIPT_DIR"
while [ "$WORKSPACE_ROOT" != "/" ] && [ ! -f "$WORKSPACE_ROOT/.workspace.md" ]; do
    WORKSPACE_ROOT=$(dirname "$WORKSPACE_ROOT")
done

# 分支名转目录名（/ -> -）
BRANCH_DIR=$(echo "$BRANCH" | tr '/' '-')
WORKTREE_DIR="$WORKSPACE_ROOT/.worktrees/$PROJECT-$BRANCH_DIR"
WORKTREE_SCRIPT="$WORKSPACE_ROOT/.agents/skills/git-worktrees/scripts/worktree.sh"

echo ""
info "项目:  $PROJECT"
info "分支:  $BRANCH"
info "变更:  $CHANGE"
info "超时:  ${TIMEOUT}s"
echo ""

# Step 1: 检查依赖
info "Step 1/5: 检查依赖..."
"$SCRIPT_DIR/check-dependencies.sh" || error "依赖检查失败，请先安装缺失依赖"
echo ""

# Step 2: 创建 worktree
info "Step 2/5: 创建 worktree..."
"$WORKTREE_SCRIPT" create "$PROJECT" "$BRANCH"
echo ""

# Step 3: 清理标记文件
info "Step 3/5: 清理残余标记文件..."
MARKER_FILE="/tmp/opencode-done-$CHANGE"
if [ -f "$MARKER_FILE" ]; then
    rm -f "$MARKER_FILE"
    warn "清理残余标记文件: $MARKER_FILE"
else
    success "无残余标记文件"
fi
echo ""

# Step 4: 启动 OpenCode
info "Step 4/5: 启动 OpenCode..."
OPENSPEC_PATH="$WORKSPACE_ROOT/openspec/changes/$CHANGE"

SESSION=$(process-adapter start \
    "PROCESS_ADAPTER_SESSION_ID=$CHANGE \
     OPENCODE_PERMISSION='{\"bash\":{\"*\":\"allow\"},\"edit\":{\"*\":\"allow\"},\"write\":{\"*\":\"allow\"}}' \
     opencode run 'Read $OPENSPEC_PATH/tasks.md and implement all tasks. Run tests and ensure all pass.'" \
    --name "$CHANGE" \
    --cwd "$WORKTREE_DIR" | awk '{print $3}')

success "Session ID: $SESSION"
echo ""

# Step 5: 监控完成
info "Step 5/5: 监控任务完成（超时 ${TIMEOUT}s）..."
"$SCRIPT_DIR/wait-for-opencode.sh" "$CHANGE" "$TIMEOUT"
echo ""

# 显示最终日志
info "查看最终输出（最后 100 行）..."
process-adapter log "$SESSION" --limit 100
