---
description: 为未提交的更改创建 Git commit
---

# 提交变更

为未提交的更改创建符合 Conventional Commits 规范的 commit。

## 阶段一：扫描与定位

```bash
# 判断当前位置并查看变更概览
git rev-parse --show-superproject-working-tree 2>/dev/null
git status --short
```

**判断当前位置**：
- 如果 `show-superproject-working-tree` 有输出 → 当前在子项目中，仅处理子项目提交
- 否则 → 在主仓库，检查是否有 dirty 子项目需要优先处理

## 阶段二：子项目提交（仅当有 dirty 子项目时）

如果 `git status` 显示子项目有 `modified content`，进入子项目优先提交：

```bash
cd <submodule-path>
git add . && git diff --staged
```

⚠️ **安全拦截**：展示暂存差异，提议 commit message，等待用户确认后执行：

```bash
git commit -m "<审批过的提交信息>"
```

对每个有变更的子项目重复本阶段。

## 阶段三：主仓库提交

```bash
git add . && git diff --staged
```

⚠️ **安全拦截**：展示暂存差异，提议 commit message，等待用户确认后执行：

```bash
git commit -m "<审批过的提交信息>"
```

**提交完成后**，如果本次包含子项目变更，一句话提醒：
> 子项目已提交。如需更新主仓库指针，请使用 `/pin-submodule`。
