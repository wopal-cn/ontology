#!/bin/bash
# IOC Database Update Script
# 用于更新威胁情报数据库
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
IOC_DIR="$PROJECT_DIR/ioc"
LOG_DIR="$PROJECT_DIR/logs"

UPSTREAM_REPO="https://raw.githubusercontent.com/adibirzu/openclaw-security-monitor/main/ioc"

FORCE_UPDATE=false
CHECK_ONLY=false

show_help() {
    cat << 'EOF'
IOC 数据库更新脚本

用法：./update-ioc.sh [选项]

选项:
  --force     强制更新 (忽略版本检查)
  --check     仅检查更新，不下载
  --help      显示帮助信息

示例:
  ./update-ioc.sh           # 更新所有 IOC 文件
  ./update-ioc.sh --check   # 检查是否有可用更新
EOF
}

parse_args() {
    while [ $# -gt 0 ]; do
        case "$1" in
            --force)
                FORCE_UPDATE=true
                ;;
            --check)
                CHECK_ONLY=true
                ;;
            --help)
                show_help
                exit 0
                ;;
            *)
                echo "未知选项: $1" >&2
                show_help >&2
                exit 1
                ;;
        esac
        shift
    done
}

log() {
    mkdir -p "$LOG_DIR"
    local LOG_FILE="$LOG_DIR/ioc-update.log"
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

download_file() {
    local filename="$1"
    local url="$UPSTREAM_REPO/$filename"
    local local_file="$IOC_DIR/$filename"
    local temp_file="/tmp/ioc-$filename.$$"

    log "正在下载: $filename"

    if curl -fsSL -o "$temp_file" "$url" 2>/dev/null; then
        if [ -f "$local_file" ]; then
            local old_hash=$(shasum -a 256 "$local_file" 2>/dev/null | cut -d' ' -f1)
            local new_hash=$(shasum -a 256 "$temp_file" 2>/dev/null | cut -d' ' -f1)

            if [ "$old_hash" != "$new_hash" ]; then
                cp "$local_file" "$local_file.bak"
                mv "$temp_file" "$local_file"
                log "  ✓ 已更新: $filename"
                return 0
            else
                log "  - 无变化: $filename"
                rm -f "$temp_file"
                return 2
            fi
        else
            mv "$temp_file" "$local_file"
            log "  ✓ 已创建: $filename"
            return 0
        fi
    else
        log "  ✗ 下载失败: $filename"
        rm -f "$temp_file"
        return 1
    fi
}

check_updates() {
    log "检查 IOC 更新..."

    local has_updates=false

    for ioc_file in c2-ips.txt malicious-domains.txt malicious-skill-patterns.txt file-hashes.txt malicious-publishers.txt; do
        local url="$UPSTREAM_REPO/$ioc_file"
        local local_file="$IOC_DIR/$ioc_file"

        if ! curl -fsSL -o /dev/null "$url" 2>/dev/null; then
            log "  ✗ 无法访问: $ioc_file"
            continue
        fi

        if [ -f "$local_file" ]; then
            local temp_file="/tmp/check-$ioc_file.$$"
            if curl -fsSL -o "$temp_file" "$url" 2>/dev/null; then
                local old_hash=$(shasum -a 256 "$local_file" 2>/dev/null | cut -d' ' -f1)
                local new_hash=$(shasum -a 256 "$temp_file" 2>/dev/null | cut -d' ' -f1)

                if [ "$old_hash" != "$new_hash" ]; then
                    log "  ↑ 有更新: $ioc_file"
                    has_updates=true
                else
                    log "  ✓ 无更新: $ioc_file"
                fi
            fi
            rm -f "$temp_file"
        else
            log "  ? 新文件: $ioc_file"
            has_updates=true
        fi
    done

    if [ "$has_updates" = true ]; then
        log "有可用更新，使用 --force 强制更新"
        return 0
    else
        log "所有 IOC 数据库已是最新版本"
        return 1
    fi
}

main() {
    parse_args "$@"

    mkdir -p "$IOC_DIR"
    mkdir -p "$LOG_DIR"
    local LOG_FILE="$LOG_DIR/ioc-update.log"

    log "========================================"
    log "IOC 数据库更新"
    log "========================================"

    if [ "$CHECK_ONLY" = true ]; then
        check_updates
        exit $?
    fi

    if [ "$FORCE_UPDATE" = false ]; then
        if ! check_updates; then
            log "没有可用更新，退出"
            exit 0
        fi
    fi

    local updated=0
    local failed=0

    for ioc_file in c2-ips.txt malicious-domains.txt malicious-skill-patterns.txt file-hashes.txt malicious-publishers.txt; do
        if download_file "$ioc_file"; then
            updated=$((updated + 1))
        else
            failed=$((failed + 1))
        fi
    done

    log "========================================"
    log "更新完成: $updated 成功, $failed 失败"
    log "========================================"

    if [ "$failed" -gt 0 ]; then
        exit 1
    fi
    exit 0
}

main "$@"