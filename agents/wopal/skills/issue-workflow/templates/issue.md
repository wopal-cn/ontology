# Issue 模板

---

## 方案草案 (Shape Up Pitch)

### Problem

<!-- 描述要解决的问题：痛点是什么？影响谁？为什么现在要解决？ -->

### Appetite

<!-- 时间预算：愿意投入多少时间？优先级如何？ -->

### Solution

<!-- 
核心思路与设计方向，不涉及具体实施细节。

应包含：
1. 核心思路：解决问题的方向性描述（1-2 句话）
2. 关键设计决策：技术选型、架构方向、重要约束

示例：
> 核心思路：扩展 FaeClient 和 EventMonitor，让 Wopal 能自主响应 Fae 提问并从网络故障中恢复。
> 关键决策：重试策略仅应用于网络错误，不应用于业务错误；SSE 重连不持久化历史，通过 session status 恢复。

注意：具体修改哪些文件、详细实施步骤，由 Plan 文档负责。
-->

### Rabbit Holes

<!-- 避坑指南：哪些方向看起来可行但实际是坑？ -->

- ❌ ...

### No-gos

<!-- 边界明确：哪些事情明确不在本次范围内？ -->

- ...

---

## 关联资源

| 资源 | 链接 |
|------|------|
| Plan | _待关联_ |
| PR | _待关联_ |

---

## Target Project

- [ ] agent-tools
- [ ] wopal-cli
- [ ] space
- [ ] other: `<project-name>`

---

## Label 建议

**状态 Label**（选择一个）：
- `status/planning` - 规划中
- `status/in-progress` - 开发中
- `status/in-review` - 审核中
- `status/blocked` - 阻塞中

**类型 Label**（选择一个）：
- `type/feature` - 新功能
- `type/bug` - Bug 修复
- `type/refactor` - 重构
- `type/docs` - 文档更新
- `type/chore` - 构建/工具/杂项

**项目 Label**（选择一个）：
- `project/agent-tools`
- `project/wopal-cli`
- `project/space`