---
description: 审查和管理 LanceDB 中的长期记忆（列出、搜索、删除）
---

# /memory — 记忆管理命令

**这是一个需要你立即执行的工具调用命令，不是规则说明。** 收到此命令后，你必须立即调用 `memory_manage` tool 执行对应操作。

## 参数: `$ARGUMENTS`

| 用户输入 | 你要做的 |
|----------|----------|
| 无参数 / `list` | 调用 `memory_manage(command="list", limit=100)` — 一次拿完，不要分批 |
| `list --category X` | 调用 `memory_manage(command="list", category="X", limit=100)` |
| `list --limit N` | 调用 `memory_manage(command="list", limit=N)` — 用户指定了就用用户的 |
| `search <query>` | 调用 `memory_manage(command="search", query="<query>")` |
| `stats` | 调用 `memory_manage(command="stats")` |
| `delete <id1,id2,...>` | **先展示要删除的内容摘要，等用户确认后再调用** `memory_manage(command="delete", query="<ids>")` |

## 输出要求

**用户执行 `list` 的目的是逐条审查记忆内容，决定删除或调整哪一条。** 你必须将 tool 返回的**每一条记忆的完整内容**写入回复，省略任何一条 = 用户无法做出判断 = 任务失败。

**tool 返回值对用户不可见。** 只调 tool 不输出 = 用户什么都没看到 = 任务未完成。

## 注意

- 删除不可逆，必须先展示内容等用户确认
