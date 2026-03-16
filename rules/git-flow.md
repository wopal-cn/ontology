---
trigger: always_on
---
# Git 工作流规则

## 基本法
- 必须先提供代码或文件变更列表供用户在编辑器中评审，**只有在用户明确确认并要求 commit 的情况下**，才能执行 `git commit` 或 `git push` 操作
- **commit message 必须使用中文**，严格遵循 Conventional Commits 规范
- 每次提交前确认不在 `detached HEAD` 状态

## 提交规范

使用 Conventional Commits 规范，格式为 `<type>: <description>`

| Type | 用途 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat: 添加用户认证模块` |
| `fix` | Bug 修复 | `fix: 修复登录超时问题` |
| `refactor` | 重构（不改变功能） | `refactor: 重构调度引擎` |
| `docs` | 文档更新 | `docs: 更新安装指南` |
| `test` | 测试相关 | `test: 添加单元测试` |
| `chore` | 构建/工具 | `chore: 更新依赖版本` |

### Message 规则

- 使用祈使句：`添加` 而非 `添加了`
- 首行（type + scope + description）不超过 72 字符
- 复杂变更添加 body 说明
- 破坏性变更标注 `BREAKING CHANGE:`

### 提交拆分

- 相关变更合并为一个提交
- 不相关变更拆分为多个提交
- 拆分好处：原子(事务性)提交、便于回滚和 bisect 排查

## 分支策略

- `main` - 主分支，稳定版本
- `feature/*` - 功能分支
- `bugfix/*` - Bug 修复分支
- `hotfix/*` - 紧急修复分支
- `refactor/*` - 重构分支

## 子项目工作流

**核心原则**: 逐层提交，先子项目后工作空间

1. **开发前**: 确保 `git checkout <branch>` 脱离 detached HEAD
2. **开发后**: 在子项目内完成 `git add` → `git commit` → `git push`
3. **里程碑**: 在工作空间仓库使用 `/pin-submodule` 更新指针

> 详细指南请使用 `/git-submodule` 技能

## 禁止提交

- `.env*` 环境变量文件
- `__pycache__/`, `node_modules/`, `.ruff_cache/`
- IDE 配置 `.idea/`, `.vscode/` (除非项目明确需要)