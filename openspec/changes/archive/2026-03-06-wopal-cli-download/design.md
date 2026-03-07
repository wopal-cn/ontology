## Context

### 背景

wopal-cli 需要实现 `wopal skills download` 命令，从远程仓库（GitHub/GitLab）下载技能到 INBOX 隔离区，供后续安全扫描和安装。

**核心目标**：**支持下载 find 命令能获取到的任何技能**

### 当前状态

- ✅ wopal-cli-core 已完成（INBOX 路径管理）
- ✅ wopal skills find 已实现（API: `https://skills.sh/api/search`）
- ⏳ download 命令待实现

### 技术参考

**Skills CLI 官方实现**：
- `playground/_good_repos/skills/src/git.ts` - Git 克隆逻辑
- `playground/_good_repos/skills/src/source-parser.ts` - 源格式解析（支持 @skill 语法）
- `playground/_good_repos/skills/src/skills.ts` - 技能发现（递归搜索 SKILL.md）

### 约束

1. **必须与 find 命令输出兼容**：`owner/repo@skill-name`
2. **AI Agent 核心场景**：批量下载需要明确的命令格式
3. **安全优先**：下载到 INBOX，不直接安装

---

## Goals / Non-Goals

### Goals

1. **无缝衔接 find 命令**：从 find 输出直接复制粘贴可执行
2. **支持批量下载**：多参数、逗号分隔、混合格式
3. **保存元数据**：`.source.json` 用于 install/update 命令
4. **清晰的错误提示**：技能不存在、仓库不存在、网络错误
5. **AI Agent 友好的帮助信息**：完整的命令用法和示例

### Non-Goals

1. **不支持本地路径**：由 `install` 命令处理（本地技能不需要下载）
2. **不支持 `*` 通配符**：只支持精确的技能名称
3. **暂不支持 Well-Known 端点**：find 命令不会返回，可后续添加
4. **暂不支持 Direct Git URL**：如 `git@github.com:owner/repo.git`，可后续添加
5. **不支持 `owner/repo`（不带 @skill）**：必须明确指定技能名称（非交互式）

---

## Decisions

### Decision 1: 逗号分隔语法解析位置

**决策**：在 download 命令预处理

**理由**：
- 逗号分隔是 download 命令特有的语法
- 不应污染 source-parser（保持与 Skills CLI 一致）
- 实现简单，逻辑清晰

**实现**：

```typescript
// download.ts
function parseSources(sources: string[]): Array<{ owner: string; repo: string; skill: string }> {
  const result: Array<{ owner: string; repo: string; skill: string }> = [];
  
  for (const source of sources) {
    const match = source.match(/^([^/]+)\/([^/@]+)@(.+)$/);
    if (!match) {
      throw new Error(`Invalid source format: ${source}`);
    }
    
    const [, owner, repo, skills] = match;
    const skillNames = skills.split(',').map(s => s.trim());
    
    for (const skill of skillNames) {
      result.push({ owner, repo, skill });
    }
  }
  
  return result;
}
```

---

### Decision 2: 批量下载并发策略

**决策**：分组后并发（同一仓库的技能合并，不同仓库并发）

**理由**：
- 同一仓库的多个技能只需克隆一次
- 不同仓库可以并发克隆（控制并发数为 3）
- 避免 GitHub API 限流

**实现**：

```typescript
// 1. 分组：同一仓库的技能合并
const grouped = groupBySkillSource(parsedSources);
// grouped: { 'owner/repo': ['skill1', 'skill2'] }

// 2. 并发克隆（控制并发数为 3）
const results = await Promise.all(
  Object.entries(grouped).map(([repo, skills]) => 
    downloadFromRepo(repo, skills)
  )
);
```

---

### Decision 3: 临时目录策略

**决策**：使用 wopal 命名空间：`/tmp/wopal/skills-<timestamp>-<random>`

**理由**：
- 避免与 Skills CLI 冲突
- 包含时间戳和随机数，确保唯一性
- 更容易识别和调试（`ls /tmp/wopal/` 可看到所有临时目录）

**实现**：

```typescript
// git.ts
export async function cloneRepo(url: string, ref?: string): Promise<string> {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  const tempDir = join(tmpdir(), 'wopal', `skills-${timestamp}-${random}`);
  
  await mkdtemp(tempDir, { recursive: true });
  // ... 克隆逻辑
}
```

---

### Decision 4: 支持的仓库格式范围

**决策**：支持所有能解析为 GitHub/GitLab 仓库的格式

**理由**：
- find 命令只返回 GitHub/GitLab 的 `owner/repo` 格式
- 直接复制 Skills CLI 的 source-parser.ts，所有格式已支持
- 确保与 find 命令完全兼容

**必须支持的格式**：

| 类型 | 格式 | 示例 |
|------|------|------|
| GitHub shorthand | `owner/repo@skill` | `forztf/open-skilled-sdd@openspec-proposal-creation` |
| GitHub URL | `https://github.com/owner/repo@skill` | `https://github.com/forztf/open-skilled-sdd@openspec-proposal-creation` |
| GitHub URL with branch | `https://github.com/owner/repo/tree/branch@skill` | `https://github.com/owner/repo/tree/main@skill` |
| GitLab URL | `https://gitlab.com/owner/repo@skill` | `https://gitlab.com/user/repo@my-skill` |
| GitLab subgroup | `https://gitlab.com/group/subgroup/repo@skill` | `https://gitlab.com/myteam/backend/api@skill` |
| GitLab URL with branch | `https://gitlab.com/owner/repo/-/tree/branch@skill` | `https://gitlab.com/owner/repo/-/tree/main@skill` |

**暂不支持**：
- **Well-Known URLs**：find 命令不会返回，可后续添加
- **Direct Git URLs**：如 `git@github.com:owner/repo.git`，可后续添加

---

### Decision 5: 技能发现策略

**决策**：复制 Skills CLI 的 discoverSkills

**理由**：
- 保持与 Skills CLI 的兼容性
- 支持各种技能目录结构
- 代码可直接复制，无需重新实现

**搜索优先级**（从 skills.ts）：

```typescript
const prioritySearchDirs = [
  searchPath,
  join(searchPath, 'skills'),
  join(searchPath, 'skills/.curated'),
  join(searchPath, 'skills/.experimental'),
  join(searchPath, '.agent/skills'),
  join(searchPath, '.agents/skills'),
  join(searchPath, '.claude/skills'),
  // ... 更多 agent 目录
];
```

---

### Decision 6: 元数据格式

**决策**：完整字段（包含 SKILL.md 的所有元数据）

**理由**：
- install 命令需要 name 和 description
- update 命令需要 source 和 downloadedAt
- 未来可能需要更多字段

**元数据格式**：

```json
{
  "name": "skill-name",
  "description": "Skill description from SKILL.md",
  "source": "owner/repo@skill-name",
  "sourceUrl": "https://github.com/owner/repo.git",
  "skillPath": "skills/skill-name/SKILL.md",
  "downloadedAt": "2026-03-06T10:00:00Z"
}
```

---

---

## Module Design

### Module Overview

```
src/commands/download.ts          # 主命令入口
src/utils/source-parser.ts        # 源格式解析（复用 Skills CLI）
src/utils/git.ts                  # Git 克隆逻辑（复用 Skills CLI）
src/utils/skills.ts               # 技能发现（复用 Skills CLI）
src/utils/metadata.ts             # 元数据写入（新增）
```

### Module 1: download.ts（主命令）

**职责**：
- 解析命令行参数（处理逗号分隔）
- 协调其他模块执行下载流程
- 处理批量下载的分组和并发
- 显示下载结果

**复用策略**：参考 `add.ts` 的流程，但简化实现

**关键函数**：
```typescript
// 1. 预处理逗号分隔语法
function parseSources(sources: string[]): ParsedSource[] {
  // owner/repo@skill1,skill2 → [{ owner, repo, skill: 'skill1' }, ...]
}

// 2. 分组同一仓库的技能
function groupByRepo(sources: ParsedSource[]): Map<string, string[]> {
  // { 'owner/repo': ['skill1', 'skill2'] }
}

// 3. 下载单个仓库的多个技能
async function downloadFromRepo(
  repo: string, 
  skills: string[], 
  inboxPath: string
): Promise<DownloadResult[]> {
  // 1. 克隆仓库（调用 git.cloneRepo）
  // 2. 发现技能（调用 skills.discoverSkills）
  // 3. 过滤目标技能（调用 skills.filterSkills）
  // 4. 复制到 INBOX
  // 5. 写入元数据（调用 metadata.writeMetadata）
  // 6. 清理临时目录（调用 git.cleanupTempDir）
}
```

**依赖关系**：
- 依赖 `source-parser.ts`：解析用户输入
- 依赖 `git.ts`：克隆仓库
- 依赖 `skills.ts`：发现技能
- 依赖 `metadata.ts`：写入 `.source.json`

---

### Module 2: source-parser.ts（源格式解析）

**复用策略**：**直接复制** Skills CLI 的实现

**复用内容**：
- ✅ `parseSource()` - 解析所有源格式（GitHub/GitLab URL、shorthand、@skill 语法）
- ✅ `getOwnerRepo()` - 提取 owner/repo
- ✅ `parseOwnerRepo()` - 解析 owner/repo 字符串
- ✅ `isLocalPath()` - 检查本地路径
- ✅ `isWellKnownUrl()` - 检查 Well-Known URL

**适配点**：**无需修改**

**理由**：
- Skills CLI 的 source-parser 已经支持所有需要的格式
- 代码质量高，测试覆盖完整
- 保持兼容性，确保与 find 命令输出一致

---

### Module 3: git.ts（Git 克隆）

**复用策略**：**直接复制并修改临时目录路径**

**复用内容**：
- ✅ `cloneRepo()` - 克隆仓库到临时目录
- ✅ `cleanupTempDir()` - 清理临时目录
- ✅ `GitCloneError` - 自定义错误类

**适配点**：
```typescript
// 原代码：/tmp/skills-<random>
const tempDir = await mkdtemp(join(tmpdir(), 'skills-'));

// 修改为：/tmp/wopal/skills-<timestamp>-<random>
const timestamp = Date.now();
const random = Math.random().toString(36).substring(7);
const tempDir = join(tmpdir(), 'wopal', `skills-${timestamp}-${random}`);
await mkdir(tempDir, { recursive: true });
```

**理由**：
- 使用 wopal 命名空间，避免与 Skills CLI 冲突
- 时间戳便于调试和识别

---

### Module 4: skills.ts（技能发现）

**复用策略**：**复制并移除不需要的函数**

**复用内容**：
- ✅ `discoverSkills()` - 在仓库中递归发现技能
- ✅ `parseSkillMd()` - 解析 SKILL.md 文件
- ✅ `filterSkills()` - 过滤技能（根据技能名称）
- ✅ `hasSkillMd()` - 检查目录是否包含 SKILL.md
- ✅ `findSkillDirs()` - 递归查找技能目录
- ✅ `getSkillDisplayName()` - 获取技能显示名称

**移除内容**：
- ❌ `shouldInstallInternalSkills()` - wopal-cli 不需要环境变量控制

**适配点**：
```typescript
// 移除 shouldInstallInternalSkills 相关逻辑
// 在 parseSkillMd 中：
const isInternal = data.metadata?.internal === true;
if (isInternal && !options?.includeInternal) {
  return null;  // 简化：不检查环境变量
}
```

**理由**：
- wopal-cli 不需要 `INSTALL_INTERNAL_SKILLS` 环境变量
- 简化实现，减少依赖

---

### Module 5: metadata.ts（元数据管理）

**职责**：写入 `.source.json` 文件到 INBOX

**新增模块**（Skills CLI 没有对应实现）

**关键函数**：
```typescript
interface SkillMetadata {
  name: string;
  description: string;
  source: string;           // owner/repo@skill-name
  sourceUrl: string;        // https://github.com/owner/repo.git
  skillPath: string;        // skills/skill-name/SKILL.md
  downloadedAt: string;     // ISO 8601 timestamp
}

export async function writeMetadata(
  skillDir: string, 
  metadata: SkillMetadata
): Promise<void> {
  const metadataPath = join(skillDir, '.source.json');
  await writeFile(metadataPath, JSON.stringify(metadata, null, 2));
}

export async function readMetadata(skillDir: string): Promise<SkillMetadata | null> {
  try {
    const metadataPath = join(skillDir, '.source.json');
    const content = await readFile(metadataPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}
```

**理由**：
- Skills CLI 使用 lockfile，wopal-cli 使用 `.source.json`（每个技能独立）
- install 命令需要读取元数据
- update 命令需要 `source` 和 `downloadedAt` 字段

---

### Dependency Graph

```
download.ts
  ├─→ source-parser.ts (解析用户输入)
  ├─→ git.ts (克隆仓库)
  ├─→ skills.ts (发现技能)
  └─→ metadata.ts (写入元数据)
```

---

### Code Reuse Summary

| 模块 | 复用来源 | 复用策略 | 修改点 |
|------|---------|---------|--------|
| `source-parser.ts` | Skills CLI | 直接复制 | 无 |
| `git.ts` | Skills CLI | 直接复制 | 临时目录路径 |
| `skills.ts` | Skills CLI | 复制并简化 | 移除 `shouldInstallInternalSkills()` |
| `metadata.ts` | 新增 | 新实现 | 无参考 |
| `download.ts` | 参考 `add.ts` | 简化实现 | 批量下载逻辑 |

---

### Implementation Checklist

#### Phase 1: 复制核心模块
- [ ] 复制 `source-parser.ts`（无修改）
- [ ] 复制 `git.ts`（修改临时目录路径）
- [ ] 复制 `skills.ts`（移除 `shouldInstallInternalSkills`）

#### Phase 2: 实现元数据模块
- [ ] 实现 `metadata.ts`（新增）

#### Phase 3: 实现下载命令
- [ ] 实现 `download.ts`（主逻辑）
- [ ] 实现逗号分隔解析
- [ ] 实现批量下载分组
- [ ] 实现并发控制

#### Phase 4: 测试和验证
- [ ] 单元测试
- [ ] 集成测试
- [ ] 手动测试所有格式

---

## Risks / Trade-offs

### Risk 1: GitHub API 限流

**风险**：批量下载时可能触发 GitHub API 限流。

**缓解**：
- 控制并发克隆数为 3
- 使用 `--depth 1` 减少数据传输
- 提供友好的错误提示："Rate limit exceeded. Please wait and try again."

### Risk 2: GitLab 兼容性

**风险**：GitLab 的不同实例（gitlab.com vs 自建）可能有差异。

**缓解**：
- 第一版只支持 gitlab.com
- 在帮助信息中明确说明
- 后续可根据需求扩展

### Risk 3: 临时目录清理

**风险**：如果下载失败，临时目录可能未被清理。

**缓解**：
- 使用 try-finally 确保清理
- 定期清理 `/tmp/wopal/` 下的旧目录（可通过 cron job）

### Risk 4: 技能名称冲突

**风险**：不同仓库的技能可能有相同名称。

**缓解**：
- 这是预期行为（INBOX 是临时目录）
- 用户应使用 `--force` 覆盖
- install 命令会处理重名问题

### Trade-off 1: 不支持 `owner/repo`（不带 @skill）

**权衡**：要求用户明确指定技能名称。

**理由**：
- 避免误下载
- AI Agent 从 find 命令获取的已经是 `owner/repo@skill-name` 格式
- 简化实现（不需要 `--list` 选项）

### Trade-off 2: 暂不支持 Well-Known 端点

**权衡**：暂不支持 `https://example.com/skills` 格式。

**理由**：
- find 命令不会返回 Well-Known URL（只返回 GitHub/GitLab）
- Well-Known 需要额外的 provider 实现（从 `/.well-known/skills/index.json` 获取）
- 可后续根据需求添加

### Trade-off 3: 不显示下载进度

**权衡**：不显示进度条或下载状态。

**理由**：
- AI Agent 不需要进度信息
- 简化实现
- 只显示最终结果即可
