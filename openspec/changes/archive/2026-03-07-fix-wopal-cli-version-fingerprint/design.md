# Design: fix-wopal-cli-version-fingerprint

## 技术决策

### 1. 版本指纹方案选择

**决策**：采用官方 Skills CLI 的 GitHub Tree SHA 方案

**理由**：
- Tree SHA 是技能文件夹级别的哈希，任何文件变化都会改变
- 官方方案已验证，与 check/update 命令设计一致
- 直接调用 GitHub API，无需依赖外部服务

**对比方案**：
| 方案 | 优点 | 缺点 | 决策 |
|------|------|------|------|
| Commit SHA | 简单，克隆后即可获取 | 仓库级别，无法精确定位技能变化 | ❌ 不采用 |
| GitHub Tree SHA | 技能级别，精确检测变更 | 需要额外 API 调用 | ✅ 采用 |
| 文件 hash | 完全精确 | 需要递归计算所有文件 | 仅用于本地技能 |

### 2. 代码复用策略

**决策**：从官方 Skills CLI 移植核心函数

**移植函数**：
- `fetchSkillFolderHash()` - 获取 GitHub Tree SHA
- `getGitHubToken()` - 获取 GitHub 认证 Token

**修改点**：
- User-Agent 改为 `wopal-cli`
- 返回值适配 wopal-cli 的元数据结构

### 3. API 调用策略

**决策**：优先使用认证请求，支持匿名降级

**Token 获取优先级**：
1. `GITHUB_TOKEN` 环境变量
2. `GH_TOKEN` 环境变量
3. `gh auth token` 命令

**分支尝试顺序**：
1. `main` 分支
2. `master` 分支（兼容旧仓库）

### 4. 错误处理策略

**决策**：优雅降级，不阻塞下载流程

| 错误场景 | 处理方式 |
|---------|---------|
| GitHub API 失败 | `skillFolderHash` 设为 `null`，继续下载 |
| 无 Token | 使用匿名请求（速率限制较低） |
| 树中找不到技能文件夹 | `skillFolderHash` 设为 `null` |
| 旧版本元数据 | check/update 提示重新下载 |

### 5. 元数据结构

**决策**：扩展 `SkillMetadata` 接口

```typescript
export interface SkillMetadata {
  // 现有字段
  name: string;
  description: string;
  source: string;
  sourceUrl: string;
  skillPath: string;
  downloadedAt: string;
  
  // 新增版本指纹
  skillFolderHash?: string | null;  // GitHub Tree SHA（主指纹）
  commit?: string;                   // Commit SHA（追溯）
  ref?: string;                      // 分支/标签
  tag?: string;                      // 语义化标签
}
```

**字段用途**：
- `skillFolderHash`：check/update 命令用于检测变更
- `commit`：追溯具体提交，用于问题排查
- `ref`/`tag`：记录用户指定的版本，用于精确更新

---

## 实现架构

```
┌─────────────────────────────────────────────────────────┐
│              download 命令版本指纹流程                   │
└─────────────────────────────────────────────────────────┘

  用户输入                     系统处理                      输出
  ────────                     ────────                      ────
      │                            │                          │
      │  wopal download            │                          │
      │  owner/repo@skill          │                          │
      ▼                            ▼                          │
  ┌────────┐              ┌─────────────────┐                │
  │ 解析源  │─────────────▶│ git clone       │                │
  └────────┘              │ --depth 1       │                │
                          └────────┬────────┘                │
                                   │                         │
                          ┌────────▼────────┐                │
                          │ 获取 commit SHA  │                │
                          │ git log -1       │                │
                          └────────┬────────┘                │
                                   │                         │
                          ┌────────▼────────┐                │
                          │ 获取 GitHub Token│                │
                          │ (可选)           │                │
                          └────────┬────────┘                │
                                   │                         │
                          ┌────────▼────────┐                │
                          │ 调用 GitHub API  │                │
                          │ GET /git/trees   │                │
                          │ ?recursive=1     │                │
                          └────────┬────────┘                │
                                   │                         │
                          ┌────────▼────────┐                │
                          │ 提取 Tree SHA    │                │
                          │ (技能文件夹)     │                │
                          └────────┬────────┘                │
                                   │                         │
                          ┌────────▼────────┐         ┌──────▼──────┐
                          │ 写入 .source.json│────────▶│ INBOX/      │
                          │ (完整元数据)     │         │ skill/      │
                          └─────────────────┘         └─────────────┘
```

---

## 文件变更清单

### 新增文件

```
projects/agent-tools/tools/wopal-cli/
└── src/
    └── utils/
        └── skill-lock.ts        # GitHub Tree SHA 获取函数
```

### 修改文件

```
projects/agent-tools/tools/wopal-cli/
└── src/
    ├── utils/
    │   ├── metadata.ts          # 扩展 SkillMetadata 接口
    │   └── git.ts               # 返回 commit SHA
    └── commands/
        └── download.ts          # 获取并记录版本指纹
```

---

## 依赖关系

```
download.ts
    │
    ├── git.ts (cloneRepo + commitSha)
    │
    ├── skill-lock.ts (fetchSkillFolderHash + getGitHubToken)
    │       │
    │       └── GitHub API
    │
    └── metadata.ts (writeMetadata)
```

---

## 性能考虑

### GitHub API 调用

- **单次下载**：1 次 API 调用（获取树结构）
- **批量下载**：每个仓库 1 次调用（复用树结构）
- **速率限制**：
  - 匿名：60 次/小时
  - 认证：5000 次/小时

### 优化策略

1. **批量下载优化**：同一仓库的多个技能共享一次 API 调用
2. **缓存策略**：未来可考虑缓存树结构（当前不实现）
3. **并发控制**：避免并发请求触发速率限制

---

## 向后兼容

### 旧版本元数据处理

```typescript
// check/update 命令读取元数据时
const metadata = await readMetadata(skillDir);

if (!metadata.skillFolderHash) {
  // 旧版本，提示重新下载
  console.log(`Skill '${skillName}' was downloaded with an older version.`);
  console.log(`Re-download to enable update detection: wopal skills download ${metadata.source}`);
  continue;
}
```

### 迁移建议

- 不强制迁移旧元数据
- 用户重新下载时自动获取完整版本信息
- check/update 命令优雅降级

---

## 测试策略

### 单元测试

- [ ] `fetchSkillFolderHash()` 正确提取 Tree SHA
- [ ] `getGitHubToken()` 按优先级获取 Token
- [ ] 元数据序列化/反序列化正确
- [ ] 错误场景优雅降级

### 集成测试

- [ ] 下载公开仓库技能，获取 Tree SHA
- [ ] 下载私有仓库技能（需 Token）
- [ ] 下载不存在的技能文件夹，skillFolderHash 为 null
- [ ] 批量下载同仓库多个技能，共享 API 调用

### 手动测试

- [ ] 下载后检查 `.source.json` 包含所有字段
- [ ] 修改远程技能文件，check 命令检测到变化
- [ ] 未修改时，check 命令显示无更新
