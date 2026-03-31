---
description: |
  蒸馏当前会话，提取有价值的记忆存入数据库。
  
  **触发场景**（用户说以下任意）：
  - "蒸馏会话"、"提取记忆"、"总结这次对话"
  - "把刚才的记下来"、"保存到记忆"
  
  **执行流程**（必须严格遵循）：
  
  1. **第一步 - 调用 preview**：
     调用 `distill_session` 工具，参数：`{"action": "preview"}`
  
  2. **第二步 - 展示给用户**：
     将工具返回的候选列表展示给用户，每条显示索引号 [0]、[1]、[2]...
  
  3. **第三步 - 等待确认**：
     明确询问用户："是否全部写入？" / "只写入特定索引？" / "取消？"
  
  4. **第四步 - 根据选择调用 confirm/cancel**：
     - 用户说"全部写入"/"确认"/"是的" → 调用 `{"action": "confirm"}`
     - 用户说"只要第 X、Y 条" → 调用 `{"action": "confirm", "selectedIndices": [X, Y]}`（索引从 0 开始）
     - 用户说"取消"/"不要了" → 调用 `{"action": "cancel"}`
  
  **示例对话**：
  - 用户："蒸馏这次会话"
  - Agent：调用 distill_session {"action": "preview"}
  - Agent："提取到 5 条候选记忆：[0] xxx, [1] yyy... 是否全部写入？"
  - 用户："只要 0 和 2"
  - Agent：调用 distill_session {"action": "confirm", "selectedIndices": [0, 2]}
---

## distill 命令 - 两步式记忆提取

当用户输入 `/distill` 或要求蒸馏会话时：

### 步骤 1：预览提取
**立即调用**：`distill_session` tool with `{"action": "preview"}`

### 步骤 2：展示并等待确认
将返回的候选记忆列表展示给用户，格式：
```
提取到 N 条候选记忆：
[0] [分类] 标题
[1] [分类] 标题
...

请选择：
- 全部写入：回复 "确认"
- 部分写入：回复 "只要 0, 2, 3"（索引号）
- 取消：回复 "取消"
```

### 步骤 3：根据用户选择执行
- **"确认"/"全部"/"写入"** → 调用 `{"action": "confirm"}`
- **"只要第 X 条"** → 调用 `{"action": "confirm", "selectedIndices": [X]}`
- **"取消"** → 调用 `{"action": "cancel"}`

**重要**：
- preview 和 confirm 必须在同一 session 中完成
- 候选数据会暂存在 session 缓存中
- 如果用户长时间不响应，数据可能会过期
