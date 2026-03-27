# Git Submodule 实战示例

## 目录

1. [添加外部库](#示例-1添加外部库)
2. [克隆后设置](#示例-2克隆后设置)
3. [更新到最新版本](#示例-3更新到最新版本)
4. [多项目共享组件](#示例-4多项目共享组件)
5. [CI/CD 集成](#示例-5cicd-集成)

---

## 示例 1：添加外部库

```bash
# 1. 添加子模块
git submodule add https://github.com/lodash/lodash.git vendor/lodash

# 2. 固定到特定版本（标签）
cd vendor/lodash
git checkout v4.17.21
cd ../..

# 3. 提交变更
git add .
git commit -m "feat: add lodash v4.17.21 as submodule"

# 4. 推送
git push origin main
```

---

## 示例 2：克隆后设置

```bash
# 1. 克隆仓库
git clone https://github.com/myorg/myproject.git
cd myproject

# 2. 初始化并更新子模块
git submodule update --init --recursive

# 3. 检查子模块状态
git submodule status

# 4. 切换子模块分支（开发时）
git submodule foreach 'git checkout main || git checkout master'
```

---

## 示例 3：更新到最新版本

```bash
# 1. 更新所有子模块到远程最新
git submodule update --remote --merge

# 2. 查看变更
git diff --submodule

# 3. 提交变更
git add .
git commit -m "chore: update all submodules to latest"

# 4. 推送
git push origin main
```

---

## 示例 4：多项目共享组件

```bash
# 在项目 A 中
git submodule add https://github.com/myorg/shared-components.git src/shared

# 在项目 B 中
git submodule add https://github.com/myorg/shared-components.git src/shared

# 更新共享组件时（在各项目中执行）
git submodule update --remote src/shared
git add src/shared
git commit -m "chore: update shared-components"
```

---

## 示例 5：CI/CD 集成

### GitHub Actions

```yaml
jobs:
  build:
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive
```

### GitLab CI

```yaml
variables:
  GIT_SUBMODULE_STRATEGY: recursive
```

### Jenkins

```groovy
checkout scm: [
  $class: 'SubmoduleOption',
  recursiveSubmodules: true
]
```
