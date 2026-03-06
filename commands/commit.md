---
description: 为未提交的更改创建 Git commit
---

# 提交变更

为未提交的更改创建符合 Conventional Commits 规范的 commit。

**参数输入**: `$ARGUMENTS` （目标仓库）

## ⚠️ 工作规范

- **精准定位原则** - 有参数时只处理指定仓库，严禁触碰其他仓库（包括子项目）
- **事务性提交原则** - 相关类型的变更合并，不同类型拆分为多个提交
- **一次性确认原则** - 批量分析所有变更，生成完整提交计划，用户确认一次后依次执行
- **严禁 `git add .`** - 必须按变更类型分批精确暂存

---

## 场景A：有参数（精准提交）

### 步骤1：目标仓库识别

**第一步：读取项目结构（如果以前未读取）**
- 读取 `.workspace.md` 获取当前工作空间的所有项目路径和名称

**第二步：模糊匹配**
- 对用户输入 `$ARGUMENTS` 进行关键词匹配
- 匹配维度：项目名称、路径关键词、别名（如 `agent-tools` 的别名可能是 `agent`、`tools`、`空间`）
- 支持中英文混合匹配

**第三步：定位仓库**
- 匹配成功 → 定位到准确的仓库路径
- 匹配失败或多个匹配 → 列出可选项目，提示用户确认

### 步骤2：分析变更内容

```bash
cd <matched-repository-path>
git status --short
git diff
```

**全面分析**：
1. 查看所有变更文件列表
2. 读取变更内容，理解变更意图
3. 按类型分组（docs/feat/fix/refactor/test/chore）
4. 为每组生成 commit message

### 步骤3：生成提交计划

**输出格式**：
```
📋 提交计划（共 N 个提交）

1. [type1]: description1
   - file1.md
   - file2.ts

2. [type2]: description2
   - file3.md
   - dir1/

...
```

⚠️ **一次性确认**：展示完整提交计划，等待用户确认（yes/no）

### 步骤4：批量执行提交

用户确认后，依次执行：

```bash
# 提交 1
git add <files-for commit 1>
git commit -m "type1: description1"

# 提交 2
git add <files for commit 2>
git commit -m "type2: description2"

# ... 直到所有提交完成
```

**完成后任务结束**，不触碰其他仓库

---

## 场景B：无参数（自动扫描）

### 步骤1：扫描变更

```bash
git rev-parse --show-superproject-working-tree 2>/dev/null
git status --short
```

**判断逻辑**：
- 在子项目中 → 仅处理子项目提交
- 在主仓库 → 检查 dirty 子项目并优先处理

### 步骤2：子项目提交（如果有变更）

如果 `git status` 显示子项目有 `modified content`，进入子项目：

```bash
cd <submodule-path>
git status --short
git diff
```

**全面分析并生成提交计划**：
1. 按类型分组所有变更
2. 生成完整提交计划
3. 展示给用户一次性确认
4. 确认后依次执行所有提交

对每个有变更的子项目重复此流程。

### 步骤3：工作空间提交（如果有变更）

```bash
git status --short
git diff
```

**全面分析并生成提交计划**：
1. 按类型分组所有变更
2. 生成完整提交计划
3. 展示给用户一次性确认
4. 确认后依次执行所有提交

**提交完成后**：提醒用户使用 `/pin-submodule` 更新主仓库指针

---

## 提交类型速查

| Type | 用途 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat: 添加用户认证模块` |
| `fix` | Bug 修复 | `fix: 修复登录超时问题` |
| `refactor` | 重构（不改变功能） | `refactor: 重构调度引擎` |
| `docs` | 文档更新 | `docs: 更新安装指南` |
| `test` | 测试相关 | `test: 添加单元测试` |
| `chore` | 构建/工具 | `chore: 更新依赖版本` |
