# wopal-cli skills download 功能增强方案

## 问题描述

`wopal skills find` 输出的某些技能（非 GitHub 格式）无法通过 `wopal skills download` 下载。

### 示例

```
# find 输出
gpa-mcp.genai.prd.aws.saccap.int@superpowers  31 installs  └ https://skills.sh/xxx

# download 失败
wopal skills download gpa-mcp.genai.prd.aws.saccap.int@superpowers
# Error: Invalid source format
```

### 根因

| 来源 | 格式 | 示例 |
|------|------|------|
| `wopal find` 输出 | `source@skillId` | `gpa-mcp.genai.prd.aws.saccap.int@superpowers` |
| `download` 期望 | `owner/repo@skill` | `anthropics/skills@mcp-builder` |

`parseDownloadSource()` 调用 `getOwnerRepo()` 要求 URL 路径包含 `/`，非 GitHub 格式返回 `null`。

---

## 解决方案

### 支持格式

| 格式 | 示例 | 处理方式 |
|------|------|----------|
| GitHub `owner/repo@skill` | `anthropics/skills@mcp-builder` | ✅ 现有逻辑 |
| 非 GitHub `source@skillId` | `gpa-mcp.genai.prd.aws.saccap.int@superpowers` | 🆕 Well-Known 协议 |
| skills.sh URL | `https://skills.sh/anthropics/skills@mcp-builder` | 🆕 解析为 GitHub 格式 |

---

## 实现方案

### 文件变更

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/lib/types.ts` | 修改 | 添加 `WellKnownSource` 类型 |
| `src/lib/wellknown-provider.ts` | **新建** | RFC 8615 Provider 实现 |
| `src/lib/download-skill.ts` | 修改 | 添加 `downloadFromWellKnown()` |
| `src/commands/skills/download.ts` | 修改 | 支持 `source@skillId` 格式 |

---

### Phase 1: 类型定义

**文件**: `src/lib/types.ts`

```typescript
// 在 ParsedSource 类型中添加
export interface WellKnownSource {
  type: "well-known";
  source: string;      // e.g., "gpa-mcp.genai.prd.aws.saccap.int"
  skillName: string;   // e.g., "superpowers"
  url: string;         // e.g., "https://gpa-mcp.genai.prd.aws.saccap.int"
}

// Well-Known API 响应类型
export interface WellKnownIndex {
  skills: WellKnownSkillEntry[];
}

export interface WellKnownSkillEntry {
  name: string;
  description: string;
  files: string[];
}

export interface WellKnownSkill {
  name: string;
  description: string;
  content: string;
  files: Map<string, string>;
  sourceUrl: string;
}
```

---

### Phase 2: Well-Known Provider

**文件**: `src/lib/wellknown-provider.ts` (新建)

```typescript
import matter from "gray-matter";
import type { WellKnownIndex, WellKnownSkillEntry, WellKnownSkill } from "./types.js";

const WELL_KNOWN_PATH = ".well-known/skills";
const INDEX_FILE = "index.json";

/**
 * 尝试从 source 获取 well-known 技能索引
 */
export async function fetchWellKnownIndex(
  source: string,
): Promise<{ index: WellKnownIndex; baseUrl: string } | null> {
  // 构建可能的 URL
  const urls = [
    `https://${source}/${WELL_KNOWN_PATH}/${INDEX_FILE}`,
  ];

  for (const indexUrl of urls) {
    try {
      const response = await fetch(indexUrl, { 
        signal: AbortSignal.timeout(10000) // 10s 超时
      });
      
      if (!response.ok) continue;

      const index = (await response.json()) as WellKnownIndex;
      
      // 验证结构
      if (!index.skills || !Array.isArray(index.skills)) continue;
      
      return { index, baseUrl: `https://${source}` };
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * 从 well-known 端点下载技能
 */
export async function fetchWellKnownSkill(
  baseUrl: string,
  skillName: string,
  entry: WellKnownSkillEntry,
): Promise<WellKnownSkill | null> {
  try {
    const skillBaseUrl = `${baseUrl}/${WELL_KNOWN_PATH}/${skillName}`;
    
    // 获取 SKILL.md
    const skillMdUrl = `${skillBaseUrl}/SKILL.md`;
    const response = await fetch(skillMdUrl);
    
    if (!response.ok) return null;
    
    const content = await response.text();
    const { data } = matter(content);
    
    if (!data.name || !data.description) return null;
    
    // 获取所有文件
    const files = new Map<string, string>();
    files.set("SKILL.md", content);
    
    const otherFiles = entry.files.filter(f => f.toLowerCase() !== "skill.md");
    
    await Promise.all(
      otherFiles.map(async (filePath) => {
        try {
          const fileUrl = `${skillBaseUrl}/${filePath}`;
          const fileRes = await fetch(fileUrl);
          if (fileRes.ok) {
            files.set(filePath, await fileRes.text());
          }
        } catch {
          // 忽略单个文件失败
        }
      })
    );
    
    return {
      name: data.name,
      description: data.description,
      content,
      files,
      sourceUrl: skillMdUrl,
    };
  } catch {
    return null;
  }
}

/**
 * 检查 source 是否支持 well-known 协议
 */
export async function isWellKnownSource(source: string): Promise<boolean> {
  const result = await fetchWellKnownIndex(source);
  return result !== null;
}
```

---

### Phase 3: 下载逻辑增强

**文件**: `src/lib/download-skill.ts`

添加新函数：

```typescript
import { 
  fetchWellKnownIndex, 
  fetchWellKnownSkill 
} from "./wellknown-provider.js";

/**
 * 从 well-known 端点下载技能到 INBOX
 */
export async function downloadFromWellKnown(
  source: string,
  skillName: string,
  inboxPath: string,
  options: DownloadOptions,
  context: ProgramContext,
): Promise<DownloadResult> {
  const { output, debug } = context;
  const result: DownloadResult = { success: [], failed: [] };
  
  if (debug) {
    output.print(`Trying well-known protocol: https://${source}`);
  }
  
  // 1. 获取索引
  const indexResult = await fetchWellKnownIndex(source);
  
  if (!indexResult) {
    result.failed.push({
      skill: skillName,
      error: `Source '${source}' is not accessible or does not support well-known protocol.\n` +
             `This may be an internal/private domain or the skill may no longer exist.\n` +
             `Try: wopal skills find ${skillName} to find alternatives.`,
    });
    return result;
  }
  
  // 2. 查找技能
  const skillEntry = indexResult.index.skills.find(
    s => s.name.toLowerCase() === skillName.toLowerCase()
  );
  
  if (!skillEntry) {
    const available = indexResult.index.skills.map(s => `  - ${s.name}`).join("\n");
    result.failed.push({
      skill: skillName,
      error: `Skill '${skillName}' not found at '${source}'\nAvailable skills:\n${available}`,
    });
    return result;
  }
  
  // 3. 下载技能
  if (debug) {
    output.print(`Fetching skill '${skillName}' from well-known endpoint...`);
  }
  
  const skill = await fetchWellKnownSkill(indexResult.baseUrl, skillName, skillEntry);
  
  if (!skill) {
    result.failed.push({
      skill: skillName,
      error: `Failed to fetch skill '${skillName}' from '${source}'`,
    });
    return result;
  }
  
  // 4. 写入 INBOX
  const skillDestPath = join(inboxPath, skillName);
  
  if (existsSync(skillDestPath) && !options.force) {
    result.failed.push({
      skill: skillName,
      error: `Skill '${skillName}' already exists in INBOX\nUse --force to overwrite`,
    });
    return result;
  }
  
  await mkdir(skillDestPath, { recursive: true });
  
  // 写入所有文件
  for (const [filePath, content] of skill.files) {
    const fullPath = join(skillDestPath, filePath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content);
  }
  
  // 写入元数据
  const metadata: SkillMetadata = {
    name: skillName,
    description: skill.description,
    source: `${source}@${skillName}`,
    sourceUrl: indexResult.baseUrl,
    skillPath: `/.well-known/skills/${skillName}`,
    downloadedAt: new Date().toISOString(),
    skillFolderHash: null, // well-known 无 git hash
  };
  
  await writeMetadata(skillDestPath, metadata);
  
  result.success.push(skillName);
  
  if (debug) {
    output.print(`Skill '${skillName}' downloaded via well-known protocol`);
  }
  
  return result;
}

/**
 * 解析下载来源，支持 source@skillId 格式
 */
export function parseDownloadSourceExtended(source: string): {
  type: "github" | "well-known";
  owner?: string;
  repo?: string;
  source?: string;
  skill: string;
} | null {
  let skillFilter: string | undefined;
  let sourceWithoutSkill = source;

  const atSkillMatch = source.match(/^(.+)@([^/@]+)$/);
  if (atSkillMatch) {
    sourceWithoutSkill = atSkillMatch[1]!;
    skillFilter = atSkillMatch[2]!;
  }

  if (!skillFilter) return null;

  // 尝试 GitHub 格式解析
  const parsed = parseSource(sourceWithoutSkill);
  
  if (parsed.type !== "local") {
    const ownerRepo = getOwnerRepo(parsed);
    if (ownerRepo) {
      const [owner, repo] = ownerRepo.split("/");
      return {
        type: "github",
        owner: owner!,
        repo: repo!,
        skill: skillFilter,
      };
    }
  }

  // 非 GitHub 格式 → well-known
  // sourceWithoutSkill 不含 "/" 且不是本地路径
  if (
    !sourceWithoutSkill.includes("/") &&
    !isLocalPath(sourceWithoutSkill) &&
    !sourceWithoutSkill.startsWith("http")
  ) {
    return {
      type: "well-known",
      source: sourceWithoutSkill,
      skill: skillFilter,
    };
  }

  return null;
}

function isLocalPath(input: string): boolean {
  return (
    input.startsWith("./") ||
    input.startsWith("../") ||
    input === "." ||
    input === ".."
  );
}
```

---

### Phase 4: download 命令修改

**文件**: `src/commands/skills/download.ts`

修改 `parseSources` 函数：

```typescript
function parseSources(sources: string[]): Array<{
  type: "github" | "well-known";
  owner?: string;
  repo?: string;
  source?: string;
  skill: string;
  originalSource: string;
}> {
  const result = [];

  for (const source of sources) {
    const parsed = parseDownloadSourceExtended(source);

    if (!parsed) {
      throw new CommandError({
        code: "INVALID_SOURCE_FORMAT",
        message: `Invalid source format: ${source}`,
        suggestion: 
          "Supported formats:\n" +
          "  - owner/repo@skill-name (GitHub)\n" +
          "  - source@skill-name (Well-Known)",
      });
    }

    const skillNames = parsed.skill.split(",").map((s) => s.trim());

    for (const skill of skillNames) {
      if (parsed.type === "github") {
        result.push({
          type: "github",
          owner: parsed.owner,
          repo: parsed.repo,
          skill,
          originalSource: `${parsed.owner}/${parsed.repo}@${skill}`,
        });
      } else {
        result.push({
          type: "well-known",
          source: parsed.source,
          skill,
          originalSource: `${parsed.source}@${skill}`,
        });
      }
    }
  }

  return result;
}
```

修改 action 中的处理逻辑：

```typescript
// 分组处理
const githubSources = parsedSources.filter(s => s.type === "github");
const wellKnownSources = parsedSources.filter(s => s.type === "well-known");

// GitHub 来源（现有逻辑）
const grouped = groupByRepo(githubSources);
for (const [repo, skills] of grouped.entries()) {
  // ... 现有代码
}

// Well-Known 来源
for (const item of wellKnownSources) {
  output.print(`Downloading from ${item.source} (well-known)...`);
  const result = await downloadFromWellKnown(
    item.source!,
    item.skill,
    inboxPath,
    { force: options.force as boolean, ref },
    context,
  );
  allResults.push(result);
}
```

---

## 测试用例

```bash
# 1. GitHub 格式（现有功能）
wopal skills download anthropics/skills@mcp-builder

# 2. 非 GitHub 格式（新功能）
wopal skills download gpa-mcp.genai.prd.aws.saccap.int@superpowers
# → 尝试 well-known，可能失败并提示

# 3. 多个技能
wopal skills download anthropics/skills@mcp-builder,context7

# 4. 混合格式
wopal skills download anthropics/skills@mcp-builder some.domain.com@skill
```

---

## 依赖

- `gray-matter`: 解析 SKILL.md frontmatter（已有）

---

## 错误处理

| 场景 | 错误信息 |
|------|----------|
| 来源不可访问 | `Source 'xxx' is not accessible or does not support well-known protocol` |
| 技能不存在 | `Skill 'xxx' not found at 'source'` |
| 网络超时 | 10 秒超时，返回友好提示 |

---

## 风险

1. **非所有来源支持 well-known**: 部分内部域名可能无法访问
2. **网络延迟**: 需要设置合理超时
3. **文件完整性**: 需验证 SKILL.md 必须存在
