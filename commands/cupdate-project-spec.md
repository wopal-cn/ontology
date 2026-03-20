---
description: 创建/更新项目 AGENTS.md 和 README.md
---

# 创建/更新项目规范

## 项目和目标: `$ARGUMENTS` -> [project] [target]

| 参数 | 必填 | 说明 |
|------|------|------|
| `project` | 否 | 项目路径，未提供则从上下文推断 |
| `target` | 否 | `agents` / `readme` / `both`，默认 `both` |

**示例**:
- `/cupdate-project-spec` → 推断项目，生成两个文件
- `/cupdate-project-spec wopal-cli` → 指定项目
- `/cupdate-project-spec wopal-cli agents` → 仅生成 AGENTS.md

---

## 执行流程

### 1. 确定目标项目

**有参数**: 使用参数

**无参数**: 从上下文推断
- 检查当前工作目录
- 检查最近操作的文件所属项目
- 检查会话中讨论的项目

```bash
pwd | grep -o 'projects/[^/]*'  # 提取项目名
```

### 2. 收集上下文

**必读（如存在）：**
- `docs/products/{project}/PRD-{product}.md` — 产品定位与范围
- `docs/products/{project}/DESIGN-{product}.md` — 架构蓝图（复用架构图）

### 3. 深度分析项目

**必须实际读取代码**，不是猜测：

```bash
# 目录结构
tree -L 3 -I 'node_modules|dist|.git'

# 技术栈
cat package.json 2>/dev/null || cat pyproject.toml 2>/dev/null || cat Cargo.toml 2>/dev/null

# 入口文件
cat src/index.ts src/main.ts src/cli.ts 2>/dev/null | head -100

# 核心逻辑（抽样 2-3 个）
find src -name "*.ts" -type f | head -5 | xargs cat
```

**识别**：
- 项目类型、技术栈、目录结构
- 关键入口点、核心逻辑位置
- 开发约束（从代码风格、注释、lint 配置提取）

### 4. 确认操作

```
将为 projects/<project> 生成/更新：
- AGENTS.md（面向 AI Agent）
- README.md（面向人类开发者）

确认？[Y/n]
```

### 5. 生成文档

---

## AGENTS.md 质量标准

### 定位

AGENTS.md 是**施工手册** — 仅描述当前态，供开发时参考。

与 PRD（做什么）和 DESIGN（怎么设计）的关系：

| | PRD | DESIGN | AGENTS.md |
|--|-----|--------|-----------|
| 回答 | 做什么、为谁做 | 系统怎么设计 | 怎么在项目里干活 |
| 时态 | 含目标态演进 | 含目标态设计 | **仅当前态** |

### 核心原则

1. **引用不重写** — 架构图复用 DESIGN 的，一句话引用 DESIGN 获取详情
2. **施工导向** — 开发者拿到就能干活：目录结构、命令速查、代码模板
3. **约束明确** — 规范要具体到可执行，不要模糊描述
4. **保持同步** — 新模块/新命令实现后必须更新

### 必要部分

| 部分 | 说明 |
|------|------|
| **架构概览** | 复用 DESIGN 架构图 + 引用链接 |
| **目录与模块** | 完整目录树，每个文件附职责 |
| **命令/API 速查** | 所有已实现命令的完整用法（如有 CLI/API） |
| **核心模块详解** | 关键模块的行为、输入输出格式 |
| **开发规范** | 构建/测试命令、代码模板、核心 API 用法 |
| **代码约束** | 代码风格、UX 规范、测试约束、安全红线 |

### 可选部分

- 典型工作流（常用命令序列）
- 快速定位命令

### 禁止

- ❌ 目标态内容（属于 DESIGN）
- ❌ 产品级内容（属于 PRD）
- ❌ 模糊描述（"遵循最佳实践"）
- ❌ 过时的索引清单

---

## README.md 质量标准

### 核心原则

1. **独立完整** — 视为独立项目介绍，不提及 monorepo 关系
2. **快速上手** — 安装 + 运行命令一目了然
3. **价值导向** — 说明能做什么，不是怎么实现

### 必要部分

| 部分 | 作用 |
|------|------|
| **简介** | 一句话核心价值 |
| **快速开始** | 安装 + 运行命令 |
| **核心功能** | 能做什么 |
| **技术栈** | 用到什么 |
| **License** | 许可证 |
| **相关文档** | 链接到 AGENTS.md、PRD、DESIGN |

---

## AGENTS.md 模板

```markdown
# [项目名] — 项目规范

> **定位**：[在更大系统中的角色]
> **架构蓝图**：`docs/products/{project}/DESIGN-{product}.md`
> **产品 PRD**：`docs/products/{project}/PRD-{product}.md`

---

## 1. 架构概览

[复用 DESIGN 的架构图]

> 组件关系、接口契约与技术决策详见 DESIGN 文档。

---

## 2. 目录与模块

```
src/
├── [文件/目录]     # [职责说明]
└── ...
```

---

## 3. 命令/API 规格速查

[所有已实现命令的完整用法]

---

## 4. 核心模块详解

[关键模块的行为说明、输入输出格式]

---

## 5. 开发规范

### 开发命令

```bash
[build-command]
[test-command]
[format-command]
```

### 新增功能模板

[代码模板，可直接复制使用]

### 核心 API 用法

[OutputService、Logger 等内部 API 用法]

---

## 6. 代码约束

**代码风格**：[具体约束]
**敏感信息**：**禁止记录**：[列表]
```

---

## README.md 模板

```markdown
# [项目名]

[一句话核心价值]

## 快速开始

```bash
[安装命令]
[运行命令]
```

## 核心功能

- [功能 1]
- [功能 2]

## 技术栈

| 类别 | 技术 |
|------|------|

## 相关文档

| 文档 | 说明 |
|------|------|
| [AGENTS.md](./AGENTS.md) | 项目规范（面向开发） |
| [PRD](../../docs/products/{project}/PRD-{product}.md) | 产品需求文档 |
| [DESIGN](../../docs/products/{project}/DESIGN-{product}.md) | 架构设计文档 |

## License

[许可证]
```

---

## 输出格式

```markdown
## 项目文档已创建

| 文件 | 状态 |
|------|------|
| AGENTS.md | 已创建/已更新 |
| README.md | 已创建/已更新 |

**项目类型**: {类型}
**技术栈**: {关键技术}
**核心约束**: {提取的关键约束}
```