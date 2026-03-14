---
description: 更新主仓库的子项目指针到最新快照
---

## 扫描指针变化

```bash
git submodule status
```

识别 `+` 前缀的子模块（指针已变化但未记录）。

## 暂存并确认

```bash
git add <changed-submodules>
git status --short
```

展示变更列表，等待用户确认。

## 提交

```bash
git commit -m "chore: 更新子项目快照"
```

完成后告知用户。如需推送远程，等待明确指示。
