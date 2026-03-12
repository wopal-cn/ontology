# wopal-cli v0.2.0 - Agent 项目规范

<CRITICAL_RULE>
- 此文档规范为 ai agents 提供项目参考,当项目设计和代码发生变更后,agents 必须及时更新本文档并保持精简有效.
<CRITICAL_RULE>

## 项目概览

wopal-cli 是 Wopal 工作空间的技能管理命令行工具，实现 INBOX 隔离工作流（下载 → 扫描 → 评估 → 安装），为 AI Agent 技能管理提供安全保障。

**核心价值**：INBOX 隔离机制、51 项安全检查（集成 OpenClaw）、版本指纹追踪、延迟加载架构

## 架构特性 (v0.2.0)

采用三层优化架构实现快速启动：
1. **Layer 1: 快速路由** - `--help`/`--version` 跳过 commander 直接执行 (<50ms)
2. **Layer 2: 构建程序** - 注册核心命令（init）+ 占位符命令
3. **Layer 3: 延迟加载** - 子命令按需动态 import

```
cli.ts (入口)
├─ tryRouteCli() → --help/--version 直接输出
├─ buildProgram() → 注册 init + skills 占位符
└─ registerSkillsCli() → 动态加载 skills 子命令
```

## 目录结构

```
wopal-cli/
├── bin/
│   └── wopal              # CLI 入口脚本
├── src/
│   ├── cli.ts             # 入口（快速路由 + 延迟加载）
│   ├── argv.ts            # 轻量 argv 解析
│   ├── route.ts           # 快速路由（仅 --help/--version）
│   ├── program/           # 程序构建模块
│   │   ├── index.ts       # 导出
│   │   ├── context.ts     # 程序上下文
│   │   ├── helpers.ts     # 辅助函数
│   │   ├── command-registry.ts  # 命令注册表
│   │   └── register-subclis.ts  # 子命令延迟加载
│   ├── commands/
│   │   ├── init.ts        # 初始化命令
│   │   └── skills/        # skills 子命令
│   │       ├── index.ts   # 主入口
│   │       ├── inbox.ts
│   │       ├── list.ts
│   │       ├── download.ts
│   │       ├── scan.ts
│   │       ├── check.ts
│   │       ├── install.ts
│   │       └── passthrough.ts
│   ├── lib/               # 核心库
│   │   ├── logger.ts
│   │   ├── env-loader.ts
│   │   ├── error-utils.ts
│   │   ├── help-texts.ts
│   │   ├── init-check.ts
│   │   ├── config.ts
│   │   ├── lock-manager.ts
│   │   ├── skill-lock.ts
│   │   ├── skill-utils.ts
│   │   ├── inbox-utils.ts
│   │   ├── source-parser.ts
│   │   ├── metadata.ts
│   │   ├── hash.ts
│   │   ├── git.ts
│   │   └── types.ts
│   ├── scanner/           # 安全扫描器（集成 OpenClaw）
│   │   ├── scanner.ts
│   │   ├── types.ts
│   │   ├── openclaw-updater.ts   # OpenClaw 仓库更新
│   │   ├── openclaw-wrapper.ts   # OpenClaw 扫描调用
│   │   └── wopal-scan-wrapper.sh # Shell wrapper 脚本
│   └── types/
│       ├── cli.ts
│       └── lock.ts
├── tests/               # 测试文件
├── package.json
├── tsconfig.json
└── AGENTS.md
```

## 技术栈

TypeScript ^5.9.3 | commander.js ^12.0.0 | simple-git ^3.32.3 | fs-extra ^11.3.4 | vitest ^4.0.18 | prettier ^3.6.2

## 开发命令

```bash
pnpm build        # 编译 TypeScript
pnpm dev          # 开发模式
pnpm test         # 运行测试
pnpm test:run     # 运行测试（单次）
pnpm format       # 代码格式化
```

## 命令列表

所有命令支持 `--help` 查看详细帮助

```bash
wopal init                                    # 初始化配置
wopal skills download <sources...>            # 下载技能到 INBOX
wopal skills scan [skill-name]                # 安全扫描（51 项检查）
wopal skills update-scanner                   # 更新 OpenClaw 扫描器
wopal skills check [skill-name]               # 版本检查
wopal skills install <skill-name>             # 安装技能
wopal skills list                             # 列出技能
wopal skills inbox list/show/remove           # INBOX 管理
wopal find [query]                            # 透传搜索
```

## 核心约定

### 命令开发规范

1. **禁用 help 命令**：主命令和所有子命令必须添加 `.addHelpCommand(false)`，只保留 `--help` / `-h` 参数
2. **命令注册**：函数命名 `register<Command>Command`，Logger 注入函数命名 `setLogger`
3. **Logger 注入**：在 `cli.ts` 的 `preAction` hook 中统一注入到各模块
4. **错误处理**：统一使用 `src/lib/error-utils.ts` 的 `handleCommandError`
5. **环境变量加载**：`cli.ts` 在 `preAction` hook 中调用 `loadEnv(debug)`，优先级：`./.env` > `~/.wopal/.env`
6. **初始化检查**：所有命令（除 `init`）在 `cli.ts` 的 `preAction` hook 中统一调用 `checkInitialization()`

### 代码规范

- **风格**：Prettier 格式化，2 空格缩进，单引号，分号结尾
- **TypeScript**：严格模式，ES modules，显式类型注解，避免 `any`
- **测试**：单元测试 `*.test.ts`
- **Git**：Conventional Commits（`feat:`、`fix:`、`refactor:`、`test:`）
- **格式化（必须）**：修改代码后必须运行 `pnpm format:check <file>` 检查，或 `pnpm format` 自动修复

### CLI UX 规范

- 所有用户界面包括 help 报错信息等统一使用英文
- 每个命令的 -h --help 输出要完善, 便于 ai agent 了解命令完整使用方法
- 所有命令必须支持 `--json` 的命令
- 所有命令在出错后,清晰明了显示错误信息,如果是参数和指令错误,要打印命令帮助信息或指导性说明
- **禁用颜色输出**：不使用 picocolors 等颜色库，CLI 输出为纯文本，便于 AI agent 解析

## 环境变量

| 变量名                      | 默认值                  |
| --------------------------- | ----------------------- |
| `WOPAL_SKILLS_INBOX_DIR`    | `.wopal/skills/INBOX`   |
| `WOPAL_SKILLS_DIR`          | `.wopal/skills`         |
| `WOPAL_OPENCLAW_DIR`        | `~/.wopal/storage/openclaw-security-monitor` |
| `GITHUB_TOKEN` / `GH_TOKEN` | -（可选）               |

## 关键模块

- **scanner/**：集成 OpenClaw 安全扫描器，51 项检查（C2、恶意软件、反向 shell、CVE 等）
- **scanner/openclaw-updater.ts**：管理 OpenClaw 仓库的自动更新（每 24 小时）
- **scanner/openclaw-wrapper.ts**：调用 OpenClaw 扫描并解析结果
- **lib/lock-manager.ts**：管理 `wopal-skills.lock` 文件
- **lib/skill-lock.ts**：技能元数据管理（版本、来源、哈希）
- **program/register-subclis.ts**：延迟加载核心逻辑
