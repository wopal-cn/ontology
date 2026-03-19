---
name: plan-master
description: ⚠️ MUST USE for task/plan tracking (never edit PLAN.md directly). Provides persistent task management with priorities and plan lifecycle. Triggers on "add to plan", "what's on the plan", "mark X done", "show plan", "remove from plan", "pending tasks", "craft plan", "create plan", "plan feature", "deep analysis", "verify plan", "execute plan", or plan-related queries.
---

# Plan Master

管理持久化的 PLAN.md 任务追踪板，支持跨会话任务管理和计划生命周期管理。

## 文件位置

- **任务追踪**: `memory/PLAN.md`
- **实施计划**: `docs/products/<project>/plans/`（根据项目自动推断）

## 命令概览

| 命令 | 用途 | 触发词 |
|------|------|--------|
| `add` | 添加任务项 | "add X to plan" |
| `done` | 标记完成 | "mark X done" |
| `remove` | 移除任务 | "remove X from plan" |
| `list` | 列出任务 | "show plan", "pending tasks" |
| `summary` | 快速摘要 | 心跳检查 |
| `craft` | 创建计划 | "craft plan", "create plan", "制定方案" |
| `verify` | 验证计划 | "verify plan" |
| `execute` | 执行计划 | "execute plan", "执行计划" |

---

## 任务管理

### 查看计划

当用户说："what's on the plan?", "show plan", "pending tasks?"

```bash
cat memory/PLAN.md
```

然后按优先级摘要展示。

### 添加任务

当用户说："add X to plan", "plan: X", "remember to X"

```bash
bash skills/plan-master/scripts/plan.sh add "<priority>" "<item>"
```

优先级: `high`, `medium`, `low`（默认 medium）

### 标记完成

当用户说："mark X done", "completed X", "finished X"

```bash
bash skills/plan-master/scripts/plan.sh done "<item-pattern>"
```

支持部分文本匹配，将任务移动到 ✅ Done 区域并记录日期。

### 移除任务

当用户说："remove X from plan", "delete X from plan"

```bash
bash skills/plan-master/scripts/plan.sh remove "<item-pattern>"
```

### 心跳集成

在心跳检查时调用：

```bash
bash skills/plan-master/scripts/plan.sh summary
```

输出示例：
```
📋 Plan: 7 items (2 high, 2 medium, 3 low)
🔴 High priority items:
  • Ingest low-code docs
  • Fix critical bug
⚠️ 1 stale item (>7 days old)
```

---

## 计划生命周期

```
craft → verify → execute → done
```

### 创建计划

#### 轻量模式（简单任务）

当用户说："craft plan", "create plan", "制定方案"

```bash
bash skills/plan-master/scripts/plan.sh craft "plan-name"
```

#### 深度模式（复杂功能）

当用户说："plan feature", "深度规划", "analyze and plan"

```bash
bash skills/plan-master/scripts/plan.sh craft "feature-name" --deep --prd "docs/products/PRD-xxx.md"
```

**参数说明**：

| 参数 | 说明 |
|------|------|
| `<plan-name>` | 计划名称（必需） |
| `--deep` | 深度分析模式，从代码库收集情报 |
| `--prd <path>` | 关联 PRD 文件，如 `docs/products/PRD-xxx.md` |

**计划文件位置**：根据技能所在项目自动推断
- `projects/agent-tools/agents/wopal/skills/plan-master/` → `docs/products/agent-tools/plans/`
- `projects/wopal-cli/skills/xxx/` → `docs/products/wopal-cli/plans/`
- 空间级技能 → `docs/products/plans/`

### 验证计划

当用户说："verify plan", "验证计划"

```bash
bash skills/plan-master/scripts/plan.sh verify "plan-name"
```

**验证项**：

| 检查项 | 通过标准 |
|--------|----------|
| 占位符 | 无 TODO/FIXME/待补充/REQ-xxx/path/to/ |
| PRD 关联 | 必须存在有效 PRD 引用 |
| 必需章节 | 目标/In Scope/Out of Scope/文件清单/实施步骤/验收标准 |
| 文件清单 | 非空，包含具体文件路径 |
| 任务定义 | 至少包含一个 Task |
| PRD 需求映射 | 每个 Task 都有关联 PRD 需求 |
| 验证命令 | 每个 Task 都有验证命令 |
| 粒度检查 | Step 数量 ≥ Task 数量（启发式） |

### 执行计划

当用户说："execute plan", "执行计划"

```bash
bash skills/plan-master/scripts/plan.sh execute "plan-name"
```

先执行 `verify`，通过后将状态更新为 `executing`。

**未来扩展**：
```bash
bash skills/plan-master/scripts/plan.sh execute "plan-name" --fae  # 委派给 fae
```

---

## 深度分析流程（--deep 模式）

当使用 `--deep` 参数创建计划时，按以下流程收集情报：

### Phase 0: 前置上下文检查

- 检测当前工作目录所在项目
- 读取目标项目 `AGENTS.md`

### Phase 1: 需求理解

- 提取要解决的核心问题
- 识别用户价值和业务影响
- 确定功能类型：新功能 / 增强 / 重构 / Bug修复
- 评估复杂度：低 / 中 / 高
- 梳理受影响的系统和组件

### Phase 2: 代码库情报收集

**架构与结构分析**
- 定位相关服务、组件的边界与集成点
- 查找需要修改的现有文件
- 定位配置文件确定已有依赖

**模式识别**
- 寻找类似功能的实现作为参考
- 识别项目的编码规范
- 提取需要避免的反模式

**测试模式分析**
- 确定现有的测试框架
- 寻找可供模仿的测试用例
- 记录覆盖率要求

**依赖分析**
- 梳理需要用到的外部库
- 了解库的集成方式
- 注意版本兼容性

### Phase 3: 外部研究

- 查找新库/API 的官方文档
- 收集实现示例和避坑点
- 记录文档链接及特定段落

### Phase 4: 战略思考

- 新功能如何融入现有架构？
- 关键依赖是什么？操作的先后顺序？
- 哪里最容易出问题？
- 如何全面测试？

---

## 计划模板结构

```markdown
# <计划名称>

## 元数据

- **PRD**: `<PRD 路径或待关联>`
- **Created**: YYYY-MM-DD
- **Status**: draft
- **Mode**: deep | lite

## 目标

<!-- 继承自 PRD Problem Statement，一句话描述 -->

## In Scope

- [ ] 功能点1
- [ ] 功能点2

## Out of Scope

- [ ] 排除项（需与 PRD Non-Goals 对齐）

## 文件清单

- `path/to/file1.ts` - 创建/修改

## 实施步骤

### Task 1: [任务名称]

**关联 PRD 需求**: REQ-xxx
**Files**:
- Modify: `path/to/file1.ts`

- [ ] Step 1: 具体操作
- [ ] Step 2: 验证

**验证**: `npm test -- path/to/test`

## 验收标准

- [ ] 对应 PRD Success Criteria 逐项覆盖
- [ ] 所有测试通过
- [ ] 功能验证通过

## 风险与依赖

- 风险点1
- 依赖项1
```

---

## PLAN.md 格式

```markdown
# PLANS

*Last updated: 2026-03-19*

## 🔴 High Priority
- [ ] Item one (added: 2026-03-19)

## 🟡 Medium Priority
- [ ] Item two (added: 2026-03-19)

## 🟢 Nice to Have
- [ ] Item three (added: 2026-03-19)

## ✅ Done
- [x] Completed item (done: 2026-03-19)
```

---

## 响应格式

展示计划时：

```
📋 **Plan** (3 items)

🔴 **High Priority** (1)
• Important task

🟡 **Medium Priority** (1)
• Regular task

🟢 **Nice to Have** (1)
• Future idea

⚠️ 1 item is stale (>7 days old)
```
