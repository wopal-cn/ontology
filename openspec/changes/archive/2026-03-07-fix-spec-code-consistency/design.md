## Context

wopal-cli 的 5 份主规格是在短时间内迭代产生的：先有 wopal-cli-core，然后 download、scan、install、lock-management 依次创建并经历多轮 delta sync。由于各规格独立演化，出现了以下技术债：

1. **环境变量命名分裂**：core 规格写 `SKILL_INBOX_DIR`，代码和 AGENTS.md 早已统一为 `WOPAL_SKILL_INBOX_DIR`
2. **扫描失败语义矛盾**：scan 规格定义退出码 1 = 硬性阻止，install 规格定义"询问是否继续"，代码实现为 throw Error（硬性阻止）
3. **结构定义散落**：SkillMetadata 在 download 和 install 规格中各定义一次，版本指纹逻辑在 download、install、lock-management 三处重复
4. **规格目录与标题命名不统一**：skill-scan、skill-install、skill-lock-management 缺少 `wopal-cli-skills-` 前缀；部分标题格式不符合 `# Capability: <name>` 规范

本次修改仅涉及规格文本，不需要改动代码（代码实现已经是正确的目标状态）。

## Goals / Non-Goals

**Goals:**

- 将 4 份主规格中与代码实现不一致的描述修正为与代码对齐
- 消除规格间的逻辑矛盾（扫描失败处理）
- 建立 SkillMetadata 和版本指纹机制的"单一真相来源"（归入 wopal-cli-skills-lock-management）
- 统一规格目录命名为 `wopal-cli-<功能域>-<能力>` 格式，标题为 `# Capability: <name>` 格式

**Non-Goals:**

- 不修改任何代码文件（代码已正确）
- 不创建新的主规格文件（skill-check 和 skill-update 的 sync 由各自的 change 负责）
- 不改变现有行为或接口
- 不重构规格目录结构

## Decisions

### D1: 环境变量统一为 WOPAL_ 前缀

**选择**：wopal-cli-core 中 `SKILL_INBOX_DIR` → `WOPAL_SKILL_INBOX_DIR`

**理由**：
- 代码（inbox-utils.ts:7）已使用 `WOPAL_SKILL_INBOX_DIR`
- AGENTS.md 文档已使用 `WOPAL_SKILL_INBOX_DIR`
- 与 `WOPAL_SKILL_IOCDB_DIR` 保持命名一致性
- WOPAL_ 前缀可避免与其他工具的环境变量冲突

### D2: 扫描失败 = 硬性阻止（不询问）

**选择**：移除 skill-install 规格中"显示警告并询问是否继续"的描述，改为硬性阻止

**理由**：
- 代码实现（install.ts:261-265）在扫描失败时直接 throw Error
- skill-scan 规格定义退出码 1 = 阻止，CI/CD 场景不允许交互
- 安全扫描的目的是"阻止危险技能"，不应给出绕过选项
- 用户已有 `--skip-scan` 选项作为显式绕过手段

### D3: SkillMetadata 定义收归 wopal-cli-skills-lock-management

**选择**：在 wopal-cli-skills-lock-management 规格中新增 SkillMetadata 接口定义作为权威来源，download 和 install 规格改为引用

**理由**：
- 避免两处定义产生分歧
- skill-lock-management 已是"锁文件与版本追踪"的核心规格，SkillMetadata 是其输入数据结构
- download 产出 .source.json（SkillMetadata），install 读取 .source.json 写入锁文件，lock-management 定义锁文件格式 —— 数据流向清晰

### D4: 版本指纹机制统一到 wopal-cli-skills-lock-management

**选择**：将版本指纹的完整定义（远程 GitHub Tree SHA、本地 SHA-256、Token 获取、回退逻辑）收归 wopal-cli-skills-lock-management，download 和 install 规格中仅保留"调用"语句

**理由**：
- 当前三处重复（download:188-219, install:105-114, lock-management:142-160）
- 版本指纹是"版本追踪"的核心概念，归属 lock-management 最自然
- 减少未来修改时需要同步多处的风险

### D5: 规格目录与标题命名统一

**选择**：所有规格目录统一为 `wopal-cli-<功能域>-<能力>` 格式，标题统一为 `# Capability: <目录名>`

**理由**：
- AGENTS.md 中 Capability 命名规范要求 `<产品>-<功能域>-<具体能力>` 格式
- skill-scan、skill-install、skill-lock-management 缺少产品前缀 `wopal-cli-`，与 wopal-cli-core 和 wopal-cli-skills-download 不一致
- wopal-cli-core 标题为 `# Wopal CLI Core`，不符合 `# Capability:` 格式
- wopal-cli-skills-download 标题为 `# Capability: skill-download`，与目录名不一致
- 统一后便于 OpenSpec 工具自动匹配目录名与标题

## Risks / Trade-offs

- **[Risk] 引用关系可能增加阅读成本** → 在被引用处加入简短说明和指向 wopal-cli-skills-lock-management 的引用链接，保持可读性
- **[Risk] 修改规格文本可能引入新的不一致** → 每处修改后与代码实现逐行对比验证
