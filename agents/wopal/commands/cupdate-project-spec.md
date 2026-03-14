---
description: 创建/更新子项目 AGENTS.md 和 README.md
---

# 创建/更新项目规范 AGENTS.md 或 README.md 文档

## 项目和目标: `$ARGUMENTS` -> [project] [target]

| 参数 | 必填 | 说明 |
|------|------|------|
| `project` | 否 | 项目路径，未提供则从上下文推断 |
| `target` | 否 | `agent` / `readme` / `both`，默认 `both`, 需要模糊推断 |

**示例**:
- `/cupdate-project-spec` → 推断项目，生成两个文件（需确认）
- `/cupdate-project-spec wopal-cli` → 指定项目，生成两个文件（需确认）
- `/cupdate-project-spec wopal-cli AGENTS` → 指定项目，仅生成 AGENTS.md

---

## 执行流程

### 1. 确定目标项目

**有参数**: 使用 `$ARGUMENTS` 中的项目路径

**无参数**: 从上下文推断
1. 检查当前工作目录是否在 `projects/` 下
2. 检查最近操作的文件所属项目
3. 检查会话中讨论的项目

```bash
# 检测当前位置
git rev-parse --show-superproject-working-tree  # 非空 = 子项目内
pwd | grep -o 'projects/[^/]*'                  # 提取项目名
```

### 2. 确认操作

向用户确认：
```
将为 projects/<project> 生成/更新以下文档：
- AGENTS.md
- README.md

确认？[Y/n]
```

### 3. 分析项目

识别：
- **项目类型**: CLI / Web App / API / Library / Monorepo
- **技术栈**: 语言、框架、测试工具、构建工具
- **目录结构**: 源码、测试、配置位置
- **关键文件**: 入口点、核心逻辑
- **开发约束**: 从代码中提取的约束规则（如禁止 console.*、禁用颜色等）

### 4. 生成文档

根据 target 生成对应文件。

---

## AGENTS.md 模板

> 面向 AI Agent，聚焦开发细节和约束。

```markdown
# [项目名称] - 项目规范

<CRITICAL_RULE>
此文档为 AI agents 提供项目开发规范，当项目设计或代码变更后，必须及时更新本文档。
</CRITICAL_RULE>

---

## 架构

[简要架构图或描述，如：核心模块 + 数据流]

---

## 目录结构

\`\`\`
[root]/
├── [dir]/     # [描述]
├── [dir]/     # [描述]
└── [dir]/     # [描述]
\`\`\`

---

## 开发命令

\`\`\`bash
# 开发
[dev-command]

# 构建
[build-command]

# 测试
[test-command]

# 格式化
[format-command]
\`\`\`

---

## 开发约束

> **关键规则**：必须遵守的开发约束，从代码中提取。

### 代码风格

- [约束，如：Prettier, 2 空格, 单引号]
- [约束，如：TypeScript 严格模式]

### 输出规范

- [约束，如：禁止 console.*，必须使用 output.* 或 logger.*]
- [约束，如：禁用颜色输出]

### 术语规范

- [约束，如：统一使用 space，避免 workspace/project/scope]

### 测试约束

- [约束，如：涉及子进程的测试必须隔离 WOPAL_HOME 环境]

### 敏感信息

- **禁止记录**: [如：GITHUB_TOKEN、*_API_KEY、*_SECRET]

---

## 项目特有模式

> 仅填写此项目**特有**的模式。

### [特有模式名称]

- [描述]

---

## 测试

- **运行测试**: `[test-command]`
- **测试位置**: `[test-directory]`

---

## 关键模块

| 模块 | 说明 |
|------|------|
| `[path]` | [描述] |

```

---

## README.md 模板

> 面向人类开发者，视为独立项目介绍，**不提及** monorepo/子项目关系。

```markdown
# [项目名称]

[一句话项目简介，说明核心价值和用途]。

## 快速开始

\`\`\`bash
# 安装依赖
[install-command]

# 开发模式
[dev-command]
\`\`\`

## 核心功能

| 功能 | 说明 |
|------|------|
| [功能 1] | [简要描述] |
| [功能 2] | [简要描述] |

## 技术栈

| 技术 | 用途 |
|------|------|
| [技术 1] | [用途] |

## 项目结构

\`\`\`
[root]/
├── [dir]/     # [描述]
└── [dir]/     # [描述]
\`\`\`

## 文档

- [AGENTS.md](AGENTS.md) - 开发规范

## License

[许可证]
```

---

## 输出格式

```markdown
## 项目文档已创建

| 文件 | 状态 |
|------|------|
| AGENTS.md | 已创建 |
| README.md | 已创建 |

**项目类型**: {类型}
**技术栈**: {关键技术}
```
