## MODIFIED Requirements

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

**变更说明**：
- 移除了两个 scenario 中的"**AND** 所有输出使用英文"（重复的全局规范）
- 这些全局规范已由 `config.yaml` 的 `rules.specs` 自动注入
