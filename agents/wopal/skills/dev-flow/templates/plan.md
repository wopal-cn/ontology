# {plan_name}

## Metadata

{issue_line}
{type_line}
{project_line}
- **Created**: {date}
- **Status**: planning

## Scope Assessment

- **Complexity**: Low|Medium|High
- **Confidence**: High|Medium|Low

## Goal

一句话描述本计划要达成的目标。

## Technical Context

<当前架构描述，为什么需要变更>
<如有全局性风险，在此说明>

## In Scope

列出本次要完成的具体内容：

- 功能点 1
- 功能点 2

## Out of Scope

列出本次不做的内容：

- <本次不做的内容及原因>

## Affected Files

| Component | Files | Operation | Role |
|-----------|-------|-----------|------|
| <component> | `file1`, `file2` | 修改/创建/删除 | <在此变更中的作用> |

## Implementation

### Task 1: Task Title

**Files**: `path/to/file`

**Changes**:
- [ ] Step 1: 具体改动点 1
- [ ] Step 2: 具体改动点 2

**Verification**: 验证命令或验证方法

- [ ] Step 1: 具体操作
- [ ] Step 2: 验证通过

## Delegation Strategy

<!--
  ⚠️ 委派策略规范：
  
  **何时必须填写**：
  - Plan 有 2+ Task 或 Complexity = High 时必须填写
  - 单一 Task + Complexity ≠ High 时可写 N/A
  
  **批次划分原则**：
  - 无依赖的 Task 放同一批次并行执行
  - 有依赖关系的 Task 按依赖顺序分批次
  - 每个批次标明执行者（Wopal / fae）
  
  **委派规范**：
  - 委派给 fae 时必须遵循 fae-collab 技能规范（委派、监控、验证边界）
  - 涉及自身行为的技能内容优化 → Wopal 自己做
  - 通用代码编写、文件操作 → 委派给 fae
-->

| 批次 | Task | 执行者 | 依赖 |
|------|------|--------|------|
| 1 | Task 1 | fae | 无 |
| 1 | Task 2 | fae | 无 |
| _ | _ | _ | _ |

<!-- 或简单填写：N/A — 单一任务，无需并行委派 -->

## Test Plan

<!--
  ⚠️ 执行级测试规范 - 必须遵守以下结构：
  
  **最小可执行 Case 骨架**（每个保留的测试用例必须包含）：
  - Case 标题（##### Case <ID>: <简短描述>）
  - Goal: 测试目标（一句话）
  - Fixture: 测试前置条件（文件路径、环境状态、数据）
  - Execution: 执行步骤（用 - [ ] Step N: 描述）
  - Expected Evidence: 通过的证据（输出特征、文件状态、返回码）
  
  **类别标题规范**：
  - 类别标题可选，若写必须英文：`#### Unit Tests` / `#### Integration Tests` / `#### E2E Tests` / `#### Regression Tests`
  - 不写类别标题时，直接写 `##### Case U1: ...`、`##### Case I1: ...`
  
  **宁缺毋滥原则**：
  - 某类测试无必要时，写 `N/A — 理由`，不要凑数
  - 禁止只有空洞 bullet（如 "- 单元测试通过"）而没有具体 Case
-->

#### Unit Tests

<!-- 如无必要，写：N/A — 理由 -->

##### Case U1: <简短描述>
- Goal: <测试目标>
- Fixture: <前置条件，如 `.tmp/xxx/` fixture 目录、环境变量>
- Execution:
  - [ ] Step 1: <具体操作>
  - [ ] Step 2: <验证通过判定>
- Expected Evidence: <通过的证据，如输出特征、返回码>

#### Integration Tests

<!-- 如无必要，写：N/A — 理由 -->

##### Case I1: <简短描述>
- Goal: <测试目标>
- Fixture: <前置条件>
- Execution:
  - [ ] Step 1: <具体操作>
  - [ ] Step 2: <验证通过判定>
- Expected Evidence: <通过的证据>

#### E2E Tests

<!-- 如无必要，写：N/A — 理由 -->

##### Case E1: <简短描述>
- Goal: <测试目标>
- Fixture: <前置条件>
- Execution:
  - [ ] Step 1: <具体操作>
  - [ ] Step 2: <验证通过判定>
- Expected Evidence: <通过的证据>

#### Regression Tests

<!-- 如无必要，写：N/A — 理由 -->

##### Case R1: <简短描述>
- Goal: <确认变更不破坏现有功能>
- Fixture: <受影响功能点>
- Execution:
  - [ ] Step 1: <验证方法>
  - [ ] Step 2: <确认通过>
- Expected Evidence: <通过的证据>

### Adjustment Strategy

<!--
  实施中发现问题时的应对策略（可选章节）：
  简单任务可写：N/A — 单一任务，无复杂阻塞场景
-->

## Acceptance Criteria

### Agent Verification

<!-- 
  ⚠️ 强制要求：Agent 完成实施后必须验证并打勾
  flow.sh complete 会校验此子章节的 checkbox 是否全部勾选
-->
- [ ] <Agent 可验证项 1：如代码构建通过>
- [ ] <Agent 可验证项 2：如单元测试通过>

### User Validation

<!--
  ⚠️ 用户验证规范 - 必须遵守以下结构：
  
  **用户场景骨架**（每个场景必须包含）：
  - Scenario 标题（#### Scenario N: <简短描述>）
  - Goal: 本次变更后用户能感知到什么行为差异
  - Precondition: 验证前的前置状态
  - User Actions: 用户操作步骤
  - Expected Result: 用户可观察到的结果
  
  **设计原则**：
  - 优先挑选 1-3 个本次变更直接影响的可感知行为
  - 不写内部实现细节（如函数调用、脚本路径）
  - 不凑数——不需要覆盖每个 Task
  - **排除自动化验证项**：编译、单测、CLI 自测等 Agent 可验证的项不写在此节，此节只含人工感知验证
  
  **最终确认 checkbox**：
  - 下方唯一的 checkbox 是 verify --confirm 的硬 gate
  - 只有用户本人在实际完成场景验证后才能勾选
  - Agent 禁止代为勾选（违反 = 严重失职）
-->

#### Scenario 1: <本次变更影响的可感知行为>
- Goal: <确认什么行为差异>
- Precondition: <验证前的前置状态>
- User Actions:
  1. <用户操作步骤>
  2. <观察结果>
- Expected Result: <用户可观察到的预期结果>

- [ ] 用户已完成上述功能验证并确认结果符合预期
