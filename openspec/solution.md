## 概述

基于对 Skills CLI 和 skill-security-scanner 的深入研究，本文档记录 wopal skills 的核心设计思路和关键技术决策。

## 设计思路

### 1. 完全独立 vs 依赖外部工具

**思考过程**：
- 初步想法：调用 `npx skills add` 进行安装，复用 Skills CLI 的功能
- 问题：`npx skills add` 是**单阶段流程**（download→install），源信息在内存中传递，无法插入安全扫描环节
- 解决：复制 Skills CLI 的 git.ts、source-parser.ts、skills.ts 代码，在 wopal skills 内部实现完整流程

**设计思路**：
- **完全独立**：不依赖任何外部 CLI，所有功能内置实现
- **借鉴代码**：从 Skills CLI 复制核心模块（git.ts, source-parser.ts, skills.ts）
- **保持兼容**：使用相同的目录结构和 symlink/copy 模式
- **三阶段流程**：download → scan → install（Skills CLI 是单阶段）

### 2. 源格式支持（简化为 2 种远程源）

**思考过程**：
- Skills CLI 支持 5 种源格式：GitHub、GitLab、本地路径、Well-Known、Git URL
- 初步设计支持 4 种远程源，不支持本地路径
- **最终简化**：只支持 GitHub 和 GitLab，降低复杂度
- **核心场景**：AI Agent 执行 `find → download` 工作流

**设计思路**：

**与 find 命令无缝衔接**：

```bash
# 1. AI Agent 搜索技能
$ wopal skills find openspec
forztf/open-skilled-sdd@openspec-proposal-creation
itechmeat/llm-code@openspec

# 2. AI Agent 下载技能（直接复制粘贴）
$ wopal skills download forztf/open-skilled-sdd@openspec-proposal-creation
```

**find 命令返回格式研究**：

通过研究 `playground/_good_repos/skills/src/find.ts` 发现：

1. **API 端点**：`https://skills.sh/api/search?q=<query>&limit=10`
2. **返回格式**：
   ```json
   {
     "skills": [
       {
         "id": "slug",
         "name": "skill-name",
         "installs": 118,
         "source": "owner/repo"
       }
     ]
   }
   ```
3. **显示格式**：`owner/repo@skill-name  <installs> installs`
4. **关键发现**：`source` 字段包含 `owner/repo`，技能名称通过 `@` 符号附加

**download 命令源格式设计**：

基于 find 命令输出格式，download 命令必须支持：

1. **基础格式**：`owner/repo@skill-name`（与 find 输出一致）
2. **批量下载**：
   - 多个参数：`owner1/repo1@skill1 owner2/repo2@skill2`
   - 逗号分隔：`owner/repo@skill1,skill2,skill3`

**源格式解析**（从 source-parser.ts 参考）：

```typescript
// @skill 语法解析（最常用）
const atSkillMatch = input.match(/^([^/]+)\/([^/@]+)@(.+)$/);
if (atSkillMatch) {
  const [, owner, repo, skillFilter] = atSkillMatch;
  return {
    type: 'github',
    url: `https://github.com/${owner}/${repo}.git`,
    skillFilter,
  };
}
```

**支持的源格式**（简化版）：

1. **GitHub**
   - shorthand: `owner/repo`
   - @skill 语法: `owner/repo@skill-name`（**find 命令输出格式**）
   - HTTPS URL: `https://github.com/owner/repo`

2. **GitLab**
   - GitLab.com: `https://gitlab.com/owner/repo`
   - 嵌套子组: `https://gitlab.com/group/subgroup/repo`
   - 任何实例: `https://gitlab.example.com/owner/repo`

**不支持的源**：
- ❌ **本地路径**：使用 `wopal skills install <path>` 命令
- ❌ **Well-Known 端点**：暂不支持（可后续添加）
- ❌ **直接 Git URL**：暂不支持（可后续添加）
- ❌ **`owner/repo`（不带 @skill）**：必须明确指定技能名称

**本地技能工作流**：
```bash
# 不使用 download 命令
wopal skills scan ./my-skill              # 直接扫描本地技能
wopal skills install ./my-skill           # 从本地路径安装
```

**支持的源格式**（简化版）：

1. **GitHub**（最常用）
   - `owner/repo@skill-name` - **find 命令返回格式**
   - `https://github.com/owner/repo@skill-name` - 完整 URL

2. **GitLab**
   - `https://gitlab.com/owner/repo@skill-name` - 完整 URL
   - `https://gitlab.com/group/subgroup/repo@skill-name` - 嵌套子组

**不支持的源**（简化设计）：
- ❌ **本地路径**：使用 `wopal skills install <path>` 命令
- ❌ **不带 @skill 的格式**：必须明确指定技能名称（`owner/repo` 不支持）
- ❌ **Well-Known 端点**：暂不支持（可后续添加）
- ❌ **直接 Git URL**：暂不支持（可后续添加）
- ❌ **`*` 通配符**：不支持，降低复杂度

**批量下载设计**：

```bash
# 方式 1：多个参数（不同仓库）
wopal skills download owner1/repo1@skill1 owner2/repo2@skill2

# 方式 2：逗号分隔（同一仓库的多个技能）
wopal skills download owner/repo@skill1,skill2,skill3

# 混合格式
wopal skills download owner1/repo1@skill1 owner2/repo2@skill2,skill3
```

**设计理由**：
- AI Agent 从 find 命令获取结果后，需要明确知道如何批量下载
- 逗号分隔语法简化同一仓库的多技能下载
- 不支持 `*` 通配符，避免用户误操作下载整个仓库

**find 命令研究**（为 download 命令设计提供依据）：

通过深入研究 `playground/_good_repos/skills/src/find.ts` 发现：

1. **API 调用**：
   ```typescript
   const url = `${SEARCH_API_BASE}/api/search?q=${query}&limit=10`;
   const res = await fetch(url);
   ```

2. **返回数据结构**：
   ```typescript
   interface SearchSkill {
     name: string;        // 技能名称
     slug: string;        // 唯一标识（如 "forztf/open-skilled-sdd/openspec-proposal-creation"）
     source: string;      // 仓库路径（如 "forztf/open-skilled-sdd"）
     installs: number;    // 安装次数
   }
   ```

3. **显示格式**（第 294-299 行）：
   ```typescript
   const pkg = skill.source || skill.slug;
   const installs = formatInstalls(skill.installs);
   console.log(`${TEXT}${pkg}@${skill.name}${RESET}${installs ? ` ${CYAN}${installs}${RESET}` : ''}`);
   console.log(`${DIM}└ https://skills.sh/${skill.slug}${RESET}`);
   ```

4. **关键发现**：
   - `source` 字段包含 `owner/repo`（不含技能名称）
   - 显示格式：`owner/repo@skill-name`
   - `@skill` 语法是通过 `source + "@" + name` 拼接而成
   - 这是 Skills CLI 的标准格式，download 命令必须完全兼容

5. **source-parser.ts 中的解析逻辑**（第 209-217 行）：
   ```typescript
   // @skill 语法解析
   const atSkillMatch = input.match(/^([^/]+)\/([^/@]+)@(.+)$/);
   if (atSkillMatch) {
     const [, owner, repo, skillFilter] = atSkillMatch;
     return {
       type: 'github',
       url: `https://github.com/${owner}/${repo}.git`,
       skillFilter,  // 技能名称过滤器
     };
   }
   ```

**结论**：
- download 命令必须完全支持 `owner/repo@skill-name` 格式
- 这是 find 命令的标准输出格式
- AI Agent 可以直接复制粘贴

**思考过程**：
- 初步想法：调用 skill-security-scanner 的 shell 脚本
- 问题：shell 脚本不易维护，且无法深度集成到 CLI 中
- 解决：将 20 项检查逻辑移植到 TypeScript，管理 IOC 数据库

**设计思路**：
- **TypeScript 实现**：移植 shell 脚本逻辑到 TypeScript
- **IOC 数据库**：内置 6 个威胁签名文件（c2-ips.txt, malicious-domains.txt 等）
- **误报过滤**：使用 whitelist-patterns.txt 减少误报
- **自动更新**：提供 `wopal skills ioc update` 命令更新威胁数据库

### 3. INBOX 元数据设计（.source.json）

**思考过程**：
- Skills CLI 是单阶段流程（download→install），源信息在内存中传递
- wopal-cli 是三阶段流程（download→scan→install），**需要持久化源信息**
- 问题：如何在不同阶段间传递源信息？

**解决方案**：
- 保存到 `INBOX/<skill>/.source.json`（隐藏文件）
- 用于 `install` 命令（读取元数据，写入锁文件）
- 用于 `update` 命令（读取元数据，重新下载）

**元数据格式**：
```typescript
interface SourceMetadata {
  name: string;              // 技能名称
  description: string;       // 技能描述
  source: string;            // "owner/repo"
  sourceType: string;        // "github" | "gitlab" | "wellknown" | "git"
  sourceUrl: string;         // Git URL
  skillPath: string;         // 仓库内路径 "skills/<name>/SKILL.md"
  treeSHA: string;           // GitHub Tree SHA
  downloadedAt: string;      // ISO timestamp
  branch?: string;           // 分支名（可选）
}
```

**为什么使用隐藏文件**：
- 不污染技能目录（用户查看时不会看到）
- 遵循 Unix 约定（.开头的文件为隐藏文件）
- 与 Skills CLI 的 `metadata.json` 排除逻辑兼容

**使用场景**：
```bash
# download 命令：保存元数据
wopal skills download owner/repo
# → INBOX/<skill>/.source.json

# install 命令：读取元数据
wopal skills install <skill>
# ← 读取 .source.json
# → 写入 skills-lock.json

# update 命令：读取元数据
wopal skills update <skill>
# ← 读取 .source.json
# → 重新下载最新版本
```

### 4. 安全扫描实现方式

**思考过程**：
- 初步想法：INBOX → deployed → Agent 目录（三层架构）
- 问题：deployed 目录增加了复杂度，且 skills add 会直接安装到 Agent 目录
- 解决：移除 deployed 目录，直接追踪源头变更

**设计思路**：
```
第一条线（远程）：
  GitHub → INBOX (隔离扫描) → Agent 目录 → 删除 INBOX
  锁文件记录：source (owner/repo) + sourceHash (Tree SHA)

第二条线（本地）：
  my-skills → Agent 目录
  锁文件记录：sourcePath (本地路径) + sourceHash (content hash)
```

**优势**：
- 简化架构，减少中间环节
- 锁文件直接追踪源头 → Agent 的对应关系
- 本地技能无需复制到中间层

### 5. 架构简化：移除 deployed 中间层

**思考过程**：
- 初步想法：INBOX → deployed → Agent 目录（三层架构）
- 问题：deployed 目录增加了复杂度，且 skills add 会直接安装到 Agent 目录
- 解决：移除 deployed 目录，直接追踪源头变更

**设计思路**：
```
第一条线（远程技能）：
  GitHub → INBOX (隔离扫描) → Agent 目录 → 删除 INBOX
  锁文件记录：source (owner/repo) + sourceHash (Tree SHA)

第二条线（本地技能）：
  my-skills → Agent 目录
  锁文件记录：sourcePath (本地路径) + sourceHash (content hash)
```

**优势**：
- 简化架构，减少中间环节
- 锁文件直接追踪源头 → Agent 的对应关系
- 本地技能无需复制到中间层

### 6. 源头变更追踪策略

**思考过程**：
- 问题：如何检测技能是否需要更新？
- Skills CLI 方案：比较 GitHub Tree SHA vs 锁文件
- wopal skills 扩展：支持本地技能的变更追踪

**设计思路**：

**远程技能追踪**：
```typescript
// 1. 从锁文件读取已安装版本
const lock = readWpSkiLock();
const installed = lock.skills['skill-name'];

// 2. 获取远程最新版本
const latestHash = await fetchSkillFolderHash(
  'owner/repo',
  'skills/skill-name/SKILL.md',
  token
);

// 3. 比较
if (latestHash !== installed.sourceHash) {
  console.log('有更新可用');
}
```

**本地技能追踪**：
```typescript
// 1. 从锁文件读取已安装版本
const lock = readWpSkiLock();
const installed = lock.skills['skill-name'];

// 2. 计算源码最新 hash
const currentHash = await computeSkillFolderHash(
  'projects/.../my-skills/skill-name'
);

// 3. 比较
if (currentHash !== installed.sourceHash) {
  console.log('源码已变更，需要重新安装');
}
```

**关键设计**：
- 锁文件记录源头标识（GitHub Tree SHA 或 content hash）
- check 命令重新计算/获取源头标识并比较
- 不依赖文件时间戳（不可靠）

### 6.1 版本指纹方案实现（已验证 2026-03-06）

**实现方案**：

采用 **GitHub Tree SHA** 作为主版本指纹，同时记录 **commit SHA** 用于追溯。

**版本指纹字段**：

| 字段 | 用途 | 来源 | 示例 |
|------|------|------|------|
| `skillFolderHash` | 主版本指纹（变更检测） | GitHub Trees API | `d9871ac21480e83b5d714e2525cbbb42b89000d7` |
| `commit` | 追溯用（commit SHA） | `git log -1` | `792f48807c192d740968f56b474e79612c51a98a` |
| `ref` | 用户指定的分支/标签 | 命令行参数 | `main`, `develop`, `v1.2.3` |
| `tag` | 语义化标签（如适用） | 从 ref 提取 | `v1.2.3` |

**核心实现**（`src/utils/skill-lock.ts`）：

```typescript
/**
 * 获取技能文件夹的 GitHub Tree SHA
 * 
 * @param ownerRepo - owner/repo 格式
 * @param skillPath - 技能路径（如 /skills/my-skill）
 * @param token - GitHub Token（可选）
 * @returns Tree SHA 或 null
 */
export async function fetchSkillFolderHash(
  ownerRepo: string,
  skillPath: string,
  token?: string | null
): Promise<string | null> {
  // 1. 标准化路径（去除前导斜杠）
  let folderPath = skillPath.replace(/\\/g, '/');
  if (folderPath.startsWith('/')) {
    folderPath = folderPath.slice(1);  // 关键修复！
  }
  
  // 2. 移除 SKILL.md 后缀
  if (folderPath.endsWith('/SKILL.md')) {
    folderPath = folderPath.slice(0, -9);
  }
  
  // 3. 尝试 main → master 分支
  const branches = ['main', 'master'];
  
  for (const branch of branches) {
    const url = `https://api.github.com/repos/${ownerRepo}/git/trees/${branch}?recursive=1`;
    const headers = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'wopal-cli',
      ...(token && { Authorization: `Bearer ${token}` })
    };
    
    const response = await fetch(url, { headers });
    if (!response.ok) continue;
    
    const data = await response.json();
    
    // 4. 根目录技能 - 使用根树 SHA
    if (!folderPath) return data.sha;
    
    // 5. 查找技能文件夹的树条目
    const folderEntry = data.tree.find(
      entry => entry.type === 'tree' && entry.path === folderPath
    );
    
    if (folderEntry) return folderEntry.sha;
  }
  
  return null;
}

/**
 * 获取 GitHub Token（优先级顺序）
 */
export function getGitHubToken(): string | null {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  
  try {
    return execSync('gh auth token', { encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}
```

**download 命令集成**（`src/commands/download.ts`）：

```typescript
// 1. 克隆仓库并获取 commit SHA
const { tempDir, commitSha } = await cloneRepo(parsed.url, ref);

// 2. 获取 GitHub Tree SHA
const token = getGitHubToken();
const skillFolderHash = await fetchSkillFolderHash(repo, skillRelativePath, token);

// 3. 保存元数据
const metadata: SkillMetadata = {
  name: skillName,
  description: skill.description,
  source: `${repo}@${skillName}`,
  sourceUrl: parsed.url,
  skillPath: skillRelativePath,
  downloadedAt: new Date().toISOString(),
  
  // 版本指纹
  skillFolderHash,  // 主版本指纹
  commit: commitSha,  // 追溯用
  ref: ref,  // 用户指定的分支/标签
  tag: ref?.match(/^v\d+\.\d+\.\d+/) ? ref : undefined,
};

await writeMetadata(skillDestPath, metadata);
```

**关键修复**：

1. **skillPath 前导斜杠问题**：
   - 问题：`skillPath` 为 `/skills/my-skill`，但 GitHub API 返回的树路径为 `skills/my-skill`（无前导斜杠）
   - 解决：在 `fetchSkillFolderHash()` 中去除前导斜杠
   - 影响：修复前 `skillFolderHash` 为 `null`，修复后正确获取 40 字符 SHA

2. **分支/标签参数支持**：
   - 添加 `--branch <branch>` 和 `--tag <tag>` 参数
   - 优先级：`--tag` > `--branch` > 源字符串中的 ref

**验证结果**（2026-03-06）：

```json
{
  "name": "openspec-proposal-creation",
  "skillFolderHash": "a6e93af834ba80ee490c9ead9df99771c746ba3a",
  "commit": "792f48807c192d740968f56b474e79612c51a98a",
  "ref": "main"
}
```

- ✅ `skillFolderHash`: 40 字符 GitHub Tree SHA
- ✅ `commit`: 40 字符 Commit SHA
- ✅ `ref`: 用户指定的分支
- ✅ 匿名请求正常工作
- ✅ Token 认证支持（提高 API 速率限制）

**设计优势**：

1. **精确变更检测**：Tree SHA 在技能文件夹内任何文件变化时都会改变
2. **离线友好**：元数据持久化在 `.source.json`，install/update 命令可直接读取
3. **向后兼容**：字段可选，旧版本元数据不会导致崩溃
4. **官方兼容**：采用与 Skills CLI 相同的版本指纹方案

### 7. INBOX 隔离工作流（三阶段）

**设计思路**：
```
download → INBOX (隔离区)
  ↓
  保存 .source.json (持久化源信息)
  ↓
scan (20 项安全检查)
  ↓
评估 (风险评分)
  ↓
install → Agent 目录
  ↓
  读取 .source.json → 写入 skills-lock.json
  ↓
删除 INBOX
```

**关键环节**：
1. **下载到 INBOX**：临时隔离区，用于安全检查
2. **持久化元数据**：保存 .source.json，供后续命令使用
3. **安全扫描**：20 项静态检查 + 风险评分
4. **用户评估**：查看扫描结果，决定是否安装
5. **安装到 Agent**：复制到 Agent 目录（symlink 或 copy）
6. **更新锁文件**：读取 .source.json，写入 skills-lock.json
7. **清理 INBOX**：删除临时文件，节省空间


### 6. 锁文件设计

**思考过程**：
- Skills CLI 使用两个锁文件（全局 + 本地）
- wopal 需要追踪源头信息
- 解决：单一锁文件，记录所有必要信息

**设计思路**：

```typescript
interface WpSkiLockFile {
  version: number;  // 当前版本 1
  skills: Record<string, WpSkiLockEntry>;
}

interface WpSkiLockEntry {
  // 源头信息
  source: string;        // "owner/repo" 或 "my-skills/<skill>"
  sourceType: string;    // "github" 或 "local"
  sourceUrl?: string;    // GitHub URL (远程技能)
  sourcePath?: string;   // 本地绝对路径 (本地技能)
  sourceHash: string;    // GitHub Tree SHA 或 content hash
  
  // 安装信息
  installedAt: string;   // ISO timestamp
  installPath: string;   // Agent 目录路径
  installMode: 'symlink' | 'copy';
  
  // 技能信息
  skillPath?: string;    // 仓库内路径 (skills/<name>/SKILL.md)
}
```

**存放位置**：`.agents/skills-lock.json`

**设计优势**：
- 单一文件，简化管理
- 包含源头和安装信息
- 支持 check 命令比较源头变更

### 8. 命令设计

**核心命令**：

| 命令 | 功能 | 实现方式 |
|------|------|----------|
| `wopal skills download <source>` | 下载到 INBOX（4 种远程源） | 复制 git.ts + source-parser.ts + skills.ts + wellknown.ts + **skill-lock.ts**（版本指纹） |
| `wopal skills scan <dir>` | 安全扫描 | TypeScript 实现 20 项检查 + IOC 数据库 |
| `wopal skills install <skill>` | 安装到 Agent | 复制 installer.ts，读取 .source.json |
| `wopal skills check` | 检查更新 | fetchSkillFolderHash + computeSkillFolderHash |
| `wopal skills update <skill>` | 更新技能 | download + scan + install |
| `wopal skills list` | 列出已安装 | 读取锁文件 |
| `wopal skills remove <skill>` | 移除技能 | 删除 Agent 目录 + 更新锁文件 |
| `wopal skills ioc update` | 更新 IOC 数据库 | 从上游仓库同步 |

**命令流程**：

```bash
# 第一条线（远程技能）
wopal skills download owner/repo@skill-name              # 下载到 INBOX，保存 .source.json
#   ↓ 自动获取版本指纹（skillFolderHash + commit + ref + tag）
wopal skills scan INBOX/<skill>                          # 安全扫描
wopal skills install <skill>                             # 安装到 Agent，读取 .source.json
# INBOX/<skill> 自动删除

# 第二条线（本地技能）
wopal skills scan ./my-skill                             # 直接扫描本地技能
wopal skills install <skill> --from ./my-skill           # 从本地路径安装

# 检查更新
wopal skills check                            # 检查所有技能
wopal skills update <skill>                   # 更新指定技能（读取 .source.json）
```

### 9. 技术栈选择

### 核心依赖

| 库 | 用途 | 来源 |
|---|------|------|
| `simple-git` | Git 操作 | Skills CLI 使用 |
| `gray-matter` | YAML frontmatter 解析 | Skills CLI 使用 |
| `commander` | CLI 框架 | 常用选择 |
| `@clack/prompts` | 交互式提示 | Skills CLI 使用 |
| `picocolors` | 终端颜色 | Skills CLI 使用 |
| `glob` | 文件匹配 | 扫描需要 |
| `crypto` | Hash 计算 | Node.js 内置 |
| `fs-extra` | 文件操作增强 | 常用选择 |
| `node-fetch` | HTTP 请求 | Well-Known 端点需要 |

### IOC 数据库管理

**内置数据库**：
- `ioc/c2-ips.txt` - C2 IP 地址列表
- `ioc/malicious-domains.txt` - 恶意域名列表
- `ioc/malicious-publishers.txt` - 恶意发布者列表
- `ioc/malicious-skill-patterns.txt` - 恶意技能模式
- `ioc/file-hashes.txt` - 恶意文件 SHA-256 哈希
- `ioc/whitelist-patterns.txt` - 白名单模式（减少误报）

**更新机制**：
```bash
wopal skills ioc update           # 从上游仓库同步
wopal skills ioc update --check   # 检查更新
```

**上游仓库**：`adibirzu/openclaw-security-monitor`（skill-security-scanner 的 IOC 来源）

### 10. 关键技术决策

### 决策 1：三阶段流程 vs 单阶段流程

**理由**：
- Skills CLI 是单阶段流程（download→install），源信息在内存中传递
- wopal-cli 需要在 download 和 install 之间插入安全扫描
- 需要持久化源信息，供 install 和 update 命令使用

**实施**：
- download 命令：下载到 INBOX，保存 .source.json
- scan 命令：对 INBOX 中的技能进行安全扫描
- install 命令：读取 .source.json，写入 skills-lock.json

### 决策 2：复制代码而非依赖包

**理由**：
- Skills CLI 的逻辑需要定制（安装前扫描）
- 避免上游变更导致兼容性问题
- 完全控制实现细节

**实施**：
- 从 Skills CLI 复制核心模块（git.ts、source-parser.ts、skills.ts、providers/wellknown.ts）
- 根据需求改造（添加元数据、调整流程）
- 保持代码注释说明来源

### 决策 3：INBOX 元数据使用 .source.json

**理由**：
- 支持三阶段流程（download → scan → install）
- 持久化源信息，供 install 和 update 使用
- 隐藏文件不污染技能目录

**实施**：
- download 命令保存 `.source.json` 到 INBOX/<skill>/
- install 命令读取 `.source.json`，写入锁文件
- update 命令读取 `.source.json`，重新下载

### 决策 4：只支持 4 种远程源

**理由**：
- 本地路径已在用户控制下，不需要"下载"
- 避免不必要的文件复制
- scan 命令可以直接扫描本地路径

**实施**：
- download 命令支持：GitHub、GitLab、Well-Known、Git URL
- 本地路径使用 scan 命令：`wopal skills scan <path>`
- install 命令支持 `--from <path>` 从本地安装

### 决策 5：内置 IOC 数据库

**理由**：
- 威胁签名需要定期更新
- 用户不应手动管理 IOC 文件
- CLI 应该开箱即用

**实施**：
- IOC 数据库作为 npm 包的一部分分发
- 提供 `wopal skills ioc update` 命令更新
- 数据库存放在 `~/.wopal skills/ioc/` 或项目本地

### 决策 6：版本指纹方案 - GitHub Tree SHA（已实施 2026-03-06）

**理由**：
- 需要精确检测技能变更（文件夹级别）
- 支持离线检查（元数据持久化）
- 与官方 Skills CLI 保持兼容

**方案对比**：

| 方案 | 优点 | 缺点 | 决策 |
|------|------|------|------|
| **Commit SHA** | 简单，克隆后即可获取 | 仓库级别，无法精确定位技能变化 | ❌ 不采用 |
| **GitHub Tree SHA** | 技能级别，精确检测变更 | 需要额外 API 调用 | ✅ 采用 |
| **文件 Hash** | 完全精确 | 需要递归计算所有文件 | 仅用于本地技能 |

**实施**：
- **远程技能**：使用 `fetchSkillFolderHash()` 获取 GitHub Tree SHA
- **本地技能**：使用 `computeSkillFolderHash()` 计算 SHA-256（未来）
- **元数据字段**：`skillFolderHash`（主指纹）+ `commit`（追溯）+ `ref`/`tag`（版本记录）
- **关键修复**：skillPath 需要去除前导斜杠才能匹配 GitHub API 树结构
- **验证结果**：所有版本指纹字段正确记录，手动测试通过

**依赖关系**：
- download 命令：获取并记录版本指纹
- check 命令：比较 `skillFolderHash` 检测更新（待实现）
- update 命令：根据 `skillFolderHash` 决定是否更新（待实现）

### 决策 7：单一锁文件

**理由**：
- 简化实现，避免多个文件同步问题
- 所有信息集中管理
- 易于检查和调试

**实施**：
- `.agents/skills-lock.json` 存放所有技能信息
- 区分 sourceType（github/local）
- 包含源头标识（sourceHash）


### 11. 目录结构

```
projects/agent-tools/tools/wopal-cli/
├── src/
│   ├── commands/
│   │   ├── download.ts          # 下载命令（4 种远程源 + 版本指纹）
│   │   ├── scan.ts              # 扫描命令（20 项检查）
│   │   ├── install.ts           # 安装命令
│   │   ├── update.ts            # 更新命令
│   │   ├── check.ts             # 检查命令
│   │   ├── list.ts              # 列出命令
│   │   ├── remove.ts            # 移除命令
│   │   └── ioc.ts               # IOC 数据库管理
│   ├── utils/
│   │   ├── git.ts               # Git 克隆（复制自 Skills CLI + 返回 commitSha）
│   │   ├── source-parser.ts     # 源解析（复制自 Skills CLI）
│   │   ├── skills.ts            # 技能发现（复制自 Skills CLI）
│   │   ├── wellknown.ts         # Well-Known 端点（复制自 Skills CLI）
│   │   ├── installer.ts         # 安装机制（复制自 Skills CLI）
│   │   ├── agents.ts            # Agent 定义（复制自 Skills CLI）
│   │   ├── skill-lock.ts        # GitHub Tree SHA（复制自 Skills CLI）✅ 已实现
│   │   ├── local-lock.ts        # 本地 hash（复制自 Skills CLI）
│   │   ├── metadata.ts          # INBOX 元数据管理（扩展字段）✅ 已实现
│   │   ├── scanner.ts           # 安全扫描逻辑（新增）
│   │   ├── skills-lock.ts       # wopal skills 锁文件管理（新增）
│   │   └── inbox-metadata.ts    # INBOX 元数据管理（新增）
│   └── index.ts                 # CLI 入口
├── ioc/                         # IOC 数据库（内置）
│   ├── c2-ips.txt
│   ├── malicious-domains.txt
│   ├── malicious-publishers.txt
│   ├── malicious-skill-patterns.txt
│   ├── file-hashes.txt
│   └── whitelist-patterns.txt
├── package.json
└── tsconfig.json

.agents/
├── skills-lock.json             # wopal skills 锁文件
└── skills/                      # Agent 技能目录
    └── <skill-name>/
```

## 工作进展

### 已完成（2026-03-06）

**变更：fix-wopal-cli-version-fingerprint**
- ✅ 实现版本指纹机制（GitHub Tree SHA + Commit SHA）
- ✅ 创建 `src/utils/skill-lock.ts`（fetchSkillFolderHash、getGitHubToken）
- ✅ 修改 `src/utils/git.ts`（返回 commitSha）
- ✅ 修改 `src/utils/metadata.ts`（扩展元数据字段）
- ✅ 修改 `src/commands/download.ts`（获取并记录版本指纹）
- ✅ 添加 `--branch` 和 `--tag` 参数支持
- ✅ 修复 skillPath 前导斜杠问题
- ✅ 手动验证通过（skillFolderHash + commit + ref 正确记录）
- ✅ 更新主规格 `openspec/specs/wopal-cli-skills-download/spec.md`
- ✅ 更新 `projects/agent-tools/AGENTS.md`（版本指纹说明）

**验证结果**：
```json
{
  "skillFolderHash": "a6e93af834ba80ee490c9ead9df99771c746ba3a",  // 40-char GitHub Tree SHA
  "commit": "792f48807c192d740968f56b474e79612c51a98a",           // 40-char Commit SHA
  "ref": "main"                                                    // Branch/Tag
}
```

### 待完成

**变更：wopal-cli-core**
- ⏳ 核心命令实现（download ✅、scan、install）
- ⏳ 锁文件管理（skills-lock.json）
- ⏳ INBOX 元数据管理（.source.json ✅）

**变更：wopal-cli-scan**
- ⏳ 安全扫描逻辑（20 项检查）
- ⏳ IOC 数据库集成
- ⏳ 报告生成

**变更：wopal-cli-install**
- ⏳ 安装命令实现
- ⏳ 双锁文件管理（项目级 + 全局级）
- ⏳ 版本指纹读取（从 .source.json）

**变更：wopal-cli-check**
- ⏳ 检查命令实现
- ⏳ 版本比较逻辑（skillFolderHash）

**变更：wopal-cli-update**
- ⏳ 更新命令实现
- ⏳ download + scan + install 流程

### 变更目录

- openspec/changes/create-wopal-cli - 整体规划（本文档）
- openspec/changes/wopal-cli-core - 核心命令（进行中）
- openspec/changes/fix-wopal-cli-version-fingerprint - 版本指纹（✅ 已完成）
- openspec/changes/wopal-cli-scan - 安全扫描（待启动）
- openspec/changes/wopal-cli-install - 安装命令（待启动）
- openspec/changes/wopal-cli-check - 检查更新（待启动）
- openspec/changes/wopal-cli-update - 更新命令（待启动）


