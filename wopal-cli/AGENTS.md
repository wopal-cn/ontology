# wopal-cli v0.2.0

<CRITICAL_RULE>
此文档为 AI agents 提供项目参考，当项目设计和代码变更后，必须及时更新本文档并保持精简有效。
</CRITICAL_RULE>

技能管理 CLI，实现 INBOX 隔离工作流（下载 → 扫描 → 安装），集成 51 项安全检查。

## 命令速查

| 命令 | 参数 | 说明 |
|------|------|------|
| `wopal init [name] [dir]` | - | 初始化工作空间 |
| `wopal space <cmd>` | list/add/remove/use/show | 空间管理 |
| `wopal skills find <query>` | `--limit N` `--json` `--verify` | 搜索技能 (skills.sh API) |
| `wopal skills download <src...>` | `--branch` `--tag` `--force` | 下载到 INBOX（GitHub + well-known） |
| `wopal skills scan [name]` | `--all` `--json` `--output` | 安全扫描 |
| `wopal skills install <source>` | `-g` `--force` `--skip-scan` `--rm-inbox` | 安装技能 |
| `wopal skills check [name]` | `--local` `--global` `--json` | 版本检查 |
| `wopal skills list` | `--info` `--local` `--global` `--json` | 列出技能 |
| `wopal skills inbox <cmd>` | list/show/remove | INBOX 管理 |
| `wopal skills update-scanner` | - | 更新扫描器 |

> 所有命令支持 `--json` 输出和 `--help` 查看详情

## 架构

```
CommandRegistry + ProgramContext + OutputService

cli.ts → route.ts (--version 快速路由)
       → Commander → CommandRegistry.registerAll([commands])
                  → ProgramContext { version, debug, config, output }
                  → OutputService { print, json, jsonError, error, table }
```

## 目录结构

```
src/
├── cli.ts                 # 入口
├── program/               # 命令框架
│   ├── types.ts           # ModuleEntry, SubCommandDefinition, ProgramContext
│   └── command-registry.ts
├── commands/
│   ├── init.ts, space.ts  # 顶层命令
│   └── skills/            # skills 子命令
│       ├── find.ts        # 搜索 (skills.sh API)
│       ├── download.ts    # 下载到 INBOX
│       ├── scan.ts        # 安全扫描
│       ├── install.ts     # 安装
│       ├── check.ts       # 版本检查
│       ├── list.ts        # 列表
│       ├── inbox.ts       # INBOX 管理
│       └── update-scanner.ts
├── lib/
│   ├── config.ts          # ConfigService (空间、配置管理)
│   ├── lock-manager.ts    # wopal-skills.lock 管理
│   ├── download-skill.ts  # 下载编排（API/clone/well-known）
│   ├── wellknown-provider.ts # RFC 8615 well-known provider
│   ├── skill-lock.ts      # 技能元数据
│   ├── output-service.ts  # 统一输出
│   ├── inbox-utils.ts     # INBOX 工具
│   ├── source-parser.ts   # 来源解析 (owner/repo@skill)
│   └── git.ts             # Git 操作
├── scanner/               # OpenClaw 集成
└── types/                 # lock.ts, cli.ts
```

## 开发命令

```bash
pnpm build        # 编译
pnpm test:run     # 测试
pnpm format       # 格式化
```

## 环境变量

| 变量 | 默认值 |
|------|--------|
| `WOPAL_HOME` | `~/.wopal` |
| `WOPAL_SKILLS_DIR` | `<space>/.wopal/skills` |
| `WOPAL_SKILLS_INBOX_DIR` | `<space>/.wopal/skills/INBOX` |
| `WOPAL_SETTINGS_PATH` | `~/.wopal/config/settings.jsonc` |
| `GITHUB_TOKEN` | - (私有仓库) |

## 命令开发

### SubCommandDefinition 模板

```typescript
const mySubcommand: SubCommandDefinition = {
  name: "my-cmd <arg>",
  description: "Description",
  options: [
    { flags: "--json", description: "JSON output" },
  ],
  action: async (args, options, context) => {
    if (options.json) {
      context.output.json({ data });
    } else {
      context.output.print("Result");
    }
  },
  helpText: {
    examples: ["wopal skills my-cmd arg  # Description"],
    notes: ["Important note"],
  },
};
```

### OutputService API

| 方法 | 用途 |
|------|------|
| `print(msg)` | 输出文本 (带 header) |
| `println()` | 空行 |
| `json(data)` | `{ success: true, data }` |
| `jsonError(code, msg)` | `{ success: false, error: {...} }` |
| `error(msg, hint?)` | 错误输出 |

### 写入配置后刷新单例

```typescript
import { getConfig, invalidateConfigInstance } from "../lib/config.js";

config.addSpace(name, path);
invalidateConfigInstance();  // 写入后必须刷新
```

## CLI Help 规范

### 格式标准

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
| WORKFLOW | 可选 | 最多 5 步 |

### 实现方式

```typescript
import { buildHelpText } from "../lib/help-texts.js";

cmd.addHelpText("after", buildHelpText({
  examples: ["wopal cmd --flag    # Description"],
  notes: ["Important note"],
}));
```

## 代码规范

- **风格**: Prettier, 2 空格, 单引号, 分号
- **TypeScript**: 严格模式, ES modules, 避免 `any`
- **测试**: 单元测试 `*.test.ts`
- **Git**: Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`)
- **格式化**: 修改代码后必须运行 `pnpm format`

## CLI UX 规范

- 所有用户界面（help、报错信息等）统一使用英文
- 每个命令的 `--help` 输出要完善，便于 AI agent 了解完整用法
- 所有命令必须支持 `--json` 输出
- 出错时清晰显示错误信息，参数错误时打印指导性说明
- **禁用颜色输出**: 不使用 picocolors 等颜色库，CLI 输出为纯文本

## 关键模块

| 模块 | 说明 |
|------|------|
| `program/types.ts` | ModuleEntry, SubCommandDefinition, ProgramContext |
| `program/command-registry.ts` | CommandRegistry 类 |
| `lib/output-service.ts` | 统一输出，自动 header + 标准 JSON |
| `lib/config.ts` | ConfigService 配置管理 |
| `lib/lock-manager.ts` | skill-lock.json 管理（space/global 分离写入）|
| `lib/skill-lock.ts` | 技能元数据（版本、来源、哈希）|
| `scanner/` | OpenClaw 集成，51 项安全检查 |

## 安装源类型

| 格式 | 类型 | 说明 |
|------|------|------|
| `skill-name` | INBOX | 从 INBOX 安装已扫描的技能 |
| `/absolute/path` | 本地 | 本地技能目录（必须绝对路径）|
| `C:\path` | 本地 | Windows 本地路径 |
| `owner/repo@skill` | 远程 | GitHub 自动 download → scan → install |
| `source@skill` | 远程 | well-known 自动 download → scan → install |
| `https://skills.sh/<source>/<skill>` | 远程 | 自动解析来源后 download → scan → install |

## 下载源类型

| 格式 | 类型 | 说明 |
|------|------|------|
| `owner/repo@skill` | GitHub | GitHub API + clone 回退 |
| `source@skill` | Well-known | 通过 `/.well-known/skills/index.json` 下载 |
| `https://skills.sh/<source>/<skill>` | skills.sh URL | 自动解析为 GitHub 或 well-known |

## 安装级别

| 级别 | 目标目录 | Lock 文件 |
|------|----------|-----------|
| space (默认) | `<space>/.wopal/skills/` | `<space>/.wopal/skills/.skill-lock.json` |
| global (`-g`) | `~/.wopal/skills/` | `~/.wopal/skills/.skill-lock.json` |

## 工作流

### 标准流程
```
download → scan → install
```

### 快捷流程
```
wopal skills install owner/repo@skill  # 自动完成三步
```

### 远程下载回退策略
- GitHub API 优先（自动识别默认分支）→ 失败后 git clone HTTPS → 若鉴权失败再尝试 GitHub SSH clone
- 非 GitHub `source@skill` 走 well-known 协议：`/.well-known/skills/index.json`

### 搜索结果验证
- `skills find` 默认展示 skills.sh 索引结果，可能存在陈旧条目
- `skills find --verify` 会临时执行下载验证，标记结果是否真的可下载
