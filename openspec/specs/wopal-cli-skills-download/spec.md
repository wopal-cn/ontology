# Capability: wopal-cli-skills-download

## Purpose

提供技能下载功能，支持从远程仓库（GitHub、GitLab）下载技能到 INBOX 目录，用于安全扫描后再安装。

**核心设计原则**：将下载、扫描、安装分离为三个独立阶段（不同于官方 Skills CLI 的一步式下载+安装）。

**核心用例**：AI Agent 执行 `find → download` 工作流，直接复制搜索结果到下载命令。

## Requirements

### Requirement: 下载单个技能

系统应当支持从远程仓库下载单个技能到 INBOX。

#### Scenario: 从 find 命令复制粘贴下载
- **WHEN** 用户运行 `wopal skills download owner/repo@skill-name`
- **THEN** 系统下载技能到 `INBOX/skill-name/`
- **AND** 系统显示："✓ Downloaded skill 'skill-name' to INBOX"

#### Scenario: 技能已存在
- **WHEN** `INBOX/skill-name/` 已存在
- **THEN** 系统显示错误："Skill 'skill-name' already exists in INBOX"
- **AND** 系统提示："Use --force to overwrite"

#### Scenario: 使用 --force 覆盖
- **WHEN** 用户运行 `wopal skills download owner/repo@skill-name --force`
- **THEN** 系统覆盖已存在的技能
- **AND** 系统显示："✓ Downloaded skill 'skill-name' to INBOX (overwritten)"

### Requirement: 批量下载技能

系统应当支持一次下载多个技能。

#### Scenario: 下载多个技能（多个参数）
- **WHEN** 用户运行 `wopal skills download owner/repo@skill1 owner/repo@skill2`
- **THEN** 系统下载所有指定的技能
- **AND** 系统显示："✓ Downloaded 2 skills to INBOX"

#### Scenario: 下载多个技能（逗号分隔）
- **WHEN** 用户运行 `wopal skills download owner/repo@skill1,skill2,skill3`
- **THEN** 系统下载所有指定的技能
- **AND** 系统显示："✓ Downloaded 3 skills to INBOX"

#### Scenario: 混合格式
- **WHEN** 用户运行 `wopal skills download owner1/repo1@skill1 owner2/repo2@skill2 owner1/repo1@skill3,skill4`
- **THEN** 系统下载所有指定的技能（来自不同仓库）
- **AND** 系统显示："✓ Downloaded 4 skills to INBOX"

#### Scenario: 部分技能已存在（不使用 --force）
- **WHEN** 用户运行 `wopal skills download owner/repo@skill1,skill2`
- **AND** `skill1` 已存在
- **THEN** 系统显示错误："Skill 'skill1' already exists in INBOX"
- **AND** 系统提示："Use --force to overwrite all skills"

#### Scenario: 部分技能已存在（使用 --force）
- **WHEN** 用户运行 `wopal skills download owner/repo@skill1,skill2 --force`
- **AND** `skill1` 已存在
- **THEN** 系统覆盖所有技能
- **AND** 系统显示："✓ Downloaded 2 skills to INBOX (overwritten)"

### Requirement: 源格式验证

系统应当验证源格式的正确性。

#### Scenario: 必须包含技能名称
- **WHEN** 用户运行 `wopal skills download owner/repo`
- **THEN** 系统显示错误："Missing skill name"
- **AND** 系统提示："Use format: owner/repo@skill-name"
- **AND** 系统显示示例："Example: owner/repo@my-skill"

#### Scenario: 拒绝本地路径
- **WHEN** 用户运行 `wopal skills download ./skill`
- **THEN** 系统显示错误："Local paths are not supported by download command"
- **AND** 系统提示："Use 'wopal skills install <path>' to install local skills"

#### Scenario: 格式错误
- **WHEN** 用户运行 `wopal skills download invalid-format`
- **THEN** 系统显示错误："Invalid source format"
- **AND** 系统提示："Use format: owner/repo@skill-name"

### Requirement: 错误处理

系统应当提供清晰的错误提示。

#### Scenario: 技能不存在
- **WHEN** 指定的技能在仓库中不存在
- **THEN** 系统显示错误："Skill 'skill-name' not found in repository 'owner/repo'"
- **AND** 系统显示可用技能列表

#### Scenario: 仓库不存在或无权限
- **WHEN** 仓库不存在或用户无访问权限
- **THEN** 系统显示错误："Repository 'owner/repo' not found or access denied"
- **AND** 系统提示："Check repository name and your access permissions"

#### Scenario: 网络错误
- **WHEN** 网络连接失败
- **THEN** 系统显示错误："Network error. Please check your internet connection"

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

**帮助信息应包含**：

```
Usage: wopal skills download <source>...

Download skills to INBOX for security scanning before installation.

SOURCE FORMAT:
  owner/repo@skill-name            Download single skill
  owner/repo@skill1,skill2,...     Download multiple skills from same repo

BATCH DOWNLOAD:
  # Multiple sources (space-separated)
  wopal skills download owner/repo@skill1 owner/repo@skill2

  # Multiple skills from same repo (comma-separated)
  wopal skills download owner/repo@skill1,skill2,skill3

  # Mixed formats
  wopal skills download owner1/repo1@skill1 owner2/repo2@skill2

EXAMPLES:
  # Download single skill (copy from 'wopal skills find' output)
  wopal skills download forztf/open-skilled-sdd@openspec-proposal-creation

  # Download multiple skills from same repository
  wopal skills download forztf/open-skilled-sdd@openspec-proposal-creation,openspec-implementation

  # Download multiple skills from different repositories
  wopal skills download \
    forztf/open-skilled-sdd@openspec-proposal-creation \
    itechmeat/llm-code@openspec

OPTIONS:
  --force    Overwrite existing skills in INBOX
  --help     Show this help message

NOTES:
  - Skills are downloaded to INBOX for security scanning
  - Use 'wopal skills scan <skill-name>' to scan skills in INBOX
  - Use 'wopal skills install <skill-name>' to install scanned skills
  - Local paths are not supported (use 'install' command instead)

WORKFLOW:
  1. Find skills:   wopal skills find <keyword>
  2. Download:      wopal skills download <source>...
  3. Scan:          wopal skills scan <skill-name>
  4. Install:       wopal skills install <skill-name>
```

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
