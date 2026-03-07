## ADDED Requirements

### Requirement: 统一版本指纹机制

系统 MUST 使用统一的版本指纹机制追踪技能版本，无论安装到全局还是项目级。

#### Scenario: 远程技能版本指纹
- **WHEN** 安装 GitHub 技能
- **THEN** 系统必须使用 GitHub Tree SHA 作为版本指纹
- **AND** 全局锁和项目级锁使用相同的 Tree SHA
- **AND** 系统通过 `fetchSkillFolderHash(ownerRepo, skillPath, token)` 获取

#### Scenario: 本地技能版本指纹
- **WHEN** 安装 my-skills 技能
- **THEN** 系统必须使用源码 hash 作为版本指纹
- **AND** 全局锁和项目级锁使用相同的 hash
- **AND** 系统通过 `computeSkillFolderHash(my-skills/skill-name)` 计算

### Requirement: 检测远程技能更新（使用 GitHub Tree SHA）

系统 MUST 通过比较 GitHub Tree SHA 检测远程技能更新。

#### Scenario: 获取远程最新 Tree SHA
- **WHEN** 用户运行 `wopal skills check skill-name`（远程技能）
- **THEN** 系统从全局锁读取 source 和 skillPath
- **AND** 系统调用 `fetchSkillFolderHash(ownerRepo, skillPath, token)` 获取最新 Tree SHA

#### Scenario: 比较 Tree SHA 检测更新
- **WHEN** 系统获取到最新 Tree SHA
- **THEN** 系统比较最新 Tree SHA 与全局锁的 skillFolderHash
- **AND** 如果相同，标记为 "up-to-date"
- **AND** 如果不同，标记为 "update-available"

### Requirement: 检测本地技能变更（使用源码 hash）

系统 MUST 通过比较源码 hash 检测本地技能变更。

#### Scenario: 读取本地技能路径
- **WHEN** 检查本地技能（sourceType: "local"）
- **THEN** 系统从锁文件的 `sourceUrl` 字段读取绝对路径
- **AND** 系统调用 `computeSkillFolderHash(sourceUrl)` 计算最新 hash

#### Scenario: 计算源码最新 hash
- **WHEN** 系统调用 `computeSkillFolderHash(absolutePath)`
- **THEN** 系统递归遍历技能文件夹
- **AND** 系统计算所有文件的 SHA-256 hash（排除 .git、node_modules 等目录）
- **AND** 系统合并所有文件 hash 为最终的文件夹 hash

#### Scenario: 比较 hash 检测变更
- **WHEN** 系统计算完最新 hash
- **THEN** 系统比较最新 hash 与锁文件的 `skillFolderHash`
- **AND** 如果相同，标记为 "up-to-date"
- **AND** 如果不同，标记为 "source-changed"

### Requirement: 检查所有已安装技能

系统 MUST 支持检查所有已安装技能的源头变更。

#### Scenario: 检查所有技能（默认）
- **WHEN** 用户运行 `wopal skills check`
- **THEN** 系统合并项目锁（`./skills-lock.json`）和全局锁（`~/.agents/.skill-lock.json`）
- **AND** 系统去重后检查所有技能的源头变更
- **AND** 系统显示变更报告

#### Scenario: 只检查项目级技能
- **WHEN** 用户运行 `wopal skills check --local`
- **THEN** 系统只读取项目锁（`./skills-lock.json`）
- **AND** 系统只检查项目级技能的源头变更

#### Scenario: 只检查全局级技能
- **WHEN** 用户运行 `wopal skills check --global`
- **THEN** 系统只读取全局锁（`~/.agents/.skill-lock.json`）
- **AND** 系统只检查全局级技能的源头变更（排除项目锁中的技能）

#### Scenario: 检查指定技能
- **WHEN** 用户运行 `wopal skills check skill-name`
- **THEN** 系统从合并的锁文件中查找指定技能
- **AND** 系统只检查该技能的源头变更

### Requirement: 生成变更报告

系统 MUST 生成清晰的变更报告。

#### Scenario: 显示检查进度
- **WHEN** 检查多个技能
- **THEN** 系统显示 "Checking skill 1/50: skill-name"
- **AND** 系统显示 "Fetching GitHub Tree SHA..."（远程技能）
- **OR** 系统显示 "Computing local hash..."（本地技能）
- **AND** 系统显示进度百分比

#### Scenario: 变更报告格式
- **WHEN** 检查完成
- **THEN** 系统必须按以下格式显示每个技能的：
  - 技能名称
  - 源头类型（github/local）
  - 已安装版本（skillFolderHash 前 8 位）
  - 最新版本（最新 hash 前 8 位）
  - 状态（up-to-date/update-available/source-missing）

#### Scenario: 无变更时显示提示
- **WHEN** 所有技能都是最新版本
- **THEN** 系统显示"所有技能都是最新版本"

#### Scenario: 建议更新操作
- **WHEN** 检测到技能有更新
- **THEN** 系统在变更报告中建议更新命令
- **AND** 系统显示"运行 'wopal skills update --all' 更新所有技能"
- **OR** 系统显示"运行 'wopal skills update <skill-name>' 更新指定技能"

#### Scenario: 详细报告格式
- **WHEN** 检查完成且有变更
- **THEN** 系统按以下格式输出：

```
Skills Source Tracking Report
=============================

✓ up-to-date (45 skills)
  - skill-name-1 [github] installed: a1b2c3d4 latest: a1b2c3d4
  - skill-name-2 [local] installed: e5f6g7h8 latest: e5f6g7h8
  ...

⚠ update-available (3 skills)
  - skill-name-3 [github] installed: i9j0k1l2 latest: m3n4o5p6
    → Run: wopal skills update skill-name-3

✗ source-missing (2 skills)
  - skill-name-4 [local] path: /path/to/skill (not found)
    → Source code has been moved or deleted

Summary: 45 up-to-date, 3 updates available, 2 source missing
```
- **AND** 技能按字母排序显示
- **AND** 状态使用颜色标识（✓ 绿色、⚠ 黄色、✗ 红色）

### Requirement: 不依赖文件时间戳

系统 MUST 使用 hash 而非文件时间戳进行变更检测。

#### Scenario: 使用 hash 而非时间戳
- **WHEN** 系统检测变更
- **THEN** 系统必须使用 sourceHash（Tree SHA 或 content hash）
- **AND** 系统不得依赖文件修改时间（不可靠）

### Requirement: 处理检查错误

系统 MUST 妥善处理检查过程中的错误。

#### Scenario: GitHub API 限流
- **WHEN** GitHub API 请求被限流
- **THEN** 系统显示警告"GitHub API 限流，稍后重试"
- **AND** 系统建议等待或使用 GitHub Token

#### Scenario: 本地源码路径不存在
- **WHEN** my-skills 源码路径不存在
- **THEN** 系统标记技能为"source-missing"
- **AND** 系统显示警告"源码路径不存在"

#### Scenario: 锁文件损坏
- **WHEN** 锁文件格式错误或损坏
- **THEN** 系统显示错误"锁文件损坏"
- **AND** 系统建议重新安装技能
