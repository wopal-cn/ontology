# Git Worktrees Skill 优化计划

> 状态：待实施
> 创建：2026-03-16
> 关联技能：`projects/agent-tools/agents/wopal/skills/git-worktrees`

---

## 概述

本计划优化 git-worktrees 技能，新增计划驱动开发支持，移除无效的 OpenSpec 集成。

**优化项汇总**：

| # | 优化项 | 优先级 | 修改文件 |
|---|--------|--------|----------|
| 1 | 创建前检查主分支未提交变更 | 高 | worktree.sh, SKILL.md |
| 2 | 创建后自动迁移计划文档（--plan 参数） | 高 | worktree.sh, SKILL.md |
| 3 | 移除 OpenSpec 集成 | 中 | SKILL.md, .workspace.md |
| 4 | 更新 SKILL.md description | 高 | SKILL.md |

---

## 实施步骤

### 步骤 1：修改 worktree.sh - 添加新函数

**文件**：`projects/agent-tools/agents/wopal/skills/git-worktrees/scripts/worktree.sh`

#### 1.1 添加配置变量初始化

在配置区域（约第 32 行附近）添加：

```bash
# 配置
WORKTREE_DIR=".worktrees"
INSTALL_DEPS=true
RUN_TESTS=true
PLAN_DOC=""  # 新增：计划文档名
```

#### 1.2 添加 check_clean_working_tree 函数

在 `install_dependencies()` 函数之前添加：

```bash
# 检查工作区是否干净（可选忽略计划文档）
check_clean_working_tree() {
    local project_dir="$1"
    local plan_doc="${2:-}"
    
    cd "$project_dir"
    
    # 构建排除参数
    local exclude_args=()
    if [ -n "$plan_doc" ]; then
        exclude_args+=(":!docs/products/plans/${plan_doc}.md")
        exclude_args+=(":!projects/*/docs/products/plans/${plan_doc}.md")
    fi
    
    # 检查未暂存的变更
    if [ ${#exclude_args[@]} -gt 0 ]; then
        git diff --quiet -- "${exclude_args[@]}" 2>/dev/null || return 1
    else
        git diff --quiet 2>/dev/null || return 1
    fi
    
    # 检查已暂存未提交的变更
    if [ ${#exclude_args[@]} -gt 0 ]; then
        git diff --cached --quiet -- "${exclude_args[@]}" 2>/dev/null || return 1
    else
        git diff --cached --quiet 2>/dev/null || return 1
    fi
    
    return 0
}
```

#### 1.3 添加 move_plan_doc 函数

在 `check_clean_working_tree()` 函数之后添加：

```bash
# 迁移计划文档到 worktree
move_plan_doc() {
    local workspace_root="$1"
    local project="$2"
    local worktree_path="$3"
    local plan_doc="$4"
    
    # 源路径：先查空间级，再查子项目级
    local plan_src="$workspace_root/docs/products/plans/${plan_doc}.md"
    
    if [ ! -f "$plan_src" ]; then
        plan_src="$workspace_root/projects/$project/docs/products/plans/${plan_doc}.md"
    fi
    
    if [ ! -f "$plan_src" ]; then
        warn "计划文档不存在: ${plan_doc}.md（已跳过）"
        return 1
    fi
    
    # 目标路径
    local plan_dest_dir="$worktree_path/docs/products/plans"
    local plan_dest="$plan_dest_dir/${plan_doc}.md"
    
    mkdir -p "$plan_dest_dir"
    mv "$plan_src" "$plan_dest"
    
    success "计划文档已迁移: $plan_dest"
    info "文档将在 worktree 中随实现一起提交，合并时返回主分支"
}
```

---

### 步骤 2：修改 worktree.sh - 更新 cmd_create 函数

**文件**：`projects/agent-tools/agents/wopal/skills/git-worktrees/scripts/worktree.sh`

#### 2.1 添加 --plan 参数解析

在 `cmd_create()` 的参数解析部分（约第 163 行）添加：

```bash
--plan)
    PLAN_DOC="$2"
    shift 2
    ;;
```

#### 2.2 添加工作区检查

在 `cd "$project_dir"` 之后、创建 worktree 之前添加：

```bash
# 检查工作区状态
if ! check_clean_working_tree "$project_dir" "${PLAN_DOC:-}"; then
    warn "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    warn "主分支存在未提交的变更！"
    warn "建议先提交变更后再创建 worktree。"
    warn "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    git status --short
    echo ""
    read -p "仍要继续创建 worktree？[y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        info "已取消"
        exit 0
    fi
fi
```

#### 2.3 添加计划文档迁移

在 `success "Worktree 创建成功"` 之后添加：

```bash
# 迁移计划文档（如果指定）
if [ -n "${PLAN_DOC:-}" ]; then
    move_plan_doc "$workspace_root" "$project" "$worktree_path" "$PLAN_DOC"
fi
```

---

### 步骤 3：修改 worktree.sh - 更新帮助信息

**文件**：`projects/agent-tools/agents/wopal/skills/git-worktrees/scripts/worktree.sh`

在 `cmd_help()` 函数的「选项（仅 create 命令）」部分添加：

```bash
  --plan <name>     迁移计划文档到 worktree（不含 .md 后缀）
```

---

### 步骤 4：修改 SKILL.md - 移除 OpenSpec 内容

**文件**：`projects/agent-tools/agents/wopal/skills/git-worktrees/SKILL.md`

#### 4.1 移除的行

| 行号 | 内容 |
|------|------|
| 3 | description 中的 `and OpenSpec workflow integration` |
| 10 | 概述中的 `以及 OpenSpec 工作流集成` |
| 16 | `- OpenSpec 变更工作流支持` |
| 66-78 | 整个 `### 2. OpenSpec 变更工作流` 部分 |
| 239-251 | 整个 `### OpenSpec 变更流程` 部分 |

---

### 步骤 5：修改 SKILL.md - 更新 frontmatter

**文件**：`projects/agent-tools/agents/wopal/skills/git-worktrees/SKILL.md`

将 description 更新为：

```yaml
---
name: git-worktrees
description: Workspace-level Git worktree management for parallel development across multiple branches. Supports dynamic project validation, automated dependency installation, and plan-driven development with --plan flag for migrating plan documents. Use this skill when creating isolated development environments, working on multiple features in parallel, or when you have a plan document ready for implementation.
---
```

---

### 步骤 6：修改 SKILL.md - 添加新功能文档

**文件**：`projects/agent-tools/agents/wopal/skills/git-worktrees/SKILL.md`

#### 6.1 在「快速开始 → 基本用法」部分添加

```bash
# 创建 worktree 并迁移计划文档
./scripts/worktree.sh create agent-tools feature/auth --plan auth-feature-plan
```

#### 6.2 在「命令详解 → create → 选项」部分添加

```markdown
- `--plan <name>`: 迁移计划文档到 worktree（指定文档名，不含 .md 后缀）
    - 文档从 `docs/products/plans/` 或 `projects/<name>/docs/products/plans/` 迁移
    - 迁移后在 worktree 中随实现一起提交，合并时返回主分支
```

#### 6.3 在「使用场景」部分添加（作为场景 4）

```markdown
### 4. 计划驱动开发

```bash
# 1. 编写计划文档
# docs/products/plans/my-feature.md

# 2. 创建 worktree 并迁移计划
./scripts/worktree.sh create agent-tools feature/my-feature --plan my-feature

# 3. 在 worktree 中按计划开发
cd .worktrees/agent-tools-feature-my-feature
# ... 开发 ...

# 4. 提交（文档 + 代码一起）
git add .
git commit -m "feat: 实现我的功能"

# 5. 合并回主分支，计划文档也随之进入
```
```

#### 6.4 在「注意事项 → 常见问题」部分添加

```markdown
**Q: 创建 worktree 时提示"主分支存在未提交的变更"？**
A: 如有未提交变更，脚本会警告并询问是否继续。建议先提交其他变更。如果只是计划文档的变更，可使用 `--plan` 参数自动忽略该文档。
```

---

### 步骤 7：修改 .workspace.md

**文件**：`.workspace.md`

将第 59 行：
```markdown
**管理方式**：工作空间级统一管理，支持动态项目验证和 OpenSpec 工作流集成
```

修改为：
```markdown
**管理方式**：工作空间级统一管理，支持动态项目验证和计划驱动开发
```

---

## 实施验证

完成后执行以下验证：

```bash
# 1. 语法检查
bash -n projects/agent-tools/agents/wopal/skills/git-worktrees/scripts/worktree.sh

# 2. 帮助信息检查
projects/agent-tools/agents/wopal/skills/git-worktrees/scripts/worktree.sh help

# 3. 功能测试（在干净目录下）
cd /tmp/test-worktree
# 创建测试仓库
git init test-repo
cd test-repo
echo "test" > README.md
git add . && git commit -m "init"
# 测试 --plan 参数解析
# 注意：完整功能测试需要在实际工作空间中进行
```

---

## 规范检查

| 检查项 | 要求 | 状态 |
|--------|------|------|
| YAML frontmatter | name + description | ✓ |
| SKILL.md 行数 | < 500 行 | ✓ (约 260 行) |
| scripts/ 目录 | 存在可执行脚本 | ✓ |
| description 触发场景 | 包含使用时机 | ✓ |

---

## 实施记录

| 日期 | 步骤 | 实施者 | 状态 |
|------|------|--------|------|
| | | | |
