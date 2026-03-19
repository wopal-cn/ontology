---
name: plan-master
description: ⚠️ MUST USE for task/plan tracking (never edit PLAN.md directly). Provides persistent task management with priorities and plan lifecycle. Triggers on "add to plan", "what's on the plan", "mark X done", "show plan", "remove from plan", "pending tasks", "craft plan", "create plan", "plan feature", "deep analysis", "verify plan", "execute plan", "complete plan", "validate plan", "archive plan", or plan-related queries.
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
| `complete` | 标记执行完成 | "complete plan", "执行完成" |
| `validate` | 验证确认 | "validate plan", "验证通过" |
| `archive` | 归档计划 | "archive plan", "归档计划" |

**注意**：`craft`/`verify`/`execute` 必须指定 `--project <name>` 或 `--global`。

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
craft → verify → execute → complete → validate → archive
```

### 状态流转

| 状态 | 触发命令 | 说明 |
|------|----------|------|
| `draft` | craft | 初始创建 |
| `verified` | verify | 静态检查通过 |
| `executing` | execute | 开始执行 |
| `completed` | complete | 执行完成（Fae 返回结果） |
| `validated` | validate --confirm | 用户确认验证通过 |
| 归档 | archive | 移动到 done/，自动标记 PLAN.md 任务完成 |

### 计划命名规范

```
<component>-<type>-<description>.md
```

| 字段 | 说明 | 示例 |
|------|------|------|
| `<component>` | 所属组件/模块 | plan-master, fae, wopal-cli |
| `<type>` | 计划类型 | feature, enhance, fix, refactor |
| `<description>` | 简短描述 | validate-phase, task-wait-bug |

**type 定义**：

| type | 用途 | 示例 |
|------|------|------|
| `feature` | 全新功能 | 新增命令、新模块 |
| `enhance` | 功能增强/优化 | 流程改进、参数扩展 |
| `fix` | Bug 修复 | 修复已知问题 |
| `refactor` | 重构 | 不改变功能的代码改进 |
| `docs` | 文档更新 | 文档改进 |
| `test` | 测试相关 | 测试用例添加 |

**命名示例**：
- `plan-master-enhance-validate-phase.md`
- `fae-fix-task-wait-bug.md`
- `wopal-cli-feature-session-messages.md`

### ⚠️ 项目定位规则（重要）

在创建计划前，**必须先确定目标项目**。

**定位逻辑**：

| 用户指令 | 项目定位 |
|----------|----------|
| "给 <project> 创建计划" | 指定的项目 |
| "空间级计划" / "全局计划" | 空间级（无项目） |
| 未指定项目 | **必须先询问用户** |

**可用项目**：参考 `.workspace.md` 中的 `projects/` 目录结构。

**禁止行为**：不要猜测项目，用户未指定时必须询问。

### 创建计划

#### 轻量模式（简单任务）

当用户说："craft plan", "create plan", "制定方案"

```bash
bash skills/plan-master/scripts/plan.sh craft "plan-name" --project <project>
# 或空间级计划
bash skills/plan-master/scripts/plan.sh craft "plan-name" --global
```

#### 深度模式（复杂功能）

当用户说："plan feature", "深度规划", "analyze and plan"

```bash
bash skills/plan-master/scripts/plan.sh craft "feature-name" --project <project> --deep --prd "docs/products/PRD-xxx.md"
```

**参数说明**：

| 参数 | 说明 |
|------|------|
| `<plan-name>` | 计划名称（必需） |
| `--project <name>` | 项目级计划，存放在 `docs/products/<name>/plans/` |
| `--global` | 空间级计划，存放在 `docs/products/plans/` |
| `--deep` | 深度分析模式，从代码库收集情报 |
| `--prd <path>` | 关联 PRD 文件，如 `docs/products/PRD-xxx.md` |

### 验证计划

当用户说："verify plan", "验证计划"

```bash
bash skills/plan-master/scripts/plan.sh verify "plan-name" --project <project>
# 或空间级计划
bash skills/plan-master/scripts/plan.sh verify "plan-name" --global
```

### 执行计划

当用户说："execute plan", "执行计划"

```bash
bash skills/plan-master/scripts/plan.sh execute "plan-name" --project <project>
# 或空间级计划
bash skills/plan-master/scripts/plan.sh execute "plan-name" --global
```

先执行 `verify`，通过后将状态更新为 `executing`。

**未来扩展**：
```bash
bash skills/plan-master/scripts/plan.sh execute "plan-name" --project <project> --fae  # 委派给 fae
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
