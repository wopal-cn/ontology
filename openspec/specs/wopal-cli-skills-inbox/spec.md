# Capability: wopal-cli-skills-inbox

## Purpose

wopal-cli INBOX 管理功能：配置 INBOX 路径、列出/显示/删除 INBOX 中的技能。

## Requirements

### Requirement: INBOX 路径配置

wopal-cli 应当支持通过环境变量配置 INBOX 路径。

#### Scenario: 使用环境变量配置 INBOX 路径
- **WHEN** 环境变量 `WOPAL_SKILLS_INBOX_DIR` 已设置
- **THEN** 系统使用该路径作为 INBOX 目录
- **AND** 默认路径为 `~/.wopal/skills/INBOX`

### Requirement: 列出 INBOX 技能

wopal-cli 应当支持列出 INBOX 中的所有技能。

#### Scenario: 列出 INBOX 技能
- **WHEN** 用户运行 `wopal skills inbox list`
- **THEN** 系统显示 INBOX 中的所有技能名称和文件大小
- **AND** 标题使用英文 "INBOX Skills:"

#### Scenario: INBOX 为空
- **WHEN** INBOX 中无技能
- **THEN** 系统显示 "INBOX is empty"

### Requirement: 显示 INBOX 技能详情

wopal-cli 应当支持显示 INBOX 技能的详细信息。

#### Scenario: 显示技能详情
- **WHEN** 用户运行 `wopal skills inbox show skill-name`
- **THEN** 系统显示 SKILL.md 内容和技能目录结构

#### Scenario: 技能不存在
- **WHEN** 用户运行 `wopal skills inbox show <nonexistent>`
- **THEN** 系统显示 "Skill '<name>' not found in INBOX"
- **AND** 系统返回退出码 1

#### Scenario: 技能目录无效
- **WHEN** 技能目录存在但缺少 SKILL.md
- **THEN** 系统显示警告 "Invalid skill directory: missing SKILL.md"

### Requirement: 删除 INBOX 技能

wopal-cli 应当支持删除 INBOX 中的单个技能。

#### Scenario: 删除单个技能
- **WHEN** 用户运行 `wopal skills inbox remove skill-name`
- **THEN** 系统删除 INBOX/<skill-name> 目录
- **AND** 系统显示 "Removed skill: skill-name"
- **AND** 系统保留 INBOX 目录本身
- **AND** 系统不删除 `.agents/skills/` 中已安装的技能

#### Scenario: 删除不存在的技能
- **WHEN** 用户运行 `wopal skills inbox remove <nonexistent>`
- **THEN** 系统显示 "Skill '<name>' not found in INBOX"
- **AND** 系统返回退出码 1
