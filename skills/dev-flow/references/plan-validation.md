# Plan 校验规则

`flow.sh plan <issue> --check` / `flow.sh plan --title ... --check` 和 `flow.sh approve` 都会走 Plan 质量校验。

## 校验目的

Plan 必须达到“可执行”质量，而不是只有标题和空提纲。校验不通过时，先修 Plan，再推进流程。

## 重点检查项

| 类别 | 要求 |
|------|------|
| 文件命名 | 需符合 plan 命名规范 |
| 占位符 | 不得残留 TODO / FIXME / `path/to/` / `REQ-xxx` 等 |
| 调查充分性 | `Technical Context` 非空，`Affected Files` 已填写 |
| Scope Assessment | `Complexity` / `Confidence` 不能是占位符 |
| Implementation | 至少一个 Task；每个 Task 有 `Verification` |
| Changes 格式 | 使用 `- [ ] Step N:` checkbox 格式 |
| Test Plan | 有结构化 Case，或明确写 `N/A — 理由` |
| User Validation | 至少一个 Scenario + 最终确认 checkbox |

## 使用方式

### Issue 驱动

```bash
flow.sh plan <issue> --check
```

### Plan 驱动

如果是无 Issue 模式，可通过原始 plan 创建参数定位 Plan 再校验：

```bash
flow.sh plan --title "<title>" --project <name> --type <type> --check
```

## 推进规则

- 先 `--check`，再 `approve`
- `approve` 不是第一次检查，而是进入“等待用户评审方案”的节点
- 如果 `approve` 被校验拦下，修好 Plan 后重新执行 `approve`

## Test Plan 章节怎么写

`## Test Plan` 的目标不是凑章节，而是让后续执行者知道怎么验证。

### 推荐骨架

```markdown
##### Case U1: <简短描述>
- Goal: <测试目标>
- Fixture: <前置条件>
- Execution:
  - [ ] Step 1: <具体操作>
  - [ ] Step 2: <验证通过判定>
- Expected Evidence: <通过证据>
```

### 关键要求

- `Execution` 使用 `- [ ] Step N:` 格式
- 每个 Case 至少包含：Goal / Fixture / Execution / Expected Evidence
- 无必要的测试类型可以写：`N/A — 理由`
- 不要只写“测试通过”这类无法执行的描述

### 使用原则

- Unit / Integration / E2E / Regression 标题可写可不写
- 重点是让后续执行者知道怎么验证，而不是凑章节

## Acceptance Criteria 分层

`## Acceptance Criteria` 分为两层：

### 1. Agent Verification

由 agent 在 `complete` 前完成并勾选。

适合放这里的内容：
- 构建通过
- 单元测试通过
- 脚本 / CLI 自测通过

### 2. User Validation

由用户在真实验证后确认。

每个场景建议包含：
- Goal
- Precondition
- User Actions
- Expected Result

并保留最终确认 checkbox：

```markdown
- [ ] 用户已完成上述功能验证并确认结果符合预期
```

### 铁律

- Agent 不得代勾选 User Validation 最终 checkbox
- `verify --confirm` 会严格检查该 checkbox
- 如果用户尚未完成验证，不要推进到 `done`
