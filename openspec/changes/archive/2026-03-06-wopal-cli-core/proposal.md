## Why

Skills CLI 官方不支持 INBOX 隔离工作流（下载 → 安全扫描 → 评估 → 部署），直接安装技能到 agent 目录。我们需要一个**完全独立的 CLI 工具**，借鉴 Skills CLI 的核心代码实现完整功能，同时添加安全扫描和源头变更追踪。

wopal-cli-core 是这个工具的核心基础设施，为后续所有命令（download、scan、install、check、update）提供底层支持。

核心设计原则：
1. **技术栈灵活**：使用 TypeScript + ES modules，可选用 CLI 框架（commander.js/yargs）简化实现
2. **完全独立**：不依赖外部 CLI（npx skills），所有功能内置实现
3. **INBOX 隔离**：提供临时隔离区，支持"下载 → 扫描 → 评估 → 安装"工作流
4. **透传兼容**：透传功能方便用户从 Skills CLI 迁移

## Reference

### Skills CLI 源代码（作为参考，复用技术栈）
- `playground/_good_repos/skills/` - Skills CLI 完整源码
  - 技术栈：TypeScript + ES modules + obuild + picocolors
  - 架构设计：CLI 框架、命令路由、工具函数组织
  - 关键文件：
    - `src/cli.ts` - CLI 入口和命令路由
    - `src/agents.ts` - Agent 定义
    - `src/installer.ts` - 安装逻辑
    - `src/skills.ts` - 技能发现
    - `src/git.ts` - Git 操作
    - `package.json` - 依赖和构建配置

### 依赖关系
- **无外部依赖**：wopal-cli-core 是第一个变更，不依赖其他变更
- **被依赖**：所有后续变更（download、scan、install、check、update）都依赖 wopal-cli-core

## What Changes

### 新增
- **wopal skills CLI 框架**: TypeScript + ES modules + obuild 构建的命令行框架
  - 技术栈：与 Skills CLI 完全一致（TypeScript, obuild, picocolors, simple-git, gray-matter）
  - 命令格式：`wopal skills <subcommand>`
  - 帮助命令：`--help` / `-h` 显示完整命令帮助（适合 AI agent 阅读）
  - 版本命令：`--version` 显示版本
  - 调试模式：`--debug` 或 `-d` 参数
  - 环境变量：默认加载 `~/.wopal/.env`，调试模式加载 cwd/.env
  - 日志输出：调试模式下输出到 cwd/logs/ 目录
- **INBOX 隔离区管理**: 
  - INBOX 路径：通过环境变量 `SKILL_INBOX_DIR` 配置（默认 `~/.wopal/skills/INBOX`）
  - 命令：`wopal skills inbox list/show/remove`
- **技能列表管理**:
  - `wopal skills list` 显示所有技能（INBOX 中已下载 + 已安装）
  - `--info` 参数展示技能的 description
  - 区分显示技能状态（已下载/已安装）
- **透传命令**: 
  - 透传 find、list 命令到 Skills CLI（使用 `npx skills`）
  - 不修改 Skills CLI 的原始输出
  - 不记录到 wopal skills 锁文件

### 修改
- 无

### 废弃
- 无

## Capabilities

### New Capabilities

- `core-management`: 
  - **CLI 框架**：
    - 使用 TypeScript + ES modules，可选用 CLI 框架（commander.js/yargs）
    - 完整的帮助系统：`--help/-h` 显示所有命令及其用法
    - 子命令帮助：`wopal skills inbox -h` 显示子命令详细帮助
    - 帮助信息格式清晰，适合 AI agent 阅读
    - 环境变量加载：默认 ~/.wopal/.env，调试模式 cwd/.env
    - 调试模式：`--debug/-d` 参数，输出日志到 cwd/logs/
  - **INBOX 管理**：
    - INBOX 目录管理（列出、查看、删除）
    - 从 SKILL.md 读取技能详情
    - 通过环境变量 `SKILL_INBOX_DIR` 配置路径（默认 `~/.wopal/skills/INBOX`）
    - remove 命令用于安装完成后清理 INBOX 中的技能
  - **技能列表管理**：
    - `wopal skills list` 显示所有技能（INBOX 已下载 + 已安装）
    - `--info` 参数展示技能的 description
    - 区分显示技能状态（已下载/已安装）
  - **透传命令**：
    - 透传命令到 Skills CLI（find）
    - 使用 `npx skills` 执行
    - 保持 Skills CLI 的原始输出
    - 不影响 wopal skills 锁文件

## Impact

### 新增文件
- `projects/agent-tools/tools/wopal-cli/` - CLI 工具源码
  - `src/cli.ts` - CLI 入口（加载环境变量 + 注册子命令 + 调试模式 + 帮助系统）
  - `bin/cli.mjs` - CLI 可执行文件
  - `src/commands/` - 子命令实现
    - `inbox.ts` - `wopal skills inbox` 命令（list/show/remove + 帮助信息）
    - `list.ts` - `wopal skills list` 命令（显示所有技能）
    - `passthrough.ts` - `wopal skills find` 透传命令
  - `src/utils/` - 工具函数
    - `env-loader.ts` - 从 .env 文件加载环境变量
    - `logger.ts` - 日志工具（调试模式输出到 cwd/logs/）
    - `inbox-utils.ts` - INBOX 工具函数
    - `skill-utils.ts` - 技能工具函数（读取 SKILL.md、获取 description）
  - `package.json`, `tsconfig.json` - 项目配置（ES modules）

### 修改文件
- 无

### 废弃文件
- 无

### 依赖
- Node.js 18+
- TypeScript 5.9+
- commander 或 yargs（CLI 框架，可选）
- picocolors（终端颜色）
- simple-git（Git 操作，可选）
- gray-matter（Markdown frontmatter 解析）
- dotenv（环境变量加载，可选）
- npx（透传功能需要）

### Specs
- `core-management/spec.md` - INBOX 管理和透传命令

## Verification

### 功能验证
- [ ] `wopal skills --help` 显示完整命令帮助
- [ ] `wopal skills -h` 显示完整命令帮助（短参数）
- [ ] 帮助信息包含所有可用命令及其用法
- [ ] 帮助信息格式清晰，适合 AI agent 阅读
- [ ] `wopal skills inbox -h` 显示 inbox 子命令帮助
- [ ] `wopal skills inbox --help` 显示 inbox 子命令帮助
- [ ] `wopal skills --version` 显示版本
- [ ] CLI 启动时自动加载 `~/.wopal/.env` 环境变量
- [ ] `wopal skills --debug` 启动调试模式
- [ ] `wopal skills -d` 启动调试模式（短参数）
- [ ] 调试模式下加载 cwd/.env 环境变量
- [ ] 调试模式下输出日志到 cwd/logs/ 目录
- [ ] `wopal skills inbox list` 列出 INBOX 技能
- [ ] `wopal skills inbox show skill-name` 显示技能详情
- [ ] `wopal skills inbox remove skill-name` 删除单个技能
- [ ] 环境变量 `SKILL_INBOX_DIR` 配置 INBOX 路径（默认 `~/.wopal/skills/INBOX`）
- [ ] `wopal skills list` 显示所有技能（INBOX 已下载 + 已安装）
- [ ] `wopal skills list --info` 显示技能 description
- [ ] 区分显示技能状态（已下载/已安装）
- [ ] 透传命令 `wopal skills find` 工作

### 架构验证
- [ ] CLI 框架可扩展（易于添加新命令）
- [ ] 帮助系统完整（主命令 + 子命令帮助）
- [ ] 帮助信息格式统一，适合 AI agent 解析
- [ ] INBOX 工具函数可复用（供 download/install 使用）
- [ ] 日志系统可配置（正常模式静默，调试模式详细）

## Next Steps

完成 wopal-cli-core 后，可以并行实施以下变更：
- **wopal-cli-download**: 从 GitHub 下载技能到 INBOX（依赖 core 的 INBOX 管理）
- **wopal-cli-scan**: 对 INBOX 技能进行安全扫描（依赖 core 的基础框架，包含 IOC 数据库管理）
- **wopal-cli-install**: 从 INBOX 安装技能（依赖 core 的 INBOX 管理，包含锁文件管理）
