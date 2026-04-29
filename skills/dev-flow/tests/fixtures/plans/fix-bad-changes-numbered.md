# 200-fix-bad-changes-format

## Metadata

- **Issue**: #200
- **Type**: fix
- **Target Project**: ontology
- **Created**: 2026-04-15
- **Status**: planning

## Scope Assessment

- **Complexity**: Low
- **Confidence**: High

## Goal

测试 **Changes** 块使用编号列表的错误情况。

## Technical Context

无

## In Scope

- 测试 check-doc 对 **Changes** 格式的校验

## Out of Scope

- 无

## Affected Files

| Component | Files | Operation |
|-----------|-------|-----------|
| Test | `tests/fixtures/plans/bad-changes-numbered.md` | create |

## Implementation

### Task 1: 测试用例（故意使用错误的编号列表格式）

**Files**: `bad-changes-numbered.md`

**Changes**:
1. Step 1: 用编号列表代替 checkbox 格式（这是错误的）
2. Step 2: 编号列表不会被 check-doc 接受

**Verification**: check_doc_plan 应拒绝此 Plan

## Test Plan

#### 单元测试

##### Case U1: check-doc 拒绝编号列表格式的 Changes
- Goal: 证明 check_doc_plan 拒绝 1. 2. 3. 编号列表格式
- Fixture: tests/fixtures/plans/bad-changes-numbered.md
- Execution:
  - [ ] Step 1: 运行 check_doc_plan on bad-changes-numbered.md
  - [ ] Step 2: 确认报错指向 **Changes** 格式问题
- Expected Evidence: 退出码 1，错误信息包含 "numbered list"

## Acceptance Criteria

### Agent Verification

- [ ] check-doc 拒绝编号列表格式

### User Validation

#### Scenario 1: N/A
- Goal: 此 fixture 仅用于自动化测试
- Precondition: N/A
- User Actions: N/A
- Expected Result: N/A

N/A — 此 fixture 用于自动化校验测试，无需用户手动验证