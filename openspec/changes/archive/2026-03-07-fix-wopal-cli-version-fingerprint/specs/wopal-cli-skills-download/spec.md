# Spec Delta: wopal-cli-skills-download

**Change**: fix-wopal-cli-version-fingerprint
**Type**: MODIFIED
**Base Spec**: openspec/specs/wopal-cli-skills-download/spec.md

---

## Modified Requirement: INBOX 元数据

系统应当为每个下载的技能保存完整的元数据，包括版本指纹信息，用于后续的 check、update 和 install 命令。

**版本指纹方案**（采用官方 Skills CLI 方案）：
- **远程技能**：使用 GitHub Tree SHA（通过 GitHub Trees API 获取技能文件夹的树哈希）
- **补充信息**：同时记录 commit SHA 用于追溯

### Scenario: 保存元数据（MODIFIED）

- **WHEN** 系统下载技能到 `INBOX/skill-name/`
- **THEN** 系统创建 `INBOX/skill-name/.source.json`
- **AND** 元数据包含：
  - `name`: 技能名称
  - `description`: 技能描述
  - `source`: 原始源字符串（如 `owner/repo@skill-name`）
  - `sourceUrl`: Git 仓库 URL
  - `skillPath`: 技能在仓库中的相对路径
  - `downloadedAt`: 下载时间戳（ISO 8601）
  - `skillFolderHash`: GitHub Tree SHA（技能文件夹的树哈希，用于变更检测）
  - `commit`: 实际克隆的 commit SHA（40 字符完整哈希，用于追溯）
  - `ref`: 用户指定的分支或标签（如指定）
  - `tag`: 如果 ref 是语义化标签则记录（如 `v1.2.3`）

### Scenario: GitHub Tree SHA 获取

- **WHEN** 系统下载 GitHub 仓库的技能
- **THEN** 系统调用 GitHub Trees API 获取技能文件夹的 Tree SHA
- **AND** API 调用格式：`GET /repos/{owner}/{repo}/git/trees/{branch}?recursive=1`
- **AND** 从返回的树结构中提取技能文件夹的 `sha` 字段
- **AND** 如果技能文件夹不存在于树中，`skillFolderHash` 为 `null`

### Scenario: Tree SHA 格式

- **WHEN** 系统记录 `skillFolderHash`
- **THEN** SHA 应为 GitHub 返回的完整树哈希（40 字符十六进制）
- **AND** 该哈希在技能文件夹内任何文件变化时都会改变
- **AND** 与 commit SHA 不同（commit SHA 是整个仓库的提交哈希）

### Scenario: 指定分支下载

- **WHEN** 用户运行 `wopal skills download owner/repo@skill-name --branch develop`
- **THEN** 元数据中 `ref` 字段记录为 `"develop"`
- **AND** `skillFolderHash` 从 develop 分支获取
- **AND** `commit` 字段记录该分支当前 HEAD 的完整 SHA

### Scenario: 指定标签下载

- **WHEN** 用户运行 `wopal skills download owner/repo@skill-name --tag v1.2.3`
- **THEN** 元数据中 `ref` 字段记录为 `"v1.2.3"`
- **AND** `tag` 字段记录为 `"v1.2.3"`
- **AND** `skillFolderHash` 从该标签获取
- **AND** `commit` 字段记录该标签指向的完整 SHA

### Scenario: 默认分支下载

- **WHEN** 用户未指定分支或标签
- **THEN** 系统依次尝试 `main`、`master` 分支
- **AND** `ref` 字段留空或省略
- **AND** `skillFolderHash` 从成功获取的分支中提取
- **AND** `commit` 字段记录该分支 HEAD 的完整 SHA

### Scenario: GitHub Token 认证（可选）

- **WHEN** 系统调用 GitHub API
- **THEN** 系统应尝试获取 GitHub Token 以提高速率限制
- **AND** Token 来源优先级：
  1. `GITHUB_TOKEN` 环境变量
  2. `GH_TOKEN` 环境变量
  3. `gh auth token` 命令输出
- **AND** 无 Token 时使用匿名请求（速率限制较低）

### Scenario: 元数据向后兼容

- **WHEN** check 或 update 命令读取 `.source.json`
- **AND** 文件缺少 `skillFolderHash` 字段（旧版本下载）
- **THEN** 系统应优雅处理，提示用户重新下载以获取完整版本信息
- **AND** 不应崩溃或报错

---

## Implementation Notes

### 新增文件：skill-lock.ts

参考官方 Skills CLI 实现，从 `playground/_good_repos/skills/src/skill-lock.ts` 移植：

```typescript
/**
 * Fetch the tree SHA (folder hash) for a skill folder using GitHub's Trees API.
 */
export async function fetchSkillFolderHash(
  ownerRepo: string,
  skillPath: string,
  token?: string | null
): Promise<string | null> {
  // Normalize skillPath to folder path
  let folderPath = skillPath.replace(/\\/g, '/');
  if (folderPath.endsWith('/SKILL.md')) {
    folderPath = folderPath.slice(0, -9);
  } else if (folderPath.endsWith('SKILL.md')) {
    folderPath = folderPath.slice(0, -8);
  }
  if (folderPath.endsWith('/')) {
    folderPath = folderPath.slice(0, -1);
  }

  const branches = ['main', 'master'];

  for (const branch of branches) {
    try {
      const url = `https://api.github.com/repos/${ownerRepo}/git/trees/${branch}?recursive=1`;
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'wopal-cli',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(url, { headers });
      if (!response.ok) continue;

      const data = await response.json() as {
        sha: string;
        tree: Array<{ path: string; type: string; sha: string }>;
      };

      // Root-level skill - use root tree SHA
      if (!folderPath) {
        return data.sha;
      }

      // Find the tree entry for the skill folder
      const folderEntry = data.tree.find(
        (entry) => entry.type === 'tree' && entry.path === folderPath
      );

      if (folderEntry) {
        return folderEntry.sha;
      }
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Get GitHub token from user's environment.
 */
export function getGitHubToken(): string | null {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;

  try {
    const token = execSync('gh auth token', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return token || null;
  } catch {
    return null;
  }
}
```

### 修改文件：metadata.ts

```typescript
export interface SkillMetadata {
  name: string;
  description: string;
  source: string;
  sourceUrl: string;
  skillPath: string;
  downloadedAt: string;
  
  // 版本指纹（新增）
  skillFolderHash?: string | null;  // GitHub Tree SHA（主版本指纹）
  commit?: string;                   // Commit SHA（补充信息）
  ref?: string;                      // 分支或标签
  tag?: string;                      // 语义化标签
}
```

### 修改文件：git.ts

```typescript
export async function cloneRepo(
  url: string, 
  ref?: string
): Promise<{ tempDir: string; commitSha: string }> {
  // ... 克隆逻辑 ...
  
  const git = simpleGit(tempDir);
  const log = await git.log(['-1']);
  const commitSha = log.latest?.hash;
  
  if (!commitSha) {
    throw new Error('Failed to get commit SHA after clone');
  }
  
  return { tempDir, commitSha };
}
```

### 修改文件：download.ts

```typescript
import { fetchSkillFolderHash, getGitHubToken } from '../utils/skill-lock.js';

// 在 downloadFromRepo 函数中：
const { tempDir, commitSha } = await cloneRepo(parsed.url, parsed.ref);

// 获取 GitHub Tree SHA
const token = getGitHubToken();
const skillFolderHash = await fetchSkillFolderHash(
  repo,
  skill.path.replace(tempDir, ''),
  token
);

const metadata: SkillMetadata = {
  name: skillName,
  description: skill.description,
  source: `${repo}@${skillName}`,
  sourceUrl: parsed.url,
  skillPath: skill.path.replace(tempDir, ''),
  downloadedAt: new Date().toISOString(),
  
  // 版本指纹
  skillFolderHash,
  commit: commitSha,
  ref: parsed.ref,
  tag: parsed.ref?.match(/^v\d+\.\d+\.\d+/) ? parsed.ref : undefined,
};
```

---

## Verification

- [ ] 下载技能后 `.source.json` 包含 `skillFolderHash` 字段
- [ ] `skillFolderHash` 为 GitHub Tree SHA（40 字符）
- [ ] 同时记录 `commit` SHA 用于追溯
- [ ] 指定分支时从正确分支获取 Tree SHA
- [ ] 指定标签时从标签获取 Tree SHA
- [ ] 无 Token 时匿名请求可正常工作
- [ ] 有 Token 时使用认证请求（更高速率限制）
- [ ] 旧版本元数据（缺少 skillFolderHash）可被优雅处理
- [ ] check 命令可读取 skillFolderHash 进行比较
- [ ] update 命令可读取 skillFolderHash 判断是否需要更新

---

## 与官方 Skills CLI 的差异

| 方面 | 官方 Skills CLI | wopal-cli |
|------|----------------|-----------|
| 锁文件位置 | `~/.agents/.skill-lock.json` | INBOX 内 `.source.json` |
| 本地技能 hash | `computedHash`（计算文件 hash） | 不适用（download 只处理远程） |
| GitHub Tree SHA | 通过 telemetry API 获取 | 直接调用 GitHub API |
| 认证方式 | 同 | 同（GITHUB_TOKEN / gh CLI） |

**设计理由**：
- wopal-cli 采用 INBOX 隔离工作流，每个技能有独立的 `.source.json`
- download 命令只处理远程技能，本地技能由 install 命令处理
- 直接调用 GitHub API 避免依赖外部 telemetry 服务
