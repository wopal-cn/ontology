# 100-feature-old-plan-format

## Metadata

- **Issue**: #100
- **Type**: feature
- **Target Project**: ontology
- **Created**: 2025-01-01
- **Status**: done

## Scope Assessment

- **Complexity**: Medium
- **Confidence**: High

## Goal

旧格式 Plan 测试 fixture，用于验证向后兼容性。

## Technical Context

旧格式无结构化子段落

## In Scope

- 测试旧 Plan 的 check-doc 校验

## Out of Scope

- 无

## Affected Files

| Component | Files | Operation |
|-----------|-------|-----------|
| Test | `tests/fixtures/plans/old-plan-no-techcontext.md` | create |

## Implementation

### Task 1: 旧格式测试用例

**Files**: `old-plan-no-techcontext.md`

**Changes**:
- [x] Step 1: 使用旧格式（无 Technical Context 命名子段落）
- [x] Step 2: 应被 check-doc 放行（向后兼容）

**Verification**: check_doc_plan 应通过

## Test Plan

#### 单元测试

##### Case U1: 旧 Plan 通过 check-doc
- Goal: 证明旧格式 Plan 仍被接受
- Fixture: tests/fixtures/plans/old-plan-no-techcontext.md
- Execution:
  - [ ] Step 1: 运行 check_doc_plan
  - [ ] Step 2: 确认通过
- Expected Evidence: 退出码 0

## Acceptance Criteria

### Agent Verification

- [x] 旧 Plan 通过 check-doc 校验

### User Validation

#### Scenario 1: N/A

N/A — 此 fixture 用于向后兼容测试