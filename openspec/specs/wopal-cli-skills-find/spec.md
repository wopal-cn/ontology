# Capability: wopal-cli-skills-find

## Purpose

wopal-cli 透传搜索功能：将 find 命令透传到 Skills CLI，保持原始输出。

## Requirements

### Requirement: 透传命令到 Skills CLI

wopal-cli 应当提供透传功能，将特定命令转发给 Skills CLI，并保持原始输出。

#### Scenario: 透传 find 命令
- **WHEN** 用户运行 `wopal skills find "query"`
- **THEN** 系统调用 `npx skills find "query"`
- **AND** 系统显示原始输出
- **AND** 系统不更新锁文件

#### Scenario: 网络错误
- **WHEN** Skills CLI 因网络问题失败
- **THEN** 系统显示 "Skills CLI execution failed"

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
