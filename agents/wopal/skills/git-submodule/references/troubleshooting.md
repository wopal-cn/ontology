# Git Submodule 故障排除与最佳实践

## 目录

1. [常见陷阱](#常见陷阱)
2. [故障排除](#故障排除)
3. [最佳实践](#最佳实践)
4. [配置建议](#配置建议)

---

## 常见陷阱

| 陷阱 | 说明 | 解决方案 |
|------|------|----------|
| **detached HEAD** | 子模块默认处于 detached HEAD 状态 | 工作前执行 `git checkout main` |
| **遗漏初始化** | 克隆后忘记初始化子模块 | 执行 `git submodule update --init` |
| **引用不一致** | 子模块变更后未在主仓库更新引用 | 逐层提交：子模块 → 主仓库 |
| **权限问题** | 私有子模块缺少访问权限 | 配置 SSH 密钥或令牌 |
| **相对路径** | `.gitmodules` 使用相对路径，fork 后出问题 | 使用绝对 URL |
| **删除不完整** | 移除子模块时未删除 `.git/modules` 缓存 | 完整执行 deinit + rm + 删除缓存 |

---

## 故障排除

### 子模块未初始化

```bash
# 强制初始化
git submodule update --init --force
```

### 子模块冲突

```bash
# 1. 检查状态
git submodule status

# 2. 解决冲突后切换到想要的提交
cd libs/lib
git checkout <desired-commit>
cd ..

# 3. 更新引用
git add libs/lib
git commit -m "fix: resolve submodule conflict"
```

### 权限错误（私有仓库）

```bash
# 使用 SSH URL
git config -f .gitmodules submodule.libs/lib.url git@github.com:org/private-lib.git
git submodule sync
git submodule update --init
```

### 子模块 dirty 状态

```bash
# 检查变更
cd libs/lib
git status
git diff

# 丢弃变更
git checkout .
git clean -fd

# 或提交变更
git add .
git commit -m "fix: resolve changes"
git push
```

---

## 最佳实践

1. **版本固定**：子模块始终固定到特定提交/标签，确保可重现性
2. **文档化**：在 README 中说明子模块初始化方法
3. **CI 配置**：在 CI/CD 流程中使用 `--recursive` 选项
4. **定期更新**：为安全补丁等定期更新子模块
5. **分支跟踪**：开发时设置分支跟踪以提高便利性
6. **权限管理**：确认子模块仓库的访问权限
7. **浅克隆**：大仓库使用 `--depth` 选项节省空间
8. **状态检查**：提交前用 `git submodule status` 检查状态

---

## 配置建议

### 实用 Git 配置

```bash
# 在 diff 中显示子模块变更
git config --global diff.submodule log

# 在 status 中显示子模块摘要
git config --global status.submoduleSummary true

# push 时检查子模块变更
git config --global push.recurseSubmodules check

# fetch 时同时 fetch 子模块
git config --global fetch.recurseSubmodules on-demand
```

### .gitmodules 示例

```ini
[submodule "libs/lib"]
    path = libs/lib
    url = https://github.com/example/lib.git
    branch = main

[submodule "vendor/tool"]
    path = vendor/tool
    url = git@github.com:example/tool.git
    shallow = true
```

---

## 参考资料

- [Git Submodules - Official Documentation](https://git-scm.com/book/en/v2/Git-Tools-Submodules)
- [Git Submodule Tutorial - Atlassian](https://www.atlassian.com/git/tutorials/git-submodule)
- [Managing Dependencies with Submodules](https://github.blog/2016-02-01-working-with-submodules/)
- [Git Submodule Cheat Sheet](https://gist.github.com/gitaarik/8735255)
