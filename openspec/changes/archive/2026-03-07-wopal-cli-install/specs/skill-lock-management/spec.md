## ADDED Requirements

### Requirement: 管理两个锁文件（统一 v3 格式）

系统应当管理两个锁文件，**两者都使用 v3 格式**（简化设计，便于维护）。

#### Scenario: 项目级锁文件
- **WHEN** 系统安装或更新技能（项目级或全局级）
- **THEN** 项目级锁文件必须存储在 `./skills-lock.json`
- **AND** 项目级锁文件应当被提交到版本控制
- **AND** 项目级锁文件格式为 v3（与全局锁相同）：
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
- **AND** 唯一差异是文件位置（`~/.agents/` vs `./`）和 `dismissed` 字段（仅全局锁有）

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

### Requirement: 列出已安装技能

系统应当支持列出所有已安装的技能。

#### Scenario: 列出所有技能
- **WHEN** 用户运行 `wopal skills list`
- **THEN** 系统读取两个锁文件并显示所有技能
- **AND** 系统显示每个技能的名称、源头类型、安装时间、范围（项目级/全局级）

#### Scenario: 只列出项目级技能
- **WHEN** 用户运行 `wopal skills list --local`
- **THEN** 系统只显示项目级锁文件中的技能

#### Scenario: 只列出全局级技能
- **WHEN** 用户运行 `wopal skills list --global`
- **THEN** 系统只显示全局级锁文件中的技能

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

### Requirement: 版本指纹机制（远程 vs 本地）

系统应当根据技能来源使用不同的版本指纹计算方式，但**无论安装到全局还是项目级，都使用相同的字段 `skillFolderHash`**。

#### Scenario: 远程技能版本指纹
- **WHEN** 安装 INBOX 技能（远程）
- **THEN** 系统从 `INBOX/<skill>/.source.json` 的 `skillFolderHash` 字段读取（GitHub Tree SHA）
- **IF** `.source.json` 不包含 `skillFolderHash`，系统调用 `fetchSkillFolderHash(ownerRepo, skillPath, token)` 获取
- **AND** 全局锁和项目锁的 `skillFolderHash` 字段都存储该值

#### Scenario: 本地技能版本指纹
- **WHEN** 安装 my-skills 技能（本地）
- **THEN** 系统调用 `computeSkillFolderHash()` 计算源码 hash（SHA-256）
- **AND** 全局锁和项目锁的 `skillFolderHash` 字段都存储该值

#### Scenario: 版本指纹字段统一
- **WHEN** 技能安装成功
- **THEN** 全局锁和项目锁都使用 `skillFolderHash` 字段
- **AND** 两个锁文件中的 `skillFolderHash` 值完全相同
- **AND** 差异仅在于指纹来源（远程=GitHub Tree SHA，本地=SHA-256）
