# 📋 Plan Master Skill

Wopal 工作空间的持久化任务/计划追踪系统，支持跨会话任务管理、优先级排序、完成追踪和心跳提醒。

## 文件位置

- **任务追踪**: `memory/PLAN.md`
- **实施计划**: `docs/products/<project>/plans/`（根据项目自动推断）

## 快速使用

| 说法... | 结果 |
|---------|------|
| "Add X to plan" | 添加任务（默认 medium 优先级） |
| "Add X to high priority" | 添加高优先级任务 |
| "What's on the plan?" | 显示任务列表 |
| "Mark X done" | 移动到完成区域 |
| "Remove X from plan" | 删除任务 |
| "Craft plan X" | 创建实施计划 |
| "Verify plan X" | 验证计划完整性 |
| "Execute plan X" | 执行计划 |

## 优先级

- 🔴 **High** — 紧急任务
- 🟡 **Medium** — 普通优先级（默认）
- 🟢 **Nice to Have** — 低优先级 / 未来想法

## CLI 命令

```bash
# 任务管理
bash scripts/plan.sh add high "Urgent task"
bash scripts/plan.sh done "Urgent"
bash scripts/plan.sh remove "old task"
bash scripts/plan.sh list
bash scripts/plan.sh summary

# 计划生命周期
bash scripts/plan.sh craft "feature-name"              # 轻量模式
bash scripts/plan.sh craft "feature" --deep --prd "docs/products/PRD-xxx.md"  # 深度模式
bash scripts/plan.sh verify "feature-name"             # 验证
bash scripts/plan.sh execute "feature-name"            # 执行
```

## 计划生命周期

```
craft → verify → execute → done
```

### craft - 创建计划

| 参数 | 说明 |
|------|------|
| `<plan-name>` | 计划名称（必需） |
| `--deep` | 深度分析模式，从代码库收集情报 |
| `--prd <path>` | 关联 PRD 文件 |

**轻量模式**：快速创建计划模板
```bash
bash scripts/plan.sh craft "fix-login-bug"
```

**深度模式**：复杂功能规划
```bash
bash scripts/plan.sh craft "add-oauth" --deep --prd "docs/products/PRD-oauth.md"
```

### verify - 验证计划

检查计划是否达到可执行质量：

- 无占位符（TODO/待补充/REQ-xxx/path/to/）
- PRD 关联有效
- 必需章节完整
- 文件清单非空
- 每个 Task 都有 PRD 需求映射和验证命令

```bash
bash scripts/plan.sh verify "add-oauth"
```

### execute - 执行计划

先验证，通过后更新状态为 `executing`：

```bash
bash scripts/plan.sh execute "add-oauth"
```

## 心跳集成

在 `HEARTBEAT.md` 中添加：

```markdown
## Active Monitoring Tasks

### Daily Plan Check
On each heartbeat:
- Run: bash skills/plan-master/scripts/plan.sh summary
- If high-priority items exist, mention them
- Flag stale items (>7 days old)
```

## PLAN.md 格式

```markdown
# PLANS

*Last updated: 2026-03-19*

## 🔴 High Priority
- [ ] Important task (added: 2026-03-19)

## 🟡 Medium Priority
- [ ] Regular task (added: 2026-03-19)

## 🟢 Nice to Have
- [ ] Future idea (added: 2026-03-19)

## ✅ Done
- [x] Completed task (done: 2026-03-19)
```

## 示例摘要输出

```
📋 Plan: 7 items (2 high, 2 medium, 3 low)
🔴 High priority items:
  • Ingest low-code docs
  • Fix critical bug
⚠️ 1 stale item (>7 days old)
```
