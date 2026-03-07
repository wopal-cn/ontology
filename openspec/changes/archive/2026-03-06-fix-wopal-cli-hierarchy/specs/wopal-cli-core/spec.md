## MODIFIED Requirements

> Target: `openspec/specs/wopal-cli-core/spec.md`

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
