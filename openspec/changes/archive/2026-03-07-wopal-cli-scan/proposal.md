# Proposal: wopal-cli-scan

## Summary

实现 `wopal skills scan` 命令，对 INBOX 中的技能进行安全扫描，检测潜在的恶意代码。

## Why

对 INBOX 中的技能进行安全扫描，检测恶意代码，保护用户安全。扫描采用 20 项静态安全检查 + IOC 数据库匹配，生成风险评分和扫描报告。

## What Changes

### 新增

- `wopal skills scan` 命令
  - 支持 `--json` 输出 JSON 格式
  - 支持 `--all` 扫描所有 INBOX 技能
  - 支持 `--output <file>` 保存 JSON 报告到文件
  - 支持 `-d` 调试参数（记录详细扫描日志）
  - **默认从 INBOX 扫描技能**，只需指定技能名称
- 20 项安全检查（移植自 skill-security-scanner v2.1.0）
- IOC 数据库加载
  - 支持环境变量 `WOPAL_SKILL_IOCDB_DIR` 覆盖默认路径
  - 默认路径：`projects/agent-tools/skills/download/openclaw/openclaw-security-monitor/ioc/`
- 风险评分计算（严重 × 25 + 警告 × 10）
- JSON 格式扫描报告（包含技能名称、风险评分、20项检查结果、统计摘要）
- 退出码机制（通过退出码 0/1/2 阻止高风险技能安装）
- 集成主命令日志框架（通过 `-d` 参数启用）

### 命令设计

```bash
# 扫描 INBOX 中的技能（简化命令）
wopal skills scan skill-name              # 等价于 scan INBOX/skill-name

# 扫描所有 INBOX 技能
wopal skills scan --all

# 输出 JSON 格式
wopal skills scan --json skill-name

# 保存报告到文件
wopal skills scan --json --output report.json skill-name

# 调试模式（详细日志）
wopal skills scan -d skill-name

# CI/CD 集成（失败时阻止安装）
wopal skills scan skill-name && wopal skills install skill-name
```

### 退出码

| 退出码 | 含义 | 场景 |
|--------|------|------|
| 0 | 扫描通过 | 风险评分 < 50，允许安装 |
| 1 | 扫描失败 | 风险评分 ≥ 50，阻止安装 |
| 2 | 参数错误 | 技能目录不存在或参数无效 |

### 环境变量

| 变量名 | 用途 | 默认值 |
|--------|------|--------|
| `WOPAL_SKILL_IOCDB_DIR` | IOC 数据库路径 | `projects/agent-tools/skills/download/openclaw/openclaw-security-monitor/ioc/` |

### 实现方式

- 移植 shell 脚本到 TypeScript
- IOC 数据库路径支持环境变量 `WOPAL_SKILL_IOCDB_DIR`
- 20 项检查模块化实现
- 集成主命令的日志框架（支持 `-d` 调试参数）
- 默认从 INBOX 目录扫描技能（简化命令）

## Dependencies

- **wopal-cli-core**: 依赖 INBOX 路径管理

## Files

### 新增文件

```
projects/agent-tools/tools/wopal-cli/
├── src/
│   ├── commands/
│   │   └── scan.ts                 # scan 命令实现
│   ├── scanner/
│   │   ├── scanner.ts              # 扫描器主逻辑
│   │   ├── ioc-loader.ts           # IOC 数据库加载（从 git submodule）
│   │   ├── checks/                 # 20 项检查模块
│   │   │   ├── c2-infrastructure.ts
│   │   │   ├── malware-markers.ts
│   │   │   ├── reverse-shell.ts
│   │   │   ├── exfil-endpoints.ts
│   │   │   ├── crypto-wallet.ts
│   │   │   ├── curl-pipe.ts
│   │   │   ├── skillmd-injection.ts
│   │   │   ├── memory-poison.ts
│   │   │   ├── env-leakage.ts
│   │   │   ├── plaintext-creds.ts
│   │   │   ├── base64-obfuscation.ts
│   │   │   ├── binary-download.ts
│   │   │   ├── malicious-patterns.ts
│   │   │   ├── persistence.ts
│   │   │   ├── file-hashes.ts
│   │   │   ├── vscode-trojan.ts
│   │   │   ├── mcp-security.ts
│   │   │   ├── dynamic-code-execution.ts
│   │   │   ├── js-obfuscation.ts
│   │   │   └── url-shorteners.ts
│   │   └── whitelist.ts            # 白名单过滤
```

### 依赖文件

- `projects/agent-tools/tools/wopal-cli/src/utils/inbox-utils.ts`（来自 wopal-cli-core）

## Capabilities

### skill-scan

安全扫描：

| 特性 | 描述 |
|------|------|
| 命令格式 | `wopal skills scan skill-name`（默认从 INBOX 扫描） |
| 检查项 | 20 项静态安全检查 |
| IOC 数据库 | 6 个威胁签名文件（支持环境变量 `WOPAL_SKILL_IOCDB_DIR`） |
| 风险评分 | 严重 × 25 + 警告 × 10 |
| 高风险阈值 | ≥ 50 分 |
| 输出格式 | 文本 / JSON |
| 退出码 | 0（通过）/ 1（失败）/ 2（错误） |
| 白名单过滤 | 支持 whitelist-patterns.txt 减少误报 |
| 调试模式 | `-d` 参数输出详细日志（集成主命令日志框架） |

## Verification

- [ ] IOC 数据库加载成功（6 个文件）
- [ ] `wopal skills scan skill-name` 从 INBOX 扫描技能成功
- [ ] `wopal skills scan --all` 扫描所有 INBOX 技能
- [ ] 环境变量 `WOPAL_SKILL_IOCDB_DIR` 覆盖默认路径
- [ ] 20 项检查全部运行
- [ ] 风险评分计算正确
- [ ] JSON 输出格式正确
- [ ] 高风险技能标记为"失败"（退出码 1）
- [ ] 白名单过滤工作正常
- [ ] `-d` 调试参数输出详细日志
- [ ] 退出码 0/1/2 正确返回

## Notes

- IOC 数据库通过 git submodule 管理，无需额外更新命令
- 移植自 skill-security-scanner v2.1.0 的 shell 脚本逻辑
- 20 项检查模块化实现，便于维护和扩展
