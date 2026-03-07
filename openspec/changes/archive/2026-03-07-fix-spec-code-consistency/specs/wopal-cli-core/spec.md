# Spec Delta: wopal-cli-core

**Change**: fix-spec-code-consistency
**Type**: MODIFIED
**Base Spec**: openspec/specs/wopal-cli-core/spec.md

---

## MODIFIED Requirements

### Requirement: INBOX 路径配置

wopal-cli SHALL 支持通过环境变量配置 INBOX 路径。

#### Scenario: 使用环境变量配置 INBOX 路径
- **WHEN** 环境变量 `WOPAL_SKILL_INBOX_DIR` 已设置
- **THEN** 系统使用该路径作为 INBOX 目录
- **AND** 默认路径为 `~/.wopal/skills/INBOX`
