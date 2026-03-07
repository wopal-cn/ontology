# Proposal: wopal-cli-check

## Summary

实现 `wopal skills check` 命令，检测已安装技能的源头变更，提醒用户更新。

## Why

检测已安装技能的源头变更，提醒用户更新。通过比较版本指纹（GitHub Tree SHA / 本地源码 hash）检测远程和本地技能的变更。

## What Changes

### 新增

- `wopal skills check` 命令
- 统一版本指纹机制（远程用 Tree SHA，本地用源码 hash）
- 远程技能：比较 GitHub Tree SHA
- 本地技能：比较源码 hash
- 生成变更报告并建议更新操作

### 实现方式

- 复制 Skills CLI 代码：skill-lock.ts + local-lock.ts
- 远程技能：fetchSkillFolderHash() 获取 GitHub Tree SHA
- 本地技能：computeSkillFolderHash() 计算源码 hash
- 读取锁文件，比较源头 hash vs 锁文件 hash

## Dependencies

- **wopal-cli-core**: 基础框架
- **wopal-cli-install**: 需要锁文件读取功能

## Files

### 新增文件

```
projects/agent-tools/tools/wopal-cli/
├── src/
│   ├── commands/
│   │   └── check.ts                # check 命令实现
│   └── utils/
│       ├── skill-lock.ts           # 复制自 Skills CLI（GitHub Tree SHA）
│       └── local-lock.ts           # 复制自 Skills CLI（本地 hash）
```

### 依赖文件

- `projects/agent-tools/tools/wopal-cli/src/utils/lock-manager.ts`（来自 wopal-cli-install）
- `projects/agent-tools/tools/wopal-cli/src/types/lock.ts`（来自 wopal-cli-install）

## Capabilities

### skill-source-tracking

源头变更追踪：

| 特性 | 描述 |
|------|------|
| 远程技能 | 比较 GitHub Tree SHA（从 `skillFolderHash` 字段） |
| 本地技能 | 比较源码 hash（从 `sourceUrl` 字段读取路径） |
| 统一指纹 | `skillFolderHash` 字段（远程=Tree SHA，本地=SHA-256） |
| 检查范围 | 所有技能（默认）/ 项目级（--local）/ 全局级（--global） |
| 锁文件策略 | 合并项目锁和全局锁并去重 |
| 并发控制 | 最大 5 个并发，3 次重试，10 秒超时 |
| 进度反馈 | 显示检查进度、当前技能、百分比 |
| 变更报告 | 分组显示（up-to-date / update-available / source-missing） |

## Verification

- [ ] `wopal skills check` 检查所有技能（合并项目锁和全局锁）
- [ ] `wopal skills check --local` 只检查项目级技能
- [ ] `wopal skills check --global` 只检查全局级技能
- [ ] `wopal skills check skill-name` 检查指定技能
- [ ] 远程技能变更检测正确（Tree SHA 比较）
- [ ] 本地技能变更检测正确（源码 hash 比较，从 `sourceUrl` 读取路径）
- [ ] 显示检查进度（1/50、百分比、当前技能）
- [ ] 变更报告格式正确（分组、排序、颜色标识）
- [ ] 无变更时显示友好提示
- [ ] 建议更新操作正确
- [ ] GitHub API 限流时显示警告
- [ ] 本地技能路径不存在时标记为 source-missing
- [ ] 并发检查正常（最大 5 个并发）
- [ ] 失败重试机制正常（3 次，指数退避）

## Notes

- 复制自 Skills CLI 的代码需要保持兼容性
- 使用 hash 而非文件时间戳进行变更检测
- 不依赖外部命令，直接调用 GitHub API
- 从锁文件 `sourceType` 字段判断技能类型
- 从锁文件 `sourceUrl` 字段读取本地技能路径（绝对路径）
- 合并项目锁和全局锁时，优先使用项目锁（更具体）
- 并发控制：最大 5 个并发，避免 GitHub API 限流
- 失败重试：3 次，指数退避（1s, 2s, 4s）
- 超时设置：单个请求 10 秒，总检查 5 分钟
- 进度显示：显示当前检查的技能名称和百分比
- 报告格式：按状态分组，技能按字母排序，使用颜色标识
