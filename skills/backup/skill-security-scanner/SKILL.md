---
name: skill-security-scanner
description: Security scanner for AI agent skills. Scans skills or directories for malicious code including C2 infrastructure, reverse shells, credential exfiltration, malware markers, dynamic code execution, and JS obfuscation. Default JSON output for AI agents. Use after downloading any new skill.
---

# Skill Security Scanner

对 AI Agent 技能进行静态安全分析，检测 20 种恶意代码模式。**默认输出 JSON**（节省 token）。

## 用法

```bash
# 扫描单个技能（默认 JSON 输出）
./scripts/scan.sh <skill-directory>

# 详细模式（人类可读日志）
./scripts/scan.sh <skill-directory> --verbose

# 递归扫描目录
./scripts/scan.sh ~/.claude/skills
```

## 检测项 (20 项)

| # | 检查项 | 风险等级 | 说明 |
|---|--------|----------|------|
| 1 | c2_infrastructure | 严重 | 已知 C2 IP 地址 |
| 2 | malware_markers | 严重 | AMOS/Stealer 恶意软件特征 |
| 3 | reverse_shell | 严重 | 反向 Shell 模式 |
| 4 | exfil_endpoints | 严重 | 数据外泄端点 |
| 5 | crypto_wallet | 警告 | 加密钱包相关模式 |
| 6 | curl_pipe | 警告 | Curl-Pipe 攻击模式 |
| 7 | skillmd_injection | 警告 | SKILL.md 可疑安装指令 |
| 8 | memory_poison | 严重 | 尝试修改内存文件 |
| 9 | env_leakage | 警告 | 访问敏感文件 |
| 10 | plaintext_creds | 警告 | 硬编码 API 密钥 |
| 11 | base64_obfuscation | 警告 | Base64 混淆模式 |
| 12 | binary_download | 警告 | 外部二进制下载 |
| 13 | malicious_patterns | 严重 | 已知恶意技能模式 |
| 14 | persistence | 警告 | 持久化机制 |
| 15 | file_hashes | 严重 | 已知恶意文件哈希 |
| 16 | vscode_trojan | 严重 | 可疑 VS Code 扩展 |
| 17 | mcp_security | 严重 | MCP 配置提示注入 |
| 18 | dynamic_code_execution | 警告 | 动态代码执行 |
| 19 | js_obfuscation | 警告 | JavaScript 混淆 |
| 20 | url_shorteners | 警告 | 短链接服务 |

## 退出码

- `0` - 安全 (Risk Score: 0)
- `1` - 警告 (Risk Score: 1-99)
- `2` - 严重 (Risk Score: 100)

## JSON 输出示例

```json
{
  "scan_time": "2026-02-25T10:00:00Z",
  "target_dir": "/path/to/skill",
  "scanner_version": "2.1.0",
  "risk_score": 0,
  "summary": { "critical": 0, "warning": 0, "safe": 20, "total": 20 },
  "status": "safe",
  "exit_code": 0,
  "checks": [...]
}
```

## IOC 数据库更新

```bash
./scripts/update-ioc.sh         # 立即更新
./scripts/update-ioc.sh --check # 检查更新
```

### 设置自动更新

```bash
# 默认每日 02:30 更新
./scripts/setup-auto-update.sh

# 自定义时间 (HH:MM)
./scripts/setup-auto-update.sh --time 03:30

# 或分别指定小时和分钟
./scripts/setup-auto-update.sh --hour 2 --minute 30

# 查看当前定时任务
./scripts/setup-auto-update.sh --list

# 卸载定时任务
./scripts/setup-auto-update.sh --uninstall
```

威胁签名数据库位于 `ioc/` 目录，从上游仓库 `adibirzu/openclaw-security-monitor` 同步。
