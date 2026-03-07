## ADDED Requirements

> Target: `openspec/specs/wopal-cli-core/spec.md`

### Requirement: CLI 框架初始化

系统应当在启动时初始化 CLI 框架。

#### Scenario: 加载环境变量
- **WHEN** CLI 启动
- **THEN** 系统从 `~/.wopal/.env` 加载环境变量

#### Scenario: 调试模式
- **WHEN** 用户运行 `wopal skills --debug` 或 `wopal skills -d`
- **THEN** 系统从 cwd 目录下的 `.env` 加载环境变量
- **AND** 系统将日志输出到 cwd 目录下的 `logs/` 目录

#### Scenario: 显示完整帮助
- **WHEN** 用户运行 `wopal skills --help` 或 `wopal skills -h`
- **THEN** 系统显示完整的命令帮助信息
- **AND** 帮助信息包含所有可用命令及其用法
- **AND** 帮助信息格式清晰，适合 AI agent 阅读

#### Scenario: 显示子命令帮助
- **WHEN** 用户运行 `wopal skills inbox -h` 或 `wopal skills inbox --help`
- **THEN** 系统显示 inbox 子命令的详细帮助
- **AND** 帮助信息包含 list、show、remove 的用法和参数

#### Scenario: 显示版本
- **WHEN** 用户运行 `wopal skills --version`
- **THEN** 系统显示 CLI 版本号

### Requirement: INBOX 路径配置

系统应当支持通过环境变量配置 INBOX 路径。

#### Scenario: 使用环境变量配置 INBOX 路径
- **WHEN** 环境变量 `SKILL_INBOX_DIR` 已设置
- **THEN** 系统使用该路径作为 INBOX 目录
- **AND** 默认路径为 `~/.wopal/skills/INBOX`

### Requirement: 列出 INBOX 技能

系统应当支持列出 INBOX 中的所有技能。

#### Scenario: 列出 INBOX 技能
- **WHEN** 用户运行 `wopal skills inbox list`
- **THEN** 系统显示 INBOX 中的所有技能名称和文件大小

#### Scenario: INBOX 为空
- **WHEN** INBOX 中无技能
- **THEN** 系统显示"INBOX 为空"

### Requirement: 显示 INBOX 技能详情

系统应当支持显示 INBOX 技能的详细信息。

#### Scenario: 显示技能详情
- **WHEN** 用户运行 `wopal skills inbox show skill-name`
- **THEN** 系统显示 SKILL.md 内容和技能目录结构

#### Scenario: 技能目录无效
- **WHEN** 技能目录存在但缺少 SKILL.md
- **THEN** 系统显示警告"无效的技能目录"

### Requirement: 删除 INBOX 技能

系统应当支持删除 INBOX 中的单个技能。

#### Scenario: 删除单个技能
- **WHEN** 用户运行 `wopal skills inbox remove skill-name`
- **THEN** 系统删除 INBOX/<skill-name> 目录
- **AND** 系统保留 INBOX 目录本身
- **AND** 系统不删除 `.agents/skills/` 中已安装的技能

### Requirement: 列出所有技能

系统应当支持列出所有技能（INBOX 已下载 + 已安装）。

#### Scenario: 列出所有技能
- **WHEN** 用户运行 `wopal skills list`
- **THEN** 系统显示所有技能（INBOX 已下载 + 已安装）
- **AND** 系统区分显示技能状态（已下载/已安装）

#### Scenario: 显示技能详细信息
- **WHEN** 用户运行 `wopal skills list --info`
- **THEN** 系统显示技能的 description
- **AND** 系统显示技能状态和路径

### Requirement: 透传命令到 Skills CLI

系统应当提供透传功能，将特定命令转发给 Skills CLI，并保持原始输出。

#### Scenario: 透传 find 命令
- **WHEN** 用户运行 `wopal skills find "query"`
- **THEN** 系统调用 `npx skills find "query"`
- **AND** 系统显示原始输出
- **AND** 系统不更新锁文件

#### Scenario: 网络错误
- **WHEN** Skills CLI 因网络问题失败
- **THEN** 系统显示 Skills CLI 的错误信息
