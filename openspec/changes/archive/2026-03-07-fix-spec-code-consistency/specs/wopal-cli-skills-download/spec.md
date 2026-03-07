# Spec Delta: wopal-cli-skills-download

**Change**: fix-spec-code-consistency
**Type**: MODIFIED
**Base Spec**: openspec/specs/wopal-cli-skills-download/spec.md

---

## MODIFIED Requirements

### Requirement: INBOX 元数据

系统 SHALL 为每个下载的技能保存完整的元数据，结构定义参见 `wopal-cli-skills-lock-management` 规格中的 SkillMetadata 接口定义。

#### Scenario: 保存元数据
- **WHEN** 系统下载技能到 `INBOX/skill-name/`
- **THEN** 系统创建 `INBOX/skill-name/.source.json`
- **AND** 元数据结构遵循 `wopal-cli-skills-lock-management` 规格中定义的 SkillMetadata 接口

#### Scenario: GitHub Tree SHA 获取
- **WHEN** 系统下载 GitHub 仓库的技能
- **THEN** 系统按照 `wopal-cli-skills-lock-management` 规格中的远程技能版本指纹机制获取 GitHub Tree SHA
- **AND** 将 Tree SHA 存储到 `.source.json` 的 `skillFolderHash` 字段

#### Scenario: 指定分支下载
- **WHEN** 用户运行 `wopal skills download owner/repo@skill-name --branch develop`
- **THEN** 元数据中 `ref` 字段记录为 `"develop"`
- **AND** 版本指纹按照 `wopal-cli-skills-lock-management` 规格中的指定分支获取逻辑处理

#### Scenario: 指定标签下载
- **WHEN** 用户运行 `wopal skills download owner/repo@skill-name --tag v1.2.3`
- **THEN** 版本指纹按照 `wopal-cli-skills-lock-management` 规格中的指定标签获取逻辑处理

#### Scenario: 默认分支下载
- **WHEN** 用户未指定分支或标签
- **THEN** 版本指纹按照 `wopal-cli-skills-lock-management` 规格中的默认分支获取逻辑处理

#### Scenario: GitHub Token 认证（可选）
- **WHEN** 系统调用 GitHub API
- **THEN** Token 获取逻辑参见 `wopal-cli-skills-lock-management` 规格中的 GitHub Token 认证机制

#### Scenario: 元数据向后兼容
- **WHEN** check 或 update 命令读取 `.source.json`
- **AND** 文件缺少 `skillFolderHash` 字段（旧版本下载）
- **THEN** 兼容处理逻辑参见 `wopal-cli-skills-lock-management` 规格中的元数据向后兼容机制
