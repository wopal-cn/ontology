# Spec Delta: wopal-cli-skills-install

**Change**: fix-spec-code-consistency
**Type**: MODIFIED
**Base Spec**: openspec/specs/wopal-cli-skills-install/spec.md

---

## MODIFIED Requirements

### Requirement: INBOX 技能默认自动扫描

系统 SHALL 对 INBOX 技能默认执行安全扫描，扫描失败时硬性阻止安装。

#### Scenario: INBOX 技能自动扫描
- **WHEN** 用户安装 INBOX 技能（未指定 --skip-scan）
- **THEN** 系统自动调用安全扫描
- **AND** 扫描结果输出到控制台

#### Scenario: 扫描失败阻止安装
- **WHEN** 安全扫描结果为失败（风险评分 >= 50）
- **THEN** 系统 MUST 抛出错误并中止安装流程
- **AND** 系统显示风险评分和发现的问题数
- **AND** 系统不执行复制、锁文件更新等后续步骤

#### Scenario: 跳过扫描
- **WHEN** 用户运行 `wopal skills install skill-name --skip-scan`
- **THEN** 系统跳过安全扫描，直接安装

#### Scenario: 本地技能无需扫描
- **WHEN** 用户安装 my-skills 中的本地技能
- **THEN** 系统直接安装，无需扫描

### Requirement: 读取 .source.json 元数据

系统 SHALL 从 INBOX 技能的 .source.json 文件读取元数据。

#### Scenario: SkillMetadata 结构
- **WHEN** 系统读取 `INBOX/<skill>/.source.json`
- **THEN** 元数据结构参见 `wopal-cli-skills-lock-management` 规格中的 SkillMetadata 定义

#### Scenario: 版本指纹缺失时的回退
- **WHEN** `.source.json` 不包含 `skillFolderHash` 字段
- **THEN** 系统按照 `wopal-cli-skills-lock-management` 规格中的版本指纹回退机制处理

### Requirement: 更新两个锁文件（统一 v3 格式）

系统 SHALL 在安装完成后更新两个锁文件，**两者都使用 v3 格式**。

#### Scenario: 两个锁文件使用相同格式
- **WHEN** 技能安装成功（项目级或全局级）
- **THEN** 项目锁 `./skills-lock.json` 和全局锁 `~/.agents/.skill-lock.json` 都使用 v3 格式
- **AND** 锁文件条目格式参见 `wopal-cli-skills-lock-management` 规格中的 SkillLockEntry 定义

#### Scenario: 远程技能版本指纹（从 .source.json 读取）
- **WHEN** 安装 GitHub 技能
- **THEN** 系统读取 `INBOX/<skill>/.source.json` 中的 `skillFolderHash` 字段（GitHub Tree SHA）
- **IF** `.source.json` 不包含 `skillFolderHash`，系统按照 `wopal-cli-skills-lock-management` 规格中的版本指纹回退机制获取
- **AND** 项目锁和全局锁的 `skillFolderHash` 字段都存储该值

#### Scenario: 本地技能版本指纹（计算源码 hash）
- **WHEN** 安装 my-skills 技能
- **THEN** 系统按照 `wopal-cli-skills-lock-management` 规格中的本地技能版本指纹机制计算 hash
- **AND** 项目锁和全局锁的 `skillFolderHash` 字段都存储该值
