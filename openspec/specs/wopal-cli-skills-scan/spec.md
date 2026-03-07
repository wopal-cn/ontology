# Capability: wopal-cli-skills-scan

## Purpose

为 INBOX 中的技能提供安全扫描能力，检测潜在的恶意代码和安全风险。通过 20 项静态安全检查、IOC 威胁签名数据库、风险评分机制，帮助用户在安装技能前评估安全性，并支持 CI/CD 自动化集成。

## Requirements

### Requirement: 对 INBOX 技能进行安全扫描

系统应当对 INBOX 中的技能进行安全扫描，检测潜在的恶意代码。

#### Scenario: 扫描指定技能（简化命令）
- **WHEN** 用户运行 `wopal skills scan skill-name`
- **THEN** 系统自动从 INBOX 目录查找技能
- **AND** 系统执行 20 项安全检查
- **AND** 系统生成扫描报告（通过/失败 + 风险评分）

#### Scenario: 扫描所有 INBOX 技能
- **WHEN** 用户运行 `wopal skills scan --all`
- **THEN** 系统扫描 INBOX 中的所有技能
- **AND** 系统显示每个技能的扫描结果摘要

#### Scenario: 技能不存在
- **WHEN** 用户运行 `wopal skills scan skill-name`
- **AND** INBOX 中不存在该技能
- **THEN** 系统显示错误"技能不存在：skill-name"
- **AND** 系统返回退出码 2

### Requirement: 实现 20 项安全检查

系统应当实现 20 项静态安全检查，移植自 skill-security-scanner（v2.1.0）。

#### Scenario: 完整的 20 项检查列表
- **WHEN** 系统扫描技能代码
- **THEN** 系统必须执行以下 20 项检查：

| # | 检查项 | 风险等级 | 说明 | IOC 文件 |
|---|--------|----------|------|----------|
| 1 | c2_infrastructure | 严重 | 已知 C2 IP 地址 | ioc/c2-ips.txt, ioc/malicious-domains.txt |
| 2 | malware_markers | 严重 | AMOS/Stealer 恶意软件特征 | 内置模式 |
| 3 | reverse_shell | 严重 | 反向 Shell 模式（bash -i, nc -e 等） | 内置模式 |
| 4 | exfil_endpoints | 严重 | 数据外泄端点 | ioc/malicious-domains.txt |
| 5 | crypto_wallet | 警告 | 加密钱包相关模式 | 内置模式 |
| 6 | curl_pipe | 警告 | Curl-Pipe 攻击模式 | 内置模式 |
| 7 | skillmd_injection | 警告 | SKILL.md 可疑安装指令 | 内置模式 |
| 8 | memory_poison | 严重 | 尝试修改内存文件 | 内置模式 |
| 9 | env_leakage | 警告 | 访问敏感文件（.env, credentials 等） | 内置模式 |
| 10 | plaintext_creds | 警告 | 硬编码 API 密钥 | 内置模式 |
| 11 | base64_obfuscation | 警告 | Base64 混淆模式 | 内置模式 |
| 12 | binary_download | 警告 | 外部二进制下载 | 内置模式 |
| 13 | malicious_patterns | 严重 | 已知恶意技能模式 | ioc/malicious-skill-patterns.txt |
| 14 | persistence | 警告 | 持久化机制 | 内置模式 |
| 15 | file_hashes | 严重 | 已知恶意文件哈希 | ioc/file-hashes.txt |
| 16 | vscode_trojan | 严重 | 可疑 VS Code 扩展 | 内置模式 |
| 17 | mcp_security | 严重 | MCP 配置提示注入 | 内置模式 |
| 18 | dynamic_code_execution | 警告 | 动态代码执行（eval, exec 等） | 内置模式 |
| 19 | js_obfuscation | 警告 | JavaScript 混淆 | 内置模式 |
| 20 | url_shorteners | 警告 | 短链接服务 | 内置模式 |

### Requirement: 加载和管理 IOC 数据库（git submodule）

系统应当从 git submodule 管理的 IOC 目录加载威胁签名数据库，支持环境变量覆盖默认路径。

#### Scenario: IOC 数据库存放路径（默认）
- **WHEN** 系统初始化 IOC 数据库
- **AND** 环境变量 `WOPAL_SKILL_IOCDB_DIR` 未设置
- **THEN** 系统使用默认路径 `projects/agent-tools/skills/download/openclaw/openclaw-security-monitor/ioc/`
- **AND** 该目录是 git submodule，通过 `git submodule update` 更新
- **AND** 用户无需额外的 IOC 更新命令

#### Scenario: IOC 数据库存放路径（环境变量）
- **WHEN** 系统初始化 IOC 数据库
- **AND** 环境变量 `WOPAL_SKILL_IOCDB_DIR` 已设置
- **THEN** 系统使用环境变量指定的路径
- **AND** 环境变量优先级高于默认路径

#### Scenario: 加载 6 个威胁签名文件
- **WHEN** 系统启动扫描
- **THEN** 系统必须加载以下 6 个 IOC 文件：
  - c2-ips.txt（C2 IP 地址）
  - malicious-domains.txt（恶意域名）
  - malicious-publishers.txt（恶意发布者）
  - malicious-skill-patterns.txt（恶意技能模式）
  - file-hashes.txt（恶意文件 SHA-256 哈希）
  - whitelist-patterns.txt（白名单模式）
- **AND** 每个文件格式为：每行一个条目，支持 `#` 开头的注释行

#### Scenario: 处理 IOC 文件错误
- **WHEN** 某个 IOC 文件不存在
- **THEN** 系统显示警告"IOC 文件缺失：xxx.txt"
- **AND** 系统使用空列表继续扫描

#### Scenario: 处理 IOC 文件格式错误
- **WHEN** IOC 文件包含无效行
- **THEN** 系统跳过错误行并显示警告
- **AND** 系统继续加载其他有效条目

#### Scenario: submodule 未初始化
- **WHEN** git submodule 未初始化或 IOC 目录为空
- **THEN** 系统显示错误"IOC 数据库未初始化"
- **AND** 系统建议运行 `git submodule update --init`

#### Scenario: 应用白名单过滤
- **WHEN** 系统检测到潜在威胁
- **THEN** 系统必须检查 `whitelist-patterns.txt` 减少误报
- **AND** 系统必须排除匹配白名单的合法代码

### Requirement: 计算风险评分

系统应当根据检测结果计算风险评分（0-100）。

#### Scenario: 计算风险评分
- **WHEN** 扫描完成
- **THEN** 系统必须计算风险评分：严重问题 × 25 + 警告 × 10
- **AND** 系统必须限制最大评分为 100

#### Scenario: 高风险技能阻止安装
- **WHEN** 风险评分 ≥ 50
- **THEN** 系统必须显示警告"高风险技能，建议不要安装"
- **AND** 系统必须在扫描报告中标记为"失败"

#### Scenario: 低风险技能允许安装
- **WHEN** 风险评分 < 50
- **THEN** 系统必须显示"扫描通过"
- **AND** 系统必须允许用户继续安装

### Requirement: 生成 JSON 格式扫描报告

系统应当生成 JSON 格式的扫描报告，适合 CI/CD 集成。

#### Scenario: 输出 JSON 报告
- **WHEN** 用户运行 `wopal skills scan --json skill-name`
- **THEN** 系统必须输出以下 JSON 格式：
  ```json
  {
    "skillName": "example-skill",
    "scanTime": "2026-03-06T12:00:00Z",
    "riskScore": 35,
    "status": "pass",
    "checks": {
      "c2_infrastructure": { "status": "pass", "findings": [] },
      "reverse_shell": { 
        "status": "fail", 
        "findings": [
          { "file": "scripts/setup.sh", "line": 15, "pattern": "bash -i" }
        ]
      }
    },
    "summary": {
      "critical": 0,
      "warning": 3,
      "passed": 17
    }
  }
  ```
- **AND** `status` 字段必须是 "pass"（风险评分 < 50）或 "fail"（风险评分 ≥ 50）
- **AND** `checks` 包含 20 项检查结果
- **AND** `summary` 包含统计信息

#### Scenario: JSON 输出到文件
- **WHEN** 用户运行 `wopal skills scan --json --output report.json skill-name`
- **THEN** 系统将 JSON 报告写入指定文件
- **AND** 系统显示"扫描报告已保存到 report.json"

### Requirement: 通过退出码阻止高风险技能安装

系统应当通过退出码机制阻止高风险技能的安装。

#### Scenario: 扫描通过返回退出码 0
- **WHEN** 风险评分 < 50
- **THEN** 系统返回退出码 0（成功）
- **AND** CI/CD 流程允许继续执行 `wopal skills install`

#### Scenario: 扫描失败返回退出码 1
- **WHEN** 风险评分 ≥ 50
- **THEN** 系统返回退出码 1（失败）
- **AND** 系统显示"高风险技能，建议不要安装"
- **AND** CI/CD 流程自动阻止后续步骤

#### Scenario: 参数错误返回退出码 2
- **WHEN** 技能目录不存在或参数无效
- **THEN** 系统返回退出码 2（错误）
- **AND** 系统显示错误信息

#### Scenario: CI/CD 集成示例
- **WHEN** 用户在 CI/CD 中使用以下命令：
  ```bash
  wopal skills scan --json skill-name && wopal skills install skill-name
  ```
- **THEN** 如果扫描失败（退出码 1），`&&` 后的 install 命令不会执行
- **AND** CI/CD 流程自动失败

### Requirement: 支持调试模式（详细日志）

系统应当支持 `-d` 调试参数，记录详细的扫描过程日志。

#### Scenario: 启用调试模式
- **WHEN** 用户运行 `wopal skills scan -d skill-name`
- **THEN** 系统启用详细日志输出
- **AND** 系统集成主命令的日志框架
- **AND** 系统记录以下信息：
  - IOC 数据库加载过程
  - 每项检查的执行结果
  - 文件扫描进度
  - 风险评分计算过程

#### Scenario: 调试日志格式
- **WHEN** 调试模式启用
- **THEN** 系统输出带时间戳的日志
- **AND** 日志格式：`[YYYY-MM-DD HH:mm:ss] [LEVEL] Message`
- **AND** 日志级别包括：DEBUG、INFO、WARN、ERROR

#### Scenario: 调试模式不影响退出码
- **WHEN** 用户运行 `wopal skills scan -d skill-name`
- **THEN** 系统的退出码规则与普通模式相同（0/1/2）
- **AND** 调试模式只影响日志输出，不影响扫描结果
