# Capability: wopal-cli-skills-list

## Purpose

wopal-cli 技能列表功能：列出所有技能（INBOX 已下载 + 已安装）。

## Requirements

### Requirement: 列出所有技能

wopal-cli 应当支持列出所有技能（INBOX 已下载 + 已安装）。

#### Scenario: 列出所有技能
- **WHEN** 用户运行 `wopal skills list`
- **THEN** 系统显示所有技能（INBOX 已下载 + 已安装）
- **AND** 系统使用 "[Downloaded]" 和 "[Installed]" 标识状态
- **AND** 标题使用英文 "Skills:"

#### Scenario: 显示技能详细信息
- **WHEN** 用户运行 `wopal skills list --info`
- **THEN** 系统显示技能的 description
- **AND** 系统显示技能状态和路径

#### Scenario: JSON 输出
- **WHEN** 用户运行 `wopal skills list --json`
- **THEN** 系统输出结构化 JSON 数据
- **AND** 格式符合全局 CLI UX 规范（定义在 openspec/config.yaml）

### Requirement: 列出已安装技能（锁文件读取能力）

#### Scenario: 列出所有技能
- **WHEN** 用户运行 `wopal skills list`
- **THEN** 系统读取两个锁文件并显示所有技能
- **AND** 系统显示每个技能的名称、源头类型、安装时间、范围（项目级/全局级）
- **AND** INBOX 技能的显示行为参见 `wopal-cli-skills-list` 规格

#### Scenario: 只列出项目级技能
- **WHEN** 用户运行 `wopal skills list --local`
- **THEN** 系统只显示项目级锁文件中的技能

#### Scenario: 只列出全局级技能
- **WHEN** 用户运行 `wopal skills list --global`
- **THEN** 系统只显示全局级锁文件中的技能
