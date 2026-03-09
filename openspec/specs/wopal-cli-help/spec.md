# Capability: wopal-cli-help

## Purpose

wopal-cli 帮助命令功能：支持多级子命令查找。

## Requirements

### Requirement: help 命令支持多级子命令

wopal-cli 的 `help` 命令 SHALL 支持多级子命令查找。

#### Scenario: 查看多级子命令帮助
- **WHEN** 用户执行 `wopal help skills inbox`
- **THEN** 显示 `skills inbox` 的帮助信息（包含 list/show/remove 子命令）
- **AND** 不显示 skills 或顶层帮助

#### Scenario: 查看未知命令
- **WHEN** 用户执行 `wopal help unknown`
- **THEN** 显示错误 "Unknown command: unknown"
