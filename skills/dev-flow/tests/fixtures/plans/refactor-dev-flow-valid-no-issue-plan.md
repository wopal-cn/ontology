# refactor-dev-flow-optimize-helper-functions

## Metadata

- **Type**: refactor
- **Target Project**: ontology
- **Created**: 2026-04-15
- **Status**: planning

## Scope Assessment

- **Complexity**: Medium
- **Confidence**: High

## Goal

优化 helper 函数，减少重复代码，提升可维护性。

## Technical Context

无特殊技术上下文

## In Scope

- 合并重复的 body 拼装逻辑
- 清理无效变量

## Out of Scope

- 不改变对外行为

## Affected Files

| Component | Files | Operation |
|-----------|-------|-----------|
| Helper | `lib/issue.sh` | modify |

## Implementation

### Task 1: 合并重复 body 拼装逻辑

**Files**: `lib/issue.sh`

**Changes**:
- [x] Step 1: 抽取共享 _render_issue_section helper
- [x] Step 2: 让 build_structured_issue_body 和模板共用 renderer

**Verification**: 对比三路输出确认 section 一致

## Test Plan

#### 单元测试

##### Case U1: check-doc 接受无 Issue plan 命名
- Goal: 证明 check_doc_plan 接受 <type>-<slug>.md 格式
- Fixture: tests/fixtures/plans/valid-no-issue-plan.md
- Execution:
  - [ ] Step 1: 运行 check_doc_plan on valid-no-issue-plan.md
  - [ ] Step 2: 确认通过无报错
- Expected Evidence: 退出码 0，提示 File name format: valid

## Acceptance Criteria

### Agent Verification

- [x] 无 Issue plan 通过 check_doc_plan 校验

### User Validation

#### Scenario 1: 无 Issue plan 可正常审批
- Goal: 确认无 Issue 工作流不受影响
- Precondition: Plan 文件命名正确，内容完整
- User Actions:
  1. 执行 flow.sh approve refactor-optimize-helper-functions --confirm
  2. 检查是否正常进入 executing 状态
- Expected Result: 审批成功，状态变为 executing

- [x] 用户已完成上述功能验证并确认结果符合预期