# MEMORY.md

> [!IMPORTANT]
> - **核心定位**：工作空间内**各子项目的集体记忆库**——记录子项目的架构决策、能力变化、教训记忆。
> - **次要定位**：工作空间基础设施的重大变更（目录结构调整、宪法重构、工具链升级）。
> - **与 `.workspace.md` 的区别**：`.workspace.md` 记录"当前有什么"（目录事实），本文件记录"带来了什么能力"和"改变了什么工作方式"。
> - **不记录**：原始流水账（`memory/YYYY-MM-DD.md`）、代码技术细节（由子项目 AGENTS.md 或代码自身承载）、过程描述（做了什么、完成了什么）。
> - 维护规则详见 `AGENTS.md` 文档维护规则章节。

## 🧠 巫婆的记忆

### 架构决策

- `wopal-workspace` 采用 **Monorepo 工作空间 + 独立全栈子项目** 混合架构。
- AI 工具体系采用**三层解耦架构**：`projects/agent-tools`（源码/演进）→ `.agents/`（运行时部署站）→ `.claude/` `.opencode/`（各 Agent 平台适配）。
- **术语规范**：统一使用"子项目" (Sub-project) 代替"子模块" (Sub-module)，强调各项目的独立生命周期与 Git 历史。
- **自我进化**：确立了 Agent 通过优化 `agent-tools` 提升自身命令、规则、技能武器体系的自主权利。
- **OpenSpec 大变更拆分策略**：将复杂变更拆分为多个独立小变更（如 wopal-cli 拆分为 core、download、scan、install、check、update），提升可维护性和并行开发效率。
- **工作空间文档治理体系**：`.workspace.md` 记录目录结构事实（只陈述，不解释），`MEMORY.md` 重新定位为子项目集体记忆库（记录决策背景、里程碑、教训）。
- **Worktree 自动化管理**：新增 `scripts/worktree.sh` 脚本，实现创建、开发、提交、合并、清理的完整工作流，自动完成安全验证、依赖安装和测试。
- **OpenSpec 规格结构**：
  - **一个能力一个主规格**：`openspec/specs/<capability>/spec.md` 是独立的功能单元，不是子项目
  - **Delta 规格 vs 主规格**：`openspec/changes/<name>/specs/` 是临时增量（ADDED/MODIFIED/REMOVED），`openspec/specs/` 是持久真相源
  - **修复不创建独立规格**：如 `fix-wopal-cli-hierarchy` 只是对 `wopal-cli-core` 的修复，使用 MODIFIED 而非创建新规格
  - **示例**：wopal-cli-core 变更添加核心功能（ADDED），fix-wopal-cli-hierarchy 变更修复层级问题（MODIFIED），两者都指向同一主规格 `openspec/specs/wopal-cli-core/spec.md`

### 能力演进

- **分层记忆体系**：确立"规则归宪法、事实归地图、精华归长期、流水归短期"的分层记忆机制。
- **后台进程管理**：新增 `@wopal/process` 工具，可启动、监控、交互后台进程，`agent-orchestration` 技能现可驱动 Agent 在后台执行长任务，实现"启动后继续工作"的并行协作模式。
- **OpenSpec 协作框架**：引入 OpenSpec 作为规范驱动开发框架。OpenSpec 产物（proposal、specs、design、tasks）作为巫婆与其他 AI Agent 协作的契约，实现"巫婆规划、Agent 执行"的分工模式。
- **wopal-cli 技能管理工具**：新增 wopal-cli CLI 工具，实现 INBOX 隔离工作流（下载 → 扫描 → 评估 → 安装），提升技能管理的安全性和可维护性。
- **wopal-cli-scan 安全扫描**：实现 20 项静态安全检查（9 项严重 + 11 项警告），包含 IOC 数据库、白名单过滤、风险评分机制，支持环境变量配置和 CI/CD 集成。
- **wopal-cli-check 版本检测**：实现技能版本检测能力，支持检查远程技能（GitHub Tree SHA）和本地技能（源码 hash）的版本更新，包含并发控制（5 并发 + 3 次重试）、进度显示、JSON 输出，支持 `--local/--global` 选项。

### 关键发现

- **OpenCode 非交互模式**：权限请求会被 auto-reject；解决方案是使用 `OPENCODE_PERMISSION` 环境变量内联传递权限配置。

*(此文件应由 Wopal 在未来持续维护和丰富)*
