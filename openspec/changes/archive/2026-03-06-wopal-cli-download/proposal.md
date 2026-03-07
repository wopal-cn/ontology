# Proposal: wopal-cli-download

## Summary

实现 `wopal skills download` 命令，从远程仓库下载技能到 INBOX，支持与 `wopal skills find` 命令输出格式无缝衔接。

**核心使用场景**：AI Agent 执行 `find → download` 工作流。

## Why

从远程仓库下载技能到 INBOX 隔离区，为后续的安全扫描和安装做准备。

**设计目标**：
- **无缝衔接**：从 find 命令直接复制粘贴
- **批量下载**：支持一次下载多个技能
- **AI Agent 友好**：清晰的命令格式和帮助信息
- **精确下载**：必须明确指定技能名称

## What Changes

### 命令格式

```bash
# 下载单个技能（从 find 复制粘贴）
wopal skills download owner/repo@skill-name

# 批量下载：多个参数（不同仓库）
wopal skills download owner1/repo1@skill1 owner2/repo2@skill2

# 批量下载：逗号分隔（同一仓库的多个技能）
wopal skills download owner/repo@skill1,skill2,skill3

# 混合格式
wopal skills download owner1/repo1@skill1 owner2/repo2@skill2,skill3
```

### Source 格式

**核心原则**：支持所有能从 GitHub/GitLab 下载技能的格式。

| 格式类型 | 格式 | 示例 |
|---------|------|------|
| **GitHub shorthand** | `owner/repo@skill` | `forztf/open-skilled-sdd@openspec-proposal-creation` |
| **GitHub URL** | `https://github.com/owner/repo@skill` | `https://github.com/forztf/open-skilled-sdd@openspec-proposal-creation` |
| **GitLab URL** | `https://gitlab.com/owner/repo@skill` | `https://gitlab.com/user/repo@my-skill` |
| **GitLab subgroup** | `https://gitlab.com/group/subgroup/repo@skill` | `https://gitlab.com/myteam/backend/api@skill` |
| **批量下载** | `owner/repo@skill1,skill2,...` | `owner/repo@skill1,skill2,skill3` |

### 不支持

- **本地路径**：使用 `wopal skills install <path>`（本地技能不需要下载）
- **`owner/repo`（不带 @skill）**：必须明确指定技能名称（非交互式）
- **`*` 通配符**：只支持精确的技能名称
- **Well-Known URLs**：find 命令不会返回此格式（可后续添加）
- **Direct Git URLs**：如 `git@github.com:owner/repo.git`（可后续添加）

## Dependencies

- **wopal-cli-core**: 依赖 INBOX 路径管理（SKILL_INBOX_DIR 环境变量）

## Files

### 新增文件

```
projects/agent-tools/tools/wopal-cli/
├── src/
│   ├── commands/
│   │   └── download.ts              # download 命令实现
│   └── utils/
│       ├── git.ts                   # Git 克隆逻辑
│       ├── source-parser.ts         # 源格式解析
│       └── skills.ts                # 技能发现
```

## Capabilities

### 1. 典型使用场景

**AI Agent 工作流**：

```bash
# 1. AI Agent 搜索技能
$ wopal skills find openspec
forztf/open-skilled-sdd@openspec-proposal-creation
forztf/open-skilled-sdd@openspec-implementation
itechmeat/llm-code@openspec

# 2. AI Agent 决定下载（直接复制粘贴）
$ wopal skills download forztf/open-skilled-sdd@openspec-proposal-creation
✓ Downloaded skill 'openspec-proposal-creation' to INBOX

# 3. 或者批量下载
$ wopal skills download \
  forztf/open-skilled-sdd@openspec-proposal-creation \
  forztf/open-skilled-sdd@openspec-implementation
✓ Downloaded 2 skills to INBOX

# 4. 或者从同一仓库下载多个技能
$ wopal skills download forztf/open-skilled-sdd@openspec-proposal-creation,openspec-implementation
✓ Downloaded 2 skills to INBOX
```

### 2. 命令帮助（AI Agent 可读）

```
Usage: wopal skills download <source>...

Download skills to INBOX for security scanning before installation.

SOURCE FORMAT:
  owner/repo@skill-name            Download single skill
  owner/repo@skill1,skill2,...     Download multiple skills from same repo

BATCH DOWNLOAD:
  # Multiple sources (space-separated)
  wopal skills download owner/repo@skill1 owner/repo@skill2

  # Multiple skills from same repo (comma-separated)
  wopal skills download owner/repo@skill1,skill2,skill3

  # Mixed formats
  wopal skills download owner1/repo1@skill1 owner2/repo2@skill2

EXAMPLES:
  # Download single skill (copy from 'wopal skills find' output)
  wopal skills download forztf/open-skilled-sdd@openspec-proposal-creation

  # Download multiple skills from same repository
  wopal skills download forztf/open-skilled-sdd@openspec-proposal-creation,openspec-implementation

  # Download multiple skills from different repositories
  wopal skills download \
    forztf/open-skilled-sdd@openspec-proposal-creation \
    itechmeat/llm-code@openspec

OPTIONS:
  --force    Overwrite existing skills in INBOX
  --help     Show this help message

NOTES:
  - Skills are downloaded to INBOX for security scanning
  - Use 'wopal skills scan <skill-name>' to scan skills in INBOX
  - Use 'wopal skills install <skill-name>' to install scanned skills
  - Local paths are not supported (use 'install' command instead)

WORKFLOW:
  1. Find skills:   wopal skills find <keyword>
  2. Download:      wopal skills download <source>...
  3. Scan:          wopal skills scan <skill-name>
  4. Install:       wopal skills install <skill-name>
```

### 3. 实现参考

**从 Skills CLI 参考以下模块**：
- `git.ts` - Git 克隆逻辑
- `source-parser.ts` - 源格式解析
- `skills.ts` - 技能发现

**注意**：实现细节对用户透明，规格中不描述。

### 4. INBOX 元数据（.source.json）

保存到 `INBOX/<skill>/.source.json`：

```json
{
  "name": "skill-name",
  "description": "Skill description",
  "source": "owner/repo@skill-name",
  "downloadedAt": "2026-03-06T10:00:00Z"
}
```

**用途**：
- install 命令：读取元数据，写入锁文件
- update 命令：读取元数据，重新下载

## Verification

### 基础功能

- [ ] `wopal skills download owner/repo@skill-name` 下载单个技能
- [ ] 技能出现在 `INBOX/skill-name/`
- [ ] `INBOX/skill-name/.source.json` 创建成功

### 批量下载

- [ ] 多个参数：`owner/repo@skill1 owner/repo@skill2` 下载多个技能
- [ ] 逗号分隔：`owner/repo@skill1,skill2` 下载同一仓库的多个技能
- [ ] 混合格式：同时支持多种格式

### 错误处理

- [ ] 技能不存在显示友好错误
- [ ] 仓库不存在显示友好错误
- [ ] 格式错误显示帮助信息
- [ ] 已存在提示使用 --force

### 与 find 命令衔接

- [ ] 从 find 输出直接复制粘贴可执行
- [ ] `--help` 显示清晰的使用说明
- [ ] 帮助信息包含批量下载示例

## Implementation Notes

### 代码来源

从 `playground/_good_repos/skills/src/` 复制核心模块：
- `git.ts` → `utils/git.ts`
- `source-parser.ts` → `utils/source-parser.ts`
- `skills.ts` → `utils/skills.ts`

### 实施顺序

1. **Phase 1**: 实现基础下载（单个技能）
2. **Phase 2**: 实现批量下载（多个参数）
3. **Phase 3**: 实现批量下载（逗号分隔）
4. **Phase 4**: 完善错误处理和帮助信息

### 依赖安装

```bash
cd projects/agent-tools/tools/wopal-cli
pnpm add simple-git gray-matter
pnpm add -D @types/node
```

## Reference

- **Skills CLI 源码**: `playground/_good_repos/skills/src/`
- **find 命令**: `projects/agent-tools/tools/wopal-cli/src/commands/find.ts`
