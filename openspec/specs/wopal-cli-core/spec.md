# Capability: wopal-cli-core

## Purpose

wopal-cli 核心功能：CLI 框架、命令层级结构、INBOX 管理、技能列表、透传命令。

## Requirements

### Requirement: CLI 框架初始化

wopal-cli 应当在启动时初始化 CLI 框架。

#### Scenario: 加载环境变量
- **WHEN** CLI 启动
- **THEN** 系统从 `~/.wopal/.env` 加载环境变量

#### Scenario: 调试模式
- **WHEN** 用户运行 `wopal skills --debug` 或 `wopal skills -d`
- **THEN** 系统从 cwd 目录下的 `.env` 加载环境变量
- **AND** 系统将日志输出到 cwd 目录下的 `logs/` 目录

#### Scenario: 显示版本
- **WHEN** 用户运行 `wopal --version`
- **THEN** 系统显示 CLI 版本号

### Requirement: 命令层级结构

wopal-cli SHALL 使用层级命令结构，`skills` 作为命令组，包含所有技能管理子命令。

#### Scenario: 查看顶层帮助
- **WHEN** 用户执行 `wopal --help`
- **THEN** 显示 `skills` 命令组及其描述
- **AND** 不显示 `inbox`/`list`/`find` 作为顶层命令

#### Scenario: 查看 skills 帮助
- **WHEN** 用户执行 `wopal skills --help`
- **THEN** 显示所有子命令：`inbox`/`list`/`find`/`download`/`scan`/`install`/`check`/`update`

#### Scenario: 执行子命令
- **WHEN** 用户执行 `wopal skills inbox list`
- **THEN** 执行 INBOX 列表命令
- **AND** 显示正确的帮助信息（而非顶层帮助）

### Requirement: help 命令支持多级子命令

wopal-cli 的 `help` 命令 SHALL 支持多级子命令查找。

#### Scenario: 查看多级子命令帮助
- **WHEN** 用户执行 `wopal help skills inbox`
- **THEN** 显示 `skills inbox` 的帮助信息（包含 list/show/remove 子命令）
- **AND** 不显示 skills 或顶层帮助

#### Scenario: 查看未知命令
- **WHEN** 用户执行 `wopal help unknown`
- **THEN** 显示错误 "Unknown command: unknown"

### Requirement: INBOX 路径配置

wopal-cli 应当支持通过环境变量配置 INBOX 路径。

#### Scenario: 使用环境变量配置 INBOX 路径
- **WHEN** 环境变量 `WOPAL_SKILL_INBOX_DIR` 已设置
- **THEN** 系统使用该路径作为 INBOX 目录
- **AND** 默认路径为 `~/.wopal/skills/INBOX`

### Requirement: 列出 INBOX 技能

wopal-cli 应当支持列出 INBOX 中的所有技能。

#### Scenario: 列出 INBOX 技能
- **WHEN** 用户运行 `wopal skills inbox list`
- **THEN** 系统显示 INBOX 中的所有技能名称和文件大小

#### Scenario: INBOX 为空
- **WHEN** INBOX 中无技能
- **THEN** 系统显示"INBOX 为空"

### Requirement: 显示 INBOX 技能详情

wopal-cli 应当支持显示 INBOX 技能的详细信息。

#### Scenario: 显示技能详情
- **WHEN** 用户运行 `wopal skills inbox show skill-name`
- **THEN** 系统显示 SKILL.md 内容和技能目录结构

#### Scenario: 技能目录无效
- **WHEN** 技能目录存在但缺少 SKILL.md
- **THEN** 系统显示警告"无效的技能目录"

### Requirement: 删除 INBOX 技能

wopal-cli 应当支持删除 INBOX 中的单个技能。

#### Scenario: 删除单个技能
- **WHEN** 用户运行 `wopal skills inbox remove skill-name`
- **THEN** 系统删除 INBOX/<skill-name> 目录
- **AND** 系统保留 INBOX 目录本身
- **AND** 系统不删除 `.agents/skills/` 中已安装的技能

### Requirement: 列出所有技能

wopal-cli 应当支持列出所有技能（INBOX 已下载 + 已安装）。

#### Scenario: 列出所有技能
- **WHEN** 用户运行 `wopal skills list`
- **THEN** 系统显示所有技能（INBOX 已下载 + 已安装）
- **AND** 系统区分显示技能状态（已下载/已安装）

#### Scenario: 显示技能详细信息
- **WHEN** 用户运行 `wopal skills list --info`
- **THEN** 系统显示技能的 description
- **AND** 系统显示技能状态和路径

### Requirement: 透传命令到 Skills CLI

wopal-cli 应当提供透传功能，将特定命令转发给 Skills CLI，并保持原始输出。

#### Scenario: 透传 find 命令
- **WHEN** 用户运行 `wopal skills find "query"`
- **THEN** 系统调用 `npx skills find "query"`
- **AND** 系统显示原始输出
- **AND** 系统不更新锁文件

#### Scenario: 网络错误
- **WHEN** Skills CLI 因网络问题失败
- **THEN** 系统显示 Skills CLI 的错误信息

### Requirement: find 命令参数验证

wopal-cli SHALL 要求 `find` 命令必须提供查询参数。

#### Scenario: 无参数调用 find
- **WHEN** 用户执行 `wopal skills find`（无参数）
- **THEN** 显示错误提示 "missing required argument 'query'"
- **AND** 显示命令用法帮助

#### Scenario: 有参数调用 find
- **WHEN** 用户执行 `wopal skills find "react hooks"`
- **THEN** 正常执行搜索
- **AND** 调用 Skills CLI 透传查询
