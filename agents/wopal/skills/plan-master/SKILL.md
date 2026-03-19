---
name: plan-master
description: ⚠️ MUST USE for task/plan tracking (never edit PLAN.md directly). Provides persistent task management with priorities. Triggers on "add to plan", "what's on the plan", "mark X done", "show plan", "remove from plan", or pending task queries.
---

# Plan Master

Manage a persistent PLAN.md scratch pad for task tracking across sessions.

## File Location

`memory/PLAN.md` (Wopal workspace specific location)

## Commands

### View Plan
When user asks: "what's on the plan?", "show plan", "pending tasks?"
```bash
cat memory/PLAN.md
```
Then summarize the items by priority.

### Add Item
When user says: "add X to plan", "plan: X", "remember to X"
```bash
bash skills/plan-master/scripts/plan.sh add "<priority>" "<item>"
```
Priorities: `high`, `medium`, `low` (default: medium)

Examples:
```bash
bash skills/plan-master/scripts/plan.sh add high "Ingest low-code docs"
bash skills/plan-master/scripts/plan.sh add medium "Set up Zendesk escalation"
bash skills/plan-master/scripts/plan.sh add low "Add user memory feature"
```

### Mark Done
When user says: "mark X done", "completed X", "finished X"
```bash
bash skills/plan-master/scripts/plan.sh done "<item-pattern>"
```
Matches partial text. Moves item to ✅ Done section with date.

### Remove Item
When user says: "remove X from plan", "delete X from plan"
```bash
bash skills/plan-master/scripts/plan.sh remove "<item-pattern>"
```

### List by Priority
```bash
bash skills/plan-master/scripts/plan.sh list high
bash skills/plan-master/scripts/plan.sh list medium
bash skills/plan-master/scripts/plan.sh list low
```

## Heartbeat Integration

On heartbeat, check PLAN.md:
1. Count high-priority items
2. Check for stale items (added >7 days ago)
3. If items exist, include brief summary in heartbeat response

Example heartbeat check:
```bash
bash skills/plan-master/scripts/plan.sh summary
```

## PLAN.md Format

```markdown
# PLANS

*Last updated: 2026-01-17*

## 🔴 High Priority
- [ ] Item one (added: 2026-01-17)
- [ ] Item two (added: 2026-01-15) ⚠️ STALE

## 🟡 Medium Priority
- [ ] Item three (added: 2026-01-17)

## 🟢 Nice to Have
- [ ] Item four (added: 2026-01-17)

## ✅ Done
- [x] Completed item (done: 2026-01-17)
```

## Response Format

When showing plan:
```
📋 **Plan** (3 items)

🔴 **High Priority** (1)
• Ingest low-code docs

🟡 **Medium Priority** (1)  
• Zendesk escalation from Discord

🟢 **Nice to Have** (1)
• User conversation memory

⚠️ 1 item is stale (>7 days old)
```

## Phase 1: 计划编写（当用户说"制定方案"/"写计划"）

### 粒度原则
- 每步 2-5 分钟可完成
- 原子性：一步只做一件事

### 任务结构
每个任务项必须包含：
- **Files:** 明确哪些文件创建/修改
- **Steps:** 可执行步骤清单
  ```markdown
  - [ ] 写测试（附代码）
  - [ ] 跑测试确认失败
  - [ ] 写最小实现（附代码）
  - [ ] 跑测试确认通过
  - [ ] 提交
  ```

### 创建计划
```bash
bash skills/plan-master/scripts/plan.sh craft "<plan-name>"
```
生成结构化计划模板到 `docs/products/plans/<plan-name>.md`

### 范围检查
- 多子系统 → 建议拆分为多个计划
- 单计划不超过 10 个任务项
- 依赖关系明确标注

## Phase 2: 计划审查（编写完成后）

### 自检清单
| 检查项 | 通过标准 |
|--------|----------|
| 完整性 | 无 TODO/占位符 |
| 可执行性 | 工程师能直接动手 |
| 粒度 | 每步 <5 分钟 |
| 代码完整 | 附完整可运行代码 |
| 验证命令 | 提供测试/验证命令 |

### 验证命令
```bash
bash skills/plan-master/scripts/plan.sh verify "<plan-name>"
```
检查计划文档是否满足自检清单。

## Phase 3: 委派准备（当用户确认执行）

### 标记委派
```bash
bash skills/plan-master/scripts/plan.sh delegate "<plan-name>"
```
将计划标记为"已委派给 fae"，更新 PLAN.md 状态。

### 输出格式
生成 fae 可执行的方案文档：
- **位置**: `docs/products/plans/<name>.md`
- **包含**: 精确步骤 + 完整代码 + 验证命令

### 委派文档模板
```markdown
# <计划名称>

## 目标
<一句话描述>

## 文件清单
- `path/to/file1.ts` - 创建/修改
- `path/to/file2.ts` - 创建/修改

## 实施步骤

### Step 1: <步骤名>
**文件**: `path/to/file1.ts`

```typescript
// 完整代码
```

**验证**: `npm test -- file1.test.ts`

### Step 2: <步骤名>
...

## 完成标准
- [ ] 所有测试通过
- [ ] 无 lint 错误
- [ ] 功能验证通过
```