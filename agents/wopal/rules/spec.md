---
trigger: model_decision
description: 使用规格驱动开发时加载此规则。
keywords:
  - '*规格*实现*'
  - '*spec*开发*'
---

### OpenSpec 驱动协作

当使用 OpenSpec 规范驱动其他 AI Agent（如 OpenCode）执行任务时。

**核心原则**：
- 创建 OpenSpec 产物（proposal、specs、design、tasks）并传递给执行 Agent
- 完成后**必须更新子项目规范**：将新增能力、架构决策同步到子项目的 `AGENTS.md`

**Capability 命名规范**：
- 格式：`<产品>-<功能域>-<具体能力>`
- 示例：`wopal-cli-skills-download`、`wopal-cli-skills-scan`
- 原则：包含产品/功能前缀，明确归属关系

**详细指南**：参见 `docs/openspec-guide.md`