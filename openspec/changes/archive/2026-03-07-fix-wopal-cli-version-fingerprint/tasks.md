# Tasks: fix-wopal-cli-version-fingerprint

## 实施任务

### Phase 1: 核心功能实现

- [x] **Task 1.1**: 创建 `src/utils/skill-lock.ts`
  - 移植 `fetchSkillFolderHash()` 函数
  - 移植 `getGitHubToken()` 函数
  - 修改 User-Agent 为 `wopal-cli`
  - 添加错误处理和日志

- [x] **Task 1.2**: 修改 `src/utils/metadata.ts`
  - 扩展 `SkillMetadata` 接口，新增字段：
    - `skillFolderHash?: string | null`
    - `commit?: string`
    - `ref?: string`
    - `tag?: string`
  - 更新类型导出

- [x] **Task 1.3**: 修改 `src/utils/git.ts`
  - 修改 `cloneRepo()` 返回值类型为 `{ tempDir: string; commitSha: string }`
  - 克隆后获取 commit SHA：`git.log(['-1'])`
  - 添加错误处理（获取 SHA 失败时抛出异常）

- [x] **Task 1.4**: 修改 `src/commands/download.ts`
  - 导入 `fetchSkillFolderHash` 和 `getGitHubToken`
  - 在 `downloadFromRepo()` 中：
    - 调用 `cloneRepo()` 获取 `commitSha`
    - 调用 `getGitHubToken()` 获取 Token（可选）
    - 调用 `fetchSkillFolderHash()` 获取 Tree SHA
    - 构建完整元数据，包含所有版本指纹字段
  - 添加日志输出（调试模式）

### Phase 2: 测试与验证

- [x] **Task 2.1**: 单元测试 - `skill-lock.ts`
  - 测试 `fetchSkillFolderHash()` 正常场景
  - 测试 `fetchSkillFolderHash()` 技能文件夹不存在
  - 测试 `getGitHubToken()` 环境变量优先级
  - 测试 `getGitHubToken()` gh CLI 调用

- [x] **Task 2.2**: 单元测试 - `metadata.ts`
  - 测试元数据序列化包含新字段
  - 测试元数据反序列化向后兼容

- [x] **Task 2.3**: 集成测试 - download 命令
  - 下载公开仓库技能，验证 `.source.json` 包含所有字段
  - 下载指定分支技能，验证 `ref` 字段
  - 下载不存在的技能，验证错误处理

- [x] **Task 2.4**: 手动验证
  - 下载技能后检查 `.source.json` 内容
  - 验证 `skillFolderHash` 为 40 字符 SHA
  - 验证 `commit` 为 40 字符 SHA
  - 验证 GitHub API 调用日志（调试模式）

### Phase 3: 文档更新

- [x] **Task 3.1**: 更新主规格 `openspec/specs/wopal-cli-skills-download/spec.md`
  - 同步 delta spec 的修改到主规格
  - 更新元数据需求章节

- [x] **Task 3.2**: 更新 `projects/agent-tools/AGENTS.md`
  - 在 wopal-cli 部分说明版本指纹机制
  - 添加 GitHub Token 配置说明

---

## 任务依赖关系

```
Task 1.1 (skill-lock.ts)
    │
    ├──── Task 1.2 (metadata.ts) ────┐
    │                                │
    ├──── Task 1.3 (git.ts) ─────────┼──── Task 1.4 (download.ts)
    │                                │           │
    └────────────────────────────────┘           │
                                                 │
                    ┌────────────────────────────┘
                    │
                    ▼
        Phase 2: 测试与验证
                    │
                    ▼
        Phase 3: 文档更新
```

---

## 验收标准

### 功能验收

- [x] 下载技能后 `.source.json` 包含所有版本指纹字段
- [x] `skillFolderHash` 正确反映技能文件夹的 GitHub Tree SHA
- [x] `commit` 正确记录克隆时的 commit SHA
- [x] `ref`/`tag` 正确记录用户指定的版本
- [x] 无 Token 时匿名请求正常工作
- [x] 有 Token 时认证请求正常工作
- [x] 旧版本元数据（缺少 skillFolderHash）可被优雅处理

### 质量验收

- [x] 所有单元测试通过
- [x] 所有集成测试通过
- [x] TypeScript 类型检查通过（`pnpm build`）
- [x] 代码格式化通过（`pnpm format`）
- [x] 无 console.log 残留（使用 Logger）

### 文档验收

- [x] 主规格已更新
- [x] AGENTS.md 已更新
- [x] 代码注释清晰

---

## 风险与缓解

### 风险 1: GitHub API 速率限制

**影响**：批量下载时可能触发速率限制

**缓解措施**：
- 提示用户配置 GitHub Token
- 同一仓库的多个技能共享一次 API 调用
- 错误时优雅降级（skillFolderHash 设为 null）

### 风险 2: 网络不稳定

**影响**：GitHub API 调用失败

**缓解措施**：
- API 失败不阻塞下载流程
- 记录日志便于排查
- 用户可重新下载获取完整信息

### 风险 3: 向后兼容性

**影响**：旧版本元数据导致 check/update 失败

**缓解措施**：
- check/update 命令检测缺失字段
- 提示用户重新下载
- 不强制迁移

---

## 预计工时

| 任务 | 预计时间 |
|------|---------|
| Task 1.1 - skill-lock.ts | 30 分钟 |
| Task 1.2 - metadata.ts | 15 分钟 |
| Task 1.3 - git.ts | 15 分钟 |
| Task 1.4 - download.ts | 30 分钟 |
| Task 2.1-2.3 - 测试 | 45 分钟 |
| Task 2.4 - 手动验证 | 20 分钟 |
| Task 3.1-3.2 - 文档 | 20 分钟 |
| **总计** | **约 3 小时** |
