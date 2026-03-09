# Capability: wopal-cli-core

## Purpose

wopal-cli 核心功能：CLI 框架初始化和命令层级结构。

## Requirements

### Requirement: CLI 框架初始化

wopal-cli 应当在启动时初始化 CLI 框架。

#### Scenario: 加载环境变量
- **WHEN** CLI 启动
- **THEN** 系统按优先级加载环境变量：
  1. 首先加载 `cwd/.env`（项目级，最高优先级）
  2. 然后加载 `~/.wopal/.env`（全局级）
- **AND** 项目级变量覆盖全局级同名变量

#### Scenario: 调试模式
- **WHEN** 用户运行 `wopal skills --debug` 或 `wopal skills -d`
- **THEN** 系统启用详细日志输出
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


