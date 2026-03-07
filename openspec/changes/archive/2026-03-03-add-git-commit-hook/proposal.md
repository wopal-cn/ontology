## Why

工作空间采用 Conventional Commits 规范，但缺乏自动验证机制，导致不规范提交可能进入仓库。手动检查效率低且易遗漏。现在添加 Git commit hook，在提交时自动验证消息格式，确保规范执行。

## What Changes

- 添加 `commit-msg` Git hook，验证提交消息是否符合 Conventional Commits 规范
- 验证格式：`<type>: <description>`（type: feat/fix/refactor/docs/test/chore 等）
- 验证消息长度（首行不超过 50 字）
- 拒绝不合规提交，提示正确格式
- 提供安装脚本，支持快速部署到新环境

## Capabilities

### New Capabilities

- `git-commit-validation`: Git 提交消息格式验证能力，包括格式检查、长度限制、错误提示

### Modified Capabilities

无

## Impact

- 新增文件：`.git/hooks/commit-msg`（Git hook 脚本）
- 新增文件：`scripts/setup-git-hooks.sh`（安装脚本）
- 影响：所有开发者的本地提交流程
- 兼容性：不影响已有提交，仅验证新提交
