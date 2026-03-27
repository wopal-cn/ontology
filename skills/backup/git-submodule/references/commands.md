# Git Submodule 命令参考

## 目录

1. [添加子模块](#添加子模块)
2. [克隆含子模块的仓库](#克隆含子模块的仓库)
3. [更新子模块](#更新子模块)
4. [在子模块内工作](#在子模块内工作)
5. [批量操作](#批量操作)
6. [移除子模块](#移除子模块)
7. [检查状态](#检查状态)
8. [高级操作](#高级操作)

---

## 添加子模块

```bash
# 基本添加
git submodule add <repository-url> <path>

# 示例：在 libs/lib 路径添加库
git submodule add https://github.com/example/lib.git libs/lib

# 跟踪特定分支
git submodule add -b main https://github.com/example/lib.git libs/lib

# 添加后提交
git add .gitmodules libs/lib
git commit -m "feat: add lib as submodule"
```

---

## 克隆含子模块的仓库

```bash
# 方法 1：克隆时使用 --recursive
git clone --recursive <repository-url>

# 方法 2：克隆后初始化
git clone <repository-url>
cd <repository>
git submodule init
git submodule update

# 一行命令初始化和更新
git submodule update --init --recursive
```

---

## 更新子模块

```bash
# 更新所有子模块到远程最新
git submodule update --remote

# 只更新特定子模块
git submodule update --remote libs/lib

# 更新 + 合并
git submodule update --remote --merge

# 更新 + 变基
git submodule update --remote --rebase

# 将子模块切换到主仓库引用的提交
git submodule update
```

---

## 在子模块内工作

```bash
# 进入子模块目录
cd libs/lib

# 切换分支（解除 detached HEAD）
git checkout main

# 进行修改后提交
git add .
git commit -m "feat: update library"
git push origin main

# 回到主仓库更新引用
cd ..
git add libs/lib
git commit -m "chore: update lib submodule reference"
git push
```

---

## 批量操作

```bash
# 在所有子模块中执行 pull
git submodule foreach 'git pull origin main'

# 检查所有子模块状态
git submodule foreach 'git status'

# 切换所有子模块分支
git submodule foreach 'git checkout main'

# 对嵌套子模块也执行（递归）
git submodule foreach --recursive 'git fetch origin'
```

---

## 移除子模块

```bash
# 1. 注销子模块
git submodule deinit <path>

# 2. 从 Git 中移除
git rm <path>

# 3. 删除 .git/modules 中的缓存
rm -rf .git/modules/<path>

# 4. 提交变更
git commit -m "chore: remove submodule"
```

**完整示例**：
```bash
git submodule deinit libs/lib
git rm libs/lib
rm -rf .git/modules/libs/lib
git commit -m "chore: remove lib submodule"
git push
```

---

## 检查状态

```bash
# 查看子模块状态
git submodule status

# 详细状态（递归）
git submodule status --recursive

# 摘要信息
git submodule summary
```

**状态输出解读**：
```
 44d7d1... libs/lib (v1.0.0)        # 正常（与引用提交一致）
+44d7d1... libs/lib (v1.0.0-1-g...) # 有本地修改
-44d7d1... libs/lib                 # 未初始化
```

---

## 高级操作

### 嵌套子模块

```bash
# 初始化所有嵌套子模块
git submodule update --init --recursive

# 更新所有嵌套子模块
git submodule update --remote --recursive
```

### 更改子模块 URL

```bash
git config -f .gitmodules submodule.libs/lib.url https://new-url.git
git submodule sync
git submodule update --init --recursive
```

### 将子模块转换为普通目录

```bash
# 1. 备份
cp -r libs/lib libs/lib-backup

# 2. 移除子模块
git submodule deinit libs/lib
git rm libs/lib
rm -rf .git/modules/libs/lib

# 3. 恢复（排除 .git）
rm -rf libs/lib-backup/.git
mv libs/lib-backup libs/lib

# 4. 作为普通文件添加
git add libs/lib
git commit -m "chore: convert submodule to regular directory"
```

### 浅克隆节省空间

```bash
# 浅克隆方式添加
git submodule add --depth 1 https://github.com/large/repo.git libs/large

# 将现有子模块更新为浅克隆
git submodule update --init --depth 1
```
