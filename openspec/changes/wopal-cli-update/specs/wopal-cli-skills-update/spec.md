## ADDED Requirements

### Requirement: 更新已安装的技能

系统应当更新已安装的技能到最新版本。

#### Scenario: 更新指定技能
- **WHEN** 用户运行 `wopal skills update skill-name`
- **THEN** 系统从锁文件读取技能的源头信息
- **AND** 系统重新下载或复制最新版本
- **AND** 系统更新 Agent 目录和锁文件

#### Scenario: 更新所有技能
- **WHEN** 用户运行 `wopal skills update --all`
- **THEN** 系统检查所有已安装技能的源头变更
- **AND** 系统更新所有有变更的技能

### Requirement: 远程技能更新流程

系统应当为远程技能执行完整的更新流程（下载 → 扫描 → 安装）。

#### Scenario: 远程技能更新流程
- **WHEN** 更新 GitHub 技能
- **THEN** 系统必须执行：
  1. 重新下载到 INBOX/<skill-name>
  2. 安全扫描
  3. 安装覆盖 Agent 目录
  4. 删除 INBOX/<skill-name>
- **AND** 系统必须更新两个锁文件的版本指纹（GitHub Tree SHA）

#### Scenario: 远程技能源头未变更
- **WHEN** 最新 GitHub Tree SHA 与锁文件的 skillFolderHash 相同
- **THEN** 系统跳过更新
- **AND** 系统显示"技能已是最新版本"

### Requirement: 本地技能更新流程

系统应当为本地技能执行重新复制流程。

#### Scenario: 本地技能更新流程
- **WHEN** 更新 my-skills 技能
- **THEN** 系统重新复制源码到 Agent 目录
- **AND** 系统更新两个锁文件的版本指纹（源码 hash）

#### Scenario: 本地技能源码未变更
- **WHEN** my-skills 源码 hash 与锁文件的 skillFolderHash 相同
- **THEN** 系统跳过更新
- **AND** 系统显示"技能源码未变更"

### Requirement: 保留安装模式

系统应当在更新时保留原有的安装模式。

#### Scenario: 保留 symlink 模式
- **WHEN** 原技能使用 symlink 模式安装
- **THEN** 更新后仍使用 symlink 模式

#### Scenario: 保留 copy 模式
- **WHEN** 原技能使用 copy 模式安装
- **THEN** 更新后仍使用 copy 模式

### Requirement: 更新失败时保留现有版本

系统应当在更新失败时保留现有的已安装版本。

#### Scenario: 下载失败保留现有版本
- **WHEN** 远程技能下载失败
- **THEN** 系统保留 Agent 目录中的现有版本
- **AND** 系统显示错误信息

#### Scenario: 扫描失败保留现有版本
- **WHEN** 安全扫描失败
- **THEN** 系统保留 Agent 目录中的现有版本
- **AND** 系统显示"扫描失败，保留现有版本"

### Requirement: 技能未安装时报错

系统应当在技能未安装时显示错误。

#### Scenario: 技能不在锁文件中
- **WHEN** 用户运行 `wopal skills update skill-name` 但技能未安装
- **THEN** 系统显示错误"技能未安装"
- **AND** 系统建议先运行 `wopal skills install`
