# Proposal: wopal-cli-update

## Summary

实现 `wopal skills update` 命令，更新已安装的技能到最新版本，支持单个更新和批量更新。

## Why

更新已安装的技能到最新版本，支持单个更新和批量更新。组合 download + scan + install 命令，确保更新流程完整和安全。

## What Changes

### 新增

- `wopal skills update` 命令
- 单个技能更新：download → scan → install
- 批量更新：`--all` 选项
- 保留安装模式（symlink/copy）
- 更新失败时保留现有版本

### 实现方式

- 组合命令：download + scan + install
- 远程技能：重新下载 → 扫描 → 安装 → 删除 INBOX
- 本地技能：重新复制 → 更新锁文件
- 检查版本指纹，未变更则跳过

## Dependencies

- **wopal-cli-download**: 需要下载功能
- **wopal-cli-scan**: 需要扫描功能
- **wopal-cli-install**: 需要安装功能和锁文件管理

## Files

### 新增文件

```
projects/agent-tools/tools/wopal-cli/
├── src/
│   └── commands/
│       └── update.ts               # update 命令实现（组合其他命令）
```

### 依赖文件

- `projects/agent-tools/tools/wopal-cli/src/commands/download.ts`（来自 wopal-cli-download）
- `projects/agent-tools/tools/wopal-cli/src/commands/scan.ts`（来自 wopal-cli-scan）
- `projects/agent-tools/tools/wopal-cli/src/commands/install.ts`（来自 wopal-cli-install）
- `projects/agent-tools/tools/wopal-cli/src/utils/lock-manager.ts`（来自 wopal-cli-install）

## Capabilities

### skill-update

更新技能：

| 特性 | 描述 |
|------|------|
| 单个更新 | `wopal skills update skill-name` |
| 批量更新 | `wopal skills update --all` |
| 更新流程 | download → scan → install |
| 保留模式 | symlink / copy |
| 失败保护 | 保留现有版本 |

## Verification

- [ ] `wopal skills update skill-name` 更新成功
- [ ] `wopal skills update --all` 批量更新成功
- [ ] 更新流程：download → scan → install
- [ ] 保留原有安装模式
- [ ] 更新失败时保留现有版本
- [ ] 源头未变更时跳过更新
- [ ] 技能未安装时显示错误

## Notes

- 组合命令，不重复实现下载/扫描/安装逻辑
- 读取锁文件获取源头信息和安装模式
- 远程技能执行完整流程，本地技能仅重新复制
- 错误处理友好，保留现有版本
