## 1. 重构命令注册逻辑

- [x] 1.1 修改 `cli.ts`：创建 `skills` 命令组
- [x] 1.2 修改 `registerInboxCommand`：注册到 `skills` 命令组
- [x] 1.3 修改 `registerListCommand`：注册到 `skills` 命令组
- [x] 1.4 修改 `registerPassthroughCommand`：注册到 `skills` 命令组

## 2. 修复 find 命令参数验证

- [x] 2.1 修改 `passthrough.ts`：将 `[query]` 改为 `<query>`（必填参数）

## 3. 验证

- [x] 3.1 验证 `wopal --help` 显示正确层级
- [x] 3.2 验证 `wopal skills --help` 显示所有子命令
- [x] 3.3 验证 `wopal skills inbox list` 正常执行
- [x] 3.4 验证 `wopal skills find` 无参数时显示错误
- [x] 3.5 验证 `wopal skills find "query"` 正常执行
- [x] 3.6 验证 `wopal help skills inbox` 显示正确帮助
