# Capability: wopal-cli-skills-lock-management

## Purpose

统一管理项目级与全局级技能锁文件，保证安装状态、来源信息与版本指纹可追溯。

## Requirements

### Requirement: 管理两个锁文件（统一 v3 格式）

系统应当管理两个锁文件，**两者都使用 v3 格式**（简化设计，便于维护）。

#### Scenario: 项目级锁文件路径由配置中心管理
- **WHEN** 系统需要获取或写入项目级锁文件
- **THEN** 锁文件路径必须由 `ConfigService.getProjectLockPath()` 返回
- **AND** 该方法实现逻辑为：`${ConfigService.getSkillsInstallDir()}/.skill-lock.json`
- **AND** `getSkillsInstallDir()` 优先级为：环境变量 `WOPAL_SKILLS_DIR` > 配置文件 `skillsDir` > 默认值 `.wopal/skills`
- **AND** 项目级锁文件应当被提交到版本控制

#### Scenario: 项目级锁文件格式
- **WHEN** 系统写入项目级锁文件
- **THEN** 锁文件格式为 v3（与全局锁相同）：
  ```json
  {
    "version": 3,
    "skills": {
      "<skill-name>": {
        "source": "...",
        "sourceType": "...",
        "sourceUrl": "...",
        "skillPath": "...",
        "skillFolderHash": "...",
        "installedAt": "...",
        "updatedAt": "..."
      }
    }
  }
  ```
- **AND** 技能字典按字母排序（减少 Git 合并冲突）

#### Scenario: 全局级锁文件
- **WHEN** 系统安装或更新技能（项目级或全局级）
- **THEN** 全局级锁文件必须存储在 `~/.agents/.skill-lock.json`
- **AND** 全局级锁文件格式为 v3（与项目锁相同）：
  ```json
  {
    "version": 3,
    "skills": {
      "<skill-name>": {
        "source": "...",
        "sourceType": "...",
        "sourceUrl": "...",
        "skillPath": "...",
        "skillFolderHash": "...",
        "installedAt": "...",
        "updatedAt": "..."
      }
    },
    "dismissed": {
      "findSkillsPrompt": true
    }
  }
  ```
- **AND** `dismissed` 字段记录用户忽略的提示（仅全局锁需要）

#### Scenario: 两个锁文件格式统一
- **WHEN** 技能安装成功
- **THEN** 全局锁和项目锁使用**完全相同的 v3 格式**
- **AND** 两者的 `SkillLockEntry` 字段完全一致
- **AND** 唯一差异是文件位置（`~/.agents/.skill-lock.json` vs `./agents/.skill-lock.json`）和 `dismissed` 字段（仅全局锁有）

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

### Requirement: 锁文件条目包含完整信息

系统应当为每个技能记录完整的源头和安装信息。

#### Scenario: 远程技能锁文件条目
- **WHEN** 安装 GitHub 技能
- **THEN** 锁文件条目（全局或项目级）必须包含：
  - source（"owner/repo"）
  - sourceType（"github"）
  - sourceUrl（完整 GitHub URL）
  - skillPath（仓库内路径）
  - skillFolderHash（GitHub Tree SHA，从 .source.json 读取）
  - installedAt（ISO 时间戳）
  - updatedAt（ISO 时间戳）

#### Scenario: 本地技能锁文件条目
- **WHEN** 安装 my-skills 技能
- **THEN** 锁文件条目（全局或项目级）必须包含：
  - source（"my-skills/<skill-name>"）
  - sourceType（"local"）
  - sourceUrl（本地路径）
  - skillPath（"my-skills/<skill-name>"）
  - skillFolderHash（源码 hash，computeSkillFolderHash 计算）
  - installedAt（ISO 时间戳）
  - updatedAt（ISO 时间戳）

### Requirement: 原子写入锁文件

系统应当原子写入锁文件以避免损坏。

#### Scenario: 原子写入
- **WHEN** 系统更新锁文件
- **THEN** 系统必须先写入临时文件
- **AND** 系统必须原子重命名为最终文件名

#### Scenario: 项目级锁文件字母排序
- **WHEN** 系统写入项目级锁文件
- **THEN** 技能条目必须按字母排序
- **AND** 这样可以减少 Git 合并冲突

### Requirement: 处理锁文件错误

系统应当妥善处理锁文件相关的错误。

#### Scenario: 锁文件不存在
- **WHEN** 用户运行 `wopal skills list` 但锁文件不存在
- **THEN** 系统显示"无已安装技能"

#### Scenario: 锁文件格式错误
- **WHEN** 锁文件 JSON 格式错误
- **THEN** 系统显示错误"锁文件格式错误"
- **AND** 系统建议重新安装技能

#### Scenario: Agent 目录与锁文件不一致
- **WHEN** Agent 目录存在但锁文件中无对应条目
- **THEN** 系统显示警告"发现未追踪的技能"
- **AND** 系统建议运行 `wopal skills install` 重新安装

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
