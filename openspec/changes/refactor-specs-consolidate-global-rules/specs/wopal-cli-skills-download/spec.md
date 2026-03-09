## MODIFIED Requirements

### Requirement: 命令帮助

系统应当提供完整的命令帮助信息，供 AI Agent 参考。

#### Scenario: 显示帮助
- **WHEN** 用户运行 `wopal skills download --help`
- **THEN** 系统显示：
  - 命令用法
  - 源格式说明
  - 批量下载说明
  - 使用示例
  - 选项说明
  - 工作流程说明

**变更说明**：
- 移除了"**AND** 所有文本使用英文"（重复的全局规范）
- 移除了"**AND** 包含 SOURCE FORMAT / EXAMPLES / OPTIONS / NOTES / WORKFLOW 章节"（重复的全局规范）
- 这些全局规范已由 `config.yaml` 的 `rules.specs` 自动注入
