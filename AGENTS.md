# Agent Tools — 能力锻造层

> **定位**：WopalSpace 的 Agent 能力源码研发中心。所有修改在此，部署到 `.wopal/`，运行时加载自 `.agents/`。

---

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                     WopalSpace 运行时                        │
├─────────────────────────────────────────────────────────────┤
│  .agents/  ←────  .wopal/  ←────  projects/agent-tools/    │
│  (适配层)         (部署层)        (源码层 - 本项目)          │
│  只读引用         只读副本         读写修改                   │
└─────────────────────────────────────────────────────────────┘
```

**部署流**：源码层修改 → `sync-to-wopal.py` → 部署层 → `.agents/` 引用

---

## 资源类型

| 类型 | 作用 | 部署方式 | 修改后 |
|------|------|----------|--------|
| **命令** | 用户调用 `/xxx` | sync-to-wopal.py | 执行部署 |
| **规则** | 注入上下文约束 | sync-to-wopal.py | 执行部署 |
| **技能** | 复杂任务能力包 | wopal-cli install | 执行安装 |
| **代理** | 子代理灵魂提示词 | sync-to-wopal.py | 执行部署 |
| **插件** | 运行时 TS 程序 | sync-to-wopal.py | 执行部署 |

---

## 目录与归属

```
agent-tools/
├── commands/          # [共享] 所有 Agent 通用命令
├── rules/             # [共享] 所有 Agent 通用规则
├── skills/            # [共享] 所有 Agent 通用技能（待安装）
│
├── agents/wopal/      # [Wopal 专用]
│   ├── commands/      # Wopal 专用命令
│   ├── rules/         # Wopal 专用规则
│   ├── skills/        # Wopal 专用技能源码
│   ├── agents/        # 子代理提示词（fae, docs-writer 等）
│   └── plugins/       # 插件（rules-plugin）
│
└── agents/fae/        # [Fae 专用]
    ├── commands/      # Fae 专用命令
    ├── rules/         # Fae 专用规则
    └── skills/        # Fae 专用技能
```

**原则**：共享层优先，专用层补充。修改共享资源影响所有 Agent。

---

## 快速定位

```bash
# 命令（共享层）
find commands -name "xxx.md"

# 命令（Wopal 专用）
find agents/wopal/commands -name "xxx.md"

# 技能
find agents/wopal/skills -type d -name "xxx*"

# 全局搜索（不确定归属时）
find . -path "*/node_modules" -prune -o -name "*.md" -print | xargs grep -l "关键词"
```

---

## 开发规范

### 部署流程

```bash
# 命令/规则/代理/插件修改后
python ../scripts/sync-to-wopal.py -y

# 技能修改后（需加载 skill-master）
wopal skills install /absolute/path/to/skill
```

### 技能操作

**必须通过 `skill-master` 技能**，禁止手动执行。

| 操作 | 流程 |
|------|------|
| 安装技能 | 加载 skill-master → 执行命令 |
| 更新技能 | 修改源码 → 加载 skill-master → 重新安装 |
| 部署技能 | 加载 skill-master → 选择正确参数 |

### 技能安装归属

| 源码路径 | 安装命令 |
|----------|----------|
| `skills/<name>/` | `wopal skills install <path>` |
| `agents/<agent>/skills/<name>/` | `wopal skills install --agent <agent> <path>` |

### 代码风格

- Markdown：LF 换行
- TypeScript 插件：遵循 eslint/prettier 配置