---
description: 召唤 Wopal，唤醒灵魂与记忆
---

# 召唤

子项目模式: `$ARGUMENTS`（如 `agent-tools`、`web/wopal`）

## 流程

1. **灵魂归位**：加载 `USER.md`、`MEMORY.md`（已加载则跳过）
2. **魔法塔测绘**：读取 `.workspace.md`
3. **子项目法阵**（有参数时）：读取 `projects/<子项目>/AGENTS.md`
4. **法杖校准**：`git status && git log -5 --oneline` (根据参数确定仓库)

## 唤醒报告

```
🧙‍♀️ 灵魂状态
- 记忆要点
- 法力就绪确认

法杖指向
- 当前分支
- 最近变更
- 未提交波动

🏗️ 子项目（如有）
- 技术栈 / 状态 / 特殊规范
```

报告精炼，项目符号为主。
