---
description: 为未提交的更改创建 Git commit
---

# 提交变更

为未提交的更改创建符合 Conventional Commits 规范的 commit。

**参数输入**: `$ARGUMENTS` （目标仓库，可选）

---

## 核心原则

- **意图优先分组** - 按变更意图/功能单元分组，而非文件类型
- **上下文驱动** - 关联会话上下文，message 描述"为什么改"
- **精准定位** - 有参数只处理指定仓库；无参数优先推断工作上下文
- **一次性确认** - 批量展示计划，确认后执行

---

## 步骤1：确定目标仓库

### 有参数

模糊匹配项目名/路径/别名，定位到单一仓库。

### 无参数

**默认全量扫描**：同时检查工作空间 + 所有子项目的变更状态。

```bash
# 检查工作空间
git status --short

# 检查每个子项目
git submodule status --quiet 2>/dev/null | while read sha path; do
  (cd "$path" && git status --short) | sed "s|^|$path: |"
done
```

**输出格式**：列出所有有变更的仓库，按仓库分组展示。

---

## 步骤2：分析变更意图

**对每个有变更的仓库**执行：

```bash
git status --short
git diff --stat
```

**核心任务**：
1. 列出所有变更文件（按仓库分组）
2. **读取 diff 内容**，理解每个变更的目的
3. 按「仓库 × 变更意图」双重分组
4. 为每组确定 type 和 message

### 分组示例

```
📦 工作空间:
  - MEMORY.md
  - docs/products/plans/xxx.md

📦 projects/agent-tools:
  - agents/wopal/commands/summon.md
  - commands/commit.md

分组:
  [workspace] 组1 (docs): 更新知识沉淀 → MEMORY.md
  [workspace] 组2 (chore): 归档计划 → plans/xxx.md
  [agent-tools] 组1 (feat): 优化命令提示词 → summon.md + commit.md
```

### Type 判断

| Type | 判断依据 |
|------|----------|
| `feat` | 新增功能/能力 |
| `fix` | 修复 bug/错误 |
| `refactor` | 重构代码，不改变功能 |
| `docs` | 仅文档变更 |
| `test` | 仅测试相关 |
| `chore` | 构建/配置/依赖 |

---

## 步骤3：生成提交计划

```
📋 提交计划（共 N 个仓库，M 个提交）

📦 工作空间 (main)
1. feat: 增加登录 token 自动刷新
   - src/auth/login.ts
   - src/auth/token.ts

2. docs: 更新知识沉淀
   - MEMORY.md

📦 projects/agent-tools (main)
1. fix: 修复 commit 命令子项目扫描漏洞
   - commands/commit.md

...
```

**message 规范**：
- 描述"为什么改"或"改了什么功能"，而非"改了什么文件"
- 简洁明确，避免笼统的"更新文件"

⚠️ 等待用户确认（yes/no）

---

## 步骤4：执行提交

**按仓库顺序执行**（先子项目，后工作空间）：

```bash
# 1. 进入子项目提交
cd projects/agent-tools
git add <files-group-1>
git commit -m "fix: 修复 commit 命令子项目扫描漏洞"

# 2. 回到工作空间提交
cd ../..
git add <files-group-1>
git commit -m "docs: 更新知识沉淀"
```

**提交顺序**：
1. 子项目提交（projects/*）
2. 工作空间提交
3. 有子模块变更 → 提醒 `/pin-submodule`
