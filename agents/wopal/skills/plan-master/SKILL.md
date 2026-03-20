---
name: plan-master
description: ⚠️ MUST USE for task/plan tracking (never edit PLAN.md directly). Provides persistent task management with priorities and plan lifecycle. Triggers on "add to plan", "what's on the plan", "mark X done", "show plan", "remove from plan", "pending tasks", "craft plan", "create plan", "plan feature", "refine plan", "review plan", "execute plan", "complete plan", "validate plan", "archive plan", or plan-related queries.
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
| `craft` | 创建计划草案 | "craft plan", "create plan", "制定方案" |
| `refine` | 研究细化方案 | "refine plan", "细化方案", "研究方案" |
| `review` | 用户评审确认 | "review plan", "评审方案" |
| `status` | 查看状态 | "plan status" |
| `execute` | 执行计划 | "execute plan", "执行计划" |
| `complete` | 标记执行完成 | "complete plan", "执行完成" |
| `validate` | 验证确认 | "validate plan", "验证通过" |
| `archive` | 归档计划 | "archive plan", "归档计划" |

**注意**：`craft`/`refine`/`review`/`execute` 必须指定 `--project <name>` 或 `--global`。

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
craft → refine (循环) → review → execute → complete → validate → archive
         ↓
      自动 check-doc
```

### 状态流转

| 状态 | 触发命令 | 说明 |
|------|----------|------|
| `draft` | craft | 初始草案 |
| `refining` | refine | 正在研究细化 |
| `reviewed` | review --confirm | **人类确认**方案可行后标记 |
| `executing` | execute | 开始执行 |
| `completed` | complete | 执行完成（Fae 返回结果） |
| `validated` | validate --confirm | **人类确认**验证通过 |
| 归档 | archive | 移动到 done/，自动标记 PLAN.md 任务完成 |

### 核心原则

**方案质量是执行的前提**。refine 阶段必须确保：
1. 技术方案可行（有代码调研支撑）
2. 文件清单明确（具体到每个文件）
3. 实施步骤可执行（fae 能理解并执行）

### PRD 要求

| 计划类型 | PRD 要求 | 说明 |
|----------|----------|------|
| `feature` | **必需** | 新功能必须有 PRD |
| `enhance` | 可选 | 功能增强 |
| `fix` | 可选 | Bug 修复 |
| `refactor` | 可选 | 重构 |
| `docs` | 可选 | 文档更新 |
| `test` | 可选 | 测试相关 |

### 状态同步

PLAN.md 任务项会自动显示计划状态：

```markdown
- [ ] plan-name [draft] (added: 2026-03-20)
- [ ] plan-name [refining] (added: 2026-03-20)
- [ ] plan-name [reviewed] (added: 2026-03-20)
- [ ] plan-name [executing] (added: 2026-03-20)
```

状态随 `refine` → `review` → `execute` → `complete` → `validate` → `archive` 自动同步。

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
- `plan-master-enhance-refine-workflow.md`
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

---

## 创建计划草案

当用户说："craft plan", "create plan", "制定方案"

```bash
bash skills/plan-master/scripts/plan.sh craft "plan-name" --project <project>
# 或空间级计划
bash skills/plan-master/scripts/plan.sh craft "plan-name" --global
```

**参数说明**：

| 参数 | 说明 |
|------|------|
| `<plan-name>` | 计划名称（必需） |
| `--project <name>` | 项目级计划，存放在 `docs/products/<name>/plans/` |
| `--global` | 空间级计划，存放在 `docs/products/plans/` |
| `--issue <N>` | 关联 GitHub Issue 编号（可多次指定，如 `--issue 12 --issue 13`） |
| `--priority <lvl>` | PLAN.md 追踪优先级（high/medium/low，默认 medium） |
| `--no-track` | 跳过自动添加到 PLAN.md |

**craft 后状态**：`draft`

**下一步**：必须执行 `refine` 进行方案细化。

---

## 方案细化（refine）

**这是方案质量的核心环节**。craft 创建的草案只有骨架，refine 负责填充技术细节。

当用户说："refine plan", "细化方案", "研究方案"

```bash
bash skills/plan-master/scripts/plan.sh refine "plan-name" --project <project>
# 或空间级计划
bash skills/plan-master/scripts/plan.sh refine "plan-name" --global
```

### refine 流程

1. **读取现有草案**
2. **代码库研究**（按深度分析流程）
   - 定位相关文件
   - 分析现有实现
   - 识别需要修改的代码
3. **更新方案文档**
   - 补充技术调研结果
   - 细化文件清单
   - 完善实施步骤
4. **自动执行 check-doc**（内置，无需单独调用）
5. **状态更新为 `refining`**

### refine 循环

refine 可以多次执行，直到方案足够详细：

```
refine → 更新文档 → check-doc → 
  ↓ 如果还有"待补充"或不明确的地方
refine → 更新文档 → check-doc →
  ↓ 直到方案完整
提交 review
```

### 方案完整性标准

refine 完成后，方案必须满足：

| 检查项 | 要求 |
|--------|------|
| 技术调研 | 有实际代码/API 分析支撑 |
| 文件清单 | 列出所有需要修改/创建的文件 |
| 实施步骤 | 每个步骤可执行，有验证方式 |
| 风险分析 | 识别潜在问题和依赖 |

---

## 方案评审（review）

当用户说："review plan", "评审方案"

```bash
# 第一步：运行 check-doc 验证方案完整性
bash skills/plan-master/scripts/plan.sh review "plan-name" --project <project>

# 第二步：用户确认后，正式标记为 reviewed
bash skills/plan-master/scripts/plan.sh review "plan-name" --project <project> --confirm
```

**review 流程**：

1. 运行 check-doc 验证方案完整性
2. 展示方案摘要（目标、文件清单、关键步骤）
3. **用户确认方案可行**（人工环节）
4. 用户确认后，运行 `--confirm` 标记为 `reviewed`

**review 通过后**：才能进入 execute 阶段。

---

## 执行计划

当用户说："execute plan", "执行计划"

```bash
bash skills/plan-master/scripts/plan.sh execute "plan-name" --project <project>
# 或空间级计划
bash skills/plan-master/scripts/plan.sh execute "plan-name" --global
```

**前置条件**：状态必须为 `reviewed`。

**execute 后状态**：`executing`

#### 使用 Worktree 隔离执行

当需要在独立工作树中执行时：

```bash
bash skills/plan-master/scripts/plan.sh execute "plan-name" --project <project> --worktree
```

**工作树命名规则**：若计划关联 Issue，分支名为 `issue-{N}-{slug}`；否则为 `{plan-name}`。

**内部调用**：`bash ../git-worktrees/scripts/worktree.sh create <project> <branch> --no-install --no-test`

**未来扩展**：
```bash
bash skills/plan-master/scripts/plan.sh execute "plan-name" --project <project> --fae  # 委派给 fae
```

---

## 深度分析流程（refine 内部使用）

refine 命令执行时，按以下流程收集情报：

### Phase 0: 前置上下文检查

- 检测当前工作目录所在项目
- 读取目标项目 `AGENTS.md`

### Phase 1: 需求理解（Shape Up Pitch 框架）

**Problem（问题陈述）**
- 提取要解决的核心问题
- 描述当前痛点及其影响

**Appetite（时间预算）**
- 评估复杂度：低 / 中 / 高
- 确定合理的时间投入（2天 / 1周 / 2周 / 6周）

**Solution（方案方向）**
- 识别用户价值和业务影响
- 确定功能类型：新功能 / 增强 / 重构 / Bug修复
- 梳理受影响的系统和组件

**Rabbit Holes（兔子洞）**
- 识别可能陷入的技术陷阱
- 标注需要避免的过度设计

**No-Gos（不做的事）**
- 明确本次计划不涉及的范围
- 与 Out of Scope 对齐

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
- **Issue**: #N（如有）
- **Target Project**: agent-tools | wopal-cli | <other>
- **Created**: YYYY-MM-DD
- **Status**: draft
- **Mode**: deep | lite

## 目标

<!-- 继承自 PRD Problem Statement，一句话描述 -->

## Problem（问题陈述）

<!-- 描述要解决的核心问题及其影响 -->

## Appetite（时间预算）

<!-- 评估复杂度和时间投入：2天 / 1周 / 2周 / 6周 -->

## 技术调研

<!-- refine 阶段补充：代码分析、API 格式、现有实现 -->

## Rabbit Holes（兔子洞）

<!-- 可能陷入的技术陷阱，需要避免的过度设计 -->

## No-Gos（不做的事）

<!-- 本次计划不涉及的范围 -->

## In Scope

- [ ] 功能点1
- [ ] 功能点2

## Out of Scope

- [ ] 排除项（需与 PRD Non-Goals 对齐）

## 文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `path/to/file1.ts` | 创建 | xxx |
| `path/to/file2.ts` | 修改 | xxx |

## 实施步骤

### Task 1: [任务名称]

**Appetite**: X 天

**Files**:
- Create/Modify: `path/to/file1.ts`

- [ ] Step 1: 具体操作
- [ ] Step 2: 验证

**验证**: `npm test -- path/to/test`

## 验收标准

- [ ] 对应 PRD Success Criteria 逐项覆盖
- [ ] 所有测试通过
- [ ] 功能验证通过

## 风险与依赖

| 风险 | 缓解措施 |
|------|----------|
| 风险点1 | xxx |
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
