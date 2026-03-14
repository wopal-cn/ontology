#!/bin/bash
# IOC Auto-Update Setup Script
# 配置 IOC 数据库的定时自动更新
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SCRIPT_PATH="$SCRIPT_DIR/update-ioc.sh"
LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/ioc-update.log"

CRON_HOUR=2
CRON_MINUTE=30
CRON_JOB=""
CRON_COMMENT="# skill-security-scanner IOC update"

show_help() {
    cat << 'EOF'
IOC 定时更新配置脚本

用法：./setup-auto-update.sh [选项]

选项:
  --hour <0-23>       设置执行小时 (默认：2)
  --minute <0-59>     设置执行分钟 (默认：30)
  --time <HH:MM>      设置执行时间 (例如：--time 03:30)
  --uninstall         卸载定时更新任务
  --list              显示当前定时任务
  --help              显示帮助信息

示例:
  ./setup-auto-update.sh                 # 每日 02:30 执行 (默认)
  ./setup-auto-update.sh --time 03:30    # 每日 03:30 执行
  ./setup-auto-update.sh --hour 2 --minute 30  # 每日 02:30 执行
  ./setup-auto-update.sh --uninstall     # 卸载定时任务

说明:
  默认安装每日 02:30 执行的 IOC 更新任务
  更新日志保存至 logs/ioc-update.log
EOF
}

parse_args() {
    while [ $# -gt 0 ]; do
        case "$1" in
            --hour)
                shift
                if [ -n "${1:-}" ] && [ "$1" -ge 0 ] && [ "$1" -le 23 ] 2>/dev/null; then
                    CRON_HOUR="$1"
                else
                    echo "错误：--hour 需要 0-23 之间的值" >&2
                    exit 1
                fi
                ;;
            --minute)
                shift
                if [ -n "${1:-}" ] && [ "$1" -ge 0 ] && [ "$1" -le 59 ] 2>/dev/null; then
                    CRON_MINUTE="$1"
                else
                    echo "错误：--minute 需要 0-59 之间的值" >&2
                    exit 1
                fi
                ;;
            --time)
                shift
                if [ -n "${1:-}" ] && echo "$1" | grep -qE '^[0-9]{1,2}:[0-9]{2}$'; then
                    CRON_HOUR=$(echo "$1" | cut -d: -f1 | sed 's/^0//')
                    CRON_MINUTE=$(echo "$1" | cut -d: -f2 | sed 's/^0//')
                    [ -z "$CRON_HOUR" ] && CRON_HOUR=0
                    [ -z "$CRON_MINUTE" ] && CRON_MINUTE=0
                    if [ "$CRON_HOUR" -lt 0 ] || [ "$CRON_HOUR" -gt 23 ]; then
                        echo "错误：--time 小时需要 0-23 之间的值" >&2
                        exit 1
                    fi
                    if [ "$CRON_MINUTE" -lt 0 ] || [ "$CRON_MINUTE" -gt 59 ]; then
                        echo "错误：--time 分钟需要 0-59 之间的值" >&2
                        exit 1
                    fi
                else
                    echo "错误：--time 需要 HH:MM 格式 (例如：03:30)" >&2
                    exit 1
                fi
                ;;
            --uninstall)
                uninstall_cron
                exit $?
                ;;
            --list)
                list_cron
                exit $?
                ;;
            --help)
                show_help
                exit 0
                ;;
            *)
                echo "未知选项：$1" >&2
                show_help >&2
                exit 1
                ;;
        esac
        shift
    done
}

build_cron_job() {
    CRON_JOB="$CRON_MINUTE $CRON_HOUR * * * $SCRIPT_PATH >> $LOG_FILE 2>&1"
}

install_cron() {
    mkdir -p "$LOG_DIR"
    build_cron_job

    local current_crontab=$(crontab -l 2>/dev/null || true)

    if echo "$current_crontab" | grep -q "$CRON_COMMENT"; then
        echo "定时任务已安装，先卸载旧任务..."
        uninstall_cron
        current_crontab=$(crontab -l 2>/dev/null || true)
    fi

    echo "$current_crontab" > /tmp/current-cron.tmp
    echo "" >> /tmp/current-cron.tmp
    echo "$CRON_COMMENT" >> /tmp/current-cron.tmp
    echo "$CRON_JOB" >> /tmp/current-cron.tmp

    crontab /tmp/current-cron.tmp
    rm -f /tmp/current-cron.tmp

    printf "已安装定时任务：每日 %02d:%02d 更新 IOC 数据库\n" "$CRON_HOUR" "$CRON_MINUTE"
    echo "日志文件：$LOG_FILE"
}

list_cron() {
    local current_crontab=$(crontab -l 2>/dev/null || true)
    
    if echo "$current_crontab" | grep -q "$CRON_COMMENT"; then
        echo "当前 IOC 更新定时任务:"
        echo "$current_crontab" | grep -A1 "$CRON_COMMENT"
    else
        echo "未安装 IOC 更新定时任务"
        return 1
    fi
}

uninstall_cron() {
    local current_crontab=$(crontab -l 2>/dev/null || true)

    if ! echo "$current_crontab" | grep -q "$CRON_COMMENT"; then
        echo "定时任务未安装"
        exit 0
    fi

    local new_crontab=$(echo "$current_crontab" | grep -v "$CRON_COMMENT" | grep -v "$SCRIPT_PATH")

    if [ -z "$new_crontab" ]; then
        crontab -r 2>/dev/null || true
    else
        echo "$new_crontab" | crontab -
    fi

    echo "已卸载定时任务"
}

main() {
    parse_args "$@"
    install_cron
}

main "$@"
