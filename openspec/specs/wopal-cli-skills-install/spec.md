# Capability: wopal-cli-skills-install

## Purpose

提供从 INBOX 或本地路径安装技能到 Agent 目录的能力，并在安装流程中维护锁文件与版本指纹。

## Requirements

### Requirement: 从 INBOX 或 my-skills 安装技能到 Agent 目录

系统应当将技能从 INBOX 或 my-skills 安装到 Agent 目录，使用 copy 模式。

#### Scenario: 从 INBOX 安装远程技能（项目级，默认）
- **WHEN** 用户运行 `wopal skills install skill-name`
- **THEN** 系统检查 INBOX 目录是否存在该技能
- **AND** 系统自动执行安全扫描（调用 scan 命令）
- **IF** 扫描通过，系统将技能复制到项目级 Agent 目录（`./.agents/skills/<skill-name>/`）
- **AND** 系统读取 `.source.json` 元数据
- **AND** 系统更新项目级锁文件（`./skills-lock.json`）
- **AND** 系统更新全局级锁文件（`~/.agents/.skill-lock.json`）
- **AND** 系统删除 INBOX/<skill-name>（只删除当前技能）

#### Scenario: 从 INBOX 安装远程技能（全局级）
- **WHEN** 用户运行 `wopal skills install skill-name -g`
- **THEN** 系统检查 INBOX 目录是否存在该技能
- **AND** 系统自动执行安全扫描
- **IF** 扫描通过，系统将技能复制到全局级 Agent 目录（`~/.agents/skills/<skill-name>/`）
- **AND** 系统读取 `.source.json` 元数据
- **AND** 系统更新全局级锁文件（`~/.agents/.skill-lock.json`）
- **AND** 系统删除 INBOX/<skill-name>

#### Scenario: 从 my-skills 安装本地技能（项目级）
- **WHEN** 用户运行 `wopal skills install projects/agent-tools/skills/my-skills/skill-name`
- **THEN** 系统将技能复制到项目级 Agent 目录
- **AND** 系统计算源码 hash（computeSkillFolderHash）
- **AND** 系统更新项目级锁文件和全局级锁文件
- **AND** 系统保留 my-skills 中的源代码

#### Scenario: 跳过 INBOX 技能扫描
- **WHEN** 用户运行 `wopal skills install skill-name --skip-scan`
- **THEN** 系统跳过安全扫描，直接安装

### Requirement: 支持 copy 安装模式

系统应当使用 copy 模式安装技能，symlink 模式留做未来扩展。

#### Scenario: Copy 模式（默认）
- **WHEN** 用户运行 `wopal skills install <path>`
- **THEN** 系统直接复制技能到 Agent 目录（项目级或全局级）
- **AND** 锁文件记录 `installMode: "copy"`

#### Scenario: Symlink 模式（未来扩展）
- **WHEN** 用户运行 `wopal skills install <path> --mode symlink`
- **THEN** 系统显示错误"symlink mode is not implemented yet"

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

### Requirement: 检查 Agent 目录中已存在的技能

系统应当在安装前检查 Agent 目录是否已存在同名技能。

#### Scenario: 提示覆盖已存在的技能
- **WHEN** Agent 目录已存在同名技能
- **THEN** 系统显示警告"技能已安装"
- **AND** 系统提示使用 `--force` 覆盖或先 `remove`

#### Scenario: 强制覆盖已存在的技能
- **WHEN** 用户运行 `wopal skills install <path> --force`
- **THEN** 系统删除 Agent 目录中的现有技能
- **AND** 系统安装新版本

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

### Requirement: 命令格式友好

系统应当支持简洁的命令格式。

#### Scenario: 从 INBOX 安装（只传技能名）
- **WHEN** 用户运行 `wopal skills install skill-name`
- **THEN** 系统从 `INBOX/skill-name` 安装

#### Scenario: 从本地路径安装（支持相对/绝对路径）
- **WHEN** 用户运行 `wopal skills install ./my-skills/skill-name`
- **THEN** 系统从指定路径安装

#### Scenario: 自动识别源类型
- **IF** 参数是 `skill-name`（不含 `/`）→ 从 INBOX 安装
- **IF** 参数包含 `/` 或 `./` → 从本地路径安装
