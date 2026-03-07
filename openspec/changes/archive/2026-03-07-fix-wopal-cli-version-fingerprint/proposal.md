# Proposal: fix-wopal-cli-version-fingerprint

## Why

download 命令在克隆远程仓库后未记录版本指纹（commit SHA / tag / ref），导致 `.source.json` 缺少关键版本信息。这使得后续的 check 和 update 命令无法进行版本比较和精确更新。

**影响链**：
- check 命令：无法比较本地与远程的版本差异
- update 命令：无法判断是否需要更新，无法精确更新到指定版本
- install 命令：锁文件缺少完整的版本信息

## What Changes

### 修改

- 扩展 `SkillMetadata` 接口，新增版本指纹字段
- 修改 `git.ts` 的 `cloneRepo` 函数，返回 commit SHA
- 修改 `download.ts`，在元数据中记录版本指纹
- 更新 `wopal-cli-skills-download` 规格，增加版本指纹需求

### 新增字段

```typescript
interface SkillMetadata {
  // 现有字段
  name: string;
  description: string;
  source: string;
  sourceUrl: string;
  skillPath: string;
  downloadedAt: string;
  
  // 新增版本指纹
  skillFolderHash?: string | null;  // GitHub Tree SHA（主版本指纹）
  commit?: string;                   // 实际克隆的 commit SHA（追溯）
  ref?: string;                      // 用户指定的分支/标签
  tag?: string;                      // 如果 ref 是语义化标签
}
```

## Capabilities

### Modified Capabilities

- **wopal-cli-skills-download**: 增加版本指纹记录需求，扩展元数据结构

## Impact

**代码影响**：
- `src/utils/git.ts` - 修改 `cloneRepo` 返回值
- `src/utils/metadata.ts` - 扩展 `SkillMetadata` 接口
- `src/commands/download.ts` - 记录版本指纹到元数据

**依赖关系**：
- 解除 wopal-cli-check 的实现阻塞
- 解除 wopal-cli-update 的实现阻塞
- 为 wopal-cli-install 提供完整版本信息

**向后兼容**：
- 现有 `.source.json` 文件缺少新字段时，check/update 命令应优雅处理
- 建议用户重新下载技能以获取完整版本信息
