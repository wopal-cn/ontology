#!/usr/bin/env bash
# -*- coding: utf-8 -*-
#
# wait-for-opencode.sh — 监听 OpenCode 任务完成标记文件
#
# 用法：
#   ./scripts/wait-for-opencode.sh <task-id> [timeout]
#
# 示例：
#   ./scripts/wait-for-opencode.sh task-1
#   ./scripts/wait-for-opencode.sh task-1 600  # 10 分钟超时

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

# 显示帮助
show_help() {
    cat << EOF
监听 OpenCode 任务完成标记文件

用法：
  $0 <task-id> [timeout]

参数：
  task-id   任务 ID（对应 PROCESS_ADAPTER_SESSION_ID）
  timeout   超时时间（秒），默认 300

示例：
  $0 task-1
  $0 task-1 600  # 10 分钟超时

说明：
  - 监听标记文件: /tmp/opencode-done-<task-id>
  - 完成后自动清理标记文件
  - 超时后输出排查步骤
EOF
}

# 主函数
main() {
    if [ $# -eq 0 ] || [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
        show_help
        exit 0
    fi

    local task_id="$1"
    local timeout="${2:-300}"
    local marker_file="/tmp/opencode-done-${task_id}"

    info "监听任务: $task_id"
    info "标记文件: $marker_file"
    info "超时时间: ${timeout}s"
    echo ""

    local start_time
    start_time=$(date +%s)

    while true; do
        if [ -f "$marker_file" ]; then
            success "任务 $task_id 完成"
            rm -f "$marker_file"
            info "标记文件已清理: $marker_file"
            exit 0
        fi

        local current_time
        current_time=$(date +%s)
        local elapsed=$((current_time - start_time))

        if [ $elapsed -gt $timeout ]; then
            echo ""
            warn "任务 $task_id 超时（${timeout}s）"
            echo ""
            warn "排查步骤："
            echo "  1. 查看会话列表: process-adapter list"
            echo "  2. 查看会话日志: process-adapter log <session-id>"
            echo "  3. 检查会话状态: process-adapter poll <session-id>"
            echo ""
            info "可能原因："
            echo "  - OpenCode 崩溃（未正常退出）"
            echo "  - 任务执行时间过长"
            echo "  - 标记文件未被创建（插件未触发）"
            exit 1
        fi

        sleep 1
    done
}

main "$@"
