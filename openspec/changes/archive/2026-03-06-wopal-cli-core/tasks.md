## 1. 项目初始化

- [x] 1.1 创建 wopal-cli 项目目录结构 (`projects/agent-tools/tools/wopal-cli/`)
- [x] 1.2 创建 `package.json`（配置 bin、scripts、dependencies，使用 commander.js）
- [x] 1.3 创建 `tsconfig.json`（配置 ES modules、target ES2022）
- [x] 1.4 安装依赖（pnpm install）

## 2. CLI 框架基础

- [x] 2.1 创建 `src/cli.ts` 主入口文件
- [x] 2.2 使用 commander.js 创建主命令（`wopal skills`）
- [x] 2.3 实现版本读取函数（从 package.json 读取 version）
- [x] 2.4 实现环境变量加载（`src/utils/env-loader.ts`）
- [x] 2.5 实现日志工具（`src/utils/logger.ts`）
- [x] 2.6 配置全局选项（`--version`、`--help`、`--debug`）
- [x] 2.7 实现 `--debug/-d` 调试模式（加载 cwd/.env，输出日志到 cwd/logs/）
- [x] 2.8 实现环境变量自动加载（CLI 启动时加载 `~/.wopal/.env`）

## 3. INBOX 工具函数

- [x] 3.1 创建 `src/utils/inbox-utils.ts`
- [x] 3.2 实现 `getInboxDir()` 函数（读取 `SKILL_INBOX_DIR`，默认 `~/.wopal/skills/INBOX`）
- [x] 3.3 实现 `getDirectorySize()` 函数（计算目录大小）
- [x] 3.4 实现 `formatSize()` 函数（格式化文件大小显示）
- [x] 3.5 实现 `buildDirectoryTree()` 函数（生成目录树结构）

## 4. 技能工具函数

- [x] 4.1 创建 `src/utils/skill-utils.ts`
- [x] 4.2 实现 `parseSkillMd()` 函数（使用 gray-matter 解析 SKILL.md）
- [x] 4.3 实现 `getSkillInfo()` 函数（读取技能名称和 description）
- [x] 4.4 实现 `collectSkills()` 函数（收集目录下的所有技能）
- [x] 4.5 实现 `getInstalledSkillsDir()` 函数（获取已安装技能目录路径）

## 5. INBOX 管理命令

- [x] 5.1 创建 `src/commands/inbox.ts`
- [x] 5.2 使用 commander.js 创建 inbox 子命令
- [x] 5.3 实现 `inbox list` 命令（列出 INBOX 中的所有技能）
- [x] 5.4 实现 `inbox show <skill>` 命令（显示 SKILL.md 内容和目录结构）
- [x] 5.5 实现 `inbox remove <skill>` 命令（删除单个技能目录）
- [x] 5.6 处理边界情况（INBOX 为空、技能不存在、无效技能目录）

## 6. 技能列表命令

- [x] 6.1 创建 `src/commands/list.ts`
- [x] 6.2 使用 commander.js 创建 list 命令
- [x] 6.3 实现 `listSkills()` 函数（显示所有技能：INBOX 已下载 + 已安装）
- [x] 6.4 实现 `--info/-i` 参数（显示技能 description）
- [x] 6.5 实现技能状态区分（已下载/已安装）
- [x] 6.6 实现 `mergeSkills()` 函数（合并 INBOX 和已安装技能列表，去重）
- [x] 6.7 处理边界情况（无技能、INBOX 不存在、已安装目录不存在）

## 7. 透传命令

- [x] 7.1 创建 `src/commands/passthrough.ts`
- [x] 7.2 使用 commander.js 创建 find 命令
- [x] 7.3 实现 `passthroughFind(query: string)` 函数（透传到 `npx skills find`）
- [x] 7.4 处理透传命令的错误情况（Skills CLI 不可用、网络错误）
- [x] 7.5 保持 Skills CLI 的原始输出（使用 stdio: 'inherit'）

## 8. CLI 入口集成

- [x] 8.1 在 `src/cli.ts` 中注册 inbox 子命令
- [x] 8.2 在 `src/cli.ts` 中注册 list 命令
- [x] 8.3 在 `src/cli.ts` 中注册 find 命令
- [x] 8.4 确保所有命令正确解析参数
- [x] 8.5 实现调试模式自动检测（根据 --debug/-d 参数）

## 9. 构建和测试

- [x] 9.1 运行 `pnpm build` 构建 CLI（编译 TypeScript 到 bin/cli.js）
- [x] 9.2 测试 `wopal skills --version` 显示版本号
- [x] 9.3 测试 `wopal skills --help` 显示完整帮助
- [x] 9.4 测试 `wopal skills -h` 显示完整帮助（短参数）
- [x] 9.5 测试 `wopal skills inbox --help` 显示 inbox 子命令帮助
- [x] 9.6 测试 `wopal skills list --help` 显示 list 命令帮助
- [x] 9.7 测试 `wopal skills --debug` 启动调试模式
- [x] 9.8 测试 `wopal skills -d` 启动调试模式（短参数）
- [x] 9.9 测试调试模式下加载 cwd/.env
- [x] 9.10 测试调试模式下输出日志到 cwd/logs/

## 10. INBOX 命令功能验证

- [x] 10.1 测试 `wopal skills inbox list` 列出 INBOX 技能
- [x] 10.2 测试 INBOX 为空时显示"INBOX 为空"
- [x] 10.3 测试 `wopal skills inbox show skill-name` 显示技能详情
- [x] 10.4 测试技能目录无效时显示警告"无效的技能目录"
- [x] 10.5 测试 `wopal skills inbox remove skill-name` 删除单个技能
- [x] 10.6 验证删除技能后 INBOX 目录本身仍然存在
- [x] 10.7 验证环境变量 `SKILL_INBOX_DIR` 配置生效
- [x] 10.8 验证默认 INBOX 路径为 `~/.wopal/skills/INBOX`

## 11. 技能列表命令功能验证

- [x] 11.1 测试 `wopal skills list` 显示所有技能（INBOX + 已安装）
- [x] 11.2 测试 `wopal skills list --info` 显示技能 description
- [x] 11.3 测试 `wopal skills list -i` 显示技能 description（短参数）
- [x] 11.4 验证技能状态区分（已下载/已安装）
- [x] 11.5 验证技能去重（同一技能在 INBOX 和已安装目录都存在）
- [x] 11.6 测试无技能时显示"没有找到任何技能"
- [x] 11.7 测试只有 INBOX 技能时的显示
- [x] 11.8 测试只有已安装技能时的显示

## 12. 透传命令功能验证

- [x] 12.1 测试 `wopal skills find "query"` 透传到 Skills CLI
- [x] 12.2 验证透传命令保持 Skills CLI 的原始输出
- [x] 12.3 验证透传命令不更新 wopal skills 锁文件
- [x] 12.4 测试 Skills CLI 因网络问题失败时的错误提示

## 13. 环境变量验证

- [x] 13.1 测试默认加载 `~/.wopal/.env` 环境变量
- [x] 13.2 测试调试模式加载 `cwd/.env` 环境变量
- [x] 13.3 测试 `SKILL_INBOX_DIR` 环境变量配置 INBOX 路径
- [x] 13.4 测试未设置环境变量时使用默认 INBOX 路径（`~/.wopal/skills/INBOX`）

## 14. 架构验证

- [x] 14.1 验证 CLI 框架可扩展（易于添加新命令）
- [x] 14.2 验证帮助系统完整（主命令 + 子命令帮助，由 commander.js 自动生成）
- [x] 14.3 验证帮助信息格式统一，适合 AI agent 解析
- [x] 14.4 验证 INBOX 工具函数可复用（供 download/install 使用）
- [x] 14.5 验证技能工具函数可复用（供其他命令使用）
- [x] 14.6 验证日志系统可配置（正常模式静默，调试模式详细）

## 15. 文档和发布准备

- [x] 15.1 创建 README.md（包含安装、使用、配置说明）
- [x] 15.2 更新 wopal-workspace 的 `.workspace.md`（记录 wopal-cli 工具）
- [x] 15.3 确保 package.json 中的 bin 字段正确配置
- [x] 15.4 确保所有文件符合项目的代码风格（无 emoji，清晰注释）
