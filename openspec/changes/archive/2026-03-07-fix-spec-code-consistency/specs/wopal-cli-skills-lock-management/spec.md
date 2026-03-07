# Spec Delta: wopal-cli-skills-lock-management

**Change**: fix-spec-code-consistency
**Type**: MODIFIED
**Base Spec**: openspec/specs/wopal-cli-skills-lock-management/spec.md

---

## ADDED Requirements

### Requirement: SkillMetadata 接口定义（单一真相来源）

系统 SHALL 使用统一的 SkillMetadata 结构记录 INBOX 技能元数据（.source.json），作为 download 产出和 install 输入的共享契约。

#### Scenario: SkillMetadata 完整字段
- **WHEN** 系统写入或读取 `INBOX/<skill>/.source.json`
- **THEN** 元数据 MUST 包含以下字段：
  - `name`: 技能名称（字符串）
  - `description`: 技能描述（字符串）
  - `source`: 原始源字符串，如 `owner/repo@skill-name`（字符串）
  - `sourceUrl`: Git 仓库 URL（字符串）
  - `skillPath`: 技能在仓库中的相对路径（字符串）
  - `downloadedAt`: 下载时间戳（ISO 8601 字符串）
  - `skillFolderHash`: GitHub Tree SHA，技能文件夹的树哈希（字符串 | null，可选）
  - `commit`: 实际克隆的 commit SHA，40 字符完整哈希（字符串，可选）
  - `ref`: 用户指定的分支或标签（字符串，可选）
  - `tag`: 语义化标签，如 `v1.2.3`（字符串，可选）

#### Scenario: 元数据向后兼容
- **WHEN** check 或 update 命令读取 `.source.json`
- **AND** 文件缺少 `skillFolderHash` 字段（旧版本下载）
- **THEN** 系统 SHALL 优雅处理，提示用户重新下载以获取完整版本信息
- **AND** 系统不应崩溃或报错

### Requirement: 版本指纹完整机制（单一真相来源）

系统 SHALL 使用版本指纹（`skillFolderHash`）追踪技能版本，无论安装到全局还是项目级都使用相同字段。

#### Scenario: 远程技能版本指纹（GitHub Tree SHA）
- **WHEN** 处理 GitHub 远程技能
- **THEN** 系统 MUST 使用 GitHub Tree SHA 作为版本指纹
- **AND** API 调用格式：`GET /repos/{owner}/{repo}/git/trees/{branch}?recursive=1`
- **AND** 从返回的树结构中提取技能文件夹的 `sha` 字段
- **AND** SHA 为 GitHub 返回的完整树哈希（40 字符十六进制）
- **AND** 该哈希在技能文件夹内任何文件变化时都会改变

#### Scenario: 本地技能版本指纹（SHA-256）
- **WHEN** 处理 my-skills 本地技能
- **THEN** 系统 MUST 调用 `computeSkillFolderHash()` 计算源码 hash（SHA-256）

#### Scenario: 版本指纹回退机制
- **WHEN** `.source.json` 不包含 `skillFolderHash` 字段
- **THEN** 系统 SHALL 调用 `fetchSkillFolderHash(ownerRepo, skillPath, token)` 从 GitHub API 获取
- **IF** 获取失败，`skillFolderHash` 记录为空字符串

#### Scenario: GitHub Token 认证（可选）
- **WHEN** 系统调用 GitHub API
- **THEN** 系统 SHALL 尝试获取 GitHub Token 以提高速率限制
- **AND** Token 来源优先级：
  1. `GITHUB_TOKEN` 环境变量
  2. `GH_TOKEN` 环境变量
  3. `gh auth token` 命令输出
- **AND** 无 Token 时使用匿名请求（速率限制较低）

#### Scenario: 指定分支获取 Tree SHA
- **WHEN** 用户指定分支（如 `--branch develop`）
- **THEN** `skillFolderHash` 从指定分支获取
- **AND** `commit` 字段记录该分支当前 HEAD 的完整 SHA

#### Scenario: 指定标签获取 Tree SHA
- **WHEN** 用户指定标签（如 `--tag v1.2.3`）
- **THEN** `skillFolderHash` 从该标签获取
- **AND** `commit` 字段记录该标签指向的完整 SHA
- **AND** `tag` 字段记录语义化标签值

#### Scenario: 默认分支获取 Tree SHA
- **WHEN** 用户未指定分支或标签
- **THEN** 系统依次尝试 `main`、`master` 分支
- **AND** `skillFolderHash` 从成功获取的分支中提取
- **AND** `commit` 字段记录该分支 HEAD 的完整 SHA

#### Scenario: 版本指纹字段统一
- **WHEN** 技能安装成功
- **THEN** 全局锁和项目锁都使用 `skillFolderHash` 字段
- **AND** 两个锁文件中的 `skillFolderHash` 值完全相同
- **AND** 差异仅在于指纹来源（远程=GitHub Tree SHA，本地=SHA-256）
