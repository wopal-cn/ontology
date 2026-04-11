# WopalSpace ontology — 本体能力锻造层

> **定位**：WopalSpace 的 Agent 能力源码研发中心。所有修改在此，部署到 `.wopal/`，运行时加载自 `.agents/`。

---

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                     WopalSpace 运行时                        │
├─────────────────────────────────────────────────────────────┤
│  .agents/  ←────  .wopal/  ←────  projects/ontology/    │
│  (适配层)         (部署层)        (源码层 - 本项目)          │
│  只读引用         只读副本         读写修改                   │
└─────────────────────────────────────────────────────────────┘
```

**部署流**：源码层修改(非 skill) → `sync-to-wopal.py` → 部署层 → `.agents/` 引用

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

| 类型 | 作用 | 部署脚本 |
|------|------|----------|
| **命令** | 用户调用 `/xxx` | `../../scripts/sync-to-wopal.py` |
| **规则** | 注入上下文约束 | `../../scripts/sync-to-wopal.py` |
| **代理** | 子代理灵魂提示词 | `../../scripts/sync-to-wopal.py` |
| **插件** | 运行时 TS 程序 | `../../scripts/sync-to-wopal.py` |

> 脚本位于 `wopal-workspace/scripts/sync-to-wopal.py`（本项目外部）
>
> 部署后可通过 `.wopal/<工具类型>/.versions.json` 溯源部署版本（如 `.wopal/commands/.versions.json`）

---

## 插件开发

**参考**：`plugins/wopal-plugin/AGENTS.md`

插件是 TypeScript 编写的 OpenCode 运行时扩展，提供自定义工具和事件钩子。

---

## 资源层次与归属

所有资源分为**通用层(Agent 共享)**和**Agent 专属层**：

### 通用层（所有 Agent 共享）

| 资源 | 源码位置 | 部署位置 |
|------|----------|----------|
| 命令 | `commands/` | `.wopal/commands/` |
| 规则 | `rules/` | `.wopal/rules/` |
| 技能 | `skills/` | `.wopal/skills/` |

### Agent 专属层

| Agent | 资源 | 源码位置 | 部署位置 |
|-------|------|----------|----------|
| **Wopal** | 命令 | `agents/wopal/commands/` | `.wopal/agents/wopal/commands/` |
| | 规则 | `agents/wopal/rules/` | `.wopal/agents/wopal/rules/` |
| | 技能 | `agents/wopal/skills/` | `.wopal/agents/wopal/skills/` |
| | 代理 | `agents/wopal/agents/` | `.wopal/agents/wopal/agents/` |
| **Fae** | 命令 | `agents/fae/commands/` | `.wopal/agents/fae/commands/` |
| | 规则 | `agents/fae/rules/` | `.wopal/agents/fae/rules/` |
| | 技能 | `agents/fae/skills/` | `.wopal/agents/fae/skills/` |
| **通用** | 插件 | `plugins/` | `.opencode/plugins/` (symlink 自动发现) |

**原则**：通用层优先，专用层补充(重名则覆盖通用层)。修改通用层影响所有 Agent。

---

## 记忆系统设计

记忆系统由两个子系统组成：**记忆蒸馏**（提取和存储长期记忆）和**上下文管理**（会话级状态管理）。

### 数据流

```
用户消息 → distill_session（手动触发）→ 提取记忆 → MemoryStore（LanceDB）
                                                        ↓
用户消息 → buildEnrichedQuery ← 读 SessionContext ← context_manage（手动触发）
              ↓
         记忆检索 → 注入系统提示词
```

### 记忆蒸馏

**职责**：从会话中提取有价值的信息，存入 LanceDB 长期记忆。

| 组件 | 文件 | 职责 |
|------|------|------|
| DistillEngine | `memory/distill.ts` | 蒸馏核心逻辑：preview → confirm |
| MemoryStore | `memory/store.ts` | LanceDB 存储，单层 body |
| EmbeddingClient | `memory/embedder.ts` | OpenAI Embedding |
| MemoryRetriever | `memory/retriever.ts` | 语义检索 |
| MemoryInjector | `memory/injector.ts` | 格式化注入系统提示词 |

**蒸馏流程**：
1. `distill_session action=preview` — LLM 提取候选记忆
2. 用户审查候选
3. `distill_session action=confirm` — 去重后存入 LanceDB

### 上下文管理

**职责**：管理会话级状态（摘要、title），为记忆检索提供语义上下文。

| 组件 | 文件 | 职责 |
|------|------|------|
| SessionContext | `memory/session-context.ts` | 状态模型 + 文件 I/O |
| context_manage | `tools/context-manage.ts` | summary/status 子命令 |

**SessionContext 模型**（`~/.wopal/memory/state/{sessionID}.json`）：

```typescript
interface SessionContext {
  sessionID: string;
  title: string | null;
  distill?: {           // 蒸馏状态
    messageCount: number;
    extractedAt: string;
    depth: "shallow" | "deep";
  };
  summary?: {           // 会话摘要
    text: string;
    messageCount: number;
    generatedAt: string;
  };
}
```

**设计原则**：
- 按功能模块分块，新增功能加新块，不改已有结构
- 每个字段必须被后续流程读取并影响决策
- 不做向后兼容迁移，旧格式文件直接清理

**context_manage 工具**：
- `action=summary`：LLM 生成 ≤50 字摘要 → 存入 SessionContext → 更新 session title
- `action=status`：展示摘要/蒸馏状态 → 过时判断（新消息 > 20 条提示重新生成）

### 职责边界

| 关注点 | 归属 | 工具 |
|--------|------|------|
| 记忆提取和存储 | 蒸馏子系统 | `distill_session` |
| 会话摘要和 title | 上下文管理 | `context_manage` |
| 注入时的语义 query | 上下文管理（读缓存） | `buildEnrichedQuery` |
| 历史状态清理 | 上下文管理 | `cleanupLegacyStateFiles` |
