---
description: |
  蒸馏当前会话，提取有价值的记忆存入数据库。

  **触发场景**（用户说以下任意）：
  - "蒸馏会话"、"提取记忆"、"总结这次对话"
---

这是一个立即执行命令，不是规则阅读任务。
你必须立刻调用 context_manage 工具，不要解释命令，不要复述规则。

以下行为是错误的：
- 总结或复述命令内容
- 询问用户"是否要执行蒸馏"
- 解释蒸馏的原理或流程
- 重新格式化工具返回的内容

# /distill — 会话记忆蒸馏

## 第一步：Preview

无参数 / `distill` / `distill --force` → 调用 `context_manage({"action": "distill"})`，`--force` 时加 `{"force": true}`

**输出规则**：工具返回完整的候选列表和 Next Steps 指引，你必须将返回内容**原样写入回复**，不要重新格式化、不要添加额外说明。用户看到报告后会告诉你下一步。

## 第二步：Confirm / Cancel

根据用户回复调用对应参数：

| 用户说 | 调用 |
|--------|------|
| "确认"/"全部"/"写入"/"好的" | `context_manage({"action": "confirm"})` |
| "只要 0, 2, 3"（索引号） | `context_manage({"action": "confirm", "selectedIndices": [0, 2, 3]})` |
| "取消"/"不要了" | `context_manage({"action": "cancel"})` |

**输出规则**：confirm 返回去重报告，同样**原样写入回复**。

## 注意

- preview 和 confirm 必须在同一 session 中完成
- 候选数据暂存在 session 缓存中，长时间不响应可能过期
