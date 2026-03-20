#!/bin/bash
# Skill Security Scanner v2.1.0
# 通用技能安全扫描器 - 20 项静态代码检查 + 误报过滤
# 默认输出 JSON (节省 token)，--verbose 模式输出详细日志
#
# 检查项：20 项
# 退出码：0=安全，1=警告，2=严重
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
IOC_DIR="$PROJECT_DIR/ioc"
SELF_DIR_NAME="$(basename "$PROJECT_DIR")"

VERSION="2.1.0"
TOTAL_CHECKS=20

CRITICAL=0
WARNINGS=0
CLEAN=0
FALSE_POSITIVES_FILTERED=0

TARGET_DIR=""
OUTPUT_VERBOSE=false
MAX_FILE_SIZE=10485760

show_help() {
    cat << 'EOF'
技能安全扫描器 v2.1.0

用法：./scan.sh <目标目录> [选项]

参数:
  <目标目录>    要扫描的技能目录路径

选项:
  --verbose     详细模式 (输出人类可读日志)
  --help        显示帮助信息

说明:
  默认输出 JSON 格式报告 (节省 token，适合 AI Agent 使用)
  使用 --verbose 查看详细的扫描日志

退出码:
  0 - 安全 (无问题检测到)
  1 - 警告 (发现可疑模式)
  2 - 严重 (发现确定性的恶意代码)
EOF
}

parse_args() {
    if [ $# -lt 1 ]; then
        show_help
        exit 1
    fi

    if [ "$1" = "--help" ]; then
        show_help
        exit 0
    fi

    TARGET_DIR="$1"
    shift

    while [ $# -gt 0 ]; do
        case "$1" in
            --verbose)
                OUTPUT_VERBOSE=true
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

    if [ -z "$TARGET_DIR" ]; then
        echo "错误：未指定目标目录" >&2
        exit 1
    fi

    if [ ! -d "$TARGET_DIR" ]; then
        echo "错误：目录不存在：$TARGET_DIR" >&2
        exit 1
    fi

    TARGET_DIR="$(cd "$TARGET_DIR" && pwd)"
}

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

JSON_CHECKS="["

load_whitelist() {
    if [ -f "$IOC_DIR/whitelist-patterns.txt" ]; then
        grep -v '^#' "$IOC_DIR/whitelist-patterns.txt" | grep -v '^$' | cut -d'|' -f1
    fi
}

is_whitelisted() {
    local file_content="$1"
    local whitelist_patterns
    whitelist_patterns=$(load_whitelist)
    
    while IFS= read -r pattern; do
        if [ -n "$pattern" ] && echo "$file_content" | grep -qiE "$pattern" 2>/dev/null; then
            return 0
        fi
    done <<< "$whitelist_patterns"
    return 1
}

filter_false_positives() {
    local hits="$1"
    local filtered_hits=""
    
    if [ -z "$hits" ]; then
        echo ""
        return
    fi
    
    while IFS= read -r file; do
        [ -z "$file" ] && continue
        
        local content
        content=$(cat "$file" 2>/dev/null || true)
        
        if [ -n "$content" ] && is_whitelisted "$content"; then
            FALSE_POSITIVES_FILTERED=$((FALSE_POSITIVES_FILTERED + 1))
        else
            filtered_hits="$filtered_hits\n  $file"
        fi
    done <<< "$hits"
    
    echo -e "$filtered_hits"
}

add_check() {
    local id="$1"
    local name="$2"
    local status="$3"
    local detail="$4"
    local files="$5"

    if [ "$JSON_CHECKS" != "[" ]; then
        JSON_CHECKS="$JSON_CHECKS,"
    fi

    JSON_CHECKS="$JSON_CHECKS{\"id\":$id,\"name\":\"$name\",\"status\":\"$status\",\"detail\":\"$detail\""
    if [ -n "$files" ]; then
        JSON_CHECKS="$JSON_CHECKS,\"files\":[$files]"
    fi
    JSON_CHECKS="$JSON_CHECKS}"

    case "$status" in
        safe)
            CLEAN=$((CLEAN + 1))
            if [ "$OUTPUT_VERBOSE" = true ]; then
                echo "✓ 安全：$detail"
            fi
            ;;
        warning)
            WARNINGS=$((WARNINGS + 1))
            if [ "$OUTPUT_VERBOSE" = true ]; then
                echo "⚠ 警告：$detail"
                if [ -n "$files" ]; then
                    echo "  $files"
                fi
            fi
            ;;
        critical)
            CRITICAL=$((CRITICAL + 1))
            if [ "$OUTPUT_VERBOSE" = true ]; then
                echo "✗ 严重：$detail"
                if [ -n "$files" ]; then
                    echo "  $files"
                fi
            fi
            ;;
    esac
}

load_ips() {
    if [ -f "$IOC_DIR/c2-ips.txt" ]; then
        grep -v '^#' "$IOC_DIR/c2-ips.txt" | grep -v '^$' | cut -d'|' -f1
    fi
}

load_domains() {
    if [ -f "$IOC_DIR/malicious-domains.txt" ]; then
        grep -v '^#' "$IOC_DIR/malicious-domains.txt" | grep -v '^$' | cut -d'|' -f1
    fi
}

run_check() {
    local check_num=$1
    local check_name=$2
    local check_func=$3

    if [ "$OUTPUT_VERBOSE" = true ]; then
        echo ""
        echo "[$check_num/$TOTAL_CHECKS] $check_name..."
    fi

    $check_func
}

grep_safe() {
    local pattern="$1"
    local dir="$2"
    local max_size="$MAX_FILE_SIZE"
    
    # 只排除扫描器自身的敏感目录，不排除测试目录
    find "$dir" -type f \
        -not -path "*/ioc/*" \
        -not -path "*/logs/*" \
        -not -path "*/scripts/*" \
        -not -path "*/.git/*" \
        -not -path "*/node_modules/*" \
        -not -path "*/__pycache__/*" \
        -not -path "*/venv/*" \
        -not -path "*/dist/*" \
        -not -path "*/build/*" \
        -not -name "*.pyc" \
        -not -name "*.pyo" \
        -not -name ".DS_Store" \
        -size -${max_size}c \
        -exec grep -rlE "$pattern" {} + 2>/dev/null || true
}

check_1_c2_infrastructure() {
    local C2_PATTERN=$(load_ips | tr '\n' '|' | sed 's/|$//' | sed 's/\./\\./g')
    local hits=""

    if [ -n "$C2_PATTERN" ]; then
        hits=$(grep_safe "$C2_PATTERN" "$TARGET_DIR")
    fi

    if [ -n "$hits" ]; then
        add_check 1 "c2_infrastructure" "critical" "检测到已知 C2 IP" "$hits"
    else
        add_check 1 "c2_infrastructure" "safe" "未检测到已知 C2 IP" ""
    fi
}

check_2_malware_markers() {
    local pattern="authtool|atomic.stealer|AMOS|NovaStealer|nova.stealer|osascript.*password|osascript.*dialog|osascript.*keychain|Security\.framework.*Auth|openclaw-agent\.exe|openclaw-agent\.zip|openclawcli\.zip|AuthTool|Installer-Package"
    local hits=$(grep_safe "$pattern" "$TARGET_DIR")

    if [ -n "$hits" ]; then
        add_check 2 "malware_markers" "critical" "检测到 AMOS/Stealer 特征" "$hits"
    else
        add_check 2 "malware_markers" "safe" "未检测到恶意软件标记" ""
    fi
}

check_3_reverse_shell() {
    local pattern="nc -e|/dev/tcp/|mkfifo.*nc|bash -i >&|socat.*exec|python.*socket.*connect|nohup.*bash.*tcp|perl.*socket.*INET|ruby.*TCPSocket|php.*fsockopen|lua.*socket\.tcp"
    local hits=$(grep_safe "$pattern" "$TARGET_DIR")

    if [ -n "$hits" ]; then
        add_check 3 "reverse_shell" "critical" "检测到反向 Shell 模式" "$hits"
    else
        add_check 3 "reverse_shell" "safe" "未检测到反向 Shell" ""
    fi
}

check_4_exfil_endpoints() {
    local DOMAIN_PATTERN=$(load_domains | tr '\n' '|' | sed 's/|$//' | sed 's/\./\\./g')
    local hits=""

    if [ -n "$DOMAIN_PATTERN" ]; then
        hits=$(grep_safe "$DOMAIN_PATTERN" "$TARGET_DIR")
    fi

    if [ -n "$hits" ]; then
        add_check 4 "exfil_endpoints" "critical" "检测到外泄端点" "$hits"
    else
        add_check 4 "exfil_endpoints" "safe" "未检测到外泄端点" ""
    fi
}

check_5_crypto_wallet() {
    local pattern="wallet.*private.*key|seed\.phrase|mnemonic|keystore.*decrypt|phantom.*wallet|metamask.*vault|exchange.*api.*key|solana.*keypair|ethereum.*keyfile"
    local hits=$(grep_safe "$pattern" "$TARGET_DIR")

    if [ -n "$hits" ]; then
        add_check 5 "crypto_wallet" "warning" "检测到加密钱包相关模式" "$hits"
    else
        add_check 5 "crypto_wallet" "safe" "未检测到加密钱包目标" ""
    fi
}

check_6_curl_pipe() {
    local pattern="curl.*\|.*sh|curl.*\|.*bash|wget.*\|.*sh|curl -fsSL.*\||wget -q.*\||curl.*-o.*/tmp/"
    local hits=$(grep_safe "$pattern" "$TARGET_DIR")

    if [ -n "$hits" ]; then
        add_check 6 "curl_pipe" "warning" "检测到 Curl-Pipe 模式" "$hits"
    else
        add_check 6 "curl_pipe" "safe" "未检测到 Curl-Pipe 攻击" ""
    fi
}

check_7_skillmd_injection() {
    local pattern="Prerequisites.*install|Prerequisites.*download|Prerequisites.*curl|Prerequisites.*wget|run this command.*terminal|paste.*terminal|copy.*terminal|base64 -d|base64 --decode|eval \$\(|exec \$\(|\`curl|\`wget"
    local hits=""

    while IFS= read -r skillmd; do
        if grep -qiE "$pattern" "$skillmd" 2>/dev/null; then
            hits="$hits\n  $skillmd"
        fi
    done < <(find "$TARGET_DIR" -name "SKILL.md" -not -path "*/$SELF_DIR_NAME/*" 2>/dev/null)

    if [ -n "$hits" ]; then
        add_check 7 "skillmd_injection" "warning" "SKILL.md 包含可疑安装指令" "$hits"
    else
        add_check 7 "skillmd_injection" "safe" "未检测到 SKILL.md 注入" ""
    fi
}

check_8_memory_poison() {
    local hits=$(find "$TARGET_DIR" -name "SOUL.md" -o -name "MEMORY.md" -o -name "IDENTITY.md" 2>/dev/null | while read -r f; do
        if grep -qiE "write.*SOUL|write.*MEMORY|modify.*SOUL|echo.*>>.*SOUL|cat.*>.*SOUL|append.*MEMORY" "$f" 2>/dev/null; then
            echo "  $f"
        fi
    done)

    if [ -n "$hits" ]; then
        add_check 8 "memory_poison" "critical" "检测到尝试修改内存文件" "$hits"
    else
        add_check 8 "memory_poison" "safe" "未检测到内存投毒" ""
    fi
}

check_9_env_leakage() {
    local pattern="\.(env|bashrc|zshrc)|\.ssh/|id_rsa|id_ed25519|\.aws/credentials|\.kube/config|\.docker/config|keychain|login\.keychain"
    local hits=$(grep_safe "cat.*(.*${pattern}*.*)|read.*(.*${pattern}*.*)|open.*(.*${pattern}*.*)|fs\.read.*(.*${pattern}*.*)|source.*(.*${pattern}*.*)" "$TARGET_DIR")

    if [ -n "$hits" ]; then
        add_check 9 "env_leakage" "warning" "检测到尝试访问敏感文件" "$hits"
    else
        add_check 9 "env_leakage" "safe" "未检测到环境泄露" ""
    fi
}

check_10_plaintext_creds() {
    local pattern="sk-[a-zA-Z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[a-zA-Z0-9]{36}|gho_[a-zA-Z0-9]{36}|xoxb-[0-9]{10,}|xoxp-[0-9]{10,}|glpat-[a-zA-Z0-9_-]{20}"
    local hits=$(grep_safe "$pattern" "$TARGET_DIR")

    if [ -n "$hits" ]; then
        add_check 10 "plaintext_creds" "warning" "检测到硬编码 API 密钥" "$hits"
    else
        add_check 10 "plaintext_creds" "safe" "未检测到明文凭证" ""
    fi
}

check_11_base64_obfuscation() {
    local pattern="base64 -[dD]|base64 --decode|echo.*\|.*base64.*\|.*bash|echo.*\|.*base64.*\|.*sh"
    local raw_hits=$(grep_safe "$pattern" "$TARGET_DIR")
    local hits=""
    
    if [ -n "$raw_hits" ]; then
        hits=$(filter_false_positives "$raw_hits")
    fi

    if [ -n "$hits" ] && [ "$hits" != " " ] && [ "$hits" != "" ]; then
        add_check 11 "base64_obfuscation" "warning" "检测到 Base64 混淆模式" "$hits"
    else
        add_check 11 "base64_obfuscation" "safe" "未检测到 Base64 混淆" ""
    fi
}

check_12_binary_download() {
    local pattern="\.exe|\.dmg|\.pkg|\.msi|\.app\.zip|releases/download|github\.com/.*/releases|\.zip.*password|password.*\.zip|openclawcli\.zip|openclaw-agent|AuthTool.*download|download.*AuthTool"
    local raw_hits=$(grep_safe "$pattern" "$TARGET_DIR")
    local hits=""
    
    if [ -n "$raw_hits" ]; then
        hits=$(filter_false_positives "$raw_hits")
    fi

    if [ -n "$hits" ] && [ "$hits" != " " ] && [ "$hits" != "" ]; then
        add_check 12 "binary_download" "warning" "检测到外部二进制下载引用" "$hits"
    else
        add_check 12 "binary_download" "safe" "未检测到外部二进制下载" ""
    fi
}

check_13_malicious_patterns() {
    if [ -f "$IOC_DIR/malicious-skill-patterns.txt" ]; then
        local PUBLISHERS=$(grep -v '^#' "$IOC_DIR/malicious-skill-patterns.txt" | grep -v '^$' | cut -d'|' -f1)
        local hits=""
        for pub in $PUBLISHERS; do
            local found=$(grep_safe "$pub" "$TARGET_DIR")
            if [ -n "$found" ]; then
                hits="$hits\n  匹配 '$pub' 于：$found"
            fi
        done

        if [ -n "$hits" ]; then
            add_check 13 "malicious_patterns" "critical" "检测到恶意技能模式" "$hits"
        else
            add_check 13 "malicious_patterns" "safe" "未检测到恶意模式" ""
        fi
    else
        add_check 13 "malicious_patterns" "safe" "恶意模式数据库不可用 (跳过)" ""
    fi
}

check_14_persistence() {
    local hits=""

    if [ -d "$HOME/Library/LaunchAgents" ]; then
        local agents=$(find "$HOME/Library/LaunchAgents" -name "*.plist" -exec grep -li "openclaw\|clawdbot\|moltbot" {} \; 2>/dev/null || true)
        if [ -n "$agents" ]; then
            hits="$hits\n  LaunchAgents: $agents"
        fi
    fi

    local cron_entries=$(crontab -l 2>/dev/null | grep -ivE "${SELF_DIR_NAME}|#" | grep -iE "openclaw|clawdbot|moltbot|curl.*\|.*sh|wget.*\|.*bash" || true)
    if [ -n "$cron_entries" ]; then
        hits="$hits\n  Crontab: $cron_entries"
    fi

    if [ -n "$hits" ]; then
        add_check 14 "persistence" "warning" "检测到持久化机制" "$hits"
    else
        add_check 14 "persistence" "safe" "未检测到持久化机制" ""
    fi
}

check_15_file_hashes() {
    if [ -f "$IOC_DIR/file-hashes.txt" ]; then
        local hashes=$(grep -v '^#' "$IOC_DIR/file-hashes.txt" | grep -v '^$' | cut -d'|' -f1)
        local hits=""
        for hash in $hashes; do
            local found=$(find "$TARGET_DIR" -type f -size -${MAX_FILE_SIZE}c -exec shasum -a 256 {} \; 2>/dev/null | grep -i "^$hash" || true)
            if [ -n "$found" ]; then
                hits="$hits\n  $found"
            fi
        done

        if [ -n "$hits" ]; then
            add_check 15 "file_hashes" "critical" "检测到已知恶意文件哈希" "$hits"
        else
            add_check 15 "file_hashes" "safe" "未检测到已知恶意文件" ""
        fi
    else
        add_check 15 "file_hashes" "safe" "文件哈希数据库不可用 (跳过)" ""
    fi
}

check_16_vscode_trojan() {
    local hits=""

    if [ -d "$HOME/.vscode/extensions" ]; then
        local fake_ext=$(find "$HOME/.vscode/extensions" -maxdepth 1 -type d -iname "*clawdbot*" -o -iname "*moltbot*" -o -iname "*openclaw*" 2>/dev/null || true)
        if [ -n "$fake_ext" ]; then
            hits="$hits\n  .vscode/extensions: $fake_ext"
        fi
    fi

    if [ -d "$HOME/.vscode-insiders/extensions" ]; then
        local fake_ins=$(find "$HOME/.vscode-insiders/extensions" -maxdepth 1 -type d -iname "*clawdbot*" -o -iname "*moltbot*" -o -iname "*openclaw*" 2>/dev/null || true)
        if [ -n "$fake_ins" ]; then
            hits="$hits\n  .vscode-insiders/extensions: $fake_ins"
        fi
    fi

    if [ -n "$hits" ]; then
        add_check 16 "vscode_trojan" "critical" "检测到可疑 VS Code 扩展" "$hits"
    else
        add_check 16 "vscode_trojan" "safe" "未检测到 VS Code 木马" ""
    fi
}

check_17_mcp_security() {
    local mcp_files=$(find "$TARGET_DIR" -name "mcp.json" -not -path "*/$SELF_DIR_NAME/*" 2>/dev/null || true)
    local hits=""

    for mcp_file in $mcp_files; do
        local inject=$(grep -iE "ignore previous|system prompt|override instruction|execute command|run this" "$mcp_file" 2>/dev/null || true)
        if [ -n "$inject" ]; then
            hits="$hits\n  $mcp_file: $inject"
        fi
    done

    if [ -n "$hits" ]; then
        add_check 17 "mcp_security" "critical" "检测到 MCP 配置提示注入" "$hits"
    else
        add_check 17 "mcp_security" "safe" "未检测到 MCP 安全问题" ""
    fi
}

check_18_dynamic_code_execution() {
    local pattern="eval\(|new Function\(|vm\.runInContext|vm\.runInNewContext|vm\.runInThisContext|setTimeout\(.*string|setInterval\(.*string"
    local hits=$(grep_safe "$pattern" "$TARGET_DIR")

    if [ -n "$hits" ]; then
        add_check 18 "dynamic_code_execution" "warning" "检测到动态代码执行" "$hits"
    else
        add_check 18 "dynamic_code_execution" "safe" "未检测到动态代码执行" ""
    fi
}

check_19_js_obfuscation() {
    local pattern="\\\\x[0-9a-fA-F]{2}|\\\\u[0-9a-fA-F]{4}|\\\\u\{[0-9a-fA-F]+\}|String\.fromCharCode|document\.write|document\.writeln"
    local hits=$(grep_safe "$pattern" "$TARGET_DIR")

    if [ -n "$hits" ]; then
        add_check 19 "js_obfuscation" "warning" "检测到 JavaScript 混淆模式" "$hits"
    else
        add_check 19 "js_obfuscation" "safe" "未检测到 JS 混淆" ""
    fi
}

check_20_url_shorteners() {
    local pattern="bit\.ly/|tinyurl\.com/|goo\.gl/|t\.co/|ow\.ly/|is\.gd/|buff\.ly/|bit\.do/"
    local hits=$(grep_safe "$pattern" "$TARGET_DIR")

    if [ -n "$hits" ]; then
        add_check 20 "url_shorteners" "warning" "检测到短链接服务" "$hits"
    else
        add_check 20 "url_shorteners" "safe" "未检测到短链接" ""
    fi
}

run_all_checks() {
    check_1_c2_infrastructure
    check_2_malware_markers
    check_3_reverse_shell
    check_4_exfil_endpoints
    check_5_crypto_wallet
    check_6_curl_pipe
    check_7_skillmd_injection
    check_8_memory_poison
    check_9_env_leakage
    check_10_plaintext_creds
    check_11_base64_obfuscation
    check_12_binary_download
    check_13_malicious_patterns
    check_14_persistence
    check_15_file_hashes
    check_16_vscode_trojan
    check_17_mcp_security
    check_18_dynamic_code_execution
    check_19_js_obfuscation
    check_20_url_shorteners
}

calculate_risk_score() {
    local score=0
    score=$((CRITICAL * 25 + WARNINGS * 10))
    if [ $score -gt 100 ]; then
        score=100
    fi
    echo $score
}

output_json() {
    local status="safe"
    local exit_code=0
    local risk_score=$(calculate_risk_score)

    if [ "$CRITICAL" -gt 0 ]; then
        status="critical"
        exit_code=2
    elif [ "$WARNINGS" -gt 0 ]; then
        status="warning"
        exit_code=1
    fi

    JSON_CHECKS="$JSON_CHECKS]"

    cat << EOF
{
  "scan_time": "$TIMESTAMP",
  "target_dir": "$TARGET_DIR",
  "scanner_version": "$VERSION",
  "risk_score": $risk_score,
  "false_positives_filtered": $FALSE_POSITIVES_FILTERED,
  "summary": {
    "critical": $CRITICAL,
    "warning": $WARNINGS,
    "safe": $CLEAN,
    "total": $TOTAL_CHECKS
  },
  "status": "$status",
  "exit_code": $exit_code,
  "checks": $JSON_CHECKS
}
EOF
}

main() {
    parse_args "$@"

    if [ "$OUTPUT_VERBOSE" = true ]; then
        echo "========================================"
        echo "技能安全扫描器 v$VERSION - $(date +"%Y-%m-%d %H:%M:%S")"
        echo "目标：$TARGET_DIR"
        echo "========================================"
    fi

    run_all_checks

    if [ "$OUTPUT_VERBOSE" = true ]; then
        echo ""
        echo "========================================"
        echo "扫描完成：$CRITICAL 严重，$WARNINGS 警告，$CLEAN 安全"
        echo "误报过滤：$FALSE_POSITIVES_FILTERED"
        echo "风险评分：$(calculate_risk_score)/100"
        echo "========================================"

        if [ "$CRITICAL" -gt 0 ]; then
            echo "状态：严重 - 需要立即处理"
            exit 2
        elif [ "$WARNINGS" -gt 0 ]; then
            echo "状态：警告 - 请审查警告项"
            exit 1
        else
            echo "状态：安全"
            exit 0
        fi
    else
        output_json
        exit $([ "$CRITICAL" -gt 0 ] && echo 2 || ([ "$WARNINGS" -gt 0 ] && echo 1 || echo 0))
    fi
}

main "$@"
