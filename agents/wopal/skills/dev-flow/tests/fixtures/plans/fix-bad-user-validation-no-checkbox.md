# 202-fix-bad-user-validation

## Metadata

- **Issue**: #202
- **Type**: fix
- **Target Project**: ontology
- **Created**: 2026-04-15
- **Status**: verifying

## Scope Assessment

- **Complexity**: Low
- **Confidence**: High

## Goal

测试缺少最终确认 checkbox 的 User Validation 错误情况。

## Technical Context

无

## In Scope

- 测试 check_user_validation 对 checkbox 的校验

## Out of Scope

- 无

## Affected Files

| Component | Files | Operation |
|-----------|-------|-----------|
| Test | `tests/fixtures/plans/bad-user-validation-no-checkbox.md` | create |

## Implementation

### Task 1: 测试用例（故意缺少 checkbox）

**Files**: `bad-user-validation-no-checkbox.md`

**Changes**:
- [x] Step 1: User Validation 有场景但没有最终确认 checkbox
- [x] Step 2: verify --confirm 应被阻断

**Verification**: check_user_validation 应返回失败

## Test Plan

#### 单元测试

##### Case U1: check_user_validation 拒绝无 checkbox 的 User Validation
- Goal: 证明 check_user_validation 要求最终确认 checkbox
- Fixture: tests/fixtures/plans/bad-user-validation-no-checkbox.md
- Execution:
  - [ ] Step 1: 运行 check_user_validation
  - [ ] Step 2: 确认报错指向缺失 checkbox
- Expected Evidence: 退出码 1，错误信息包含 "final confirmation checkbox"

## Acceptance Criteria

### Agent Verification

- [ ] check_user_validation 拒绝无 checkbox 的 User Validation

### User Validation

#### Scenario 1: 基本功能验证
- Goal: 用户验证功能是否正常
- Precondition: 功能已实现
- User Actions:
  1. 检查功能输出
  2. 确认结果正确
- Expected Result: 功能正常工作

注意：此处故意缺少最终确认 checkbox，用于测试校验逻辑