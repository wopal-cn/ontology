# wopal-cli 架构重构设计方案

> 版本：v2.0
> 日期：2025-01-13
> 状态：待评审

## 一、问题背景

### 1.1 当前架构缺陷

| 问题 | 描述 | 严重程度 |
|------|------|---------|
| **输出逻辑散落** | 各命令直接使用 `console.log`，无统一约束 | P1 |
| **命令注册不一致** | `program/` 模块设计未被充分利用，命令绕过注册表 | P1 |
| **RouteSpec 重复定义** | `route.ts` 和 `command-registry.ts` 定义了不兼容的 RouteSpec | P2 |
| **外部子命令难集成** | 无统一机制集成外部 CLI（如 process-adapter） | P2 |
| **JSON 格式不统一** | 各命令 JSON 输出结构各异 | P1 |
| **Logger 注入分散** | 每个命令模块都有 `setLogger` 函数，手动管理 | P2 |

### 1.2 设计目标

1. **统一命令注册**：所有命令通过 CommandRegistry 注册，支持三种集成方式
2. **统一输出格式**：自动显示 ACTIVE SPACE header，标准 JSON 格式
3. **统一上下文传递**：通过 ProgramContext 传递配置、输出服务等
4. **支持外部集成**：原生支持外部 CLI 透传和深度集成
5. **最小改动迁移**：提供迁移模板，渐进式迁移

---

## 二、架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              cli.ts (入口)                                   │
│  ├─ tryRouteCli() → Layer 1: 快速路由（仅 --version）                        │
│  └─ program.parseAsync() → Layer 2-3: Commander 流程                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     CommandRegistry (统一注册中心)                           │
│  ├─ CommandEntry[] (支持三种类型)                                            │
│  │   ├─ ModuleEntry (内置 TypeScript 命令)                                   │
│  │   ├─ ExternalPassthroughEntry (外部 CLI 透传)                             │
│  │   └─ ExternalIntegratedEntry (深度集成)                                   │
│  └─ registerAll(program, context) → 统一注册                                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
             ┌──────────┐      ┌──────────┐      ┌──────────┐
             │ Module   │      │ External │      │ External │
             │ Entry    │      │ Passthru │      │Integrated│
             └──────────┘      └──────────┘      └──────────┘
                    │                 │                 │
                    ▼                 ▼                 ▼
             register()        spawn(inherit)    import+register()
```

### 2.2 模块职责

| 模块 | 职责 |
|------|------|
| `cli.ts` | 入口点，创建上下文，初始化服务，启动 Commander |
| `program/types.ts` | 所有类型定义（CommandEntry、ProgramContext 等） |
| `program/context.ts` | 创建 ProgramContext |
| `program/command-registry.ts` | 命令注册表，支持三种命令类型 |
| `lib/output-service.ts` | 统一输出管理，header 控制，JSON 格式化 |
| `commands/*.ts` | 命令定义，导出 ModuleEntry 或 SubCommandDefinition |

### 2.3 文件结构变更

```
wopal-cli/src/
├── cli.ts                          # 重构：使用 CommandRegistry
├── route.ts                        # 保留：版本获取函数
├── argv.ts                         # 保留：参数解析工具
├── program/
│   ├── index.ts                    # 更新：导出新模块
│   ├── types.ts                    # 新增：所有类型定义
│   ├── context.ts                  # 重构：完整的 ProgramContext
│   ├── command-registry.ts         # 重构：支持三种命令类型
│   ├── helpers.ts                  # 保留：resolveActionArgs
│   └── register-subclis.ts         # 删除：功能合并到 command-registry
├── commands/
│   ├── init.ts                     # 迁移：ModuleEntry 格式
│   ├── space.ts                    # 迁移：ModuleEntry 格式
│   └── skills/
│       ├── index.ts                # 迁移：ModuleEntry 格式
│       ├── list.ts                 # 迁移：SubCommandDefinition
│       ├── download.ts             # 迁移：SubCommandDefinition
│       ├── scan.ts                 # 迁移：SubCommandDefinition
│       ├── check.ts                # 迁移：SubCommandDefinition
│       ├── install.ts              # 迁移：SubCommandDefinition
│       ├── inbox.ts                # 迁移：SubCommandDefinition
│       ├── update-scanner.ts       # 迁移：SubCommandDefinition
│       └── passthrough.ts          # 迁移：SubCommandDefinition
└── lib/
    ├── output-service.ts           # 新增：统一输出服务
    └── external-command.ts         # 新增：外部命令运行器（可选）
```

---

## 三、类型定义

### 3.1 ProgramContext

```typescript
// src/program/types.ts

import type { Command } from 'commander';
import type { ConfigService } from '../lib/config.js';
import type { OutputService } from '../lib/output-service.js';

/**
 * 程序上下文，传递给所有命令
 */
export interface ProgramContext {
  version: string;
  debug: boolean;
  config: ConfigService;
  output: OutputService;
}

export interface ProgramContextParams {
  version: string;
  debug: boolean;
  config: ConfigService;
  output: OutputService;
}
```

### 3.2 RouteSpec（统一）

```typescript
/**
 * 快速路由规格
 * 用于跳过 Commander 直接执行的命令
 */
export interface RouteSpec {
  match: (path: string[], argv: string[]) => boolean;
  run: (argv: string[], context: ProgramContext) => Promise<boolean>;
}
```

### 3.3 三种命令类型

```typescript
/**
 * 类型 1: 内置模块命令
 */
export interface ModuleEntry {
  type: 'module';
  id: string;
  description: string;
  register: (params: RegisterParams) => void | Promise<void>;
  routes?: RouteSpec[];
}

/**
 * 类型 2: 外部 CLI 透传
 */
export interface ExternalPassthroughEntry {
  type: 'external-passthrough';
  id: string;
  description: string;
  binary: string;
  helpCommand?: string;  // 默认 '--help'
}

/**
 * 类型 3: 深度集成外部包
 */
export interface ExternalIntegratedEntry {
  type: 'external-integrated';
  id: string;
  description: string;
  modulePath: string;    // 相对路径或包名
  exportName: string;    // 导出的注册函数名
  routes?: RouteSpec[];
}

/**
 * 统一命令条目类型
 */
export type CommandEntry = 
  | ModuleEntry 
  | ExternalPassthroughEntry 
  | ExternalIntegratedEntry;

/**
 * 命令注册参数
 */
export interface RegisterParams {
  program: Command;
  context: ProgramContext;
}
```

### 3.4 子命令定义接口

```typescript
/**
 * 子命令定义（用于命令组内的子命令）
 */
export interface SubCommandDefinition {
  name: string;
  description: string;
  arguments?: string;  // 如 '[skill-name]'
  options?: Array<{
    flags: string;
    description: string;
    defaultValue?: string | boolean | number;
  }>;
  action: (
    args: Record<string, unknown>,
    options: Record<string, unknown>,
    context: ProgramContext
  ) => void | Promise<void>;
  helpText?: {
    examples?: string[];
    notes?: string[];
    workflow?: string[];
  };
}

/**
 * 命令组定义（如 skills、space）
 */
export interface CommandGroupDefinition {
  name: string;
  description: string;
  subcommands: SubCommandDefinition[];
  helpText?: {
    examples?: string[];
    notes?: string[];
    workflow?: string[];
  };
}
```

---

## 四、核心实现

### 4.1 context.ts

```typescript
// src/program/context.ts

import type { ProgramContext, ProgramContextParams } from './types.js';

export function createProgramContext(params: ProgramContextParams): ProgramContext {
  return {
    version: params.version,
    debug: params.debug,
    config: params.config,
    output: params.output,
  };
}
```

### 4.2 command-registry.ts

```typescript
// src/program/command-registry.ts

import type { Command } from 'commander';
import { spawnSync } from 'child_process';
import type {
  CommandEntry,
  ModuleEntry,
  ExternalPassthroughEntry,
  ExternalIntegratedEntry,
  ProgramContext,
  RouteSpec,
  CommandGroupDefinition,
  SubCommandDefinition,
} from './types.js';
import { buildHelpText } from '../lib/help-texts.js';

export class CommandRegistry {
  private entries: CommandEntry[] = [];

  register(entry: CommandEntry): void {
    const existing = this.entries.find((e) => e.id === entry.id);
    if (existing) {
      this.entries = this.entries.filter((e) => e.id !== entry.id);
    }
    this.entries.push(entry);
  }

  registerAll(entries: CommandEntry[]): void {
    for (const entry of entries) {
      this.register(entry);
    }
  }

  getEntries(): CommandEntry[] {
    return [...this.entries];
  }

  /**
   * 查找匹配的快速路由
   */
  findRoute(path: string[], argv: string[]): RouteSpec | null {
    for (const entry of this.entries) {
      if (entry.type === 'module' && entry.routes) {
        for (const route of entry.routes) {
          if (route.match(path, argv)) {
            return route;
          }
        }
      }
      if (entry.type === 'external-integrated' && entry.routes) {
        for (const route of entry.routes) {
          if (route.match(path, argv)) {
            return route;
          }
        }
      }
    }
    return null;
  }

  /**
   * 注册所有命令到 Commander
   */
  async registerAllToCommander(
    program: Command,
    context: ProgramContext,
  ): Promise<void> {
    for (const entry of this.entries) {
      await this.registerEntry(program, entry, context);
    }
  }

  private async registerEntry(
    program: Command,
    entry: CommandEntry,
    context: ProgramContext,
  ): Promise<void> {
    switch (entry.type) {
      case 'module':
        await this.registerModule(program, entry, context);
        break;
      case 'external-passthrough':
        this.registerExternalPassthrough(program, entry);
        break;
      case 'external-integrated':
        await this.registerExternalIntegrated(program, entry, context);
        break;
    }
  }

  private async registerModule(
    program: Command,
    entry: ModuleEntry,
    context: ProgramContext,
  ): Promise<void> {
    await entry.register({ program, context });
  }

  private registerExternalPassthrough(
    program: Command,
    entry: ExternalPassthroughEntry,
  ): void {
    const command = program
      .command(`${entry.id} [args...]`)
      .description(entry.description)
      .allowUnknownOption(true)
      .allowExcessArguments(true)
      .action((args: string[]) => {
        const result = spawnSync(entry.binary, args || [], {
          stdio: 'inherit',
          shell: process.platform === 'win32',
        });
        if (result.status !== 0) {
          process.exit(result.status || 1);
        }
      });

    command.addHelpText(
      'after',
      `\nExternal command: ${entry.binary}\nRun '${entry.binary} ${entry.helpCommand || '--help'}' for details.\n`,
    );
  }

  private async registerExternalIntegrated(
    program: Command,
    entry: ExternalIntegratedEntry,
    context: ProgramContext,
  ): Promise<void> {
    try {
      const mod = await import(entry.modulePath);
      const registerFn = mod[entry.exportName];
      if (typeof registerFn !== 'function') {
        throw new Error(
          `Export "${entry.exportName}" is not a function in ${entry.modulePath}`,
        );
      }
      await registerFn({ program, context });
    } catch (error) {
      console.error(`Failed to load external command "${entry.id}": ${error}`);
      program
        .command(`${entry.id}`)
        .description(`${entry.description} (unavailable)`)
        .action(() => {
          console.error(
            `Command "${entry.id}" is not available. Check installation.`,
          );
          process.exit(1);
        });
    }
  }
}

// 全局注册表实例
let globalRegistry: CommandRegistry | null = null;

export function getCommandRegistry(): CommandRegistry {
  if (!globalRegistry) {
    globalRegistry = new CommandRegistry();
  }
  return globalRegistry;
}

export function resetCommandRegistry(): void {
  globalRegistry = null;
}

/**
 * 辅助函数：注册命令组
 */
export function registerCommandGroup(
  program: Command,
  definition: CommandGroupDefinition,
  context: ProgramContext,
): void {
  const group = program
    .command(definition.name)
    .description(definition.description)
    .addHelpCommand(false);

  for (const sub of definition.subcommands) {
    registerSubCommand(group, sub, context);
  }

  if (definition.helpText) {
    group.addHelpText('after', buildHelpText(definition.helpText));
  }
}

/**
 * 辅助函数：注册子命令
 */
export function registerSubCommand(
  parent: Command,
  definition: SubCommandDefinition,
  context: ProgramContext,
): void {
  let cmd: Command;

  if (definition.arguments) {
    cmd = parent
      .command(`${definition.name} ${definition.arguments}`)
      .description(definition.description);
  } else {
    cmd = parent.command(definition.name).description(definition.description);
  }

  for (const opt of definition.options || []) {
    if (opt.defaultValue !== undefined) {
      cmd.option(opt.flags, opt.description, opt.defaultValue);
    } else {
      cmd.option(opt.flags, opt.description);
    }
  }

  cmd.action(async (...args) => {
    const options = args.pop() as Record<string, unknown>;
    const positionalArgs = args.reduce(
      (acc, val, idx) => {
        acc[`arg${idx}`] = val;
        return acc;
      },
      {} as Record<string, unknown>,
    );

    await definition.action(positionalArgs, options, context);
  });

  if (definition.helpText) {
    cmd.addHelpText('after', buildHelpText(definition.helpText));
  }
}
```

### 4.3 OutputService

```typescript
// src/lib/output-service.ts

import type { ConfigService } from './config.js';

export interface OutputOptions {
  showHeader?: boolean;
  jsonIndent?: number;
}

export interface JsonResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    suggestion?: string;
  };
}

export class OutputService {
  private static instance: OutputService;

  private config: ConfigService;
  private showHeader = true;
  private headerShown = false;
  private jsonIndent = 2;

  private constructor(config: ConfigService) {
    this.config = config;
  }

  static init(config: ConfigService): void {
    this.instance = new OutputService(config);
  }

  static get(): OutputService {
    if (!this.instance) {
      throw new Error(
        'OutputService not initialized. Call OutputService.init() first.',
      );
    }
    return this.instance;
  }

  static reset(): void {
    if (this.instance) {
      this.instance.headerShown = false;
      this.instance.showHeader = true;
    }
  }

  setMode(options: OutputOptions): void {
    if (options.showHeader !== undefined) {
      this.showHeader = options.showHeader;
    }
    if (options.jsonIndent !== undefined) {
      this.jsonIndent = options.jsonIndent;
    }
  }

  print(message: string): void {
    this.ensureHeader();
    console.log(message);
  }

  println(): void {
    console.log();
  }

  json<T>(data: T): void {
    const response: JsonResponse<T> = {
      success: true,
      data,
    };
    console.log(JSON.stringify(response, null, this.jsonIndent));
  }

  jsonError(code: string, message: string, suggestion?: string): void {
    const response: JsonResponse<never> = {
      success: false,
      error: { code, message, suggestion },
    };
    console.log(JSON.stringify(response, null, this.jsonIndent));
  }

  error(message: string, suggestion?: string): void {
    this.ensureHeader();
    console.error(`Error: ${message}`);
    if (suggestion) {
      console.error(`\n${suggestion}`);
    }
  }

  table<T extends Record<string, unknown>>(
    data: T[],
    columns: Array<{ key: keyof T; header: string; width?: number }>,
  ): void {
    this.ensureHeader();

    if (data.length === 0) {
      console.log('(none)');
      return;
    }

    const widths = columns.map((col) => {
      const headerLen = col.header.length;
      const maxDataLen = Math.max(
        ...data.map((row) => String(row[col.key] ?? '').length),
      );
      return col.width ?? Math.max(headerLen, maxDataLen);
    });

    const headerLine = columns
      .map((col, i) => col.header.padEnd(widths[i]!))
      .join('  ');
    console.log(headerLine);

    const separatorLine = widths.map((w) => '-'.repeat(w)).join('  ');
    console.log(separatorLine);

    for (const row of data) {
      const dataLine = columns
        .map((col, i) => String(row[col.key] ?? '').padEnd(widths[i]!))
        .join('  ');
      console.log(dataLine);
    }
  }

  private ensureHeader(): void {
    if (!this.showHeader || this.headerShown) return;

    const space = this.config.getActiveSpace();
    if (space) {
      console.log(`ACTIVE SPACE: ${space.path}\n`);
    } else {
      console.log(`ACTIVE SPACE: (none)\n`);
    }
    this.headerShown = true;
  }
}
```

---

## 五、命令迁移方案

### 5.1 顶层命令迁移模板

```typescript
// src/commands/init.ts

import type { ModuleEntry, RegisterParams } from '../program/types.js';
import { buildHelpText } from '../lib/help-texts.js';
import { CommandError, handleCommandError } from '../lib/error-utils.js';
import { resolve } from 'path';
import { homedir } from 'os';
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

async function initAction(
  args: Record<string, unknown>,
  _options: Record<string, unknown>,
  params: RegisterParams,
): Promise<void> {
  const { context } = params;
  const { output, config } = context;

  let finalName = 'main';
  let finalDir = process.cwd();

  const spaceName = args.arg0 as string | undefined;
  const spaceDir = args.arg1 as string | undefined;

  if (spaceName && spaceDir) {
    finalName = spaceName;
    finalDir = spaceDir;
  } else if (spaceName && !spaceDir) {
    if (
      spaceName === '.' ||
      spaceName.startsWith('/') ||
      spaceName.startsWith('~') ||
      spaceName.startsWith('./') ||
      spaceName.startsWith('../')
    ) {
      finalDir = spaceName;
    } else {
      finalName = spaceName;
    }
  }

  const expandedDir = resolve(
    process.cwd(),
    finalDir.replace(/^~(?=$|\/|\\)/, homedir()),
  );

  try {
    config.addSpace(finalName, expandedDir);

    const wopalGlobalEnv = join(homedir(), '.wopal', '.env');
    if (!existsSync(join(homedir(), '.wopal'))) {
      mkdirSync(join(homedir(), '.wopal'), { recursive: true });
    }
    if (!existsSync(wopalGlobalEnv)) {
      writeFileSync(wopalGlobalEnv, '', 'utf-8');
    }

    const spaceEnv = join(expandedDir, '.env');
    if (!existsSync(spaceEnv)) {
      if (!existsSync(expandedDir)) {
        mkdirSync(expandedDir, { recursive: true });
      }
      writeFileSync(spaceEnv, '', 'utf-8');
    }

    output.print(`Initialized workspace [${finalName}]`);
    output.println();
    output.print('Configuration:');
    output.print(`  Space: ${expandedDir}`);
    output.print(`  Config: ~/.wopal/config/settings.jsonc`);
    output.println();
    output.print('Next steps:');
    output.print('  Download a skill:');
    output.print('    wopal skills download owner/repo@skill-name');
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error);
    output.error(errMessage);
    process.exit(1);
  }
}

export const initCommand: ModuleEntry = {
  type: 'module',
  id: 'init',
  description: 'Initialize a new wopal workspace',
  register: ({ program, context }) => {
    program
      .command('init [space-name] [space-dir]')
      .description('Initialize a new wopal workspace')
      .action(async (...args) => {
        const options = args.pop();
        const positionalArgs = { arg0: args[0], arg1: args[1] };
        try {
          await initAction(positionalArgs, options as Record<string, unknown>, {
            program,
            context,
          });
        } catch (error) {
          handleCommandError(error);
        }
      })
      .addHelpText(
        'after',
        buildHelpText({
          examples: [
            'wopal init                    # Initialize current directory',
            'wopal init my-project         # Initialize with custom name',
            'wopal init . /path/to/ws      # Initialize specific directory',
          ],
          notes: [
            'Creates .env file in workspace directory',
            'Creates ~/.wopal/.env for global settings',
          ],
        }),
      );
  },
};
```

### 5.2 命令组迁移模板

```typescript
// src/commands/space.ts

import type { ModuleEntry, SubCommandDefinition } from '../program/types.js';
import { registerCommandGroup } from '../program/command-registry.js';
import { handleCommandError, CommandError } from '../lib/error-utils.js';
import { getConfig, resetConfigForTest } from '../lib/config.js';

const listSubcommand: SubCommandDefinition = {
  name: 'list',
  description: 'List all registered spaces',
  options: [{ flags: '--json', description: 'Output as JSON' }],
  action: async (_args, options, context) => {
    try {
      const { output, config } = context;
      const spaces = config.listSpaces();

      if (options.json) {
        output.json(spaces);
        return;
      }

      if (spaces.length === 0) {
        output.print('No spaces registered');
        output.print("Run 'wopal init' to create a space");
        return;
      }

      output.print('Registered spaces:');
      output.println();
      for (const space of spaces) {
        const marker = space.active ? ' *' : '';
        output.print(`  ${space.name}${marker}`);
        output.print(`    Path: ${space.path}`);
      }
      output.println();
      output.print('* = active space');
    } catch (error) {
      handleCommandError(error);
    }
  },
  helpText: {
    examples: ['wopal space list    # List all spaces'],
  },
};

const addSubcommand: SubCommandDefinition = {
  name: 'add <name> [path]',
  description: 'Add a new space',
  options: [{ flags: '--json', description: 'Output as JSON' }],
  action: async (args, options, context) => {
    try {
      resetConfigForTest();
      const config = getConfig();
      const name = args.arg0 as string;
      const path = (args.arg1 as string) || process.cwd();

      config.addSpace(name, path);
      const space = config.listSpaces().find((s) => s.name === name);

      if (options.json) {
        context.output.json({ success: true, space });
        return;
      }

      context.output.print(`Space '${name}' added`);
      context.output.print(`Path: ${space?.path}`);
    } catch (error) {
      throw new CommandError({
        code: 'SPACE_ADD_FAILED',
        message: error instanceof Error ? error.message : String(error),
        suggestion: 'Check if the space name already exists or path is valid',
      });
    }
  },
};

// ... 其他子命令 (remove, use, show)

const spaceGroupDef = {
  name: 'space',
  description: 'Manage workspace spaces',
  subcommands: [
    listSubcommand,
    addSubcommand,
    // removeSubcommand,
    // useSubcommand,
    // showSubcommand,
  ],
  helpText: {
    examples: [
      'wopal space list              # List all spaces',
      'wopal space add my-project    # Add space',
    ],
  },
};

export const spaceCommand: ModuleEntry = {
  type: 'module',
  id: 'space',
  description: 'Manage workspace spaces',
  register: ({ program, context }) => {
    registerCommandGroup(program, spaceGroupDef, context);
  },
};
```

### 5.3 子命令定义文件模板

```typescript
// src/commands/skills/list.ts

import type { SubCommandDefinition } from '../../program/types.js';
import { collectSkills, mergeSkills, getInstalledSkillsDir } from '../../lib/skill-utils.js';
import { getInboxDir } from '../../lib/inbox-utils.js';
import { handleCommandError } from '../../lib/error-utils.js';

export const listSubcommand: SubCommandDefinition = {
  name: 'list',
  description: 'List all skills (INBOX downloaded + installed)',
  options: [
    { flags: '-i, --info', description: 'Show skill descriptions' },
    { flags: '--local', description: 'Show only project-level skills' },
    { flags: '--global', description: 'Show only global-level skills' },
    { flags: '--json', description: 'Output in JSON format' },
  ],
  action: async (_args, options, context) => {
    try {
      const { output } = context;
      const inboxDir = getInboxDir();
      const installedDir = getInstalledSkillsDir();

      const inboxSkills = collectSkills(inboxDir, 'downloaded');
      const installedSkills = collectSkills(installedDir, 'installed');
      const allSkills = mergeSkills(inboxSkills, installedSkills);

      if (options.json) {
        output.json(
          allSkills.map((s) => ({
            name: s.name,
            status: s.status,
            description: s.description,
            path: s.path,
          })),
        );
        return;
      }

      if (allSkills.length === 0) {
        output.print('No skills found');
        return;
      }

      output.print('Skills:\n');
      for (const skill of allSkills) {
        const statusIcon =
          skill.status === 'downloaded' ? '[Downloaded]' : '[Installed]';
        output.print(`  ${statusIcon} ${skill.name}`);
        if (options.info && skill.description) {
          output.print(`           ${skill.description}`);
        }
      }
    } catch (error) {
      handleCommandError(error);
    }
  },
  helpText: {
    examples: [
      'wopal skills list               # List all skills',
      'wopal skills list --info        # List with details',
      'wopal skills list --json        # JSON output',
    ],
    notes: [
      'Shows both INBOX (downloaded) and installed skills',
      'INBOX skills marked with [Downloaded]',
    ],
  },
};
```

### 5.4 命令组入口文件模板

```typescript
// src/commands/skills/index.ts

import type { ModuleEntry } from '../../program/types.js';
import { registerCommandGroup } from '../../program/command-registry.js';

// 导入子命令定义
import { listSubcommand } from './list.js';
import { downloadSubcommand } from './download.js';
import { scanSubcommand } from './scan.js';
import { checkSubcommand } from './check.js';
import { installSubcommand } from './install.js';
import { inboxSubcommands } from './inbox.js';
import { updateScannerSubcommand } from './update-scanner.js';
import { passthroughSubcommand } from './passthrough.js';

const skillsGroupDef = {
  name: 'skills',
  description: 'Manage AI agent skills',
  subcommands: [
    listSubcommand,
    downloadSubcommand,
    scanSubcommand,
    checkSubcommand,
    installSubcommand,
    ...inboxSubcommands,
    updateScannerSubcommand,
    passthroughSubcommand,
  ],
  helpText: {
    workflow: [
      'Download: wopal skills download <source>',
      'Scan: wopal skills scan <skill-name>',
      'Install: wopal skills install <skill-name>',
    ],
  },
};

export const skillsCommand: ModuleEntry = {
  type: 'module',
  id: 'skills',
  description: 'Manage AI agent skills',
  register: ({ program, context }) => {
    registerCommandGroup(program, skillsGroupDef, context);
  },
};
```

---

## 六、cli.ts 完整重构

```typescript
// src/cli.ts

#!/usr/bin/env node
import { Command } from 'commander';
import { getCommandRegistry } from './program/command-registry.js';
import { createProgramContext, type ProgramContext } from './program/context.js';
import { hasFlag } from './argv.js';
import { getVersion } from './route.js';
import { getConfig } from './lib/config.js';
import { OutputService } from './lib/output-service.js';
import { checkInitialization } from './lib/init-check.js';
import { handleCommandError } from './lib/error-utils.js';
import { loadEnvForSpace } from './lib/env-loader.js';
import { buildHelpText, buildHelpHeader } from './lib/help-texts.js';

// 导入命令定义
import { initCommand } from './commands/init.js';
import { spaceCommand } from './commands/space.js';
import { skillsCommand } from './commands/skills/index.js';

async function runCli(argv: string[] = process.argv): Promise<void> {
  const version = getVersion();
  const debug = argv.includes('--debug') || argv.includes('-d');
  const config = getConfig(debug);

  // 初始化 OutputService
  OutputService.init(config);
  OutputService.reset();

  // 创建上下文
  const context: ProgramContext = createProgramContext({
    version,
    debug,
    config,
    output: OutputService.get(),
  });

  // Layer 1: 快速路由（当前仅 --version）
  if (hasFlag(argv, '--version') || hasFlag(argv, '-v')) {
    console.log(version);
    return;
  }

  // 创建注册表并注册命令
  const registry = getCommandRegistry();
  registry.registerAll([
    initCommand,
    spaceCommand,
    skillsCommand,
    // 外部命令在此注册
    // {
    //   type: 'external-passthrough',
    //   id: 'process',
    //   description: 'Manage background processes',
    //   binary: 'process-adapter',
    // },
  ]);

  // Layer 2-3: Commander 流程
  const program = new Command();
  program
    .name('wopal')
    .description('Universal toolbox for wopal agents')
    .version(version, '-v, --version', 'Show version number')
    .option('-d, --debug', 'Enable debug mode')
    .addHelpCommand(false)
    .hook('preAction', (thisCommand, actionCommand) => {
      OutputService.reset();

      // 检测 help 模式
      const isHelp = argv.includes('--help') || argv.includes('-h');
      if (isHelp) {
        OutputService.get().setMode({ showHeader: false });
        return;
      }

      // 检测 JSON 模式
      const actionOptions = actionCommand.opts();
      if (actionOptions.json) {
        OutputService.get().setMode({ showHeader: false });
      }

      // 加载环境变量
      const spacePath = config.getActiveSpacePath();
      loadEnvForSpace(debug, spacePath);

      // 初始化检查
      const commandName = actionCommand.name();
      if (commandName !== 'init' && commandName !== 'space') {
        try {
          checkInitialization();
        } catch (error) {
          handleCommandError(error);
        }
      }
    });

  // 主命令帮助
  program.addHelpText('before', () => {
    return buildHelpHeader(config.getActiveSpace());
  });

  program.addHelpText(
    'after',
    buildHelpText({
      examples: [
        'wopal init                    # Initialize workspace',
        'wopal space list              # List all spaces',
        'wopal skills list             # List all skills',
      ],
      notes: ["Run 'wopal <command> --help' for command details"],
    }),
  );

  // 注册所有命令
  await registry.registerAllToCommander(program, context);

  await program.parseAsync(argv);
}

runCli().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

---

## 七、外部子命令集成

### 7.1 透传模式

适用场景：第三方 CLI、实时流输出命令

```typescript
// 在 cli.ts 中注册
registry.register({
  type: 'external-passthrough',
  id: 'process',
  description: 'Manage background processes',
  binary: 'process-adapter',
  helpCommand: '--help',
});
```

### 7.2 深度集成模式

适用场景：同仓库内的独立包

**前置条件**：
- 外部包需导出 `register<Name>Command(params: RegisterParams)` 函数
- 外部包需支持 ProgramContext

```typescript
// 在 cli.ts 中注册
registry.register({
  type: 'external-integrated',
  id: 'process',
  description: 'Manage background processes',
  modulePath: '@wopal/process/commands',
  exportName: 'registerProcessCommands',
});
```

**外部包实现示例**：

```typescript
// @wopal/process/commands.ts
import type { ModuleEntry, RegisterParams } from 'wopal-cli/program/types';

export function registerProcessCommands({ program, context }: RegisterParams): void {
  program
    .command('process')
    .description('Manage background processes')
    .command('list')
    .action(() => {
      context.output.print('Processes: ...');
    });
}
```

### 7.3 集成方式选择

| 场景 | 推荐方式 | 理由 |
|------|---------|------|
| 核心内置命令 | `module` | 完全控制，性能最优 |
| 第三方 CLI | `external-passthrough` | 无需改造，快速集成 |
| 同仓库独立包 | `external-integrated` | 统一输出格式，保持独立性 |
| 实时流命令 | `external-passthrough` | 捕获会阻塞输出 |

---

## 八、JSON 输出规范

### 8.1 统一响应格式

```typescript
// 成功响应
{
  "success": true,
  "data": <命令返回的数据>
}

// 错误响应
{
  "success": false,
  "error": {
    "code": "SKILL_NOT_FOUND",
    "message": "Skill 'xxx' not found",
    "suggestion": "Use 'wopal skills list' to see installed skills"
  }
}
```

### 8.2 各命令 JSON 输出定义

| 命令 | data 结构 |
|------|-----------|
| `skills list` | `Array<{ name, status, description, path }>` |
| `skills check` | `Array<{ skillName, sourceType, status, installedHash, latestHash }>` |
| `skills scan` | `{ skillName, status, riskScore, summary, findings }` |
| `skills inbox list` | `Array<{ name, description, source, downloadedAt }>` |
| `space list` | `Array<{ name, path, active }>` |

---

## 九、实施计划

### Phase 1: 基础设施 (1 天)

- [ ] 创建 `src/program/types.ts`
- [ ] 重构 `src/program/context.ts`
- [ ] 重构 `src/program/command-registry.ts`
- [ ] 创建 `src/lib/output-service.ts`
- [ ] 更新 `src/program/index.ts` 导出

### Phase 2: 命令迁移 (2 天)

- [ ] 迁移 `init` 命令
- [ ] 迁移 `space` 命令
- [ ] 迁移 `skills/index.ts`
- [ ] 迁移 `skills/list.ts`
- [ ] 迁移 `skills/download.ts`
- [ ] 迁移 `skills/scan.ts`
- [ ] 迁移 `skills/check.ts`
- [ ] 迁移 `skills/install.ts`
- [ ] 迁移 `skills/inbox.ts`
- [ ] 迁移 `skills/update-scanner.ts`
- [ ] 迁移 `skills/passthrough.ts`

### Phase 3: 入口重构 (0.5 天)

- [ ] 重构 `src/cli.ts`
- [ ] 删除 `src/program/register-subclis.ts`

### Phase 4: 测试 (1 天)

- [ ] 创建 `tests/output-service.test.ts`
- [ ] 创建 `tests/command-registry.test.ts`
- [ ] 集成测试

### Phase 5: 文档 (0.5 天)

- [ ] 更新 `AGENTS.md`
- [ ] 添加命令开发指南

**总计**：约 5 天

---

## 十、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 迁移遗漏 | 部分命令无法工作 | 代码 review + 集成测试覆盖 |
| 类型不兼容 | 编译错误 | 渐进迁移，保持向后兼容 |
| 外部命令加载失败 | 命令不可用 | 注册占位符命令，友好错误提示 |
| JSON 格式变更 | 破坏下游消费者 | 保持 data 字段不变，只包装外层 |

---

## 十一、总结

本方案通过 **CommandRegistry + ProgramContext + OutputService** 组合，实现：

1. **统一命令注册**：支持三种集成方式（module、external-passthrough、external-integrated）
2. **统一上下文传递**：通过 ProgramContext 传递配置、输出服务
3. **统一输出格式**：自动 header、标准 JSON 格式
4. **架构一致性**：充分利用 `program/` 模块设计
5. **扩展性强**：易于添加新命令和外部集成
