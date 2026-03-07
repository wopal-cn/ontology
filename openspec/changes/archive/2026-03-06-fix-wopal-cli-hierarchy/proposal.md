## Why

当前 wopal-cli 的命令结构是平铺式（`wopal inbox`、`wopal list`、`wopal find` 都是顶层命令），与设计文档中定义的层级式结构不符（都应在 `skills` 子命令下）。这导致帮助信息混乱，`wopal skills inbox` 显示的是顶层帮助而非子命令帮助。

## What Changes

- 将 `inbox`、`list`、`find` 命令从顶层移动到 `skills` 子命令下
- 修复 `skills` 命令组的帮助信息显示逻辑
- 修复 `find` 命令参数验证（必填）

## Capabilities

### New Capabilities

- `skills-command-hierarchy`: 定义 wopal-cli 的层级命令结构（`skills` 作为命令组，包含 `inbox`/`list`/`find`/`download`/`scan`/`install`/`check`/`update`）

### Modified Capabilities

无（这是 wopal-cli-core 的修复，不涉及现有 spec 的修改）

## Impact

- **代码影响**：
  - `src/cli.ts` - 重构命令注册逻辑，使用 commander.js 的嵌套命令
  - `src/commands/*.ts` - 调整命令注册函数签名
- **用户体验**：
  - 帮助信息更清晰，符合层级结构
  - 向后兼容：旧命令 `wopal inbox` 仍可用
