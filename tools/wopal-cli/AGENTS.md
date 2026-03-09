# wopal-cli - Agent 项目规范

## 项目概览

wopal-cli 是 Wopal 工作空间的技能管理命令行工具，实现 INBOX 隔离工作流（下载 → 扫描 → 评估 → 安装），为 AI Agent 技能管理提供安全保障。

**核心价值**：INBOX 隔离机制、20 项静态安全检查、版本指纹追踪、白名单过滤

## 目录结构

```
wopal-cli/
├── src/
│   ├── cli.ts              # 命令行入口
│   ├── commands/           # 8 个命令实现
│   ├── scanner/            # 安全扫描器（20 项检查）
│   ├── utils/              # 工具模块
│   └── types/              # TypeScript 类型
├── tests/                  # 测试文件
├── bin/                    # 编译输出
└── package.json
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

所有命令支持 `--help` 查看详细帮助（EXAMPLES / OPTIONS / NOTES / WORKFLOW）

```bash
wopal init                                    # 初始化配置
wopal skills download <sources...>            # 下载技能到 INBOX
wopal skills scan [skill-name]                # 安全扫描
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
4. **错误处理**：统一使用 `src/utils/error-utils.ts` 的 `handleError`
5. **环境变量加载**：`cli.ts` 在 `preAction` hook 中调用 `loadEnv(debug)`，优先级：`./.env` > `~/.wopal/.env`

### 代码规范

- **风格**：Prettier 格式化，2 空格缩进，单引号，分号结尾
- **TypeScript**：严格模式，ES modules，显式类型注解，避免 `any`
- **测试**：单元测试 `*.test.ts`，集成测试 `*.integration.test.test.ts`
- **Git**：Conventional Commits（`feat:`、`fix:`、`refactor:`、`test:`）

### CLI UX 规范

- 所有用户界面包括 help 报错信息等统一使用英文
- 支持 `--json` 的命令：`list`、`inbox list`、`download`、`scan`、`check`
- 错误格式统一使用 `src/utils/error-utils.ts` 和 `src/utils/help-texts.ts`

## 环境变量

| 变量名                      | 默认值                  |
| --------------------------- | ----------------------- |
| `WOPAL_SKILLS_INBOX_DIR`    | `~/.wopal/skills/INBOX` |
| `WOPAL_SKILLS_IOCDB_DIR`    | `~/.wopal/skills/iocdb` |
| `WOPAL_SKILLS_DIR`          | `.wopal/skills`         |
| `GITHUB_TOKEN` / `GH_TOKEN` | -（可选）               |


## 关键模块

- **scanner/**：20 项静态安全检查（9 项严重 + 11 项警告）
- **utils/lock-manager.ts**：管理 `wopal-skills.lock` 文件
- **utils/skill-lock.ts**：技能元数据管理（版本、来源、哈希）
