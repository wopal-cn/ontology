# wopal-cli v0.2.0 - Agent 项目规范

<CRITICAL_RULE>
- 此文档规范为 ai agents 提供项目参考,当项目设计和代码发生变更后,agents 必须及时更新本文档并保持精简有效.
<CRITICAL_RULE>

## 项目概览

wopal-cli 是 Wopal 工作空间的技能管理命令行工具，实现 INBOX 隔离工作流（下载 → 扫描 → 评估 → 安装），为 AI Agent 技能管理提供安全保障。

**核心价值**：INBOX 隔离机制、51 项安全检查（集成 OpenClaw）、版本指纹追踪、统一命令架构

## 架构特性 (v0.2.0)

采用 **CommandRegistry + ProgramContext + OutputService** 三层架构：

```
cli.ts (入口)
├─ Layer 1: 快速路由 → --version 直接输出
└─ Layer 2-3: Commander 流程
    ├─ CommandRegistry (统一注册中心)
    │   ├─ ModuleEntry (内置 TypeScript 命令)
    │   ├─ ExternalPassthroughEntry (外部 CLI 透传)
    │   └─ ExternalIntegratedEntry (深度集成)
    ├─ ProgramContext (统一上下文传递)
    │   └─ version, debug, config, output
    └─ OutputService (统一输出格式)
        └─ 自动 ACTIVE SPACE header，标准 JSON
```

## 目录结构

```
wopal-cli/
├── bin/
│   └── wopal              # CLI 入口脚本
├── src/
│   ├── cli.ts             # 入口（CommandRegistry + ProgramContext）
│   ├── argv.ts            # 轻量 argv 解析
│   ├── route.ts           # 快速路由（仅 --version）
│   ├── program/           # 程序构建模块
│   │   ├── index.ts       # 导出
│   │   ├── types.ts       # 类型定义（ModuleEntry, SubCommandDefinition 等）
│   │   ├── context.ts     # createProgramContext()
│   │   ├── helpers.ts     # 辅助函数
│   │   └── command-registry.ts  # CommandRegistry 类
│   ├── commands/
│   │   ├── index.ts       # 命令导出
│   │   ├── init.ts        # 初始化命令 (ModuleEntry)
│   │   ├── space.ts       # 空间管理 (ModuleEntry + SubCommandDefinition)
│   │   └── skills/        # skills 子命令
│   │       ├── index.ts   # 主入口 (ModuleEntry 包装器)
│   │       ├── inbox.ts
│   │       ├── list.ts
│   │       ├── download.ts
│   │       ├── scan.ts
│   │       ├── check.ts
│   │       ├── install.ts
│   │       └── passthrough.ts
│   ├── lib/               # 核心库
│   │   ├── logger.ts
│   │   ├── output-service.ts   # OutputService（统一输出）
│   │   ├── env-loader.ts
│   │   ├── error-utils.ts
│   │   ├── help-texts.ts
│   │   ├── init-check.ts
│   │   ├── config.ts            # ConfigService
│   │   ├── config-registry.ts
│   │   ├── config-resolver.ts
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
│   │   ├── openclaw-updater.ts
│   │   ├── openclaw-wrapper.ts
│   │   └── wopal-scan-wrapper.sh
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

### 实现方式

使用 `buildHelpText()` 函数：

```typescript
import { buildHelpText } from "../lib/help-texts.js";

cmd.addHelpText("after", buildHelpText({
  examples: ["wopal cmd --flag    # Description"],
  notes: ["Important note"],
  workflow: ["Step 1", "Step 2"],
}));
```

## 核心约定

### 命令开发规范（新架构）

#### 顶层命令模板 (ModuleEntry)

```typescript
// src/commands/my-command.ts
import type { ModuleEntry, RegisterParams } from "../program/types.js";
import { buildHelpText } from "../lib/help-texts.js";
import { handleCommandError } from "../lib/error-utils.js";

export const myCommand: ModuleEntry = {
  type: "module",
  id: "my-command",
  description: "Command description",
  register: ({ program, context }: RegisterParams) => {
    program
      .command("my-command [arg]")
      .description("Command description")
      .option("--json", "Output as JSON")
      .action(async (...args) => {
        const options = args.pop();
        const positionalArgs = { arg0: args[0] };
        try {
          // 使用 context.output.print() 输出
          // 使用 context.config 获取配置
          context.output.print("Result");
        } catch (error) {
          handleCommandError(error);
        }
      })
      .addHelpText("after", buildHelpText({
        examples: ["wopal my-command    # Description"],
      }));
  },
};
```

#### 命令组模板 (SubCommandDefinition)

```typescript
// src/commands/my-group.ts
import type { ModuleEntry, SubCommandDefinition } from "../program/types.js";
import { registerCommandGroup } from "../program/command-registry.js";
import { buildHelpText } from "../lib/help-texts.js";

const listSubcommand: SubCommandDefinition = {
  name: "list",
  description: "List items",
  options: [{ flags: "--json", description: "Output as JSON" }],
  action: async (_args, options, context) => {
    if (options.json) {
      context.output.json({ items: [] });
      return;
    }
    context.output.print("Items: ...");
  },
  helpText: { examples: ["wopal my-group list"] },
};

export const myGroupCommand: ModuleEntry = {
  type: "module",
  id: "my-group",
  description: "Group command",
  register: ({ program, context }) => {
    registerCommandGroup(program, {
      name: "my-group",
      description: "Group description",
      subcommands: [listSubcommand],
    }, context);
  },
};
```

#### 注册到 cli.ts

```typescript
// Step 1: import 命令定义
import { myCommand } from "./commands/my-command.js";

// Step 2: 注册到 CommandRegistry
registry.registerAll([initCommand, spaceCommand, skillsCommand, myCommand]);
```

### OutputService 使用

```typescript
// 通过 context.output 访问
context.output.print("message");           // 带自动 header
context.output.println();                   // 空行
context.output.json({ data });              // 标准格式 { success: true, data }
context.output.jsonError("CODE", "msg");    // 标准错误格式
context.output.error("message", "hint");    // 错误输出
context.output.table(data, columns);        // 表格输出
```

### 写入配置后刷新单例

```typescript
import { getConfig, invalidateConfigInstance } from "../lib/config.js";

config.addSpace(name, path);
invalidateConfigInstance();                  // 写入后必须刷新
```

### 代码规范

- **风格**：Prettier 格式化，2 空格缩进，单引号，分号结尾
- **TypeScript**：严格模式，ES modules，显式类型注解，避免 `any`
- **测试**：单元测试 `*.test.ts`
- **Git**：Conventional Commits（`feat:`、`fix:`、`refactor:`、`test:`）
- **格式化（必须）**：修改代码后必须运行 `pnpm format`

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

- **program/types.ts**：所有类型定义（ModuleEntry, SubCommandDefinition, ProgramContext 等）
- **program/command-registry.ts**：CommandRegistry 类，支持三种命令类型
- **lib/output-service.ts**：统一输出服务，自动 header + 标准 JSON 格式
- **scanner/**：集成 OpenClaw 安全扫描器，51 项检查（C2、恶意软件、反向 shell、CVE 等）
- **lib/lock-manager.ts**：管理 `wopal-skills.lock` 文件
- **lib/skill-lock.ts**：技能元数据管理（版本、来源、哈希）
