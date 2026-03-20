# Agent Tools

AI Agent 能力锻造工具集 — 为 AI 编码助手提供可插拔的命令、规则、技能和插件。

## 核心能力

| 能力 | 说明 |
|------|------|
| **命令** | 扩展指令集：Git 提交、PRD 创建、功能规划、OpenSpec 工作流等 |
| **规则** | 代码规范注入：TypeScript、Python、Astro、Git Flow |
| **技能** | 复杂任务能力包：多代理编排、技能安全扫描、文档压缩、配置管理 |
| **代理** | 子代理灵魂：Fae（执行代理）、docs-writer、security-auditor 等 |
| **插件** | 运行时扩展：OpenCode 规则注入、会话校验、任务状态管理 |

## 快速开始

```bash
# 查看可用命令
ls commands/

# 查看技能
ls agents/wopal/skills/

# 部署到运行环境
python scripts/sync-to-wopal.py -y
```

## 架构

```
┌─────────────────────────────────────────────────────┐
│                    源码层 (本项目)                    │
├─────────────────────────────────────────────────────┤
│  commands/    rules/    skills/    agents/          │
│  (共享资源)                      (专用资源)          │
└──────────────────────┬──────────────────────────────┘
                       │ 部署
                       ▼
┌─────────────────────────────────────────────────────┐
│  .wopal/     →     .agents/                         │
│  (部署层)         (运行时引用)                        │
└─────────────────────────────────────────────────────┘
```

**原则**：共享层优先，专用层补充。

## 目录结构

```
agent-tools/
├── commands/          # 共享命令（所有 Agent 通用）
├── rules/             # 共享规则
├── skills/            # 共享技能
│
├── agents/wopal/      # Wopal 专用
│   ├── commands/      # 专用命令
│   ├── skills/        # 专用技能（plan-master, skill-master 等）
│   ├── agents/        # 子代理提示词（fae, docs-writer 等）
│   └── plugins/       # 插件（rules-plugin）
│
└── agents/fae/        # Fae 专用
```

## 核心技能

| 技能 | 用途 |
|------|------|
| `plan-master` | 计划追踪管理 |
| `skill-master` | 技能生命周期管理 |
| `agent-orchestration` | 多 Agent 编排协作 |
| `git-worktrees` | Worktree 并行开发工作流 |
| `git-submodule` | 子模块管理 |
| `skill-security-scanner` | 技能安全扫描（20+ 检查项） |
| `ai-ref-creator` | 官方文档压缩为 AI 参考 |
| `website-doc-scraper` | 网站文档抓取 |

## 开发

```bash
# 部署命令/规则/代理/插件
python scripts/sync-to-wopal.py -y

# 安装技能（通过 wopal-cli）
wopal skills install /path/to/skill

# 插件开发
cd agents/wopal/plugins/rules-plugin
bun install && bun run build && bun test
```

## 插件

### rules-plugin

OpenCode 规则注入 + 非阻塞任务委派。

**功能**：
- 自动发现 `.md` 规则文件并注入系统提示词
- `wopal_task` — 启动后台任务
- `wopal_output` — 查询任务状态和结果
- `wopal_cancel` — 取消运行中任务

**使用示例**：
```typescript
wopal_task({
  description: "实现登录功能",
  prompt: "在 /project/src/auth.ts 中...",
  agent: "general"
})
```

**参数**：
| 参数 | 说明 |
|------|------|
| `timeout` | 超时秒数（默认 300，最大 3600） |
| `staleTimeout` | 无活动超时秒数（默认 180，最大 1800） |

**注意事项**：
- 启动后等待 `[WOPAL TASK COMPLETED]` 通知，不要轮询
- 长测试任务设置 `staleTimeout: 600` 避免误杀
- 详细文档见 `docs/ai-references/fae/wopal-task-tools.md`

## 文档

- [AGENTS.md](AGENTS.md) — 完整开发规范与架构说明

## License

MIT