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

### Task 1: 任务标题

**Files**: `path/to/file`

**Changes**:
1. 具体改动点 1
2. 具体改动点 2

**Verification**: 验证命令或验证方法

- [ ] Step 1: 具体操作
- [ ] Step 2: 验证通过

## Delegation Strategy

<!--
  可选章节：简单任务可填 N/A。
  
  批次划分原则：
  - 无依赖的 Task 放同一批次并行执行
  - 有依赖关系的 Task 按依赖顺序分批次
  - 每个批次标明执行者（Wopal / fae）
-->

| 批次 | Task | 执行者 | 依赖 |
|------|------|--------|------|
| 1 | Task 1 | fae | 无 |
| 1 | Task 2 | fae | 无 |
| _ | _ | _ | _ |

<!-- 或简单填写：N/A — 单一任务，无需并行委派 -->

## Test Plan

#### 单元测试

<!--
  代码级验证，如：
  - 函数边界值测试
  - 模块逻辑测试
  - 工具脚本测试
-->

- <单元测试项 1：目标 / 方法 / 预期结果>
- <单元测试项 2：目标 / 方法 / 预期结果>

#### 集成测试

<!--
  模块间协作验证，如：
  - 命令流程测试（plan → approve → complete → verify）
  - 状态机转换测试
  - Issue/Plan 同步测试
-->

- <集成测试项 1：目标 / 方法 / 预期结果>
- <集成测试项 2：目标 / 方法 / 预期结果>

#### E2E 测试

<!--
  端到端流程验证，如：
  - 完整 dev-flow 流程（plan → approve → complete → verify → archive）
  - 用户实际场景模拟
-->

- <E2E 测试项 1：目标 / 方法 / 预期结果>
- <E2E 测试项 2：目标 / 方法 / 预期结果>

### Regression Testing

<!--
  确认变更不破坏现有功能：
  - 列出受影响的现有功能点
  - 说明如何验证这些功能仍正常工作
  
  简单任务可填 N/A
-->

- <回归验证项 1：受影响功能 / 验证方法>
- <回归验证项 2：受影响功能 / 验证方法>

### Adjustment Strategy

<!--
  实施中发现问题时的应对策略：
  - 遇到阻塞时如何调整方案
  - 哪些部分可以降级处理
  - 哪些部分必须完整实现
  
  简单任务可填 N/A
-->

- <调整方案 1：阻塞情况 / 应对策略>
- <调整方案 2：阻塞情况 / 应对策略>

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
  用户确认项：flow.sh verify --confirm 前需用户验证
  纯文本格式，无需 checkbox
-->
- <用户验证项 1：如重启后功能正常>
- <用户验证项 2：如 UI 交互确认>