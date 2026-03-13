# wopal skills find 命令设计方案

## 概述

将 `wopal skills find` 命令从透传官方 CLI 改为直接调用 skills.sh API，增加 `--limit` 选项和通配符支持。

## 背景

### 当前问题

1. 官方 `npx skills find` 不支持 `--limit` 选项
2. API 请求固定 `limit=10`，显示时只取前 6 个结果
3. 透传方式无法扩展功能

### 目标

- 直接调用 `https://skills.sh/api/search` API
- 支持 `--limit` 选项控制结果数量
- 支持 `--json` 格式输出
- 支持 `*` 通配符模式匹配
- 结果默认按安装量降序排序（API 默认行为）

## 命令规格

### 用法

```bash
wopal skills find <query> [options]
```

### 参数

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `<query>` | string | 是 | 搜索关键词，支持 `*` 通配符 |

### 选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `--limit <number>` | number | 20 | 最大结果数，`0` 表示全部（最多 100） |
| `--json` | boolean | false | JSON 格式输出 |

### 示例

```bash
wopal skills find openspec             # 搜索 openspec 技能（显示 20 条）
wopal skills find openspec*cn          # 通配符：匹配 openspec...cn
wopal skills find openspec --limit 50  # 显示 50 条结果
wopal skills find openspec --limit 0   # 显示全部（最多 100 条）
wopal skills find openspec --json      # JSON 格式输出
```

## 通配符支持

### 语法

- `*` 匹配任意字符（零个或多个）
- 匹配不区分大小写
- 同时匹配技能名和完整路径（source/name）

### 实现

```typescript
function parseWildcardQuery(query: string): { apiQuery: string; pattern: RegExp | null } {
  if (!query.includes("*")) {
    return { apiQuery: query, pattern: null };
  }
  
  // 转义正则特殊字符，保留 * 作为 .*
  const escaped = query.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  const pattern = new RegExp(`^${escaped}$`, "i");
  
  // 提取 * 前的部分作为 API 查询词
  const apiQuery = query.split("*")[0];
  
  return { apiQuery, pattern };
}
```

### 行为

1. 检测查询是否包含 `*`
2. 有通配符时，提取基础词调用 API 获取更多结果（最多 100）
3. 本地使用正则过滤匹配结果
4. 应用 `--limit` 限制最终输出数量

## API 集成

### 端点

```
GET https://skills.sh/api/search?q=<query>&limit=<limit>
```

### 请求参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `q` | string | 搜索关键词（URL 编码） |
| `limit` | number | 返回结果数量上限 |

### 响应格式

```json
{
  "query": "openspec",
  "searchType": "fuzzy",
  "skills": [
    {
      "id": "forztf/open-skilled-sdd/openspec-proposal-creation",
      "skillId": "openspec-proposal-creation",
      "name": "openspec-proposal-creation",
      "installs": 142,
      "source": "forztf/open-skilled-sdd"
    }
  ],
  "count": 10,
  "duration_ms": 47
}
```

### 排序

API 默认按安装量（installs）降序返回结果，无需额外处理。

## 输出格式

### 普通输出

```
Found 50 skill(s), showing 20:

  forztf/open-skilled-sdd@openspec-proposal-creation  142 installs
  └ https://skills.sh/forztf/open-skilled-sdd/openspec-proposal-creation

  forztf/open-skilled-sdd@openspec-implementation  113 installs
  └ https://skills.sh/forztf/open-skilled-sdd/openspec-implementation

  ...

Download with: wopal skills download <source>
```

### JSON 输出 (`--json`)

```json
{
  "success": true,
  "data": {
    "query": "openspec",
    "total": 50,
    "showing": 20,
    "skills": [
      {
        "id": "forztf/open-skilled-sdd/openspec-proposal-creation",
        "name": "openspec-proposal-creation",
        "source": "forztf/open-skilled-sdd",
        "installs": 142,
        "url": "https://skills.sh/forztf/open-skilled-sdd/openspec-proposal-creation"
      }
    ]
  }
}
```

### 安装量格式化

| 安装量 | 显示格式 |
|--------|----------|
| < 1000 | `N installs` |
| >= 1000 | `X.XK installs` |
| >= 1000000 | `X.XM installs` |

示例：`142 installs`、`1.4K installs`、`2.3M installs`

## 错误处理

### 错误场景

| 场景 | 普通输出 | JSON 输出 |
|------|----------|-----------|
| 无匹配结果 | `No skills found for "<query>"` | `{ success: true, data: { skills: [], total: 0 } }` |
| 网络错误 | `Error: <message>` + 建议检查网络 | `{ success: false, error: { code: "SEARCH_FAILED", ... } }` |
| API 错误 | `Error: API request failed: <status>` | `{ success: false, error: { code: "SEARCH_FAILED", ... } }` |

### 错误建议

```
Check your network connection and try again
```

## 文件变更

### 新建文件

| 文件 | 说明 |
|------|------|
| `src/commands/skills/find.ts` | find 命令实现 |

### 修改文件

| 文件 | 变更 |
|------|------|
| `src/commands/skills/index.ts` | 替换 passthrough 为 find |

### 删除文件

| 文件 | 说明 |
|------|------|
| `src/commands/skills/passthrough.ts` | 移除透传实现 |

## 实现细节

### 常量定义

```typescript
const SEARCH_API_BASE = "https://skills.sh/api/search";
const DEFAULT_LIMIT = 20;
const MAX_API_LIMIT = 100;  // limit=0 时使用
```

### 类型定义

```typescript
interface SkillSearchResult {
  id: string;
  name: string;
  installs: number;
  source: string;
}

interface SearchAPIResponse {
  skills: SkillSearchResult[];
  count: number;
}
```

### 核心函数

```typescript
// API 调用
async function searchSkills(query: string, limit: number): Promise<SearchAPIResponse>

// 安装量格式化
function formatInstalls(count: number): string

// 普通输出
function printResults(results: SkillSearchResult[], total: number, showing: number, context: ProgramContext): void

// JSON 输出
function printJson(results: SkillSearchResult[], query: string, total: number, showing: number, context: ProgramContext): void

// 主逻辑
async function runFind(query: string, limit: number, json: boolean, context: ProgramContext): Promise<void>
```

### limit 处理逻辑

```typescript
// 用户输入 --limit 0 表示"显示全部"
const apiLimit = limit === 0 ? MAX_API_LIMIT : limit;

// API 返回后，按用户指定的 limit 截取显示
const displayLimit = limit === 0 ? MAX_API_LIMIT : limit;
const results = data.skills.slice(0, displayLimit);
```

## 验证计划

### 测试用例

1. **基本搜索**
   ```bash
   wopal skills find openspec
   ```
   - 应返回最多 20 条结果
   - 结果按安装量降序排列

2. **自定义 limit**
   ```bash
   wopal skills find openspec --limit 5
   ```
   - 应返回最多 5 条结果

3. **显示全部**
   ```bash
   wopal skills find openspec --limit 0
   ```
   - 应返回最多 100 条结果

4. **JSON 输出**
   ```bash
   wopal skills find openspec --json
   ```
   - 应输出有效 JSON
   - 包含 `success: true` 和 `data` 字段

5. **无结果**
   ```bash
   wopal skills find "zzzzzzzzznonexistent"
   ```
   - 应显示 "No skills found"

### 构建验证

```bash
cd projects/agent-tools/wopal-cli
pnpm build && pnpm test:run && pnpm format
```

## 回滚方案

如有问题，可通过 git 回滚：

```bash
git revert <commit-hash>
```

或恢复 passthrough.ts 文件并修改 index.ts 重新使用透传方式。
