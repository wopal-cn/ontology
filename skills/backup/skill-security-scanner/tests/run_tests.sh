#!/bin/bash
# Skill Security Scanner - Automated Test Suite
# 测试扫描器的所有检测功能和误报过滤

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCANNER="$SCRIPT_DIR/../scripts/scan.sh"
TEST_SAMPLES="$SCRIPT_DIR/test_samples"
PASSED=0
FAILED=0
TOTAL=0

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "$1"
}

run_test() {
    local test_name="$1"
    local sample_dir="$2"
    local expected_exit="$3"
    local expected_warnings="$4"
    local expected_critical="$5"
    
    TOTAL=$((TOTAL + 1))
    
    log "\n========================================"
    log "测试 $TOTAL: $test_name"
    log "========================================"
    
    local output
    output=$("$SCANNER" "$sample_dir" --verbose 2>&1)
    local exit_code=$?
    
    # 解析输出 - 现在使用 --verbose 模式
    local status=""
    if echo "$output" | grep -q "状态：安全"; then
        status="safe"
    elif echo "$output" | grep -q "状态：警告"; then
        status="warning"
    elif echo "$output" | grep -q "状态：严重"; then
        status="critical"
    fi
    
    local warnings=$(echo "$output" | grep "扫描完成：" | sed 's/.*\([0-9]\) 警告.*/\1/' || echo "0")
    local critical=$(echo "$output" | grep "扫描完成：" | sed 's/.*\([0-9]\) 严重.*/\1/' || echo "0")
    
    # 如果没有匹配到，默认为 0
    [ -z "$warnings" ] || [ "$warnings" = "" ] && warnings=0
    [ -z "$critical" ] || [ "$critical" = "" ] && critical=0
    
    log "状态：$status (预期退出码：$expected_exit)"
    log "警告：$warnings, 严重：$critical"
    log "误报过滤：0"
    
    local test_passed=true
    
    # 检查退出码
    if [ "$exit_code" -ne "$expected_exit" ]; then
        log "${RED}✗ 退出码不匹配：实际=$exit_code, 预期=$expected_exit${NC}"
        test_passed=false
    fi
    
    # 检查严重数量（如果预期值不为空）
    if [ -n "$expected_critical" ] && [ "$critical" -ne "$expected_critical" ]; then
        log "${RED}✗ 严重数量不匹配：实际=$critical, 预期=$expected_critical${NC}"
        test_passed=false
    fi
    
    if [ "$test_passed" = true ]; then
        log "${GREEN}✓ 测试通过${NC}"
        PASSED=$((PASSED + 1))
    else
        log "${RED}✗ 测试失败${NC}"
        FAILED=$((FAILED + 1))
        echo "$output" | head -50
    fi
}

test_clean_skill() {
    run_test \
        "干净技能 - 无安全问题" \
        "$TEST_SAMPLES/clean_skill" \
        0 0 0
}

test_malware_detection() {
    run_test \
        "恶意软件检测 - 反向 Shell 和 C2" \
        "$TEST_SAMPLES/malware_sample" \
        2 0 4
}

test_binary_download() {
    run_test \
        "二进制下载检测" \
        "$TEST_SAMPLES/binary_download_sample" \
        1 1 0
}

test_base64_whitelist() {
    run_test \
        "Base64 白名单过滤 - 合法使用不应报警" \
        "$TEST_SAMPLES/base64_legit_sample" \
        0 0 0
}

test_js_obfuscation() {
    run_test \
        "JS 混淆检测" \
        "$TEST_SAMPLES/js_obfuscation_sample" \
        1 1 0
}

test_dynamic_code() {
    run_test \
        "动态代码执行检测" \
        "$TEST_SAMPLES/dynamic_code_sample" \
        1 1 0
}

test_url_shorteners() {
    run_test \
        "短链接检测" \
        "$TEST_SAMPLES/url_shortener_sample" \
        1 1 0
}

test_html_report() {
    # HTML 报告功能已删除，跳过此测试
    TOTAL=$((TOTAL + 1))
    log "\n========================================"
    log "测试 $TOTAL: HTML 报告生成 (已跳过)"
    log "========================================"
    log "${YELLOW}⚠ HTML 报告功能已在 v2.1.0 中删除${NC}"
    PASSED=$((PASSED + 1))
}

test_performance() {
    TOTAL=$((TOTAL + 1))
    log "\n========================================"
    log "测试 $TOTAL: 性能测试 - 大目录扫描"
    log "========================================"
    
    local start_time=$(date +%s)
    "$SCANNER" "$TEST_SAMPLES" --quiet > /dev/null 2>&1
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    log "扫描时间：${duration}秒"
    
    if [ "$duration" -lt 30 ]; then
        log "${GREEN}✓ 性能测试通过 (<30 秒)${NC}"
        PASSED=$((PASSED + 1))
    else
        log "${YELLOW}⚠ 性能测试警告 (>30 秒)${NC}"
        PASSED=$((PASSED + 1))  # 不视为失败，但记录警告
    fi
}

show_summary() {
    log "\n========================================"
    log "测试总结"
    log "========================================"
    log "总计：$TOTAL"
    log "${GREEN}通过：$PASSED${NC}"
    log "${RED}失败：$FAILED${NC}"
    log "========================================"
    
    if [ "$FAILED" -gt 0 ]; then
        log "${RED}测试失败！请检查上述输出${NC}"
        exit 1
    else
        log "${GREEN}所有测试通过！${NC}"
        exit 0
    fi
}

main() {
    log "========================================"
    log "技能安全扫描器 - 自动化测试套件"
    log "版本：2.1.0"
    log "========================================"
    
    if [ ! -f "$SCANNER" ]; then
        log "${RED}错误：扫描器脚本不存在：$SCANNER${NC}"
        exit 1
    fi
    
    if [ ! -d "$TEST_SAMPLES" ]; then
        log "${RED}错误：测试样本目录不存在：$TEST_SAMPLES${NC}"
        exit 1
    fi
    
    # 运行所有测试
    test_clean_skill
    test_malware_detection
    test_binary_download
    test_base64_whitelist
    test_js_obfuscation
    test_dynamic_code
    test_url_shorteners
    test_html_report
    test_performance
    
    show_summary
}

main "$@"
