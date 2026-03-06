# Agent Tools - Agent Context

## 概览

Agent 工具集，包含自定义命令、规则、插件、技能和工具脚本。

## 目录结构

```
agent-tools/
├── commands/        # 自定义命令（11个）
├── rules/           # 通用规则（6个）
├── plugins/         # Agent 平台插件
│   └── opencode/    # OpenCode 插件
├── skills/          # 技能
│   ├── my-skills/   # 自研技能（11个）
│   └── download/    # 下载技能
├── subagents/       # 子代理配置
│   ├── claude-code/ # Claude Code 子代理（9个）
│   └── opencode/    # OpenCode 子代理（3个）
├── tools/           # 工具脚本
│   ├── process/     # 进程管理工具
│   └── wopal-cli/   # Wopal Skills CLI
└── templates/       # 项目模板
```

## 自定义命令

| 命令 | 功能 |
|------|------|
| `commit` | Git 提交助手 |
| `create-prd` | 创建产品需求文档 |
| `cupdate-project-charter` | 更新项目章程 |
| `evaluate-skill` | 评估技能质量 |
| `execute` | 执行计划 |
| `opsx` | OpenSpec 命令集 |
| `pin-submodule` | 创建子项目里程碑快照 |
| `plan-feature` | 功能规划 |
| `summon` | 唤醒 Wopal 并加载上下文 |
| `today-memo` | 记录短期记忆 |
| `wopal-evolve` | Wopal 自我进化工具 |

## 规则文件

| 规则 | 用途 |
|------|------|
| `git-flow.md` | Git 工作流与提交规范 |
| `python.md` | Python 开发规范 |
| `typescript.md` | TypeScript 开发规范 |
| `astro.md` | Astro 开发规范 |
| `skills.md` | 技能开发与使用规范 |
| `mem-rule.md` | 记忆管理规则 |

## 自研技能

| 技能 | 功能 |
|------|------|
| agent-orchestration | 多 Agent 编排协作 |
| ai-ref-creator | 官方文档压缩为 AI 参考 |
| crafting-opencode-rules | OpenCode 规则创建 |
| docs | 文档工具集 |
| git-submodule | Git Submodule 工作流 |
| opencode-config | OpenCode 配置管理 |
| skill-deployer | 技能部署工具 |
| skill-security-scanner | 技能安全扫描 |
| skills-research | 技能搜索与下载 |
| tutorial-generator | 文档转教程 |
| website-doc-scraper | 网站文档抓取 |

> **提示**: 技能详情请读取 `skills/my-skills/<技能名>/SKILL.md`

## 工具脚本

### process - 后台进程管理工具

独立 npm 包（`@wopal/process`），为 agent-orchestration 技能提供后台进程管理能力。

**功能**：启动、监控、交互后台进程，支持长时间运行任务的异步管理。

**命令**：`process-adapter`（全局命令，start/list/log/poll/write/kill/clear/remove）

- 位置：`tools/process/`
- 文档：`tools/process/README.md`

### wopal-cli - Wopal Skills CLI

技能管理命令行工具，实现 INBOX 隔离工作流（下载 → 扫描 → 评估 → 安装）。

**技术栈**：TypeScript + ES modules + commander.js

**功能**：
- INBOX 管理：`wopal inbox list/show/remove`
- 技能列表：`wopal list [--info]`
- 透传搜索：`wopal find [query]`
- 技能下载：`wopal skills download <sources...> [--branch|--tag] [--force]`

**版本指纹机制**：
- **GitHub Tree SHA**：技能文件夹级别的哈希（`skillFolderHash`），任何文件变化都会改变
- **Commit SHA**：用于追溯具体提交（`commit`）
- **分支/标签记录**：记录用户指定的版本（`ref`/`tag`）
- **GitHub Token**：支持 `GITHUB_TOKEN`/`GH_TOKEN`/`gh auth token` 认证（提高 API 速率限制）

**配置**：
- 环境变量：`SKILL_INBOX_DIR`（默认 `~/.wopal/skills/INBOX`）
- 调试模式：`-d/--debug`（加载 cwd/.env，日志输出到 cwd/logs/）

**位置**：`tools/wopal-cli/`

**后续扩展**：scan、install、check、update 命令

## 子代理配置

### Claude Code 子代理（9个）

- architect.md - 架构设计
- build-error-resolver.md - 构建错误解决
- code-reviewer.md - 代码审查
- doc-updater.md - 文档更新
- e2e-runner.md - E2E 测试运行
- planner.md - 计划制定
- refactor-cleaner.md - 重构清理
- security-reviewer.md - 安全审查
- tdd-guide.md - TDD 指导

### OpenCode 子代理（3个）

- code-quality-reviewer.md - 代码质量审查
- docs-writer.md - 文档编写
- security-auditor.md - 安全审计
