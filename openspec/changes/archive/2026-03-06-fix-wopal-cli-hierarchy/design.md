## Context

当前 wopal-cli 使用 commander.js，但命令注册是平铺式：
- `program.command('skills')` - 空命令，调用 `program.help()`
- `program.command('inbox')` - INBOX 管理（顶层）
- `program.command('list')` - 技能列表（顶层）
- `program.command('find')` - 搜索（顶层）

这导致帮助信息混乱，`wopal skills inbox` 显示顶层帮助。

## Goals / Non-Goals

**Goals:**
- 重构命令注册为层级式（`skills` 作为命令组）
- 所有技能相关命令都在 `skills` 下
- 修复 `find` 命令参数验证

**Non-Goals:**
- 不修改命令的具体实现逻辑
- 不添加新功能
- 不提供向后兼容（直接使用新路径）

## Decisions

### Decision 1: 使用 commander.js 的嵌套命令

**选择**: 使用 `program.command('skills')` 创建子命令，然后在其上注册 `inbox`/`list`/`find`

**理由**:
- commander.js 原生支持嵌套命令
- 帮助信息自动分层
- 代码结构清晰

**备选方案**:
- ❌ 自定义帮助逻辑 - 复杂度高，维护困难
- ❌ 使用其他 CLI 框架 - 引入新依赖，过度设计

### Decision 2: find 命令参数必填

**选择**: 使用 `<query>` 而非 `[query]`

**理由**:
- 搜索必须提供查询词
- commander.js 自动验证必填参数

## Risks / Trade-offs

**风险**: 用户需要更新现有脚本使用新路径
**缓解**: 这是 wopal-cli 初期，影响范围小
