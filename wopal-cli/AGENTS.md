# wopal-cli v0.2.0 - Agent 项目规范

<CRITICAL_RULE>
- 此文档规范为 ai agents 提供项目参考,当项目设计和代码发生变更后,agents 必须及时更新本文档并保持精简有效.
<CRITICAL_RULE>

## 项目概览

wopal-cli 是 Wopal 工作空间的技能管理命令行工具，实现 INBOX 隔离工作流（下载 → 扫描 → 评估 → 安装），为 AI Agent 技能管理提供安全保障。

**核心价值**：INBOX 隔离机制、51 项安全检查（集成 OpenClaw）、版本指纹追踪、延迟加载架构

## 架构特性 (v0.2.0)

采用三层优化架构实现快速启动：
1. **Layer 1: 快速路由** - `--version` 跳过 commander 直接执行
2. **Layer 2: 构建程序** - 注册核心命令（init）+ 占位符命令
3. **Layer 3: 延迟加载** - 子命令按需动态 import

```
cli.ts (入口)
├─ tryRouteCli() → --version 直接输出
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
│   ├── route.ts           # 快速路由（仅 --version）
│   ├── program/           # 程序构建模块
│   │   ├── index.ts       # 导出
│   │   ├── context.ts     # 程序上下文
│   │   ├── helpers.ts     # 辅助函数
│   │   ├── command-registry.ts  # 命令注册表
│   │   └── register-subclis.ts  # 子命令延迟加载
│   ├── commands/
│   │   ├── init.ts        # 初始化命令
│   │   ├── space.ts       # 空间管理命令
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
│   │   ├── config.ts            # ConfigService（两阶段初始化）
│   │   ├── config-registry.ts   # 配置属性定义
│   │   ├── config-resolver.ts   # 配置解析逻辑
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
wopal space list/add/remove/use/show          # 空间管理
wopal skills download <sources...>            # 下载技能到 INBOX
wopal skills scan [skill-name]                # 安全扫描（51 项检查）
wopal skills update-scanner                   # 更新 OpenClaw 扫描器
wopal skills check [skill-name]               # 版本检查
wopal skills install <skill-name>             # 安装技能
wopal skills list                             # 列出技能
wopal skills inbox list/show/remove           # INBOX 管理
wopal find [query]                            # 透传搜索
```

## CLI Help 规范

### 格式标准

所有命令帮助信息必须遵循统一格式：

```
EXAMPLES:
  wopal <cmd> <args>    # <简短说明>

NOTES:
  - <关键注意事项>

WORKFLOW:
  1. Step one
```

### 章节规则

| 章节 | 必需 | 限制 |
|------|------|------|
| EXAMPLES | ✓ | 2-5 条，紧凑格式 |
| NOTES | 可选 | 最多 4 条 |
| WORKFLOW | 可选 | 最多 5 步（多步骤命令） |

### EXAMPLES 紧凑格式

```typescript
// 正确 ✓
examples: [
  "wopal init my-project     # Initialize with custom name",
  "wopal init .              # Initialize current directory",
]

// 错误 ✗（旧格式）
examples: [
  "# Initialize with custom name\nwopal init my-project",
]
```

### 实现方式

使用 `buildHelpText()` 函数：

```typescript
command.addHelpText("after", buildHelpText({
  examples: ["wopal cmd --flag    # Description"],
  notes: ["Important note"],
  workflow: ["Step 1", "Step 2"],
}));
```

### 禁止事项

- 禁止直接使用字符串拼接帮助文本
- 禁止在 route.ts 中定义自定义帮助（主命令通过 cli.ts 的 addHelpText 实现）
- 禁止 EXAMPLES 超过 5 条、NOTES 超过 4 条、WORKFLOW 超过 5 步

## 核心约定

### 命令开发规范

#### 命令文件结构模板

每个顶层命令对应一个文件 `src/commands/<name>.ts`，必须导出以下内容：

```typescript
import { Command } from "commander";
import { getConfig } from "../lib/config.js";
import { buildHelpText, buildHelpHeader } from "../lib/help-texts.js";
import { CommandError, handleCommandError } from "../lib/error-utils.js";
import { Logger } from "../lib/logger.js";

// 1. Logger 模块级变量 + setLogger 导出（供 cli.ts preAction 注入）
let logger: Logger = new Logger(false);
export function setLogger(l: Logger): void { logger = l; }

// 2. 注册函数（固定命名：register<Name>Command）
export function register<Name>Command(program: Command): void {
  const cmd = new Command("<name>")
    .description("...")
    .addHelpCommand(false);                   // 3. 必须禁用 help 子命令

  // 4. 帮助头（显示当前 space）
  cmd.addHelpText("before", () => buildHelpHeader(getConfig().getActiveSpace()));

  // 5. 帮助尾（EXAMPLES / NOTES / WORKFLOW）
  cmd.addHelpText("after", buildHelpText({
    examples: ["wopal <name> --flag    # Description"],
    notes: ["..."],
  }));

  // 6. 子命令
  cmd.command("sub <arg>")
    .description("...")
    .option("--json", "Output as JSON")
    .action((arg, options) => {
      try {
        doSomething(arg, options.json);
      } catch (error) {
        handleCommandError(error);            // 7. 统一错误处理
      }
    });

  program.addCommand(cmd);
}
```

#### 注册到 cli.ts 的四步流程

新命令开发完成后，按以下步骤接入 `src/cli.ts`：

```typescript
// Step 1: import 注册函数和 setLogger
import { register<Name>Command, setLogger as set<Name>Logger } from "./commands/<name>.js";

// Step 2: preAction hook 中注入 Logger
set<Name>Logger(logger);

// Step 3: 调用注册函数（在 parseAsync 之前）
register<Name>Command(program);

// Step 4: 按需免初始化检查（在 preAction 的 commandName 判断中添加）
if (commandName !== "init" && commandName !== "space" && commandName !== "<name>") {
  checkInitialization();
}
```

#### 写入配置后刷新单例

命令中若修改了 `settings.jsonc`（如空间增删改），必须调用 `invalidateConfigInstance()` 使单例失效，确保后续 `getConfig()` 读取到最新状态：

```typescript
import { getConfig, invalidateConfigInstance } from "../lib/config.js";

config.addSpace(name, path);
invalidateConfigInstance();                  // 写入后必须刷新
const freshConfig = getConfig();             // 此时读取到最新数据
```


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

| 变量名                      | 作用域 | 默认值                                        |
| --------------------------- | ------ | --------------------------------------------- |
| `WOPAL_HOME`                | 全局   | `~/.wopal`                                    |
| `WOPAL_GLOBAL_SKILLS_DIR`   | 全局   | `$WOPAL_HOME/skills`                          |
| `WOPAL_SKILLS_DIR`          | 空间   | `<space>/.wopal/skills`                       |
| `WOPAL_SKILLS_INBOX_DIR`    | 空间   | `<space>/.wopal/skills/INBOX`                 |
| `WOPAL_SETTINGS_PATH`       | 全局   | `~/.wopal/config/settings.jsonc`（覆盖配置路径）|
| `GITHUB_TOKEN` / `GH_TOKEN` | 全局   | -（可选，用于私有仓库访问）                    |

> **注意**：OpenClaw 固定安装在 `$WOPAL_HOME/storage/openclaw-security-monitor`，**不支持环境变量覆盖**，由 `ConfigService.getOpenclawDir()` 统一管理。

## 关键模块

- **scanner/**：集成 OpenClaw 安全扫描器，51 项检查（C2、恶意软件、反向 shell、CVE 等）
- **scanner/openclaw-updater.ts**：管理 OpenClaw 仓库的自动更新（每 24 小时）
- **scanner/openclaw-wrapper.ts**：调用 OpenClaw 扫描并解析结果
- **lib/lock-manager.ts**：管理 `wopal-skills.lock` 文件
- **lib/skill-lock.ts**：技能元数据管理（版本、来源、哈希）
- **program/register-subclis.ts**：延迟加载核心逻辑
