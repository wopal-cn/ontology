# 201-fix-empty-testplan

## Metadata

- **Issue**: #201
- **Type**: fix
- **Target Project**: ontology
- **Created**: 2026-04-15
- **Status**: planning

## Scope Assessment

- **Complexity**: Low
- **Confidence**: High

## Goal

测试空洞 Test Plan 的错误情况（只有标题没有可执行结构）。

## Technical Context

无

## In Scope

- 测试 check-doc 对 Test Plan 结构的校验

## Out of Scope

- 无

## Affected Files

| Component | Files | Operation |
|-----------|-------|-----------|
| Test | `tests/fixtures/plans/bad-testplan-empty.md` | create |

## Implementation

### Task 1: 测试用例（故意使用空洞 Test Plan）

**Files**: `bad-testplan-empty.md`

**Changes**:
- [x] Step 1: 创建只有标题没有 Case 结构的 Test Plan
- [x] Step 2: Test Plan 应被 check-doc 拒绝

**Verification**: check_doc_plan 应拒绝此 Plan

## Test Plan

#### 单元测试

- 单元测试：测试基本功能
- 集成测试：测试端到端流程
- E2E 测试：测试完整场景

## Acceptance Criteria

### Agent Verification

- [ ] check-doc 拒绝空洞 Test Plan

### User Validation

#### Scenario 1: N/A

N/A — 此 fixture 用于自动化校验测试