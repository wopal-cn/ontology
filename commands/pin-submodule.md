---
description: 在主仓库中创建一次快照提交，以指向子模块的最新状态。
---

为指定的子模块创建架构级别的里程碑快照。
此命令用于：当子模块（例如 `projects/web/wopal`）达到一个里程碑（所有本地更改均已提交并推送）时，我们需要在主仓库中记录并保存该子模块的最新指针状态。

1. **询问目标**: 询问用户“请问你想同步或创建快照的子模块是哪一个？”（例如：`wopal`, `flex-scheduler`, 或 `agent-tools`，默认为全部），并询问要快照的分支名称（默认为 `main`）。
2. **验证子模块**: 
   进入对应的目录。例如：`cd projects/web/wopal`。
3. **确保分支及工作区干净**:
   首先检查工作区是否干净（执行 `git status`）。如果子模块内存在未提交的本地更改，**停止执行**并提示用户是否需要帮助进行子模块提交更改。用户同意后， 执行 `/commit` 命令流程。 
   在确保工作区干净后，执行 `git checkout <branch>` 以确保不再处于 `detached HEAD` 状态。
   执行 `git pull origin <branch>` 确保子模块与远程分支干净同步。
4. **更新主仓库指针**:
   返回 monorepo 的根目录：`cd <root_dir>`。
   通过 `git add <path/to/submodule>` 更新 Git 中的子模块状态（例如：`git add projects/web/wopal`）。注意：路径末尾**不要**加斜杠。
5. **审核与提交 (遵循规则)**:
   向用户展示暂存区中的子模块指针更变内容（例如通过 `git diff --cached`）。
   **核心步骤**: 在提交前，请停止操作并明确要求用户进行确认。
   只有在获得用户允许后，才能执行 `git commit -m "chore: snapshot update <submodule> to latest milestone"` 以及 `git push`，把更新后的指针状态保存至主仓库。
6. **确认反馈**: 告知用户该 `<submodule>` 的最新里程碑引用指针已成功锁定！
