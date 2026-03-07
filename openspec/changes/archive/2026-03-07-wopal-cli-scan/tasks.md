## 1. Setup - 项目结构和类型定义

- [x] 1.1 创建扫描器目录结构 `src/scanner/`
- [x] 1.2 创建检查模块目录 `src/scanner/checks/`
- [x] 1.3 定义类型接口 `src/scanner/types.ts`
  - Check 接口（id, name, severity, run）
  - Finding 接口（file, line, pattern, message）
  - ScanResult 接口（skillName, scanTime, riskScore, status, checks, summary）
  - IOCData 接口（c2IPs, maliciousDomains, etc.）
- [x] 1.4 定义常量 `src/scanner/constants.ts`
  - 风险评分权重（critical: 25, warning: 10）
  - 高风险阈值（50）
  - 20 项检查的元数据

## 2. IOC 数据库管理

- [x] 2.1 实现 IOC 路径获取函数 `src/scanner/ioc-loader.ts`
  - 优先级：环境变量 `WOPAL_SKILL_IOCDB_DIR` > 默认路径
  - 默认路径：`projects/agent-tools/skills/download/openclaw/openclaw-security-monitor/ioc/`
- [x] 2.2 实现 IOC 文件加载器
  - 加载 6 个 IOC 文件（c2-ips.txt, malicious-domains.txt, etc.）
  - 跳过注释行（`#` 开头）
  - 跳过空行
- [x] 2.3 实现 IOC 错误处理
  - 文件缺失：显示警告，使用空列表
  - 文件格式错误：跳过错误行，显示警告
  - submodule 未初始化：显示错误，建议运行 `git submodule update --init`
- [x] 2.4 实现 IOC 数据缓存（避免重复加载）

## 3. 白名单过滤

- [x] 3.1 实现白名单加载 `src/scanner/whitelist.ts`
  - 加载 `whitelist-patterns.txt`
  - 解析三种格式（精确匹配、通配符、正则）
- [x] 3.2 实现白名单匹配函数
  - 精确匹配：`https://api.example.com`
  - 通配符匹配：`*.github.com`
  - 正则表达式：`/^https:\/\/.*\.example\.com$/`
- [x] 3.3 实现白名单过滤函数
  - 输入：finding 列表、白名单模式
  - 输出：过滤后的 finding 列表

## 4. 核心扫描器

- [x] 4.1 实现扫描器主逻辑 `src/scanner/scanner.ts`
  - 加载 IOC 数据库
  - 加载白名单
  - 执行 20 项检查
  - 应用白名单过滤
  - 计算风险评分
- [x] 4.2 实现风险评分计算
  - 公式：critical × 25 + warning × 10
  - 限制最大评分 100
  - 判断扫描状态（pass/fail）
- [x] 4.3 实现扫描结果汇总
  - 统计 critical/warning/passed 数量
  - 生成 summary 对象
- [x] 4.4 实现文件遍历逻辑
  - 递归扫描技能目录
  - 跳过 node_modules、.git、__pycache__
  - 文件大小检查（跳过 > 10MB）
  - 单文件扫描超时（30 秒）

## 5. 20 项检查模块

### 5.1 严重级别检查

- [x] 5.1.1 实现 `c2-infrastructure.ts` - 已知 C2 IP 地址检查
  - 使用 IOC 文件：c2-ips.txt, malicious-domains.txt
  - 检查文件中的 IP/域名
- [x] 5.1.2 实现 `malware-markers.ts` - AMOS/Stealer 恶意软件特征
  - 内置模式匹配
- [x] 5.1.3 实现 `reverse-shell.ts` - 反向 Shell 模式
  - 检测：bash -i, nc -e, python -c, etc.
- [x] 5.1.4 实现 `exfil-endpoints.ts` - 数据外泄端点
  - 使用 IOC 文件：malicious-domains.txt
- [x] 5.1.5 实现 `memory-poison.ts` - 修改内存文件
  - 检测：访问/修改 MEMORY.md、memory/
- [x] 5.1.6 实现 `malicious-patterns.ts` - 已知恶意技能模式
  - 使用 IOC 文件：malicious-skill-patterns.txt
- [x] 5.1.7 实现 `file-hashes.ts` - 已知恶意文件哈希
  - 使用 IOC 文件：file-hashes.txt
  - 计算文件 SHA-256 并匹配
- [x] 5.1.8 实现 `vscode-trojan.ts` - 可疑 VS Code 扩展
  - 检测：可疑的 extension.vsixmanifest
- [x] 5.1.9 实现 `mcp-security.ts` - MCP 配置提示注入
  - 检测：mcp-config.json 中的可疑指令

### 5.2 警告级别检查

- [x] 5.2.1 实现 `crypto-wallet.ts` - 加密钱包相关模式
  - 检测：钱包地址、私钥相关代码
- [x] 5.2.2 实现 `curl-pipe.ts` - Curl-Pipe 攻击模式
  - 检测：curl ... | bash, curl ... | sh
- [x] 5.2.3 实现 `skillmd-injection.ts` - SKILL.md 可疑安装指令
  - 检测：可疑的安装命令
- [x] 5.2.4 实现 `env-leakage.ts` - 访问敏感文件
  - 检测：访问 .env, credentials.json, secrets/
- [x] 5.2.5 实现 `plaintext-creds.ts` - 硬编码 API 密钥
  - 检测：API key patterns (sk-*, xoxb-*, etc.)
- [x] 5.2.6 实现 `base64-obfuscation.ts` - Base64 混淆模式
  - 检测：可疑的 Base64 编码字符串
- [x] 5.2.7 实现 `binary-download.ts` - 外部二进制下载
  - 检测：下载 .exe, .bin, .sh 并执行
- [x] 5.2.8 实现 `persistence.ts` - 持久化机制
  - 检测：修改 crontab, launchd, registry
- [x] 5.2.9 实现 `dynamic-code-execution.ts` - 动态代码执行
  - 检测：eval, exec, Function(), etc.
- [x] 5.2.10 实现 `js-obfuscation.ts` - JavaScript 混淆
  - 检测：eval, document.write, etc.
- [x] 5.2.11 实现 `url-shorteners.ts` - 短链接服务
  - 检测：bit.ly, tinyurl, etc.

## 6. 命令实现

- [x] 6.1 实现 scan 命令 `src/commands/scan.ts`
  - 解析命令参数（skill-name, --all, --json, --output, -d）
  - 自动拼接 INBOX 路径
  - 验证技能存在性
- [x] 6.2 实现单个技能扫描
  - 调用扫描器主逻辑
  - 输出扫描结果（文本格式）
  - 返回正确退出码（0/1/2）
- [x] 6.3 实现批量扫描（`--all`）
  - 遍历 INBOX 目录
  - 扫描所有技能
  - 显示摘要结果
- [x] 6.4 实现 JSON 输出（`--json`）
  - 生成 JSON 格式报告
  - 包含所有字段（skillName, scanTime, riskScore, status, checks, summary）
- [x] 6.5 实现 JSON 输出到文件（`--output`）
  - 保存 JSON 报告到指定文件
  - 显示确认消息
- [x] 6.6 实现错误处理
  - 技能不存在：显示错误，返回退出码 2
  - 参数错误：显示用法，返回退出码 2

## 7. 日志集成

- [x] 7.1 集成主命令日志框架
  - 导入 logger 工具
  - 使用 logger.debug, logger.info, logger.warn, logger.error
- [x] 7.2 实现调试模式日志（`-d` 参数）
  - 记录 IOC 数据库加载过程
  - 记录每项检查的执行结果
  - 记录文件扫描进度
  - 记录风险评分计算过程
- [x] 7.3 实现日志格式
  - 带时间戳：`[YYYY-MM-DD HH:mm:ss] [LEVEL] Message`
  - 日志级别：DEBUG, INFO, WARN, ERROR

## 8. 测试

- [x] 8.1 编写 IOC 加载器单元测试
  - 测试环境变量覆盖
  - 测试文件缺失处理
  - 测试格式错误处理
- [x] 8.2 编写白名单过滤单元测试
  - 测试精确匹配
  - 测试通配符匹配
  - 测试正则表达式匹配
- [x] 8.3 编写 20 项检查模块单元测试
  - 每项检查至少 2 个测试用例（通过/失败）
  - 测试白名单过滤效果
- [x] 8.4 编写扫描器主逻辑集成测试
  - 测试完整扫描流程
  - 测试风险评分计算
  - 测试 JSON 输出格式
- [x] 8.5 编写命令测试
  - 测试参数解析
  - 测试退出码（0/1/2）
  - 测试错误处理
- [x] 8.6 编写对比测试（shell 脚本 vs TypeScript）
  - 使用真实技能样本
  - 验证扫描结果一致性

## 9. 文档和示例

- [x] 9.1 更新 README.md
  - 命令用法说明
  - 参数说明
  - 退出码说明
  - 环境变量说明
- [x] 9.2 添加使用示例
  - 单个技能扫描
  - 批量扫描
  - JSON 输出
  - CI/CD 集成
  - 调试模式
- [x] 9.3 添加 IOC 数据库更新说明
  - 如何更新 git submodule
  - 如何使用自定义 IOC 路径
- [x] 9.4 添加白名单配置说明
  - 白名单格式说明
  - 白名单示例

## 10. 验证和清理

- [x] 10.1 验证所有 20 项检查运行正常
- [x] 10.2 验证环境变量 `WOPAL_SKILL_IOCDB_DIR` 工作正常
- [x] 10.3 验证 `-d` 调试参数输出详细日志
- [x] 10.4 验证退出码 0/1/2 正确返回
- [x] 10.5 验证 JSON 输出格式正确
- [x] 10.6 验证白名单过滤减少误报
- [x] 10.7 验证 `--all` 扫描所有 INBOX 技能
- [x] 10.8 代码审查和优化
- [x] 10.9 更新 CHANGELOG.md
