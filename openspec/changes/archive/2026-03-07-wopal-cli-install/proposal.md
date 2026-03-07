# Proposal: wopal-cli-install

## Summary

实现 `wopal skills install` 命令，从 INBOX 或 my-skills 安装技能到 Agent 目录，支持项目级（默认）和全局级（-g）两种安装范围，同时管理双锁文件追踪所有已安装技能。

## Why

将技能从 INBOX 或 my-skills 安装到 Agent 目录，支持项目级/全局级两种安装范围，同时管理双锁文件追踪所有已安装技能。使用 copy 模式安装，INBOX 技能默认自动扫描（可跳过），本地技能无需扫描。

## What Changes

### 新增

- `wopal skills install` 命令
- 双锁文件管理（项目级 + 全局级）
- 项目级/全局级两种安装范围
- INBOX 技能默认自动扫描（可跳过）
- 版本指纹追踪（GitHub Tree SHA / 本地源码 hash）

### 实现方式

- 复制 Skills CLI 代码：installer.ts（copy 相关部分）+ agents.ts（路径管理）+ skill-lock.ts + local-lock.ts
- 安装模式：copy（本次实现），symlink（未来扩展）
- 安装位置：
  - 项目级（默认）：`./.agents/skills/<skill>/`
  - 全局级（`-g`）：`~/.agents/skills/<skill>/`
- 版本指纹：
  - 远程技能：GitHub Tree SHA（从 .source.json 读取）
  - 本地技能：源码 hash（computeSkillFolderHash）
- 双锁文件（**统一 v3 格式**）：
  - 项目级锁：`./skills-lock.json`（v3 格式，提交到 Git）
  - 全局级锁：`~/.agents/.skill-lock.json`（v3 格式，本地管理）

## Dependencies

- **wopal-cli-core**: 依赖 INBOX 路径管理、Logger 系统
- **wopal-cli-download**: 依赖 .source.json 元数据格式

## Files

### 新增文件

```
projects/agent-tools/tools/wopal-cli/
├── src/
│   ├── commands/
│   │   └── install.ts              # install 命令实现
│   ├── utils/
│   │   ├── lock-manager.ts         # 双锁文件管理（项目级 + 全局级）
│   │   ├── installer.ts            # 复制自 Skills CLI（copy 部分）
│   │   ├── skill-lock.ts           # 复制自 Skills CLI（全局锁文件）
│   │   └── local-lock.ts           # 复制自 Skills CLI（项目锁文件）
│   └── types/
│       └── lock.ts                 # 锁文件类型定义
```

### 依赖文件

- `projects/agent-tools/tools/wopal-cli/src/utils/inbox-utils.ts`（来自 wopal-cli-core）
- `projects/agent-tools/tools/wopal-cli/src/utils/logger.ts`（来自 wopal-cli-core）
- `projects/agent-tools/tools/wopal-cli/src/utils/metadata.ts`（来自 wopal-cli-download）

## Capabilities

### skill-install

安装技能：

| 特性 | 描述 |
|------|------|
| 来源 1 | INBOX/<skill>（下载后） |
| 来源 2 | my-skills/<skill>（本地开发） |
| 安装模式 | copy（本次实现），symlink（未来扩展） |
| 安装范围 | 项目级（默认）或全局级（-g） |
| 扫描策略 | INBOX 默认自动扫描（--skip-scan 跳过），本地无需扫描 |
| 锁文件更新 | 双锁文件同步更新（项目级 + 全局级） |
| 已存在处理 | 显示警告，使用 --force 覆盖 |

### skill-lock-management

锁文件管理：

| 特性 | 描述 |
|------|------|
| 项目级锁 | `./skills-lock.json`（v3 格式） |
| 全局级锁 | `~/.agents/.skill-lock.json`（v3 格式） |
| 版本指纹 | skillFolderHash（远程=GitHub Tree SHA，本地=SHA-256） |
| 原子写入 | 临时文件 + 原子重命名 |
| 字母排序 | 项目锁技能按字母排序减少合并冲突 |

## Verification

- [ ] `wopal skills install skill-name` 安装到项目级 `.agents/skills/`
- [ ] `wopal skills install skill-name -g` 安装到全局 `~/.agents/skills/`
- [ ] INBOX 技能默认自动扫描
- [ ] `--skip-scan` 跳过扫描
- [ ] 本地技能无需扫描
- [ ] copy 模式工作正常
- [ ] 已存在技能显示警告
- [ ] `--force` 覆盖已存在技能
- [ ] 双锁文件更新正确（项目级 + 全局级）
- [ ] INBOX/<skill> 被删除（只删除当前技能）
- [ ] 锁文件记录源头信息和版本指纹
- [ ] `wopal skills list` 列出已安装技能
- [ ] Logger 支持（-d/--debug）
- [ ] AI Agent 友好的 help 信息

## Notes

- 复制自 Skills CLI 的代码需要保持兼容性
- **锁文件格式统一**：项目级和全局级都使用 v3 格式（简化设计）
- 版本指纹机制：
  - 远程技能：从 `.source.json` 的 `skillFolderHash` 字段读取（GitHub Tree SHA）
  - 如果 `.source.json` 不包含 `skillFolderHash`，调用 `fetchSkillFolderHash()` 获取
  - 本地技能：计算源码 hash（`computeSkillFolderHash`）
  - **无论全局还是项目级，都使用 `skillFolderHash` 字段**
- 项目级锁文件按字母排序减少合并冲突
- INBOX 技能安装后删除（临时区清理）
- 本地技能安装后保留源码（开发需要）
- **重要**：download 命令需要增强，在下载时调用 `fetchSkillFolderHash()` 获取 Tree SHA 并保存到 `.source.json`
