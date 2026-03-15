# Agent Tools - 项目规范

<CRITICAL_RULE>
此文档为 AI agents 提供项目开发规范，当项目设计或代码变更后，必须及时更新本文档。
</CRITICAL_RULE>

---

## 架构

```
源码层 (projects/agent-tools/)
    ↓ sync-to-wopal.py
部署层 (.wopal/)
    ↓ symlink/copy
适配分身层 (.agents/)
```

**核心数据流**: 命令/规则/技能的定义 → 部署脚本 → 各 AI 工具配置目录

---

## 目录结构

```
agent-tools/
├── commands/            # 共享命令（所有 Agent 通用）
├── rules/               # 共享规则（所有 Agent 通用）
├── skills/              # 共享技能（所有 Agent 通用）
├── agents/              # Agent 专用资源
│   ├── wopal/           # Wopal 专用（合并到适配分身层）
│   │   ├── commands/    # Wopal 专用命令
│   │   ├── rules/       # Wopal 专用规则
│   │   ├── skills/      # Wopal 专用技能
│   │   ├── agents/      # 子代理 + 模板
│   │   │   ├── ref/     # 子代理定义
│   │   │   ├── SOUL.md  # Wopal 身份定义
│   │   │   └── USER.md  # 用户偏好
│   │   └── plugins/     # 插件（如 rules-plugin）
│   └── fae/             # Fae 专用（独立，不合并）
└── .deploy-ignore       # 部署排除规则
```

---

## 开发命令

```bash
# 部署到工作空间（修改后必须执行）
python ../scripts/sync-to-wopal.py -y

# 验证部署
ls -la ../../.wopal/commands ../../.wopal/rules ../../.wopal/skills

# 插件开发（rules-plugin）
cd agents/wopal/plugins/rules-plugin
bun install
bun run build
bun test
```

---

## 开发约束

> **关键规则**：必须遵守的开发约束。

### 部署铁律

- **所有修改必须在源码层进行**：禁止直接编辑 `.wopal/` 或 `.agents/`
- **修改后必须运行部署脚本**：`python ../scripts/sync-to-wopal.py -y`
- **命令/规则使用 copy**：AI 工具兼容性要求
- **技能使用 symlink**：目录级合并

### 代码风格

- Markdown 文件使用 LF 换行
- TypeScript 插件遵循项目 eslint/prettier 配置

### 术语规范

- **space**：统一使用 space，避免 workspace/project/scope 混用
- **技能**：skill，非 plugin/extension
- **命令**：command，非 workflow

### 资源分类

- **共享资源**（`commands/`, `rules/`, `skills/`）：所有 Agent 通用
- **专用资源**（`agents/<name>/`）：特定 Agent 专用，需明确归属

---

## 项目特有模式

### 三层部署架构

| 层级 | 路径 | 定位 | 写权限 |
|------|------|------|--------|
| 源码层 | `projects/agent-tools/` | 所有修改在此进行 | ✅ |
| 部署层 | `.wopal/` | 版本追踪的只读副本 | ❌ |
| 适配分身层 | `.agents/` | 合并共享 + 专用，供各工具引用 | ❌ |

### 资源合并规则

```
.agents/ = .wopal/ (共享) + agents/wopal/ (专用)
```

- 命令/规则：copy 合并
- 技能：symlink 目录级合并

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
| `skill-security-scanner` | 技能安全扫描 |
| `skills-research` | 技能研究与下载 |
| `tutorial-generator` | 教程生成器 |
| `website-doc-scraper` | 网站文档抓取 |

### 子代理 (agents/wopal/agents/ref/)

**Claude Code (9个)**: architect, build-error-resolver, code-reviewer, doc-updater, e2e-runner, planner, refactor-cleaner, security-reviewer, tdd-guide

**OpenCode (3个)**: code-quality-reviewer, docs-writer, security-auditor

### 插件 (agents/wopal/plugins/)

| 插件 | 说明 |
|------|------|
| `rules-plugin` | OpenCode 规则注入插件（TypeScript），含 wopal_task 会话归属校验与后台任务状态管理 |

---

## 关键模块

| 模块 | 说明 |
|------|------|
| `commands/*.md` | 命令定义（Markdown 格式） |
| `rules/*.md` | 规则定义（Markdown 格式） |
| `skills/*/SKILL.md` | 技能定义（Markdown 格式） |
| `agents/wopal/plugins/rules-plugin/` | OpenCode 规则插件（TypeScript） |

---

## 测试

- **运行测试**: `cd agents/wopal/plugins/rules-plugin && bun test`
- **测试位置**: `agents/wopal/plugins/rules-plugin/src/*.test.ts`
- **任务委派测试重点**: launch 失败显式报错、父会话 ownership 校验、session.idle/session.error 与 cancel 竞态保护

---

## 关键文件

| 文件 | 用途 |
|------|------|
| `.deploy-ignore` | 部署排除规则 |
| `agents/wopal/agents/SOUL.md` | Wopal 身份定义 |
| `agents/wopal/agents/USER.md` | 用户偏好 |

---

## 备注

- 技能详情读取 `skills/<技能名>/SKILL.md` 或 `agents/wopal/skills/<技能名>/SKILL.md`
- Fae 专用资源位于 `agents/fae/`，不参与合并
