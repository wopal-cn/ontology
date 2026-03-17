# Agent Tools - 项目规范

<CRITICAL_RULE>
本项目是本工作空间内各类 agents 能力工具开发，本文档为 AI agents 提供开发规范和指导，当项目设计、代码、资料变更后，必须及时更新本文档。
</CRITICAL_RULE>

---

## 目录结构

```
agent-tools/
├── commands/            # 共享命令（所有 Agent 通用）
├── rules/               # 共享规则（所有 Agent 通用）
├── skills/              # 共享技能源码（通过 wopal-cli 安装）
├── agents/              # Agent 专用资源
│   ├── wopal/           # Wopal 专用（合并到适配分身层）
│   │   ├── commands/    # Wopal 专用命令
│   │   ├── rules/       # Wopal 专用规则
│   │   ├── skills/      # Wopal 专用技能源码（通过 wopal-cli 安装）
│   │   ├── agents/      # 代理系统提示词（多代理定义）
│   │   └── plugins/     # 插件（如 rules-plugin）
│   └── fae/             # Fae 专用（独立，不合并）
└── .deploy-ignore       # 部署排除规则
```

---

## 开发命令

```bash
# 部署代理/命令/规则到工作空间（修改后必须执行）
python ../scripts/sync-to-wopal.py -y

# 技能安装（使用 wopal-cli）
wopal skills install /absolute/path/to/skill   # 本地技能
wopal skills install owner/repo@skill          # 远程技能
wopal skills list                              # 查看已安装技能

# 插件开发（rules-plugin）
cd agents/wopal/plugins/rules-plugin
bun install
bun run build
bun test
```

---

## 代码风格

- Markdown 文件使用 LF 换行
- TypeScript 插件遵循项目 eslint/prettier 配置

---

## 资源清单

### 共享命令 (commands/)

| 命令 | 功能 |
|------|------|
| `commit` | Git 提交助手 |
| `context-continue` | 上下文续接 |
| `context-handoff` | 上下文移交 |
| `create-prd` | 创建产品需求文档 |
| `execute` | 执行计划 |
| `opsx/*` | OpenSpec 命令集 |
| `plan-feature` | 功能规划 |

### 共享规则 (rules/)

| 规则 | 用途 |
|------|------|
| `astro.md` | Astro 开发规范 |
| `git-flow.md` | Git 工作流与提交规范 |
| `python.md` | Python 开发规范 |
| `typescript.md` | TypeScript 开发规范 |

### 共享技能 (skills/)

| 技能 | 功能 |
|------|------|
| `download` | 技能下载缓存 |
| `firecrawl` | 网页提取和爬取 |
| `openspec-*` | OpenSpec 工作流系列 |
| `todo-tracker` | TODO 管理（位置：`memory/TODO.md`）|

### Wopal 专用命令 (agents/wopal/commands/)

| 命令 | 功能 |
|------|------|
| `cupdate-project-spec` | 创建/更新项目规范文档 |
| `evaluate-skill` | 技能评估 |
| `pin-submodule` | 固定子模块版本 |
| `summon` | 召唤子代理 |
| `today-memo` | 今日备忘 |
| `wopal-evolve` | 知识沉淀 |

### Wopal 专用规则 (agents/wopal/rules/)

| 规则 | 用途 |
|------|------|
| `dev-skill.md` | 技能开发规范 |
| `mem-rule.md` | 记忆规则 |
| `spec.md` | 规范规则 |
| `use-skill.md` | 技能使用规范 |

### Wopal 专用技能 (agents/wopal/skills/)

| 技能 | 功能 |
|------|------|
| `agent-orchestration` | 多 Agent 编排协作 |
| `ai-ref-creator` | 官方文档压缩为 AI 参考 |
| `crafting-opencode-rules` | OpenCode 规则创建 |
| `git-submodule` | Git 子模块管理 |
| `git-worktrees` | Worktree 工作流管理 |
| `opencode-config` | OpenCode 配置管理 |
| `skill-deployer` | 技能部署器 |
| `skill-master` | 技能生命周期管理（find/download/scan/install） |
| `skill-security-scanner` | 技能安全扫描 |
| `skills-research` | 技能研究与下载（旧版，保留） |
| `tutorial-generator` | 教程生成器 |
| `website-doc-scraper` | 网站文档抓取 |

### Wopal 专用插件 (agents/wopal/plugins/)

| 插件 | 说明 |
|------|------|
| `rules-plugin` | OpenCode 规则注入插件（TypeScript），含 wopal_task 会话归属校验与后台任务状态管理 |

- **运行测试**: `cd agents/wopal/plugins/rules-plugin && bun test`
- **测试位置**: `agents/wopal/plugins/rules-plugin/src/*.test.ts`

---

## 关键模块

| 模块 | 说明 |
|------|------|
| `commands/*.md` | 命令定义（Markdown 格式） |
| `rules/*.md` | 规则定义（Markdown 格式） |
| `skills/*/SKILL.md` | 技能定义（Markdown 格式） |
| `agents/wopal/plugins/rules-plugin/` | OpenCode 规则插件（TypeScript） |
| `.deploy-ignore` | 部署排除规则 |
