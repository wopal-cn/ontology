---
name: crafting-rules
description: 创建或修改 OpenCode 规则文件时使用。帮助从对话历史中提取模式、分析项目约定（AGENTS.md、linter、package.json），并生成格式正确的规则。触发条件：用户想创建规则、固化重复指令、跨会话持久化指导、或为特定文件/主题定制 Agent 行为。
---

# Crafting Rules

规则是注入到系统提示中的 Markdown 文件，用于引导 Agent 行为。

**基本结构：**

```md
---
globs:
  - '**/*.ts'
keywords:
  - 'vitest'
---

# 规则标题

- 规则内容：具体、可执行的指令。
```

## 字段说明

| 字段 | 类型 | 用途 |
|------|------|------|
| `globs` | `string[]` | 上下文中任一文件匹配时触发 |
| `keywords` | `string[]` | 用户最新提示匹配关键词时触发 |
| `alwaysApply` | `boolean` | 始终应用            |

**匹配规则：**
- 两个字段都是可选的；无 frontmatter 表示始终应用
- `globs` 和 `keywords` 同时存在时，任一匹配即触发（OR 逻辑）
- 不支持 `globs AND keywords`；需要此行为请拆分为多条规则

## 匹配策略选择

| 场景 | 推荐方式 |
|------|----------|
| 针对特定文件/目录的代码规则 | `globs` |
| 针对某个主题（可能不涉及文件） | `keywords` |
| 两种情况都应触发 | `globs` + `keywords` |
| 全局标准（语气、结构、安全、提交规范） | 无条件 |

**重要约束：** 关键词匹配是大小写不敏感的**词边界前缀匹配**。例如 `test` 会匹配 `tests` 和 `testing`。

## 存储位置

- `~/.config/opencode/rules/` - 个人偏好，跨项目生效
- `.opencode/rules/` - 项目/团队约定，仓库级行为

## 何时创建规则

**应该创建规则的信号：**
- 明确指令：「总是做 X」「永远不要 Y」「记住...」「从现在起...」
- 重复修正：用户多次修正同一个 Agent 行为
- 一致偏好：风格/流程指导（测试、提交、PR、错误处理）
- 挫折信号：「我之前说过」「又来了」

**分析问题：**
- 这是反复出现的情况，还是当前任务的一次性需求？
- 适用于特定文件还是所有工作？
- 是否已有规则/配置覆盖？（AGENTS.md、lint 配置、Prettier 等）
- 是否与项目约定冲突？

**创建流程：**
1. 识别行为差异（应该改变什么？）
2. 确定作用域（globs、keywords 或无条件）
3. 检查现有规则/配置是否重叠或冲突
4. 起草最小化规则（一个概念一条规则）
5. 选择存储位置（全局 vs 项目）

## 关键词 keywords 选择指南

**匹配机制：** 关键词使用大小写不敏感的词边界前缀匹配。短/泛化关键词容易过度匹配。

### 避免使用（Denylist）

| 类别 | 示例 |
|------|------|
| 泛化名词 | `code`, `file`, `project`, `repo`, `bug`, `issue`, `change` |
| 常见动词 | `add`, `update`, `remove`, `fix`, `make`, `create`, `implement` |
| 过宽主题 | `testing`, `performance`, `security`, `deployment`, `database`, `api` |
| 单词缩写 | `ci`, `cd`, `db`, `ui`, `ux` |

### 推荐使用（Allowlist）

| 类别 | 示例 |
|------|------|
| 工具/框架名 | `vitest`, `jest`, `pytest`, `playwright`, `cypress`, `eslint`, `prettier`, `typescript`, `terraform`, `kubernetes` |
| 复合短语 | `unit test`, `integration test`, `snapshot test`, `lint rule`, `error boundary`, `api endpoint`, `rest api` |
| 高意图动词 | `refactor`, `rollback`, `migrate`, `deprecate` |

**考虑 denylist 关键词时的替代方案：**
- 优先用 globs（文件作用域）
- 或替换为复合短语/工具名

**关键词自检：**
- 这个关键词是否可能出现在不该触发规则的提示中？
- 是否可能因前缀匹配成为其他词的一部分？
- 能否改用 globs 限定作用域？

## 规则编写原则

- 使用命令式：「做 X」「优先 Y」「避免 Z」
- 可执行：Agent 能直接遵循的指令
- 最小化：不重复通用最佳实践
- 示例优先：模式微妙时用示例代替描述

## 示例

### Glob 作用域：TypeScript 约定

```md
---
globs:
  - '**/*.ts'
  - '**/*.tsx'
---

# TypeScript

- 优先用 `type` 而非 `interface`（除非需要声明合并）
- 避免 `any`；使用 `unknown` 并收窄类型
```

### Keyword 作用域：单元测试指导

```md
---
keywords:
  - 'unit test'
  - 'integration test'
  - 'vitest'
  - 'jest'
---

# Unit Tests

- 遵循 Arrange-Act-Assert 模式
- 测试命名：`it('should <expected> when <condition>')`
```

### 无条件：全局代码风格

```md
# Code Style

- 优先早返回而非深层嵌套
- 将魔法数字提取为命名常量
```

### 组合作用域：部署安全（OR 逻辑）

```md
---
globs:
  - '**/deploy/**'
  - '**/*.tf'
keywords:
  - 'terraform'
  - 'kubernetes'
  - 'production'
  - 'rollback'
---

# Deployment

- 禁止硬编码密钥；使用环境变量或密钥管理器
- 任何生产变更计划必须包含回滚步骤
```
