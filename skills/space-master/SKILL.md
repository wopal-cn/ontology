---
name: space-master
description: |
    空间能力全生命周期管理。⚠️ MUST LOAD BEFORE 任何空间操作（技能安装/空间同步/上游贡献）。
    Triggers: 技能查找/安装/卸载、空间 worktree 管理、上游同步、贡献回上游、空间状态检查、多 Space 版本管理。
    🔴 即使用户未明确说"上游同步"，只要涉及 ontology 仓库协作（fork/merge/cherry-pick/PR），就必须加载本技能。
---

## Ontology 日常开发流

`.wopal/` 是运行时 worktree（branch: `space/main`），直接编辑立即影响正在运行的插件。

### 决策树：是否需要隔离开发？

```
需要隔离开发？
├─ YES → 创建 worktree
│    cd ~/.wopal/ontologies/wopal-space-ontology
│    git worktree add ../.worktrees/ontology-<issue> -b feature/<name>
│    → 在 worktree 开发/测试/验证
│    → 合并回 space/main（见下方 Worktree 合并流程）
│
├─ NO → 直接编辑 .wopal/
│    → 立即影响运行插件（无需重启即可生效）
│    → 验证后提交到 fork
```

### Worktree 合并流程

```bash
# 1. Fork 中转层合并
cd ~/.wopal/ontologies/wopal-space-ontology
git checkout space/main
git merge ../.worktrees/ontology-<issue>/main

# 2. 运行时层同步
cd <space-path>/.wopal/
git merge main --no-edit

# 3. 清理 worktree
cd ~/.wopal/ontologies/wopal-space-ontology
git worktree remove ../.worktrees/ontology-<issue>
git branch -D feature/<name>
git push origin --delete feature/<name>  # 如有远程分支
```

### 提交到 Fork

```bash
cd <space-path>/.wopal/
git add . && git commit -m "feat(scope): description"
git push origin space/main

# 验证：重启 OpenCode → 测试功能
```

---

## 技能生命周期

```
Find → Download → Scan → Install → Develop → Optimize → Evaluate
```

---

## 场景路由

| 用户意图 | 参考文档 | 推荐操作 |
|---------|---------|---------|
| 查看空间状态 | — | `wopal space status` |
| 保存空间变更 | — | `wopal space save -m "message"` |
| 贡献到上游 | `references/upstream-sync.md` | 工作流 1: Fork → Upstream |
| 同步上游更新 | `references/upstream-sync.md` | 工作流 2: Upstream → Fork |
| 多用户 Space 管理 | `references/upstream-sync.md` | 工作流 3: 版本矩阵 |
| 查找/搜索技能 | `references/lifecycle-install.md` | `wopal skills find` |
| 下载审查 | `references/lifecycle-install.md` | `wopal skills download` |
| 安全扫描 | `references/lifecycle-install.md` | `wopal skills scan` |
| 安装技能 | `references/lifecycle-install.md` | `wopal skills install` |
| 管理 INBOX | `references/lifecycle-install.md` | `wopal skills inbox` |
| 卸载技能 | `references/lifecycle-install.md` | `wopal skills remove` |
| 创建新技能 | `references/lifecycle-develop.md` | Use `skill-creator` |
| 优化/修复技能 | `references/lifecycle-develop.md` | Edit source + reinstall |
| 评估技能质量 | `references/evaluate-skill.md` | Read reference |

---

## Quick Commands

```bash
# 空间管理
wopal space status              # 查看空间全貌
wopal space save -m "message"   # 保存变更

# 技能管理
wopal skills find "query"
wopal skills download owner/repo@skill
wopal skills scan skill-name
wopal skills install /path/to/skill --force
wopal skills remove <skill-name> --force
```

---

## Post-Install Verification

```bash
ls -la .wopal/skills/<skill-name>/SKILL.md
wopal skills list
```

---

## Tips

1. **Ontology 协作必读** — 贡献/同步上游前读 `references/upstream-sync.md`
2. **Edit in workspace** — `.wopal/skills/<name>/` 可直接编辑
3. **Scan before install** — Downloaded skills need explicit scan
4. **Verify after install** — `ls .wopal/skills/<name>/SKILL.md`

---

## Browse Online

https://skills.sh/