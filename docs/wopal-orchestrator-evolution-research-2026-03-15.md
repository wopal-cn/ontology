# Wopal Orchestrator 进化研究报告

> 研究日期: 2026-03-15
> 研究对象: `labs/fork/sampx/oh-my-openagent`、`labs/ref-repos/opencode/packages/opencode`、`projects/agent-tools/agents/wopal/plugins`
> 目的: 为 Wopal 后续构建 `wopal-orchestrator-plugin` 提供可复用研究基线，避免在后续迭代中重复分析

---

## 1. 研究目标

本次研究的核心问题有四个：

1. `oh-my-openagent` 中哪些 agent 设计最值得借鉴
2. Sisyphus 真正强在哪里，它依赖了哪些私有武器
3. OpenCode 原生插件机制允许做什么，不允许做什么
4. Wopal 当前已有插件能力是什么，未来的 `wopal-orchestrator-plugin` 应该怎样落地才兼容、可演进、可回退

本报告聚焦“事实、结构、边界、迁移判断”，不直接承担实施设计；实施方案另见 `docs/products/plans/wopal-orchestrator-evolution-plan.md`。

---

## 2. 研究范围与参考源

### 2.1 主要参考项目

| 项目 | 路径 | 角色 |
|------|------|------|
| oh-my-openagent | `labs/fork/sampx/oh-my-openagent` | 参考多 agent 编排体系与 Sisyphus 架构 |
| OpenCode | `labs/ref-repos/opencode/packages/opencode` | 宿主插件机制、agent/config/tool/runtime 边界 |
| Wopal agent-tools | `projects/agent-tools` | 当前 Wopal 插件与部署体系 |

### 2.2 关键证据文件

| 类型 | 路径 | 用途 |
|------|------|------|
| agent 注册 | `labs/fork/sampx/oh-my-openagent/src/agents/builtin-agents.ts` | 11 个 agent 的构造与动态注入 |
| 主编排 agent | `labs/fork/sampx/oh-my-openagent/src/agents/sisyphus.ts` | Sisyphus prompt 与工作流骨架 |
| OpenCode 插件入口 | `labs/ref-repos/opencode/packages/opencode/src/plugin/index.ts` | 插件加载与 hook 分发 |
| OpenCode prompt 循环 | `labs/ref-repos/opencode/packages/opencode/src/session/prompt.ts` | messages transform、tool hook、subtask 流程 |
| OpenCode system transform | `labs/ref-repos/opencode/packages/opencode/src/session/llm.ts` | system prompt transform 注入点 |
| OpenCode config loader | `labs/ref-repos/opencode/packages/opencode/src/config/config.ts` | agent/plugin 自动发现与加载优先级 |
| 现有 Wopal 插件 | `projects/agent-tools/agents/wopal/plugins/rules-plugin/src/runtime.ts` | Wopal 当前已实践的 hook 能力 |
| 同步配置 | `scripts/sync-config.yaml` | Wopal 插件部署链路 |

---

## 3. oh-my-openagent 总体架构结论

### 3.1 它不是“几个 prompt 文件”，而是一整套编排平台

`oh-my-openagent` 的强大不来自某个单独 prompt，而来自以下叠加：

1. 多 agent 体系
2. 动态 prompt 构造器
3. 私有 task/后台运行机制
4. 大量 hook 组成的行为治理层
5. 工具、skill、MCP、配置系统联动

### 3.2 项目级架构

根据 `labs/fork/sampx/oh-my-openagent/AGENTS.md` 与 `labs/fork/sampx/oh-my-openagent/src/AGENTS.md`，其主架构可概括为：

```
oh-my-openagent/
├── src/index.ts                  # 插件总入口
├── src/agents/                   # 11 个 agent + prompt builder
├── src/hooks/                    # 46 个生命周期 hook
├── src/tools/                    # 26 个工具
├── src/features/                 # 后台代理、skill loader、tmux 等功能模块
├── src/plugin/                   # OpenCode hook handlers 组合层
├── src/config/                   # 多层 JSONC 配置与 schema
└── src/mcp/                      # 内置远程 MCP
```

### 3.3 初始化流

参考 `labs/fork/sampx/oh-my-openagent/AGENTS.md`：

```
OhMyOpenCodePlugin(ctx)
  ├─ loadPluginConfig()
  ├─ createManagers()
  ├─ createTools()
  ├─ createHooks()
  └─ createPluginInterface()
```

结论：oh-my-openagent 的本体是一个“扩展 OpenCode 的大型平台插件”，Sisyphus 只是这套平台中最耀眼的 orchestrator agent，而不是全部。

---

## 4. 11 个 agent 的角色分工

### 4.1 清单

依据 `labs/fork/sampx/oh-my-openagent/src/agents/builtin-agents.ts` 和 `labs/fork/sampx/oh-my-openagent/src/agents/AGENTS.md`：

| Agent | 定位 | 核心用途 |
|------|------|------|
| Sisyphus | 主编排者 | 计划、分流、委派、验证 |
| Hephaestus | 深度执行者 | 自主实现复杂任务 |
| Oracle | 只读顾问 | 架构建议、判断、咨询 |
| Librarian | 外部资料员 | 文档、外部代码、权威资料搜索 |
| Explore | 代码勘探者 | grep、结构搜索、模式探索 |
| Multimodal-Looker | 多模态观察者 | PDF/图像等视觉材料分析 |
| Metis | 预规划顾问 | 意图识别、方案澄清、AI slop 预防 |
| Momus | 计划审查者 | 找阻塞点，不追求完美主义 |
| Atlas | Todo 编排者 | 任务清单治理 |
| Prometheus | 战略规划器 | 内部规划用途 |
| Sisyphus-Junior | 类别执行器 | 面向特定类别的通用执行 |

### 4.2 研究结论

- `Oracle` 最适合借鉴“输出节律、简洁判断、单一路径建议”
- `Metis` 最适合借鉴“意图分类、前置澄清、AI slop 防御”
- `Sisyphus` 最适合借鉴“编排姿态、委派偏好、并行意识、验证纪律”

因此，Wopal 的未来演进不应复制某一个 agent，而应形成：

- Sisyphus 的职责骨架
- Oracle 的判断密度
- Metis 的意图眼睛

---

## 5. Sisyphus 的架构与核心能力

### 5.1 Sisyphus 的 prompt 不是静态文本，而是动态拼装

在 `labs/fork/sampx/oh-my-openagent/src/agents/sisyphus.ts` 中，Sisyphus prompt 由 `buildDynamicSisyphusPrompt()` 动态组装，输入包括：

- `availableAgents`
- `availableTools`
- `availableSkills`
- `availableCategories`
- `useTaskSystem`

它会动态拼装以下模块：

- key triggers
- tool selection table
- explore/librarian/oracle section
- delegation table
- category-skills delegation guide
- anti-patterns
- hard blocks
- parallel delegation section
- anti-duplication section
- task management section

### 5.2 Sisyphus 的 prompt 结构结论

根据 `labs/fork/sampx/oh-my-openagent/src/agents/sisyphus.ts`，其核心结构大致如下：

1. `Role`
2. `Behavior_Instructions`
3. `Phase 0 - Intent Gate`
4. `Phase 1 - Codebase Assessment`
5. `Phase 2A - Exploration & Research`
6. `Phase 2B - Implementation`
7. 各类工具/代理委派规范

### 5.3 它真正强的 6 个能力

| 能力 | 说明 |
|------|------|
| Intent Gate | 每条消息先做任务分类与路由决策 |
| Codebase Assessment | 先判断代码库是否值得遵循现有模式 |
| Delegation Bias | 默认倾向委派，而非自己硬做 |
| Parallel Execution Bias | 独立探索、读取、代理执行尽量并行 |
| Verification Discipline | 不轻信 agent/工具输出，强调最终核验 |
| Dynamic Context Awareness | prompt 知道当前有哪些兵力与技能 |

### 5.4 Sisyphus 的一句话本质

Sisyphus 不是“最会写代码的 agent”，而是“最会决定接下来谁该干什么、何时停手、何时验证”的 orchestrator。

这正是 Wopal 值得吸收的职责骨架。

---

## 6. Sisyphus 依赖的私有武器

### 6.1 私有武器结论

Sisyphus 的强度并不只来自 prompt，而来自 prompt 背后可调用的一整套 oh-my-openagent 私有武器。

### 6.2 最关键的私有武器

| 武器 | 结论 | 证据 |
|------|------|------|
| `task(category + load_skills + session_id)` | 委派内核，非 OpenCode 原生 | `labs/fork/sampx/oh-my-openagent/src/tools/delegate-task/tools.ts` |
| `background_output` / `background_cancel` | 后台异步任务管理，非 OpenCode 原生 | `labs/fork/sampx/oh-my-openagent/src/plugin/tool-registry.ts` |
| background manager | 后台代理编排运行时 | `labs/fork/sampx/oh-my-openagent/src/features/background-agent/manager.ts` |
| dynamic categories | 任务分类与技能联动 | `labs/fork/sampx/oh-my-openagent/src/tools/delegate-task/constants.ts` |
| available agents/skills injection | 动态兵力上下文注入 | `labs/fork/sampx/oh-my-openagent/src/agents/builtin-agents.ts` |

### 6.3 “隐形增幅层”

除了直接工具，oh-my-openagent 还有一层更关键的能力：行为治理与 prompt 动态增强。

| 机制 | 作用 |
|------|------|
| hook composition | 在多个生命周期节点拦截并施加行为策略 |
| tool guards | 写前先读、输出截断、规则注入、反 AI slop 等 |
| continuation hooks | 强化 todo/task 持续执行意识 |
| config-driven agent generation | 基于配置与可用模型动态生成 agent 视图 |

### 6.4 对 Wopal 的结论

Wopal 首轮进化不需要复制这些私有运行时。更稳健的做法是：

- 先迁移“行为模型”
- 后续再评估“运行时内核”

因此首轮应吸收：

- intent gate
- delegation bias
- verification discipline
- dynamic available context

而暂不急于吸收：

- 后台代理 runtime
- category-aware task system
- session continuity for delegated subtasks

---

## 7. OpenCode 原生插件机制研究结论

### 7.1 插件加载方式

根据 `labs/ref-repos/opencode/packages/opencode/src/config/config.ts` 与 `labs/ref-repos/opencode/packages/opencode/src/plugin/index.ts`：

OpenCode 支持两种插件来源：

1. `opencode.json/jsonc` 中的 `plugin` 数组
2. 目录扫描得到的 `{plugin,plugins}/*.{ts,js}` 本地插件文件

插件初始化时会收到 `PluginInput`，包括：

- `client`
- `project`
- `worktree`
- `directory`
- `serverUrl`
- `$`（Bun shell）

### 7.2 关键 hook 边界

根据 `labs/ref-repos/opencode/packages/opencode/src/plugin/index.ts`、`labs/ref-repos/opencode/packages/opencode/src/session/prompt.ts`、`labs/ref-repos/opencode/packages/opencode/src/session/llm.ts`：

| Hook | 用途 | 对 Wopal 的价值 |
|------|------|------|
| `chat.message` | 感知用户消息及 parts | 可记录用户意图与上下文 |
| `chat.params` | 修改模型参数 | 当前非首需 |
| `chat.headers` | 修改请求头 | 当前非首需 |
| `tool.execute.before` | 工具执行前拦截 | 可记录行为、插入治理逻辑 |
| `tool.execute.after` | 工具执行后处理 | 可记录结果、生成验证信号 |
| `experimental.chat.messages.transform` | 改写消息数组 | 可注入阶段提醒 |
| `experimental.chat.system.transform` | 改写 system prompt | 首轮最关键入口 |
| `event` | 观察全局事件 | 后续可用于 session 生命周期治理 |

### 7.3 最关键的宿主事实

1. system prompt 注入点存在，而且位于真正送给模型之前
2. 工具层有统一 before/after 包装，因此插件能感知所有工具执行
3. 本地 agent 与本地 plugin 都能通过目录自动发现机制接入
4. 插件依赖 `@opencode-ai/plugin`，OpenCode 会帮助本地插件安装依赖

### 7.4 宿主兼容风险

最大风险是 `experimental.*` hook：

- `experimental.chat.system.transform`
- `experimental.chat.messages.transform`

这两者非常适合做 Wopal 的首轮进化，但接口名称已明确标记为实验性，升级宿主时必须重点回归验证。

---

## 8. OpenCode agent / session / subtask 机制结论

### 8.1 agent 只是配置，不是运行时人格实例

根据 `labs/ref-repos/opencode/packages/opencode/src/config/config.ts` 和既有研究 `docs/research/opencode-session-agent-messaging.md`：

- agent 由 markdown frontmatter + prompt 构成
- mode 可为 `primary` / `subagent` / `all`
- 核心字段包括 `prompt`、`model`、`permission`、`steps`

### 8.2 subtask 是 OpenCode 原生能力

OpenCode 原生已有 `task` 工具和 `subtask` part 机制，父 session 可创建子 session 运行指定 agent。

这意味着：

- Wopal 已有基础委派能力
- 但 oh-my-openagent 在其上叠加了更复杂的 category/skill/session continuity 体系

### 8.3 对 Wopal 的结论

Wopal 并不缺“委派基础设施”，缺的是：

- 更强的委派意识
- 更明确的路由策略
- 更稳定的验证纪律
- 更清晰的分身角色边界

这就是为什么首轮进化优先做 orchestrator plugin，而不是先改 task runtime。

---

## 9. Wopal 当前现状研究结论

### 9.1 现有插件能力

`projects/agent-tools/agents/wopal/plugins/rules-plugin/src/runtime.ts` 已证明 Wopal 侧具备以下现实基础：

- 已能使用 `chat.message`
- 已能使用 `tool.execute.before`
- 已能使用 `experimental.chat.messages.transform`
- 已能使用 `experimental.chat.system.transform`
- 已能使用 `experimental.session.compacting`

### 9.2 `rules-plugin` 当前职责

它的职责本质是：

- 跟踪当前会话上下文路径
- 提取用户最新 prompt
- 根据上下文筛选适用规则
- 在 system prompt 中注入规则文本

因此它属于：**规则注入层**，不是编排增强层。

### 9.3 部署链路已存在

`scripts/sync-config.yaml` 已包含：

```yaml
agents/wopal/plugins: agents/wopal/plugins
```

这说明：

- Wopal 插件目录属于正式同步链路的一部分
- 新建 `wopal-orchestrator-plugin` 不需要额外发明部署机制

---

## 10. 为什么要新建 `wopal-orchestrator-plugin`

### 10.1 研究结论

不应把 orchestrator 能力继续叠加在 `rules-plugin` 上，原因如下：

| 原因 | 说明 |
|------|------|
| 职责边界不同 | `rules-plugin` 是规则层，orchestrator 是编排层 |
| 冲突排查困难 | 两种 prompt 注入混在一起后不易定位问题 |
| 便于禁用回退 | 单独停用 orchestrator 或单独停用 rules 更灵活 |
| 便于演化 | orchestrator 未来会有 session state、delegation policy 等更复杂能力 |

### 10.2 新插件最适合承载的能力

| 能力 | 是否适合首轮实现 | 结论 |
|------|------|------|
| system prompt orchestration 注入 | 是 | 首轮必须实现 |
| available agents / skills 上下文 | 是 | 首轮必须实现 |
| intent gate | 是 | 首轮必须实现 |
| delegation bias | 是 | 首轮必须实现 |
| verification philosophy | 是 | 首轮必须实现 |
| messages transform 提醒 | 是 | 首轮建议实现 |
| runtime state | 是 | 二步实现 |
| heavy background orchestration | 否 | 暂缓 |
| private session continuation runtime | 否 | 暂缓 |

---

## 11. 本轮研究产出的关键判断

### 11.1 对 Wopal 身份定位的判断

Wopal 不应该成为 Oracle 式纯顾问，也不应简单等同于 Sisyphus。

更准确的定位是：

- 灵魂高于 Oracle / Metis / Sisyphus 中任一单体模板
- 职责上与 Sisyphus 相似：总编排、总判断、总裁决
- 输出风格借 Oracle：简洁、单一路径、高密度建议
- 意图理解借 Metis：先识别真实需求，再选择路由

### 11.2 对首轮实施策略的判断

首轮最合理路线：

1. 新建 `wopal-orchestrator-plugin`
2. 先做 system prompt augmentation
3. 再做动态兵力上下文
4. 再做阶段提醒与轻量 session state
5. 暂缓重型私有运行时复制

### 11.3 对“最值得迁移的东西”的判断

最值得迁移的不是某段 prompt 原文，而是这四件事：

1. `Intent Gate`
2. `Delegation Bias`
3. `Verification Discipline`
4. `Dynamic Available Context`

---

## 12. 后续实施时必须记住的事实

### 12.1 事实清单

- `rules-plugin` 已经证明 Wopal 能在 OpenCode 中稳定使用关键 transform hook
- OpenCode 原生已有 subtask/task 基础，不需要为“能委派”从零造轮子
- oh-my-openagent 的强度来自“平台级插件体系”，不是只靠 prompt
- Sisyphus 最强的是路由与治理，不是单点编码能力
- 首轮进化最有收益的是认知层与治理层，而不是重型后台 runtime

### 12.2 迭代警告

- 如果 future iteration 直接追求完整复刻 Sisyphus，将显著增加复杂度和宿主耦合
- 如果将 orchestrator 能力直接塞进 `rules-plugin`，后续可维护性会明显下降
- 如果注入的 system prompt 过长、无去重策略、与 rules 注入叠加失控，模型表现会退化


---

## 14. 结论

本次研究得出的最终结论是：

Wopal 的最优进化路线，不是成为另一个 Sisyphus，而是以 Sisyphus 的职责骨架为基础，吸收 Oracle 的判断密度、Metis 的意图识别，并通过 OpenCode 官方插件机制构建属于 Wopal 自己的 `wopal-orchestrator-plugin`。

这是当前兼容性最好、收益最大、风险最可控的路线。

后续如需继续扩展，只需在这份研究报告之上增量追加事实，而无需重新分析：

- oh-my-openagent 为什么强
- OpenCode 插件能做什么
- Wopal 当前具备什么基础

这些问题，今天已经被刻进符文里了。
