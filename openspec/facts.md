# Skills CLI 整合参考文档

> 用途：AI Agent 了解背景和现状，设计 Wopal CLI 技能管理整合方案
> 日期：2026-03-05
> 参考：playground/_good_repos/skills (v1.4.3)

---

## 目录

1. [背景与现状](#1-背景与现状)
2. [Skills CLI 核心能力](#2-skills-cli-核心能力)
3. [架构设计对比](#3-架构设计对比)
4. [版本追踪机制对比](#4-版本追踪机制对比)
5. [工作流设计对比](#5-工作流设计对比)
6. [整合目标与约束](#6-整合目标与约束)
7. [待决问题](#7-待决问题)

---

## 1. 背景与现状

### 1.1 项目定位

Wopal CLI 是工作空间自建的命令行工具，用于管理技能（skills）。核心价值是**安全可控**——通过 INBOX 隔离区、安全扫描、人工评估确保引入的技能可信。

### 1.2 当前架构

```
wopal-workspace/
├── projects/agent-tools/          # 源码
│   └── skills/                   # 源码技能
│       ├── INBOX/                 # 待评估技能
│       └── universal/             # 已部署技能
├── .agents/skills/                # 运行时部署站（43个技能）
└── .worktrees/                    # 子项目 worktree
```

### 1.3 现有工具

| 工具 | 功能 | 定位 |
|------|------|------|
| `skill-deployer` | 源码 → 部署站 | 本地开发 |
| `skills-research` | 搜索 + 下载 | 发现新技能 |
| `sync-skills.py` | 版本同步 | 追踪更新 |

### 1.4 version.json 追踪格式

```json
{
  "name": "skill-name",
  "source_path": "projects/agent-tools/skills/...",
  "content_hash": "sha256...",
  "deployed_at": "2026-03-03T20:00:59",
  "deploy_type": "copy"
}
```

### 1.5 当前设计优势

1. **INBOX 隔离区** — 下载后先放 INBOX，扫描评估后再部署
2. **安全扫描集成** — 集成 skill-security-scanner 检查恶意代码
3. **本地源码追踪** — 记录 source_path，支持离线版本检查
4. **.skillignore 支持** — 精细控制部署内容

---

## 2. Skills CLI 核心能力

### 2.1 支持的 Agent 平台

- **通用型**: OpenCode, Claude Code, Cursor, Cline, Codex
- **企业型**: GitHub Copilot, Gemini CLI, Antigravity
- **垂直领域**: Windsurf, Replit, Kiro CLI, Qwen Code
- **实验性**: Goose, Junie, Mistral Vibe

### 2.2 核心命令

| 命令 | 功能 |
|------|------|
| `npx skills add <source>` | 安装技能（GitHub/GitLab/本地） |
| `npx skills find [query]` | 交互式搜索 |
| `npx skills list` | 列出已安装 |
| `npx skills check` | 检查更新 |
| `npx skills update` | 批量更新 |
| `npx skills remove` | 删除技能 |
| `npx skills init [name]` | 创建 SKILL.md 模板 |

#### `find` 命令详细说明

**用途**：从 skills.sh API 搜索技能

**使用方式**：
```bash
# 非交互式（AI Agent 场景）
npx skills find openspec

# 交互式（用户场景）
npx skills find
```

**返回格式**：
```
forztf/open-skilled-sdd@openspec-proposal-creation  118 installs
└ https://skills.sh/forztf/open-skilled-sdd/openspec-proposal-creation

forztf/open-skilled-sdd@openspec-implementation  92 installs
└ https://skills.sh/forztf/open-skilled-sdd/openspec-implementation

itechmeat/llm-code@openspec  67 installs
└ https://skills.sh/itechmeat/llm-code/openspec
```

**格式解析**：
- `owner/repo@skill-name` - 仓库路径 + 技能名称
- 技能名称通过 `@` 符号分隔
- 可直接复制粘贴到 `add` 命令使用

**API 端点**：
- `https://skills.sh/api/search?q=<query>&limit=10`
- 返回 JSON 格式：
  ```json
  {
    "skills": [
      {
        "id": "slug",
        "name": "skill-name",
        "source": "owner/repo",
        "installs": 118
      }
    ]
  }
  ```

**与 download 命令的衔接**：
- find 命令输出格式：`owner/repo@skill-name`
- download 命令输入格式：`owner/repo@skill-name`
- 完全兼容，可直接复制粘贴

### 2.3 源格式支持（5 种类型）

#### GitHub（完整支持）
- shorthand: `owner/repo`
- @skill 语法: `owner/repo@skill-name`
- 指定分支: `owner/repo/tree/branch`
- 分支+路径: `owner/repo/tree/branch/path/to/skill`
- HTTPS URL: `https://github.com/owner/repo`
- SSH URL: `git@github.com:owner/repo.git`

#### GitLab（完整支持）
- GitLab.com: `https://gitlab.com/owner/repo`
- 嵌套子组: `https://gitlab.com/group/subgroup/repo`
- 任何实例: `https://gitlab.example.com/owner/repo`
- SSH URL: `git@gitlab.com:owner/repo.git`

#### 本地路径（完整支持）
- 绝对路径: `/path/to/skill`
- 相对路径: `./skill`, `../skill`
- Windows 路径: `C:\path\to\skill`

#### Well-Known 端点（RFC 8615）
- 根域名: `https://example.com`
- 带路径: `https://example.com/docs`
- 特定技能: `https://example.com/.well-known/skills/skill-name`
- 从 `/.well-known/skills/index.json` 发现技能列表

#### 直接 Git URL
- Git 协议: `git://example.com/repo.git`
- HTTPS: `https://example.com/repo.git`

### 2.4 技能发现逻辑（20+ 优先目录）

**源码位置**：`src/skills.ts`

**优先搜索目录**（按顺序）：
```
<repo-root>/
├── skills/
│   ├── .curated/
│   ├── .experimental/
│   └── .system/
├── .agent/skills/
├── .agents/skills/
├── .claude/skills/
├── .cline/skills/
├── .codebuddy/skills/
├── .codex/skills/
├── .commandcode/skills/
├── .continue/skills/
├── .github/skills/
├── .goose/skills/
├── .iflow/skills/
├── .junie/skills/
├── .kilocode/skills/
├── .kiro/skills/
├── .mux/skills/
├── .neovate/skills/
├── .opencode/skills/
├── .openhands/skills/
├── .pi/skills/
├── .qoder/skills/
├── .roo/skills/
├── .trae/skills/
├── .windsurf/skills/
└── .zencoder/skills/
```

**发现策略**：
1. 优先搜索上述目录（快速）
2. 如果未找到，递归搜索整个仓库（最大深度 5）
3. 跳过：`node_modules/`, `.git/`, `dist/`, `build/`, `__pycache__/`

**技能识别**：
- 通过 `SKILL.md` 识别
- 必须包含 frontmatter：`name` 和 `description`
- 可选：`metadata.internal`（默认跳过内部技能）

### 2.5 关键技术设计

#### Universal vs Non-Universal 分层

```typescript
// Universal - 共享 .agents/skills
const universal = ['opencode', 'cursor', 'cline'];

// Non-Universal - 独立目录
const nonUniversal = ['claude-code', 'windsurf'];
```

#### 跨平台符号链接

- **Windows**: junction（目录链接）
- **Unix**: symlink
- **降级**: 失败时自动使用 copy 模式

#### 路径安全防护

```typescript
function sanitizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9._]+/g, '-')
    .replace(/^[.\-]+|[.\-]+$/g, '')
    .substring(0, 255) || 'unnamed';
}

function isPathSafe(basePath: string, targetPath: string): boolean {
  const normalizedBase = normalize(resolve(basePath));
  const normalizedTarget = normalize(resolve(targetPath));
  return normalizedTarget.startsWith(normalizedBase + sep);
}
```

#### Agent 自动检测

```typescript
async function detectInstalledAgents(): Promise<AgentType[]> {
  const results = await Promise.all(
    Object.entries(agents).map(async ([type, config]) => ({
      type: type as AgentType,
      installed: await config.detectInstalled(),
    }))
  );
  return results.filter(r => r.installed).map(r => r.type);
}
```

### 2.6 Git 克隆特性

**源码位置**：`src/git.ts`

**核心特性**：
- Shallow clone：`--depth 1` 减少下载时间
- 超时控制：60 秒（可配置）
- 认证支持：SSH keys、HTTPS credentials
- 错误分类：超时、认证失败、仓库不存在
- 安全清理：验证路径在 `/tmp` 内

**关键代码**：
```typescript
const CLONE_TIMEOUT_MS = 60000; // 60 seconds

export async function cloneRepo(url: string, ref?: string): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), 'skills-'));
  const git = simpleGit({
    timeout: { block: CLONE_TIMEOUT_MS },
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  const cloneOptions = ref ? ['--depth', '1', '--branch', ref] : ['--depth', '1'];
  
  await git.clone(url, tempDir, cloneOptions);
  return tempDir;
}
```

### 2.7 Well-Known 端点实现

**源码位置**：`src/providers/wellknown.ts`

**核心逻辑**：
1. 从 `/.well-known/skills/index.json` 获取技能列表
2. 验证技能条目格式（name, description, files）
3. 从 `/.well-known/skills/<name>/` 获取所有文件
4. 并行下载多技能

**index.json 格式**：
```json
{
  "skills": [
    {
      "name": "pdf-skill",
      "description": "PDF manipulation toolkit",
      "files": ["SKILL.md", "scripts/process.py"]
    }
  ]
}
```

### 2.8 锁文件系统（无 INBOX 概念）

**重要发现**：Skills CLI 是**单阶段流程**（download→安装），没有 INBOX 概念，源信息在内存中传递。

#### 全局锁文件 (`~/.agents/.skill-lock.json`)

```json
{
  "version": 3,
  "skills": {
    "my-skill": {
      "source": "owner/repo",
      "sourceType": "github",
      "skillPath": "skills/my-skill/SKILL.md",
      "skillFolderHash": "abc123...",  // GitHub Tree SHA
      "installedAt": "2026-03-05T12:00:00Z",
      "updatedAt": "2026-03-05T12:00:00Z"
    }
  }
}
```

#### 本地锁文件 (`skills-lock.json`)

用于团队协作，提交到 Git 仓库：

```json
{
  "version": 1,
  "skills": {
    "my-skill": {
      "source": "owner/repo",
      "installedAt": "2026-03-05T12:00:00Z"
    }
  }
}
```

---

## 3. 架构设计对比

### 3.1 整体架构对比

| 维度 | Skills CLI | 你的设计 |
|------|-----------|---------|
| **架构模式** | 单体应用（Monolithic） | 微服务式（分离式） |
| **数据存储** | 双层锁文件（全局+本地） | version.json（技能级） |
| **工作流** | **单阶段：直接安装** | **三阶段：INBOX → scan → universal** |
| **版本标识** | GitHub Tree SHA | SHA256 Hash |
| **Agent 管理** | 自动检测 40+ Agent | 手动指定目标目录 |
| **INBOX 概念** | ❌ 无（源信息在内存中） | ✅ 有（持久化 .source.json） |

### 3.2 Skills CLI 架构

```
┌──────────────────────────────────────────────────┐
│              统一的 CLI 入口                        │
│                (src/cli.ts)                       │
└────────────┬─────────────────────────────────────┘
             │
    ┌────────┴────────┐
    ▼                 ▼
┌─────────┐      ┌─────────┐
│  add    │      │  check  │
│  remove │      │  update │
│  list   │      │  sync   │
└────┬────┘      └────┬────┘
     └────────┬───────┘
              │
    ┌─────────▼──────────┐
    │   Core Modules     │
    ├────────────────────┤
    │ • Agent Detection  │
    │ • Skill Discovery  │
    │ • Installer        │
    │ • Lock Files       │
    │ • Git Operations   │
    └────────────────────┘
```

### 3.3 你的架构（分离式）

```
┌─────────────────────┐         ┌─────────────────────┐
│   skills-research   │         │   skill-deployer    │
│  (搜索 & 下载)      │         │  (本地部署)         │
├─────────────────────┤         ├─────────────────────┤
│ • search-skills.py  │         │ • deploy-skill.py   │
│ • download-skill.py │         │ • sync-skills.py    │
└──────────┬──────────┘         └──────────┬──────────┘
           │                               │
           ▼                               ▼
    ┌─────────────┐                ┌──────────────┐
    │   INBOX/    │                │ version.json │
    │  (临时区)   │───────────────>│  (追踪文件)  │
    └─────────────┘   部署后移动   └──────────────┘
                            │
                            ▼
                    ┌──────────────┐
                    │  universal/  │
                    │  (正式区)    │
                    └──────────────┘
```

---

## 4. 版本追踪机制对比

### 4.1 对比总结

| 特性 | Skills CLI (锁文件) | 你的设计 (version.json) |
|------|-------------------|------------------------|
| **数据结构** | 集中式（单一文件） | 分布式（每技能一个） |
| **版本标识** | GitHub Tree SHA | SHA256 Hash |
| **更新检查** | 调用 GitHub API | 本地文件 Hash 比对 |
| **离线支持** | ❌ 需要网络 | ✅ 完全本地 |
| **速度** | 慢（API 限制） | 快（本地计算） |
| **适用场景** | 远程技能包 | 本地源码开发 |

### 4.2 Skills CLI 更新流程

```
npx skills check
    ↓
读取 ~/.agents/.skill-lock.json
    ↓
POST https://add-skill.vercel.sh/check-updates
    { "skills": [...], "forceRefresh": true }
    ↓
服务端调用 GitHub API 获取最新 Tree SHA
    ↓
比对 SHA，返回更新列表
    ↓
npx skills update
    ↓
重新安装有更新的技能
```

### 4.3 你的 sync 流程

```
python3 scripts/sync-skills.py
    ↓
遍历 .agents/skills/ 目录
    ↓
对每个技能：
  1. 读取 version.json
  2. 定位源码路径
  3. 计算 SHA256 Hash
  4. 比对 version.json 中的 hash
    ↓
返回状态：updated / unchanged / orphaned / untracked
    ↓
python3 scripts/sync-skills.py --update
    ↓
交互式重新部署有更新的技能
```

---

## 5. 工作流设计对比

### 5.1 Skills CLI 工作流（单阶段）

```
npx skills add owner/repo@skill
    ↓
下载到临时目录（内存中传递源信息）
    ↓
发现技能（搜索 20+ 优先目录）
    ↓
安装到 Agent 目录（symlink/copy）
    ↓
写入锁文件（sourceType + sourceHash）
    ↓
删除临时目录
```

**关键特点**：
- 源信息在内存中传递，不持久化到 INBOX
- 下载→安装一气呵成，无隔离环节
- 无法插入安全扫描步骤

团队成员 A:
  npx skills add vercel-labs/agent-skills@my-skill
  ↓
  安装到 .agents/skills/my-skill/
  ↓
  写入 skills-lock.json
  ↓
  git add skills-lock.json
  git commit -m "Add my-skill"

团队成员 B:
  git pull
  ↓
  npx skills experimental_install
  ↓
  根据 skills-lock.json 恢复相同技能
```

### 5.2 你的工作流（三阶段，安全评估优先）

```
Step 1: 搜索技能
  ./scripts/search-skills.py "react testing"
  ↓
  返回技能列表（调用 npx skills find）

Step 2: 下载到 INBOX（隔离区）
  wopal skills download owner/repo@skill
  ↓
  下载到 INBOX/<skill>/
  ↓
  保存 .source.json（持久化源信息）
  ↓
  INBOX/<skill> 保留，等待扫描

Step 3: 安全扫描（你的创新！）
  wopal skills scan INBOX/<skill>
  ↓
  检查：C2、Reverse Shell、Data Exfiltration...
  ↓
  输出风险评分和详细报告

Step 4: 人工评估
  - 查看扫描结果
  - 查看代码
  - 测试功能
  - 决定是否安装

Step 5: 安装到 Agent（正式区）
  wopal skills install INBOX/<skill>
  ↓
  读取 .source.json
  ↓
  复制到 .agents/skills/<skill>/
  ↓
  写入 skills-lock.json
  ↓
  删除 INBOX/<skill>

Step 6: 持续同步
  wopal skills check
  ↓
  检查源码更新（GitHub API 或本地 hash）
  ↓
  wopal skills update <skill>
  ↓
  重新下载→扫描→安装
```

### 5.3 工作流对比总结

| 维度 | Skills CLI | 你的设计 |
|------|-----------|---------|
| **核心理念** | 快速安装 | 安全评估 |
| **流程阶段** | **单阶段**（download→install） | **三阶段**（download→scan→install） |
| **隔离机制** | ❌ 无隔离（临时目录） | ✅ INBOX 隔离区（持久化） |
| **源信息传递** | 内存中（不持久化） | .source.json（持久化） |
| **安全检查** | ❌ 无扫描 | ✅ 集成 scanner |
| **评估流程** | 直接安装 | 下载 → 扫描 → 评估 → 安装 |
| **适用场景** | 公开技能库（信任） | 不信任的第三方技能 |

---

## 6. 整合目标与约束

### 6.1 需要引入的能力

1. **跨 Agent 安装** — 当前只支持单一目标目录
2. **远程技能发现** — 从 GitHub/GitLab 安装
3. **版本追踪增强** — GitHub Tree SHA 支持
4. **团队协作** — 本地锁文件

### 6.2 必须保留的设计约束

| 约束 | 说明 | 优先级 |
|------|------|--------|
| 保留 INBOX 工作流 | 安全评估流程不能丢 | 必须 |
| 保留源码追踪 | 本地开发友好 | 必须 |
| 集成安全扫描 | 第三方技能必须扫描 | 必须 |
| 离线支持 | 本地 Hash 比对优先 | 必须 |

### 6.3 优劣势分析

| 维度 | Skills CLI | 你的设计 | 整合后目标 |
|------|-----------|---------|-----------|
| **生态系统** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| **团队协作** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **安全性** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **本地开发** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **离线支持** | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **易用性** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

---

## 相关文件

- `projects/agent-tools/AGENTS.md` — 技能开发规范
- `openspec/changes/wopal-cli-core/` — CLI 核心设计
- `memory/working-context.md` — 工作上下文和最新发现
- `playground/_good_repos/skills/src/` — Skills CLI 源码（git.ts、source-parser.ts、skills.ts、providers/wellknown.ts）

---

## 最新发现（2026-03-06）

### 关键发现

1. **Skills CLI 是单阶段流程**：
   - download→install 一气呵成
   - 源信息在内存中传递，不持久化
   - 无法插入安全扫描环节

2. **wopal-cli 需要三阶段流程**：
   - download → scan → install
   - 需要 INBOX 元数据（.source.json）持久化源信息
   - 支持 install 和 update 命令读取元数据

3. **wopal-cli 只支持 4 种远程源**：
   - ✅ GitHub、GitLab、Well-Known、Git URL
   - ❌ 本地路径（使用 scan 命令）

4. **技能发现搜索 20+ 优先目录**：
   - 从 Skills CLI 复制 skills.ts
   - 优先搜索常见技能目录
   - 递归搜索后备（最大深度 5）

5. **Well-Known 端点支持**：
   - 从 `/.well-known/skills/index.json` 获取技能列表
   - 并行下载多技能
   - 支持特定技能下载

6. **版本指纹方案已实现并验证**（2026-03-06）：
   - **主版本指纹**：GitHub Tree SHA（技能文件夹级别）
   - **辅助信息**：commit SHA（追溯用）
   - **实现文件**：`src/utils/skill-lock.ts`（fetchSkillFolderHash、getGitHubToken）
   - **元数据字段**：skillFolderHash、commit、ref、tag
   - **关键修复**：skillPath 需要去除前导斜杠才能匹配 GitHub API 返回的树结构
   - **参数支持**：添加 `--branch` 和 `--tag` 参数
   - **Token 认证**：支持 GITHUB_TOKEN → GH_TOKEN → gh auth token 优先级
   - **验证结果**：所有版本指纹字段正确记录，Tree SHA 为 40 字符十六进制
