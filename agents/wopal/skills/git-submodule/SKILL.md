---
name: git-submodule
description: 管理 Git 子模块的工作流指南。适用于：(1) 在主项目中包含外部仓库，(2) 跨多个项目管理共享库，(3) 将依赖锁定到特定版本，(4) 管理 monorepo 架构的独立组件，(5) 克隆/更新/移除子模块，(6) 处理嵌套子模块。
---

# Git Submodule 工作流指南

## 核心概念

Git submodule 是在主仓库中包含其他 Git 仓库的功能：
- 子模块通过引用**特定提交**来固定版本
- `.gitmodules` 文件记录子模块路径和 URL
- 子模块内的变更通过**独立提交**管理
- 修改嵌套子模块需要**从内向外逐层提交**
- 子模块挂载后默认处于 **detached HEAD** 状态，开发前必须先 `git checkout main`

## ⚠️ 常见陷阱（必读）

| 常见陷阱 | 产生原因及防范/解决方式 |
|---------|---------|
| **误用 `rm -rf` 移除子模块** | **原因**：仅删除物理文件，主仓库 `.git` 仍保留追踪记录，导致后续无法重新挂载。**正确做法**：必须使用 `git rm -r <子模块路径>`，从 Git 索引中彻底清除。 |
| **重新挂载后工作区文件未检出** | **原因**：如果挂载时子模块目录已物理存在，Git 可能会跳过 checkout，导致仿佛所有文件被删除（大量 D 状态）。**解决**：进入子模块执行 `git reset --hard origin/main` 强制恢复。 |
| **在游离状态 (Detached HEAD) 开发，导致提交遗失** | **原因**：主仓库的 `update` 仅将子模块切到特定 Commit ID，而非某分支。如果不绑定分支就提交，极其容易变成孤儿提交被后续拉取冲刷掉。**防范**：切入子模块开发前，务必先 `git checkout <分支名>` 绑定具体分支。 |
| **`git init` 前未配置好 `.gitignore`** | **原因**：若未提前准备好忽略规则就开始初始化及提交，会导致如 `.env` 凭证或 `__pycache__` 被永久写入仓库的初版历史中。**防范**：在项目独立建站最初，先建 `.gitignore` 再 `init`。 |
| **第三方嵌套项目已被当作普通文件误提交** | **原因**：直接将外部仓库源码放入主库并提交了。**正确做法**：如果是作为引用管理，必须先 `git rm -r --cached <嵌套路径>` 摘除普通文件属性，再使用 `git submodule add` 正式挂载作为子模块。 |

---

## 通用工作流

### 工作流 1：日常开发

**场景**：在子模块内修改代码

```bash
# 1. 进入子模块
cd <submodule-path>

# 2. ⚠️ 必须切换到分支（解除 detached HEAD）
git checkout main

# 3. 开发、提交、推送
git add . && git commit -m "feat: xxx"
git push

# 4. 回到主仓库
cd <main-repo-root>

# 5. 更新主仓库的子模块引用指针
git add <submodule-path>
git commit -m "chore: 更新子模块引用"
git push
```

### 工作流 2：克隆含子模块的项目

```bash
# 完整克隆（包含所有子模块和嵌套）
git clone --recurse-submodules <repository-url>

# 或分步执行
git clone <repository-url>
cd <repository>
git submodule update --init --recursive
```

### 工作流 3：选择性克隆

```bash
# 只克隆主项目
git clone <repository-url>
cd <repository>

# 只初始化特定子模块
git submodule update --init <submodule-path>

# 初始化子模块及其嵌套子模块
git submodule update --init --recursive <submodule-path>
```

### 工作流 4：更新子模块到远程最新

```bash
# 更新所有子模块
git submodule update --remote --merge

# 更新特定子模块
git submodule update --remote <submodule-path> --merge

# 使用 rebase 代替 merge
git submodule update --remote --rebase
```

### 工作流 5：同步嵌套子模块上游更新

**场景**：子模块内有嵌套的第三方子模块，需要跟踪上游更新

```bash
# 1. 进入父级子模块并切换到分支
cd <parent-submodule>
git checkout main

# 2. 更新嵌套子模块
git submodule update --remote <nested-submodule-path>

# 3. 在父级子模块中提交
git add <nested-submodule-path>
git commit -m "chore: 同步嵌套子模块上游更新"
git push

# 4. 回到主仓库
cd <main-repo-root>

# 5. 更新主仓库引用
git add <parent-submodule>
git commit -m "chore: 同步子模块（嵌套更新）"
git push
```

### 工作流 6：将已有目录转为 Submodule（主仓库重构）

**场景**：主仓库中某个子目录要拆分为独立仓库，形成子模块关系

```bash
# 1. 在子目录内建好 .gitignore（⚠️ 提交之前必须先做这一步！）
# 2. 在子目录内 git init 并推送到新的远端
cd <subdir>
git init
git add .
git commit -m "feat: 初始化独立仓库"
git remote add origin <new-repo-url>
git push -u origin main
cd <main-repo-root>

# 3. 从主仓库索引移除（关键：用 git rm，不能用 rm -rf）
git rm -r <subdir>
git commit -m "chore: 移除原实体目录，准备挂载为 submodule"

# 4. 挂载为子模块
git submodule add -b main <new-repo-url> <subdir>
git add .gitmodules <subdir>
git commit -m "feat: 挂载 <subdir> 为 submodule"

# 5. ⚠️ 子模块文件可能因目录已存在而未 checkout，若工作区出现大量删除变更：
cd <subdir>
git fetch origin && git reset --hard origin/main
```

### 工作流 7：检查子模块状态

```bash
# 查看所有子模块状态
git submodule status

# 递归查看（包含嵌套）
git submodule status --recursive

# 查看变更摘要
git submodule summary
```

### 工作流 8：批量操作

```bash
# 在所有子模块中切换分支
git submodule foreach 'git checkout main'

# 在所有子模块中拉取最新
git submodule foreach 'git pull origin main'

# 递归操作（包含嵌套）
git submodule foreach --recursive 'git fetch origin'

# 检查所有子模块状态
git submodule foreach 'git status'
```

### 工作流 9：子模块出现异常（detached HEAD / 大量删除变更）

```bash
# 修复单个子模块
cd <submodule-path>
git fetch origin
git reset --hard origin/main

# 修复所有子模块（批量）
git submodule foreach 'git fetch origin && git reset --hard origin/main'
```

### 工作流 10：开启独立产品免干扰模式（Ignore All）

**场景**：主项目中包含了并不需要强版本绑定的独立业务系统（如 `web` 或 `admin` 子站）。为了在此类子模块开发时不干扰主仓库的 `git status`，并且仅在发布“大版本里程碑”时才更新主仓库引用。

```bash
# 1. 在主仓库下屏蔽指定子模块的中间状态变更提示
git config submodule."<submodule-path>".ignore all

# 示例：
# git config submodule."projects/web/wopal".ignore all

# 2. 当你想要发布里程碑、强制更新主仓库指针时：
# 主仓库将不再提示 modified，你需要明确且主动地 add：
git add <submodule-path>
git commit -m "chore: snapshot update <submodule> to latest milestone"
```


---

## 快速参考

| 操作 | 命令 |
|------|------|
| 初始化子模块 | `git submodule update --init --recursive` |
| 更新到远程最新 | `git submodule update --remote --merge` |
| 查看状态 | `git submodule status --recursive` |
| 批量执行 | `git submodule foreach 'cmd'` |
| 解除 detached HEAD | `cd <submodule> && git checkout main` |
| 添加子模块 | `git submodule add -b main <url> <path>` |
| 移除子模块 | `git submodule deinit <path> && git rm <path>` |
| 修复文件丢失 | `cd <submodule> && git reset --hard origin/main` |
| 从主仓库正确移除 | `git rm -r <subdir>`（不能用 `rm -rf`） |

---

## 详细参考

- **命令参考**：[commands.md](references/commands.md) - 完整命令列表
- **实战示例**：[examples.md](references/examples.md) - 常见场景示例
- **故障排除**：[troubleshooting.md](references/troubleshooting.md) - 常见问题与最佳实践
