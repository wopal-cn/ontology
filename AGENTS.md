# Agent Tools - Agent Context

## 概览

Agent 工具集，包含自定义命令、规则、插件和技能。

## 目录结构

```
agent-tools/
├── commands/        # 自定义命令（8个）
├── rules/           # 通用规则（6个）
├── plugins/opencode/ # OpenCode 插件
├── skills/          # 技能
│   ├── my-skills/   # 自研技能
│   ├── installed/    # 已安装技能
│   └── download/    # 下载技能
├── subagents/       # 子代理
└── templates/       # 项目模板
```

## 自定义命令

| 命令 | 功能 |
|------|------|
| `commit` | Git 提交助手 |
| `create-prd` | 创建产品需求文档 |
| `create-rules` | 创建项目规则 |
| `execute` | 执行计划 |
| `init-py-project` | 初始化 Python 项目 |
| `today-memo` | 记录短期记忆 |
| `plan-feature` | 功能规划 |
| `prime` | 加载项目上下文 |
| `pin-submodule` | 创建子模块里程碑快照 |

## 规则文件

| 规则 | 用途 |
|------|------|
| `git.md` | Git 工作流与提交规范 |
| `submodule.md` | Git Submodule 工作流 |
| `python.md` | Python 开发规范 |
| `typescript.md` | TypeScript 开发规范 |
| `astro.md` | Astro 开发规范 |
| `dev-skills.md` | 技能开发规范 |
| `use-skill.md` | 技能使用规范 |

## 自研技能

| 技能 | 功能 | 文档路径 |
|------|------|----------|
| AI Ref Creator | 官方文档→AI参考 | `skills/my-skills/ai-ref-creator/SKILL.md` |
| Tutorial Generator | 文档→教程 | `skills/my-skills/tutorial-generator/SKILL.md` |
| Skill Security Scanner | 安全扫描 | `skills/my-skills/skill-security-scanner/SKILL.md` |
| OpenCode Config | OpenCode 配置 | `skills/my-skills/opencode-config/SKILL.md` |

> **提示**: 技能详情请读取对应的 `SKILL.md` 文件。
