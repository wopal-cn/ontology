## Context

### 背景

wopal-cli-scan 是 wopal-cli 的核心安全扫描模块，负责对 INBOX 中的技能进行 20 项静态安全检查。扫描逻辑移植自 `skill-security-scanner`（v2.1.0）的 shell 脚本实现，需要改造为 TypeScript 模块化架构。

### 当前状态

- **参考实现**: `projects/agent-tools/skills/download/openclaw/openclaw-security-monitor/`（shell 脚本）
- **依赖**: wopal-cli-core（INBOX 路径管理、日志框架）
- **技术栈**: TypeScript + Node.js 18+

### 约束条件

1. **必须保持兼容**: 扫描结果与 shell 脚本版本一致
2. **必须集成日志框架**: 使用主命令的日志框架（支持 `-d` 参数）
3. **必须支持环境变量**: `WOPAL_SKILL_IOCDB_DIR` 覆盖默认 IOC 路径
4. **必须简化命令**: 默认从 INBOX 扫描，用户只需指定技能名称

---

## Goals / Non-Goals

### Goals

1. **移植 20 项安全检查**到 TypeScript 模块化架构
2. **简化命令交互**：`wopal skills scan skill-name`（自动从 INBOX 查找）
3. **支持调试模式**：`-d` 参数输出详细日志（集成主命令日志框架）
4. **支持环境变量配置**：`WOPAL_SKILL_IOCDB_DIR` 覆盖 IOC 路径
5. **生成 JSON 格式报告**：适合 CI/CD 集成
6. **退出码机制**：0（通过）/ 1（失败）/ 2（错误）

### Non-Goals

1. **不实现实时扫描**：仅支持静态文件扫描
2. **不实现自动修复**：只检测问题，不修改代码
3. **不实现扫描缓存**：每次扫描都重新检查所有文件（后续优化）
4. **不支持并发扫描**：单线程扫描（后续优化）
5. **不支持自定义检查规则**：固定 20 项检查（后续可扩展）

---

## Decisions

### 决策 1: 模块化检查架构

**选择**: 每项检查独立模块（20 个文件）

**理由**:
- ✅ 易于维护和测试（每个模块独立）
- ✅ 易于扩展（添加新检查只需新增文件）
- ✅ 易于复用（检查模块可被其他命令使用）

**替代方案**:
- ❌ 单一检查文件：难以维护（文件过大）
- ❌ 按类别分组（如 5 个文件）：耦合度高，修改影响范围大

**实现**:
```
src/scanner/checks/
├── c2-infrastructure.ts      # 检查 1
├── malware-markers.ts        # 检查 2
├── reverse-shell.ts          # 检查 3
└── ...                       # 检查 4-20
```

每个检查模块导出统一接口：
```typescript
interface Check {
  id: string;              // 检查 ID（如 'c2_infrastructure'）
  name: string;            // 检查名称
  severity: 'critical' | 'warning';
  run(skillPath: string, iocData: IOCData): Promise<Finding[]>;
}
```

---

### 决策 2: IOC 数据库路径配置策略

**选择**: 环境变量优先 + 硬编码默认值

**理由**:
- ✅ 灵活性：用户可覆盖 IOC 路径（测试场景、自定义 IOC 库）
- ✅ 向后兼容：未设置环境变量时使用默认路径
- ✅ 简单：无需配置文件

**替代方案**:
- ❌ 配置文件（config.json）：增加复杂度，单一路径配置不值得
- ❌ 命令行参数（`--ioc-dir`）：每次都要输入，不便

**实现**:
```typescript
function getIOCPath(): string {
  // 优先级：环境变量 > 默认路径
  return process.env.WOPAL_SKILL_IOCDB_DIR || 
         'projects/agent-tools/skills/download/openclaw/openclaw-security-monitor/ioc/';
}
```

---

### 决策 3: 日志框架集成策略

**选择**: 复用主命令的日志框架

**理由**:
- ✅ 统一性：所有子命令使用相同的日志格式
- ✅ 避免重复：无需重新实现日志逻辑
- ✅ 用户友好：统一的 `-d` 参数体验

**替代方案**:
- ❌ 独立日志模块：重复造轮子，日志格式不一致
- ❌ 直接 console.log：无法控制日志级别，无法关闭

**实现**:
```typescript
// 从主命令导入日志工具
import { logger } from '../utils/logger';

// 使用日志
logger.debug('加载 IOC 数据库...', { path: iocPath });
logger.info('扫描技能', { skillName, checkId });
logger.warn('IOC 文件缺失', { file: 'c2-ips.txt' });
logger.error('扫描失败', { error: err.message });
```

---

### 决策 4: 简化命令（默认从 INBOX 扫描）

**选择**: 命令参数只接受技能名称，自动拼接 INBOX 路径

**理由**:
- ✅ 用户友好：减少输入（`scan skill-name` vs `scan INBOX/skill-name`）
- ✅ 符合直觉：INBOX 是默认扫描位置
- ✅ 与 install 命令一致：`install skill-name`

**替代方案**:
- ❌ 强制完整路径：用户需要记住输入 `INBOX/` 前缀
- ❌ 自动检测路径：增加复杂度，可能误判

**实现**:
```typescript
// 命令参数
const skillName = args[0];  // 用户输入：skill-name

// 自动拼接 INBOX 路径
const skillPath = path.join(getInboxPath(), skillName);

// 验证技能存在
if (!fs.existsSync(skillPath)) {
  logger.error(`技能不存在：${skillName}`);
  process.exit(2);  // 退出码 2：参数错误
}
```

---

### 决策 5: 退出码机制（而非锁文件）

**选择**: 使用退出码 0/1/2 控制流程

**理由**:
- ✅ 简单：依赖 shell 的 `&&` 语法即可阻止后续命令
- ✅ CI/CD 友好：所有 CI/CD 系统都支持退出码
- ✅ 无状态：无需维护额外的锁文件

**替代方案**:
- ❌ 扫描结果锁文件（`.scan-result.json`）：增加复杂度，需要 install 命令读取
- ❌ 交互式确认：不适合 CI/CD 场景

**实现**:
```bash
# CI/CD 集成示例
wopal skills scan skill-name && wopal skills install skill-name

# 扫描失败（退出码 1）→ install 不会执行
# 扫描通过（退出码 0）→ install 继续执行
```

---

### 决策 6: JSON 输出格式设计

**选择**: 结构化 JSON（包含技能名称、风险评分、20项检查、统计摘要）

**理由**:
- ✅ 完整性：包含所有扫描信息
- ✅ 可解析：CI/CD 系统可提取关键信息
- ✅ 可扩展：后续可添加字段

**替代方案**:
- ❌ 简化 JSON（仅风险评分）：信息不足，无法定位问题
- ❌ 文本格式：难以解析

**实现**:
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

---

### 决策 7: 白名单过滤实现

**选择**: 逐行匹配 `whitelist-patterns.txt`

**理由**:
- ✅ 简单：使用字符串匹配或正则表达式
- ✅ 灵活：用户可自定义白名单
- ✅ 可维护：白名单独立文件，易于更新

**替代方案**:
- ❌ 硬编码白名单：难以更新
- ❌ 数据库白名单：过度设计

**实现**:
```typescript
function isWhitelisted(finding: Finding, whitelist: string[]): boolean {
  return whitelist.some(pattern => {
    // 支持三种匹配模式：
    // 1. 精确匹配：https://api.example.com
    // 2. 通配符匹配：*.github.com
    // 3. 正则表达式：/^https:\/\/.*\.example\.com$/
    
    if (pattern.startsWith('/') && pattern.endsWith('/')) {
      // 正则表达式
      const regex = new RegExp(pattern.slice(1, -1));
      return regex.test(finding.pattern);
    } else if (pattern.includes('*')) {
      // 通配符匹配
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return regex.test(finding.pattern);
    } else {
      // 精确匹配
      return finding.pattern === pattern;
    }
  });
}
```

---

## Risks / Trade-offs

### 风险 1: 误报率高

**风险**: 合法代码被误判为恶意代码

**影响**: 
- 用户信任度下降
- 阻止正常技能安装

**缓解措施**:
- ✅ 白名单过滤（`whitelist-patterns.txt`）
- ✅ 风险评分分级（严重/警告）
- ✅ 允许用户查看详细扫描报告
- ✅ 提供调试模式（`-d`）查看检查过程

---

### 风险 2: 性能问题（大文件扫描）

**风险**: 技能包含大文件（> 10MB），扫描耗时过长

**影响**:
- 用户体验差（等待时间长）
- CI/CD 流程超时

**缓解措施**:
- ✅ 文件大小检查（跳过 > 10MB 的文件）
- ✅ 单文件扫描超时（30 秒）
- ✅ 显示扫描进度（调试模式）
- ⏸️ 后续优化：并发扫描、增量扫描

---

### 风险 3: IOC 数据库更新频率

**风险**: IOC 数据库（威胁签名）未及时更新，漏检新威胁

**影响**:
- 新型恶意代码无法检测
- 安全性下降

**缓解措施**:
- ✅ 使用 git submodule 管理（用户可自行 `git submodule update`）
- ✅ 文档说明更新方法
- ✅ 支持 `WOPAL_SKILL_IOCDB_DIR` 环境变量（用户可使用自定义 IOC 库）

---

### 风险 4: shell 脚本移植遗漏

**风险**: 移植 shell 脚本时遗漏某些检查逻辑

**影响**:
- 扫描结果不一致
- 漏检恶意代码

**缓解措施**:
- ✅ 对比测试（shell 脚本 vs TypeScript 实现）
- ✅ 单元测试覆盖 20 项检查
- ✅ 集成测试（使用真实技能样本）

---

### Trade-off 1: 功能完整性 vs 实现复杂度

**选择**: 优先保证核心功能（20 项检查），牺牲性能优化（缓存、并发）

**理由**:
- 第一阶段：确保扫描准确性
- 第二阶段：优化性能（缓存、并发）

**影响**:
- ✅ 降低初期开发复杂度
- ❌ 大规模扫描时性能较差

---

### Trade-off 2: 灵活性 vs 易用性

**选择**: 优先易用性（简化命令），牺牲灵活性（不支持自定义检查规则）

**理由**:
- 目标用户：AI Agent 和开发者
- 需求：快速扫描，而非深度定制

**影响**:
- ✅ 用户学习成本低
- ❌ 高级用户无法自定义检查规则

---

## Open Questions

### 问题 1: 是否需要支持增量扫描？

**场景**: 用户多次扫描同一技能，只扫描变化的文件

**优点**: 提升性能
**缺点**: 增加实现复杂度

**建议**: 第一阶段不实现，作为后续优化

---

### 问题 2: 是否需要支持自定义检查规则？

**场景**: 用户想添加自己的安全检查

**优点**: 灵活性高
**缺点**: 增加复杂度，维护成本高

**建议**: 第一阶段不实现，根据用户反馈决定

---

### 问题 3: 白名单格式是否需要标准化？

**当前**: 支持三种格式（精确匹配、通配符、正则）

**问题**: 用户可能混淆格式

**建议**: 
- 提供详细的文档说明
- 在白名单文件中添加注释示例

---

## Implementation Notes

### 关键实现要点

1. **模块化检查**: 每项检查独立文件，统一接口
2. **环境变量优先**: `WOPAL_SKILL_IOCDB_DIR` > 默认路径
3. **日志框架集成**: 复用主命令的 `logger`
4. **简化命令**: 自动拼接 INBOX 路径
5. **退出码机制**: 0（通过）/ 1（失败）/ 2（错误）
6. **白名单过滤**: 支持精确匹配、通配符、正则

### 技术栈

- TypeScript 5.x
- Node.js 18+
- 依赖：主命令的日志框架、INBOX 工具函数

### 参考实现

- Shell 脚本: `projects/agent-tools/skills/download/openclaw/openclaw-security-monitor/scripts/scan.sh`
- 主命令日志框架: `projects/agent-tools/tools/wopal-cli/src/utils/logger.ts`
- INBOX 工具函数: `projects/agent-tools/tools/wopal-cli/src/utils/inbox-utils.ts`
