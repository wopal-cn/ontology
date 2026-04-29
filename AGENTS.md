# WopalSpace ontology — 本体能力锻造层

> **定位**：WopalSpace 的 Agent 能力源码研发中心。所有修改在此，部署到空间 `.wopal/` 目录。


---

## 核心能力：技能（Skills）

技能是本项目的**首要产出**，是可复用、可分发、可版本化的 Agent 能力单元。

### 技能开发规范

#### 目录结构

```
skill-name/
├── SKILL.md          # 必须：YAML frontmatter + Markdown 指令
├── scripts/          # 可选：可执行脚本（确定性/重复任务）
├── references/       # 可选：按需加载的参考文档
└── assets/           # 可选：模板、图标等静态资源
```

#### 渐进式披露（三级加载）

| 层级 | 内容 | 限制 | 说明 |
|------|------|------|------|
| 元数据 | name + description | ~100 字 | 始终可见，决定是否触发 |
| 主体 | SKILL.md body | <500 行 | 触发后加载，核心流程 |
| 资源 | scripts/references/assets | 无限制 | 按需读取或执行 |

**原则**：主体超 500 行时拆分到 references/，SKILL.md 中明确指引。

#### Description 编写

**是主要触发机制**，需包含：
1. 技能做什么
2. 何时使用（具体场景/用户短语）
3. 适当"pushy"——宁可多触发也不要漏触发

**示例**：
```yaml
description: |
  Compress official documentation into concise AI references. ⚠️ MUST use when user requests:
  (1) Documentation compression or condensing, (2) Creating AI-friendly reference materials,
  (3) Reducing token usage for large documentation, (4) Extracting technical specifications.
  🔴 Trigger even when user does not explicitly mention "AI reference" if the task involves
  documentation compression or spec extraction.
```

**🚫 禁止包含**：
- 详细执行步骤（属于 SKILL.md body）
- 代码示例或模板（属于 scripts/ 或 assets/）
- 框架/平台特定细节（属于 references/）
- 模糊触发条件（如"相关场景"、"类似任务"）

#### SKILL.md 编写

**结构**：
1. 标题 + 一句话定位
2. 核心流程（步骤化）
3. 输出格式（模板/示例）
4. 注意事项（边缘情况）

**风格**：
- 用祈使句（"执行 X"，而非"你应该执行 X"）
- 解释 **why** 而非堆砌 `MUST`/`ALWAYS`——LLM 理解原理后更可靠
- 避免强制固定步骤顺序，保持适应不同场景的灵活性
- 包含真实示例，展示输入/输出

**🚫 禁止包含**：
- 恶意代码、exploit、数据窃取逻辑
- 过度具体的硬编码参数（应提取到 references/ 或配置文件）
- 冗余的背景介绍（用户不需要知道技能的历史）
- 技能设计原理、优化过程、版本历史等元信息（属于开发者文档，非 Agent 指令）

**必须显式声明**：
- 依赖的其他技能或工具（如"依赖 `skill-master` 技能，执行前必须加载"）
- 必需的环境变量或外部配置
- 与其他技能协作时的调用顺序

#### 质量验证

1. **设计 2-3 个真实测试用例**——用户实际会说的 prompt
2. **迭代循环**：执行 → 评估 → 改进 → 重复
3. **观察重复工作**：多测试用例出现相同脚本 → 提取到 scripts/

#### 资源引用

在 SKILL.md 中清晰指引何时读取：
```markdown
## 参考
- 云平台部署参数见 `references/aws.md`（仅 AWS 场景读取）
- API 规范见 `references/api-schema.md`
```

大参考文件（>300 行）包含目录，便于定位。

> 部署后可通过 `.wopal/.skill-lock.json` 溯源技能版本

---

## 其他资源类型

| 类型 | 作用 | 部署方式 |
|------|------|----------|
| **技能** | 可复用能力单元 | `wopal skills install` (copy → `.wopal/skills/`) |
| **命令** | 用户调用 `/xxx` | `sync-to-wopal.py` (copy → `.wopal/commands/`) |
| **规则** | 注入上下文约束 | `sync-to-wopal.py` (copy → `.wopal/rules/`) |
| **代理** | 子代理灵魂提示词 | `sync-to-wopal.py` (copy → `.wopal/agents/`) |
| **插件** | 运行时 TS 程序 | `.opencode/plugins/` symlink 自动发现 |

> **技能溯源**：`.wopal/.skill-lock.json`
> **其他资源溯源**：`.wopal/<类型>/.versions.json`

---

## 技能部署

技能通过 `wopal skills install` 命令部署：

```bash
# 安装技能
wopal skills install <绝对路径> --force

# 卸载技能
wopal skills remove <name> --force
```

**参数说明**：
- `--force`：强制覆盖已存在的安装

**禁止操作**：
- 手动 `cp`/`ln -s` 技能目录
- 直接编辑 `.wopal/skills/`
- 手动删除技能目录（用 `wopal skills remove`）

---

## 插件开发

**详细规范**：`wopal-plugin/AGENTS.md`

插件是 TypeScript 编写的 OpenCode 运行时扩展，提供：

| 能力 | 描述 |
|------|------|
| **规则注入** | 发现规则文件 → 匹配条件 → 注入系统提示词 |
| **任务委派** | 非阻塞子会话启动、状态监控、双向通信 |
| **记忆系统** | LanceDB 存储、语义检索、蒸馏注入 |
| **上下文管理** | 会话摘要、session title 管理 |

**部署机制**：通过 `.opencode/plugins/` symlink 自动发现，无需 `sync-to-wopal.py`。详见插件模块文档。

---

## 资源层次与归属

### 源码结构

```
projects/ontology/
├── skills/              # 所有技能统一存放
├── commands/
│   ├── *.md             # 共享命令
│   └── wopal/           # Wopal 专属命令
├── rules/
│   ├── *.md             # 共享规则  
│   └── wopal/           # Wopal 专属规则
├── agents/
│   ├── wopal.md         # Wopal agent 定义
│   ├── wopal-cn.md
│   ├── fae.md           # Fae agent 定义
│   └── fae-cn.md
└── wopal-plugin/        # 插件
```

### 部署位置

| 资源类型 | 源码位置 | 部署位置 | 部署方式 |
|----------|----------|----------|----------|
| 技能 | `skills/` | `.wopal/skills/` | `wopal skills install` (copy) |
| 共享命令 | `commands/*.md` | `.wopal/commands/` | `sync-to-wopal.py` (copy) |
| Wopal 命令 | `commands/wopal/*.md` | `.wopal/commands/wopal/` | `sync-to-wopal.py` (copy) |
| 共享规则 | `rules/*.md` | `.wopal/rules/` | `sync-to-wopal.py` (copy) |
| Wopal 规则 | `rules/wopal/*.md` | `.wopal/rules/wopal/` | `sync-to-wopal.py` (copy) |
| Agent 定义 | `agents/*.md` | `.wopal/agents/` | `sync-to-wopal.py` (copy) |
| 插件 | `wopal-plugin/` | `.opencode/plugins/` | symlink 自动发现 |

### Agent 技能权限

Agent 通过 `permission.skill` 配置控制技能可见性：

```yaml
# Fae 示例：仅允许特定技能
permission:
  skill:
    "*": deny
    project-worktrees: allow

# Wopal 示例：允许所有技能
permission:
  "*": allow
```

**原则**：技能统一部署，通过 Permission 实现隔离。修改 `permission.skill` 即可调整 Agent 可用技能。


