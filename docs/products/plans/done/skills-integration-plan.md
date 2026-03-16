# Skills CLI 整合计划 — 执行报告

> 创建日期: 2026-03-05
> 最后更新: 2026-03-08
> 状态: **进行中** — 阶段一已完成（CLI 工具开发），阶段二待启动（现有技能改造）

---

## 1. 目标与背景

### 1.1 总体目标

为 Wopal 工作空间建立统一的技能管理体系：**安全、可追踪、可协作**。

### 1.2 计划演进

| 阶段 | 日期 | 方案 | 结果 |
|------|------|------|------|
| V1 初版 | 2026-03-05 | 直接复用官方 `npx skills add` 部署 | ❌ 废弃 |
| V2 定稿 | 2026-03-06 | 独立开发 `wopal-cli`，借鉴 Skills CLI 代码 | ✅ 采纳并实施 |

**V1 废弃原因**：官方 Skills CLI 是单阶段流程（download→install），源信息在内存中传递，无法插入安全扫描环节。Wopal 的核心需求是 **三阶段隔离流程**（download → scan → install），必须独立实现。

---

## 2. 架构决策记录

### 2.1 核心技术决策

| 决策 | 结论 | 理由 |
|------|------|------|
| 依赖 vs 独立 | **完全独立**，不依赖 `npx skills` | Skills CLI 单阶段流程无法插入 scan |
| 源格式支持 | 仅支持 **GitHub + GitLab** | 简化复杂度，覆盖核心场景 |
| 锁文件设计 | **双锁文件** v3 格式 | 项目级 `./skills-lock.json` + 全局级 `~/.agents/.skill-lock.json` |
| 版本指纹 | GitHub Tree SHA + 本地 SHA-256 | 精确检测技能文件夹级变更 |
| INBOX 元数据 | `.source.json` 隐藏文件 | 跨阶段传递源信息（download → install） |
| 安全扫描 | TypeScript 移植 20 项检查 + IOC 数据库 | 深度集成，不依赖外部 shell 脚本 |
| update 命令 | **废弃，不实施** | check → download → scan → install 手动组合即可，保留人工审核环节 |

### 2.2 三阶段隔离流程（核心设计）

```
远程技能:  GitHub  → download → INBOX(.source.json) → scan → install → Agent 目录
                                                                    ↓
                                                         双锁文件更新 + 删除 INBOX

本地技能:  my-skills → install → Agent 目录
                            ↓
                   计算 SHA-256 + 双锁文件更新
```

### 2.3 保留的设计

| 功能 | 保留原因 |
|------|----------|
| INBOX 隔离工作流 | 核心安全优势：隔离 + 扫描 + 评估 |
| IOC 威胁签名数据库 | git submodule 管理，支持自动更新 |
| 本地源码追踪 | 离线友好，不依赖网络 |

### 2.4 工具链重构与废弃计划

为让 Agent 拥有一个统一的入口来操作和管理所有技能，我们将整合现有的三个主要技能：

| 旧技能/工具 | 计划处理方式 | 原因 |
|--------|----------|----------|
| `skills-research` | 🔄 **改造并重命名**（建议: `wopal-skills` 及等相关命名） | 将其作为 Agent 调用新版 `wopal skills` CLI（包含搜索、下载、扫描、安装、检查）的唯一入口，清理旧的 Python 脚本。 |
| `skill-deployer` | ❌ **彻底废弃**并移除 | 其所有安装与部署职责已由 `wopal skills install` 即将改造的新技能接管。 |
| `skill-security-scanner` | ❌ **彻底废弃**并移除 | 扫描能力已内置且硬编码在 `wopal skills scan` 命令内部。 |
| `version.json` | ⏳ **待清理** | 被双锁文件 `skills-lock.json` 与 `~/.agents/.skill-lock.json` 替代。 |
| `sync-skills.py` | ❌ **彻底废弃**并移除 | 被 `wopal skills check` 替代。 |

---

## 3. 阶段一：CLI 工具开发 ✅ 已完成

### 3.1 实现的命令

| 命令 | 文件 | 功能 | 归档日期 |
|------|------|------|----------|
| `wopal skills download` | `download.ts` (12KB) | 从 GitHub/GitLab 下载到 INBOX，记录 `.source.json` + 版本指纹 | 2026-03-06 |
| `wopal skills scan` | `scan.ts` (5KB) + `scanner/` (26项) | 20 项安全检查 + IOC 数据库 + 风险评分 | 2026-03-07 |
| `wopal skills install` | `install.ts` (8KB) | 从 INBOX/本地安装到 Agent 目录，自动扫描，更新双锁文件 | 2026-03-07 |
| `wopal skills check` | `check.ts` (10KB) | 比较版本指纹检测更新（GitHub Tree SHA / 本地 hash） | 2026-03-07 |
| `wopal skills inbox` | `inbox.ts` (3KB) | 列出/显示/删除 INBOX 中的技能 | 2026-03-06 |
| `wopal skills list` | `list.ts` (4KB) | 列出所有已安装技能 | 2026-03-06 |
| `wopal skills find` | `passthrough.ts` (1KB) | 透传到 `npx skills find`，搜索 skills.sh 生态 | 2026-03-06 |

### 3.2 归档的 OpenSpec 变更

| 变更 | 状态 |
|------|------|
| `wopal-cli-core` | ✅ 归档 2026-03-06 |
| `wopal-cli-download` | ✅ 归档 2026-03-06 |
| `fix-wopal-cli-hierarchy` | ✅ 归档 2026-03-06 |
| `fix-wopal-cli-version-fingerprint` | ✅ 归档 2026-03-07 |
| `wopal-cli-scan` | ✅ 归档 2026-03-07 |
| `wopal-cli-install` | ✅ 归档 2026-03-07 |
| `wopal-cli-check` | ✅ 归档 2026-03-07 |
| `wopal-cli-update` | ❌ 废弃 2026-03-08（手动组合 check→download→install 即可） |

### 3.3 建立的主规范

| 规范 | 说明 |
|------|------|
| `wopal-cli-core` | CLI 框架、命令层级、INBOX 管理 |
| `wopal-cli-skills-download` | 下载命令（源格式、批量、元数据） |
| `wopal-cli-skills-scan` | 安全扫描（20 项检查、IOC、风险评分） |
| `wopal-cli-skills-install` | 安装命令（自动扫描、双锁文件） |
| `wopal-cli-skills-lock-management` | 锁文件统一管理（v3 格式、版本指纹） |
| `wopal-cli-skills-source-tracking` | 源头变更追踪（check 命令逻辑） |

---

## 4. 阶段二：现有技能改造 ⏳ 待启动

### 4.1 现有状态

- **部署站** (`.agents/skills/`): 42 个已安装技能
- **旧版追踪**: 部分技能仍使用 `version.json`（如 `skill-deployer`、`agent-browser` 等）
- **旧工具仍在运行**: `skill-deployer`、`skills-research`、`skill-security-scanner` 等仍存在于部署站及源码目录。

### 4.2 改造任务清单

#### Phase 2.1: 现有技能重新安装（人工执行）

- [ ] 由用户手动执行：将现有 `projects/agent-tools/skills/download/universal/` 中的技能，重新通过 `wopal skills find/download/scan/install` 流程从网络上搜索下载并安装。
- [ ] 借由重新安装，自然建立全新的双锁文件体系及版本指纹，废弃自动迁移旧版本 `version.json` 的计划。

#### Phase 2.2: 技能工具链重构与旧工具废弃

- [ ] **重构 `skills-research` 技能**：
  - 将 `skills-research` 重命名为一个能代表整体技能管家的名称（例如: `wopal-skills`）
  - 清理其原有的 `search-skills.py` 和 `download-skills.py` 等底层 Python 脚本
  - 编写新的 `SKILL.md`，使该技能成为 Agent 调用新版本 `wopal skills` CLI (包括 `find`, `download`, `scan`, `install`, `check`) 的统一收口能力
- [ ] **废弃并移除 `skill-deployer`**：从项目中彻底移除代码并从 Agent 部署站卸载
- [ ] **废弃并移除 `skill-security-scanner`**：从项目中彻底移除代码并从 Agent 部署站卸载
- [ ] 更新技能调用规范（涵盖 `AGENTS.md`）指导 Agent 统一调用新改造的技能作为部署工作流
- [ ] 移除 `sync-skills.py` 等不再需要的零散脚本

#### Phase 2.3: 验证与文档

- [ ] 端到端测试：`find → download → scan → install → check` 完整流程
- [ ] 测试本地技能安装：`wopal skills install my-skills/<skill>`
- [ ] 测试团队协作场景：`skills-lock.json` 提交到 Git 后其他成员恢复
- [ ] 更新 `projects/agent-tools/AGENTS.md` 中的工具说明
- [ ] 更新 `.workspace.md` 反映新的技能管理架构

---

## 5. 参考文档

| 文档 | 路径 | 说明 |
|------|------|------|
| 整合研究 | `projects/agent-tools/openspec/facts.md` | Skills CLI 能力分析与对比 |
| 设计方案 | `projects/agent-tools/openspec/solution.md` | 核心技术决策和实现方案 |
| OpenSpec 指南 | `docs/openspec-guide.md` | 变更管理规范 |
| CLI 源码 | `projects/agent-tools/tools/wopal-cli/` | wopal-cli v0.1.0 |
| 主规范 | `projects/agent-tools/openspec/specs/` | 6 个 Capability 规范 |
