# Ontology 上游协作工作流

## 仓库拓扑

```
┌─ 运行时层 ─────────────────────────────────────────────────────────┐
│  wopal-workspace/.wopal/        [branch: space/main]                │
│  └── 直接编辑 agent 能力，影响正在运行的插件                          │
│      (sampx/wopal-space-ontology fork)                              │
└──────────────────────────────────────────────────────────────────────┘
                              ↓ push/pull
┌─ Fork 中转层 ───────────────────────────────────────────────────────┐
│  ~/.wopal/ontologies/wopal-space-ontology  [branch: main]           │
│  └── 同步中转站，接收上游 merge，推送贡献分支                          │
│      remote: origin → fork, upstream → wopal-cn/ontology            │
└──────────────────────────────────────────────────────────────────────┘
                              ↓ PR (cherry-pick)
                              ↑ merge
┌─ 上游本体层 ────────────────────────────────────────────────────────┐
│  wopal-cn/ontology              [branch: main]                      │
│  └── 通用能力本体，所有 space fork 的共同祖先                          │
│      (squash merge PR → 压缩历史)                                    │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 工作流 1: 贡献上游（Fork → Upstream）

**场景**：在 space 开发了通用能力，贡献到上游 ontology。

**前置**：切换到 Fork 中转层
```bash
cd ~/.wopal/ontologies/wopal-space-ontology
```

**步骤**：

```bash
# 1. 同步上游最新状态
git fetch upstream
git merge upstream/main --no-edit
git push origin main

# 2. 识别可贡献 commits
git log --oneline upstream/main..space/main

# 3. 创建贡献分支
git checkout -b contribute/<topic> upstream/main

# 4. Cherry-pick（按时间顺序）
git cherry-pick <hash1> <hash2> <hash3> ...

# 5. 推送并创建 PR
git push origin contribute/<topic>
gh pr create --repo wopal-cn/ontology \
   --title "feat(scope): description" \
   --body "## Summary\n- 变更点1\n- 变更点2\n\n## Testing\n- 测试状态"

# 6. 合并后清理分支
git checkout main
git branch -D contribute/<topic>
git push origin --delete contribute/<topic>

# 7. 同步 squash merge 结果
git fetch upstream
git merge upstream/main --no-edit
git push origin main
```

**示例**：
```bash
git log --oneline upstream/main..space/main
# 输出：
# de8268a fix(tasks): use correct SDK path param
# 71cd789 feat(tasks): add session-based task recovery
# 7020cff fix(tasks): allow deleting idle tasks
# 5fb4740 feat(tools): add wopal_task_delete tool
# 1a4012b fix(memory): convert Float32Array for Bun
# 1d42a73 chore(config): update model configs  ← 跳过（非通用）

git checkout -b contribute/task-store-persistence upstream/main
git cherry-pick 1a4012b 5fb4740 7020cff 71cd789 de8268a
git push origin contribute/task-store-persistence
gh pr create --repo wopal-cn/ontology --title "feat(tasks): add task persistence"
```

**筛选规则**：

| 目录 | 贡献 | 原因 |
|------|------|------|
| `wopal-plugin/src/` | ✅ | 核心插件功能 |
| `skills/` | ✅ | 技能库 |
| `agents/` | ✅ | Agent 能力定义 |
| `commands/` | ✅ | 命令集 |
| `rules/` | ✅ | 规则集 |
| `config/settings.jsonc` | ✅ | ellamaka 启动必需 |

**未来调整**：分离 `config/settings.local.jsonc` 后，排除本地配置。

---

## 工作流 2: 同步上游（Upstream → Fork）

**场景**：上游有新的通用能力，同步到当前 space。

**前置**：切换到 Fork 中转层
```bash
cd ~/.wopal/ontologies/wopal-space-ontology
```

**步骤**：

```bash
# 1. 检查上游更新
git fetch upstream
git log --oneline main..upstream/main

# 2. Merge 到 fork main
git merge upstream/main --no-edit
git push origin main

# 3. 同步到运行时 worktree
cd <space-path>/.wopal/
git merge main --no-edit

# 4. 验证
# 重启 OpenCode → 测试新功能
```

**冲突处理**：
```bash
# 优先保留 upstream 版本（通用能力与上游一致）
git checkout --theirs <冲突文件>

# 手动合并 space 特有内容（如用户路径配置）
git add . && git commit
```

---

## 工作流 3: 多 Space 版本管理

**场景**：多个用户各自 fork ontology，独立演进。

**模型**：
```
upstream/main (v1.0) ←───────────────────────┐
    │                                         │
    ├─ user-a/wopal-space-ontology            │ merge
    │    space/main: v[A] + v1.0              │
    │                                         │
    ├─ user-b/wopal-space-ontology            │
    │    space/main: v[B] + v1.0              │
    │                                         │
    └─ user-c/wopal-space-ontology            │
         space/main: v[C] + v1.0              │
```

**共性**：
- 都从 `upstream/main` 定期 merge 通用更新
- 都可以 cherry-pick 通用内容贡献回上游
- 定制内容（用户路径等）留在各自 space/main

---

## 常见问题

### Q1: Fork main 显示 "N commits ahead"，需要修复吗？

**NO** — squash merge 的显示噪音。

原因：
- Squash merge 将多个 commit 压缩为 1 个
- Fork main 保留原始粒度 commits
- Git merge 基于内容而非 commit hash，不影响同步

结论：
- GitHub 显示不对等是正常现象
- Force push 会丢失本地 commit history
- 除非重建仓库，否则忽略

### Q2: 上游 merge 冲突如何处理？

优先保留 upstream 版本（通用能力应与上游一致），手动合并 space 特有内容。

---

## Git Remote 配置

Fork 中转层必须配置 dual remote：

```bash
cd ~/.wopal/ontologies/wopal-space-ontology

# 检查当前 remote
git remote -v
# origin    https://github.com/<user>/wopal-space-ontology.git (fetch)
# upstream  https://github.com/wopal-cn/ontology.git (fetch)

# 如缺少 upstream，添加
git remote add upstream https://github.com/wopal-cn/ontology.git
```