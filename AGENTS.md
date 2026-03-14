# Agent Tools - Agent Context

## 概览

Agent 工具集，包含自定义命令、规则、插件、技能和工具脚本。

## 目录结构

```
agent-tools/
├── commands/        # 共享命令
├── rules/           # 共享规则
├── skills/          # 共享技能
├── agents/          # Agent 专用资源
│   ├── wopal/       # Wopal 专用（合并到适配分身层）
│   └── fae/         # Fae 专用（独立，不合并）
├── plugins/         # Agent 平台插件
├── tools/           # 工具脚本
└── templates/       # 项目模板
```

## 自定义命令

| 命令 | 功能 |
|------|------|
| `commit` | Git 提交助手 |
| `create-prd` | 创建产品需求文档 |
| `cupdate-project-spec` | 更新项目规范 |
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
| project-worktrees | 项目级 worktree 管理（面向协同 Agent） |
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
