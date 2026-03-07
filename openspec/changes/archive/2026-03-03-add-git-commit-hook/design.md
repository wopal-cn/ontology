## Context

wopal-workspace 采用 Conventional Commits 规范，但当前缺乏自动验证机制。开发者可能在提交时忘记遵循规范，导致提交历史不一致。Git hooks 是解决此问题的标准方案。

**约束**：
- 必须兼容 macOS 和 Linux 环境
- 不能依赖外部工具（如 commitlint），保持轻量
- 必须易于安装和卸载

## Goals / Non-Goals

**Goals:**
- 在 `git commit` 时自动验证消息格式
- 提供清晰的错误提示和格式指导
- 提供一键安装脚本
- 支持所有 Conventional Commits 标准类型

**Non-Goals:**
- 不验证提交消息的 body 和 footer（仅验证首行）
- 不集成 CI/CD 流程（仅本地验证）
- 不提供自动修复功能

## Decisions

### Decision 1: 使用 Shell 脚本实现

**选择**: 使用 Bash 脚本实现 `commit-msg` hook

**理由**:
- 无需额外依赖（Python/Node.js 等）
- 跨平台兼容（macOS/Linux）
- 易于阅读和维护
- 性能足够（验证逻辑简单）

**替代方案**:
- **commitlint**: 需要 Node.js 依赖，对非 Node 项目侵入性强
- **Python 脚本**: 需要确保 Python 环境，增加复杂度
- **pre-commit 框架**: 需要安装框架本身，过度设计

### Decision 2: 正则表达式验证

**选择**: 使用正则表达式验证提交消息格式

**正则模式**:
```bash
^(feat|fix|refactor|docs|test|chore|style|perf|ci|build|revert)(\(.+\))?: .{1,50}
```

**理由**:
- 单次匹配即可完成验证
- 支持可选 scope（如 `feat(auth):`）
- 同时检查类型、格式和长度

### Decision 3: Hook 文件位置

**选择**: 将 hook 安装到 `.git/hooks/commit-msg`

**理由**:
- Git 原生支持的 hook 位置
- 无需修改 Git 配置
- 易于卸载（删除文件即可）

**替代方案**:
- **core.hooksPath**: 需要修改 Git 配置，影响其他 hooks
- **软链接**: 增加管理复杂度

### Decision 4: 安装脚本设计

**选择**: 提供 `scripts/setup-git-hooks.sh` 独立脚本

**功能**:
- 检查 `.git/hooks/` 目录存在
- 复制 hook 文件并设置可执行权限
- 检测已存在时提示用户

**理由**:
- 集中管理 hooks 安装
- 可复用于其他 hooks（未来扩展）
- 新成员快速上手

## Risks / Trade-offs

### Risk 1: 开发者可能绕过 hook

**风险**: 开发者可使用 `git commit --no-verify` 绕过验证

**缓解措施**:
- 在文档中说明绕过的后果
- CI/CD 中添加相同的验证（未来）
- 代码审查时检查提交消息

### Risk 2: 误判合法提交

**风险**: 正则表达式可能过于严格，拒绝合法提交

**缓解措施**:
- 支持所有 Conventional Commits 标准类型
- 允许灵活的 scope 命名
- 测试覆盖常见提交场景

### Risk 3: 多人协作时 hook 需分别安装

**风险**: Git hooks 不会通过 Git 同步，每个开发者需手动安装

**缓解措施**:
- 在 `AGENTS.md` 中记录安装步骤
- 在项目 README 中说明
- 提供简单的安装命令

## Migration Plan

### 部署步骤

1. **创建文件**:
   - `scripts/git-hooks/commit-msg`（hook 脚本）
   - `scripts/setup-git-hooks.sh`（安装脚本）

2. **测试验证**:
   - 本地测试各种提交消息
   - 验证错误提示清晰度
   - 测试安装脚本

3. **文档更新**:
   - 更新 `AGENTS.md`（如需要）
   - 更新项目 README

4. **团队成员通知**:
   - 通知团队成员运行安装脚本

### 回滚策略

如需移除 hook：
```bash
rm .git/hooks/commit-msg
```

## Open Questions

无
