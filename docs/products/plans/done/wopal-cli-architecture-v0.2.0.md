# wopal-cli v0.2.0 架构升级计划

> **版本**: 0.2.0
> **类型**: 架构重构
> **复杂度**: 中
> **前置依赖**: 无
> **创建时间**: 2026-03-12
> **参考项目**: OpenClaw CLI (`playground/_good_repos/openclaw/src/cli`)

---

## 1. 概述

### 1.1 背景

当前 wopal-cli v0.1.0 位于 `tools/wopal-cli/`，采用同步加载所有命令的架构。随着命令数量增长（现有 8 个 skills 子命令 + 计划中的 fae 6 个子命令），启动性能成为瓶颈。

### 1.2 目标

参考 OpenClaw CLI 的三层优化架构，重构 wopal-cli 为延迟加载模式：
1. **快速路由** - `--help`/`--version` 跳过 commander 直接执行
2. **延迟加载** - 子命令按需动态导入
3. **模块化** - 命令独立注册，职责分离

### 1.3 参考资源

| 资源 | 位置 | 说明 |
|------|------|------|
| OpenClaw CLI 源码 | `playground/_good_repos/openclaw/src/cli` | 延迟加载架构参考 |
| 关键文件 | `program.ts`, `route.ts`, `register.subclis.ts` | 核心实现 |
| 现有 wopal-cli | `tools/wopal-cli/` | v0.1.0 保留备份 |

---

## 2. 架构设计

### 2.1 三层优化机制

```
┌─────────────────────────────────────────────────────────────────┐
│                        cli.ts (入口)                             │
├─────────────────────────────────────────────────────────────────┤
│  Layer 1: tryRouteCli() - 快速路由                               │
│  ├─ 匹配 --help / --version ?                                   │
│  │   └─ YES → 直接输出，跳过 commander（~5ms）                   │
│  │   └─ NO ↓                                                    │
│  │                                                              │
│  Layer 2: buildProgram() - 构建程序                              │
│  ├─ 注册核心命令（init）                                         │
│  └─ 注册占位符命令（skills, fae）                                │
│       │                                                         │
│  Layer 3: registerSubCliByName() - 按需加载                      │
│  └─ 解析 argv，只加载匹配的子命令                                │
│       └─ 动态 import → 替换占位符 → 重新解析                      │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 目录结构

```
projects/agent-tools/wopal-cli/      # 新目录（v0.2.0）
├── package.json
├── tsconfig.json
├── bin/
│   └── wopal                        # CLI 入口脚本
├── src/
│   ├── cli.ts                       # 入口（快速路由 + 延迟加载）
│   ├── argv.ts                      # 轻量 argv 解析
│   ├── route.ts                     # 快速路由（仅 --help/--version）
│   ├── program/
│   │   ├── index.ts                 # buildProgram
│   │   ├── context.ts               # 程序上下文
│   │   ├── command-registry.ts      # 命令注册表
│   │   ├── register-subclis.ts      # 子命令延迟加载
│   │   └── helpers.ts               # 辅助函数
│   ├── commands/
│   │   ├── index.ts                 # 命令导出
│   │   ├── init.ts                  # 初始化（立即加载）
│   │   └── skills/
│   │       ├── index.ts             # skills 主命令
│   │       ├── inbox.ts
│   │       ├── list.ts
│   │       ├── download.ts
│   │       ├── scan.ts
│   │       ├── check.ts
│   │       ├── install.ts
│   │       └── passthrough.ts
│   ├── lib/                         # 核心库（原 utils）
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
│   ├── scanner/                     # 安全扫描器
│   │   ├── scanner.ts
│   │   ├── ioc-loader.ts
│   │   ├── whitelist.ts
│   │   ├── types.ts
│   │   ├── constants.ts
│   │   ├── scanner-utils.ts
│   │   └── checks/
│   │       └── ...（20 项检查）
│   └── types/
│       ├── cli.ts
│       └── lock.ts
├── tests/
│   ├── argv.test.ts
│   ├── route.test.ts
│   ├── program/
│   │   └── register-subclis.test.ts
│   ├── commands/
│   │   └── skills/
│   │       └── *.test.ts
│   └── scanner/
│       └── *.test.ts
└── AGENTS.md                        # 项目规范
```

---

## 3. 核心模块设计

### 3.1 argv.ts - 轻量解析器

**来源**: 移植自 OpenClaw `src/cli/argv.ts`

```typescript
const HELP_FLAGS = new Set(["-h", "--help"]);
const VERSION_FLAGS = new Set(["-v", "-V", "--version"]);

/**
 * 检查是否包含 --help 或 --version
 */
export function hasHelpOrVersion(argv: string[]): boolean;

/**
 * 获取命令路径（如 ["skills", "list"]）
 */
export function getCommandPath(argv: string[], depth?: number): string[];

/**
 * 获取主命令名
 */
export function getPrimaryCommand(argv: string[]): string | null;

/**
 * 检查是否包含指定 flag
 */
export function hasFlag(argv: string[], name: string): boolean;

/**
 * 获取 flag 值
 */
export function getFlagValue(argv: string[], name: string): string | null | undefined;
```

### 3.2 route.ts - 快速路由

**设计原则**: 只处理 `--help` 和 `--version`，其他命令走延迟加载路径。

```typescript
type RouteSpec = {
  match: (path: string[], argv: string[]) => boolean;
  run: (argv: string[]) => Promise<boolean>;
};

const routes: RouteSpec[] = [
  // wopal --version / -v
  {
    match: (path, argv) => path.length === 0 && hasFlag(argv, "--version"),
    run: async (argv) => {
      console.log(getVersion());
      return true;
    },
  },
  // wopal --help / -h（无子命令时）
  {
    match: (path, argv) => path.length === 0 && hasFlag(argv, "--help"),
    run: async (argv) => {
      // 直接输出帮助，跳过 commander
      console.log(getHelpText());
      return true;
    },
  },
];

/**
 * 尝试快速路由
 * @returns true 表示已处理，false 表示需要走 commander
 */
export async function tryRouteCli(argv: string[]): Promise<boolean>;
```

### 3.3 register-subclis.ts - 延迟加载

**来源**: 移植自 OpenClaw `src/cli/program/register.subclis.ts`

```typescript
type SubCliEntry = {
  name: string;
  description: string;
  register: (program: Command) => Promise<void> | void;
};

const entries: SubCliEntry[] = [
  {
    name: "skills",
    description: "Manage AI agent skills",
    register: async (program) => {
      const mod = await import("../commands/skills/index.js");
      mod.registerSkillsCli(program);
    },
  },
  // 0.2.1 新增
  // {
  //   name: "fae",
  //   description: "Sandbox agent management",
  //   register: async (program) => {
  //     const mod = await import("../commands/fae/index.js");
  //     mod.registerFaeCli(program);
  //   },
  // },
];

/**
 * 注册占位符命令
 * - 创建空壳命令，allowUnknownOption + allowExcessArguments
 * - action 中动态 import 真实模块
 * - 移除占位符 → 注册真实命令 → 重新 parseAsync
 */
function registerLazyCommand(program: Command, entry: SubCliEntry): void;

/**
 * 按名称加载单个子命令
 */
export async function registerSubCliByName(program: Command, name: string): Promise<boolean>;

/**
 * 注册所有子命令（占位符模式）
 */
export function registerSubCliCommands(program: Command, argv: string[]): void;
```

### 3.4 cli.ts - 入口重构

```typescript
#!/usr/bin/env node
import { Command } from "commander";
import { loadEnv } from "./lib/env-loader.js";
import { Logger } from "./lib/logger.js";
import { hasHelpOrVersion, getPrimaryCommand } from "./argv.js";
import { tryRouteCli } from "./route.js";
import { buildProgram } from "./program/index.js";
import { registerSubCliByName } from "./program/register-subclis.js";

export async function runCli(argv: string[] = process.argv): Promise<void> {
  // Layer 1: 快速路由
  if (await tryRouteCli(argv)) {
    return;
  }

  // Layer 2: 构建程序
  const program = buildProgram();

  // Layer 3: 按需加载子命令
  const primary = getPrimaryCommand(argv);
  if (primary && !hasHelpOrVersion(argv)) {
    await registerSubCliByName(program, primary);
  }

  await program.parseAsync(argv);
}
```

---

## 4. 实施计划

### Phase 1: 项目初始化（0.5 天）

| 任务 | 文件 | 说明 |
|------|------|------|
| P1-T1 | 目录结构 | 创建 `projects/agent-tools/wopal-cli/` |
| P1-T2 | `package.json` | 复制 0.1.0 并调整 |
| P1-T3 | `tsconfig.json` | ESM 模块配置 |
| P1-T4 | `bin/wopal` | CLI 入口脚本 |

### Phase 2: 核心框架（1.5 天）

| 任务 | 文件 | 说明 |
|------|------|------|
| P2-T1 | `src/argv.ts` | 移植轻量 argv 解析器 |
| P2-T2 | `src/route.ts` | 快速路由（--help/--version） |
| P2-T3 | `src/program/context.ts` | 程序上下文 |
| P2-T4 | `src/program/helpers.ts` | 辅助函数 |
| P2-T5 | `src/program/command-registry.ts` | 命令注册表 |
| P2-T6 | `src/program/register-subclis.ts` | 子命令延迟加载 |
| P2-T7 | `src/program/index.ts` | buildProgram |

### Phase 3: 入口重构（0.5 天）

| 任务 | 文件 | 说明 |
|------|------|------|
| P3-T1 | `src/cli.ts` | 入口（快速路由 + 延迟加载） |

### Phase 4: 库迁移（1 天）

| 任务 | 说明 |
|------|------|
| P4-T1 | 复制 `utils/*.ts` → `lib/*.ts` |
| P4-T2 | 复制 `scanner/` 目录 |
| P4-T3 | 复制 `types/` 目录 |
| P4-T4 | 调整所有 import 路径 |

### Phase 5: 命令迁移（1 天）

| 任务 | 说明 |
|------|------|
| P5-T1 | 创建 `src/commands/skills/index.ts` |
| P5-T2 | 迁移所有 skills 子命令 |
| P5-T3 | 迁移 `init.ts` 命令 |
| P5-T4 | 创建 `src/commands/index.ts` |

### Phase 6: 测试与文档（0.5 天）

| 任务 | 说明 |
|------|------|
| P6-T1 | 复制现有测试 |
| P6-T2 | 新增 argv.ts / route.ts 单元测试 |
| P6-T3 | 创建 `wopal-cli/AGENTS.md` |
| P6-T4 | 更新 `agent-tools/AGENTS.md` |

---

## 5. 验收标准

### 5.1 性能指标

| 指标 | v0.1.0 | v0.2.0 目标 |
|------|--------|-------------|
| `wopal --version` 响应 | ~150ms | **<50ms** |
| `wopal --help` 响应 | ~150ms | **<50ms** |
| `wopal skills list` 首次 | ~200ms | **<150ms** |
| 启动时加载模块数 | 全部 | **仅匹配命令** |

### 5.2 功能验收

- [x] `wopal --version` 正确输出版本
- [x] `wopal --help` 正确输出帮助
- [x] `wopal init` 正常工作
- [x] `wopal skills *` 所有子命令正常工作
- [x] 所有现有功能保持兼容
- [x] 单元测试覆盖率 > 80% (119 tests passed)
- [x] `pnpm build` 无错误
- [x] AGENTS.md 已创建

**执行记录**: 2026-03-12 完成 v0.2.0 架构升级
- 目录位置: `/workspace/wopal-cli/`
- 三层优化架构已实现：快速路由、延迟加载、模块化
- 119 个测试全部通过

---

## 6. 风险评估

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| 动态 import 路径问题 | 低 | 使用 `.js` 后缀，严格 ESM |
| 占位符命令参数丢失 | 中 | `allowUnknownOption` + 重新解析 |
| 测试覆盖不足 | 中 | 优先覆盖核心路径 |
| 与 0.1.0 功能不一致 | 中 | 迁移后逐一验证 |

---

## 7. 后续版本

| 版本 | 目标 | 计划文档 |
|------|------|----------|
| **0.2.1** | fae 功能实现 | `wopal-cli-fae-v0.2.1.md` |

---

## 8. 相关文档

| 文档 | 位置 | 说明 |
|------|------|------|
| PRD | `../PRD-wopal-cli.md` | 产品需求 |
| DESIGN | `../DESIGN-wopal-cli.md` | 详细设计 |
| v0.1.0 项目规范 | `tools/wopal-cli/AGENTS.md` | 旧版本参考 |
| OpenClaw CLI | `playground/_good_repos/openclaw/src/cli` | 架构参考 |

---

> **信心指数**: 9/10
>
> **理由**:
> - OpenClaw CLI 架构成熟，已验证生产可用
> - 现有 wopal-cli 命令结构清晰，迁移风险低
> - 无外部依赖变更，主要是内部重构
