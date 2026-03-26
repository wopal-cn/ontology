#!/usr/bin/env bash
# -*- coding: utf-8 -*-
#
# check-dependencies.sh — 检查 agent-orchestration 运行环境依赖
#
# 用法：
#   ./scripts/check-dependencies.sh
#
# 示例：
#   ./scripts/check-dependencies.sh

set -euo pipefail

# 颜色输出
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[0;33m'
readonly NC='\033[0m'

check_command() {
    local cmd=$1
    local install_hint=$2

    if command -v "$cmd" &> /dev/null; then
        echo -e "${GREEN}✓${NC} $cmd 已安装"
        return 0
    else
        echo -e "${RED}✗${NC} $cmd 未安装"
        echo "  安装提示: $install_hint"
        return 1
    fi
}

check_file() {
    local file=$1
    local desc=$2

    if [ -f "$file" ]; then
        echo -e "${GREEN}✓${NC} $desc"
        return 0
    else
        echo -e "${RED}✗${NC} $desc 不存在: $file"
        return 1
    fi
}

echo "检查 agent-orchestration 依赖..."
echo ""

errors=0

# 必须依赖
check_command "process-adapter" "cd projects/ontology/tools/process && npm install && npm link" || ((errors++))
check_command "opencode" "参考 https://opencode.ai 安装 OpenCode CLI" || ((errors++))

# 可选依赖（Worktree 集成）
# 通过向上查找 .workspace.md 定位 workspace root（兼容源码和部署路径）
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
WORKSPACE_ROOT="$SCRIPT_DIR"
while [ "$WORKSPACE_ROOT" != "/" ] && [ ! -f "$WORKSPACE_ROOT/.workspace.md" ]; do
    WORKSPACE_ROOT=$(dirname "$WORKSPACE_ROOT")
done
WORKTREE_SCRIPT="$WORKSPACE_ROOT/.agents/skills/git-worktrees/scripts/worktree.sh"

echo ""
echo "可选依赖（Worktree 集成）："
check_file "$WORKTREE_SCRIPT" "git-worktrees 技能" || echo -e "  ${YELLOW}注意${NC}: 不影响基础功能，仅 worktree 集成需要"

echo ""
if [ $errors -eq 0 ]; then
    echo -e "${GREEN}✅ 必要依赖已就绪${NC}"
    exit 0
else
    echo -e "${RED}❌ 缺失 $errors 个必要依赖${NC}"
    exit 1
fi
