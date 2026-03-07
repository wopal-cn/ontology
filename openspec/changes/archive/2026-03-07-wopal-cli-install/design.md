## Context

**背景**：wopal-cli 需要实现技能安装功能，将技能从 INBOX（远程下载后）或 my-skills（本地开发）安装到 Agent 目录。这是 wopal-cli 项目的 Phase 2 核心命令之一，download 命令已完成。

**当前状态**：
- ✅ download 命令已实现，技能下载到 `INBOX/<skill>/` 并保存 `.source.json` 元数据
- ✅ scan 命令已实现，支持安全扫描
- ⏳ install 命令待实现，需要处理双锁文件管理

**约束**：
1. 复用 Skills CLI 的锁文件管理代码（skill-lock.ts, local-lock.ts, installer.ts）
2. 锁文件格式与 Skills CLI 兼容（但统一为 v3）
3. 依赖 wopal-cli-core 的 Logger 系统和 INBOX 路径管理
4. 依赖 wopal-cli-download 的 `.source.json` 元数据格式

**利益相关者**：
- 终端用户：安装技能到项目或全局
- AI Agent：自动化批量安装和更新
- 开发者：本地开发技能并安装

## Goals / Non-Goals

**Goals:**

1. **实现 install 命令**：从 INBOX 或 my-skills 安装技能到 Agent 目录
2. **双锁文件管理**：项目级和全局级锁文件都使用 v3 格式，统一管理
3. **版本指纹追踪**：记录技能的版本指纹（远程=GitHub Tree SHA，本地=SHA-256）
4. **自动安全扫描**：INBOX 技能默认自动扫描，本地技能无需扫描
5. **AI Agent 友好**：提供清晰的命令格式和详细的 help 信息

**Non-Goals:**

1. **Symlink 模式**：本次只实现 copy 模式，symlink 留做未来扩展
2. **批量安装**：不支持通配符或批量安装（可后续添加）
3. **依赖解析**：不处理技能间的依赖关系
4. **版本回退**：不支持回退到旧版本（可后续添加）
5. **自动更新**：update 命令独立实现，不属于 install 范围

## Decisions

### Decision 1: 统一锁文件格式为 v3

**选择**：项目级和全局级锁文件都使用 v3 格式（而非 Skills CLI 的项目级 v1 + 全局级 v3）

**理由**：
- ✅ 简化代码：一套锁文件管理逻辑，减少维护成本
- ✅ 便于迁移：项目级技能可以轻松升级到全局级
- ✅ 格式统一：便于未来实现 update 命令（跨范围更新）
- ✅ 减少混淆：开发者不需要记忆两套格式

**替代方案**：
- ❌ 完全兼容 Skills CLI（项目级 v1 + 全局级 v3）
  - 缺点：需要维护两套逻辑，增加复杂度
  - 缺点：Skills CLI 可能是历史遗留问题，我们采用更简洁的设计

**实现细节**：
- 项目锁 `./skills-lock.json` 和全局锁 `~/.agents/.skill-lock.json` 都使用 `SkillLockEntry` 接口
- 唯一差异：全局锁包含 `dismissed` 字段（用于记录用户忽略的提示）
- 项目锁技能按字母排序（减少 Git 合并冲突）

### Decision 2: 复制 Skills CLI 代码而非重写

**选择**：直接复制 Skills CLI 的核心代码（skill-lock.ts, local-lock.ts, installer.ts）

**理由**：
- ✅ 经过验证：Skills CLI 代码已经在生产环境验证
- ✅ 兼容性保证：锁文件格式完全兼容
- ✅ 节省时间：避免重复造轮子
- ✅ 易于维护：可以同步 Skills CLI 的更新

**替代方案**：
- ❌ 从零重写锁文件管理
  - 缺点：需要重新测试所有边界情况
  - 缺点：可能引入新 bug
- ❌ 使用 npm 包依赖 Skills CLI
  - 缺点：Skills CLI 没有发布为 npm 包
  - 缺点：版本耦合问题

**实现细节**：
- 复制文件：`skill-lock.ts`, `local-lock.ts`, `installer.ts`, `agents.ts`
- 修改：`local-lock.ts` 的版本从 v1 改为 v3（统一格式）
- 保留：`computeSkillFolderHash()` 和 `fetchSkillFolderHash()` 函数

### Decision 3: INBOX 技能默认自动扫描

**选择**：安装 INBOX 技能时默认执行安全扫描，提供 `--skip-scan` 跳过

**理由**：
- ✅ 安全优先：远程代码存在安全风险，默认扫描保护用户
- ✅ 用户体验：自动扫描比手动扫描更方便
- ✅ 灵活性：`--skip-scan` 提供快速安装选项

**替代方案**：
- ❌ 不自动扫描，要求用户手动 scan
  - 缺点：用户可能忘记扫描，增加安全风险
  - 缺点：增加操作步骤
- ❌ 强制扫描，无法跳过
  - 缺点：降低灵活性，某些场景（如离线环境）无法安装

**实现细节**：
- INBOX 技能：默认调用 `wopal skills scan <skill-name>`
- 本地技能：跳过扫描（已在用户控制下）
- 扫描失败：显示警告，询问用户是否继续

### Decision 4: 版本指纹机制（远程 vs 本地）

**选择**：根据技能来源使用不同的版本指纹计算方式，但字段名统一为 `skillFolderHash`

**理由**：
- ✅ 远程技能：GitHub Tree SHA 是官方标准，精确追踪文件变化
- ✅ 本地技能：SHA-256 基于文件内容，适合本地开发
- ✅ 字段统一：无论全局还是项目级，都使用 `skillFolderHash`
- ✅ 更新检测：未来 update 命令可以基于指纹检测变化

**替代方案**：
- ❌ 统一使用 SHA-256（包括远程技能）
  - 缺点：无法利用 GitHub Tree SHA 的官方追踪能力
  - 缺点：与 Skills CLI 不兼容
- ❌ 分别使用 skillFolderHash（全局）和 computedHash（项目）
  - 缺点：增加代码复杂度
  - 缺点：与 Decision 1（统一格式）冲突

**实现细节**：
- 远程技能：从 `.source.json` 读取 `skillFolderHash`，如缺失调用 `fetchSkillFolderHash()`
- 本地技能：调用 `computeSkillFolderHash()` 计算 SHA-256
- 锁文件：全局锁和项目锁都存储在 `skillFolderHash` 字段

### Decision 5: Copy 模式优先，Symlink 留做未来

**选择**：本次只实现 copy 模式，symlink 模式返回错误提示

**理由**：
- ✅ 简单可靠：copy 模式无需处理符号链接的跨平台问题
- ✅ 隔离性好：每个安装的技能独立，不受源变化影响
- ✅ 易于理解：用户不需要理解符号链接的概念
- ✅ 时间优先：Phase 2 需要快速交付核心功能

**替代方案**：
- ❌ 同时实现 copy 和 symlink
  - 缺点：增加实现复杂度
  - 缺点：symlink 在 Windows 上有兼容性问题
  - 缺点：需要处理符号链接失败的回退逻辑
- ❌ 只实现 symlink
  - 缺点：跨平台兼容性问题
  - 缺点：某些环境不支持符号链接

**实现细节**：
- 默认模式：copy
- `--mode symlink`：显示错误 "symlink mode is not implemented yet"
- 未来扩展：在 Phase 3 或后续版本实现 symlink 模式

## Risks / Trade-offs

### Risk 1: Skills CLI 代码兼容性问题

**风险**：复制的 Skills CLI 代码可能与 wopal-cli 的 TypeScript 配置或依赖版本不兼容

**缓解措施**：
- ✅ 逐文件复制并验证编译通过
- ✅ 运行单元测试确保功能正确
- ✅ 使用相同的依赖版本（如 fs-extra, picocolors）
- ✅ 修改 local-lock.ts 的版本号从 v1 改为 v3

**回退方案**：
- 如果兼容性问题严重，可以重写特定函数
- 保持与 Skills CLI 的锁文件格式兼容（v3）

### Risk 2: 锁文件格式迁移问题

**风险**：如果用户已有 Skills CLI 的 v1 项目锁文件，格式不兼容

**缓解措施**：
- ✅ 在读取锁文件时检测版本号
- ✅ 如果版本 < 3，返回空锁文件并提示重新安装
- ✅ 文档中说明迁移步骤（删除旧锁文件，重新安装）

**影响范围**：
- 仅影响从 Skills CLI 迁移到 wopal-cli 的用户
- 新用户不受影响

### Risk 3: INBOX 清理策略可能误删

**风险**：安装成功后删除 INBOX/<skill>，可能误删用户需要的内容

**缓解措施**：
- ✅ 只删除成功安装的技能（检查返回值）
- ✅ 删除前验证目标目录存在（`.agents/skills/<skill>/`）
- ✅ 提供详细日志（Logger -d 模式）
- ✅ 文档说明 INBOX 是临时区，安装后会删除

**用户指导**：
- 如果需要保留源代码，建议使用本地技能安装（my-skills）
- INBOX 仅用于远程下载的临时存储

### Risk 4: 版本指纹获取失败

**风险**：`.source.json` 不包含 `skillFolderHash` 且 `fetchSkillFolderHash()` 调用失败（网络问题、API 限制）

**缓解措施**：
- ✅ 回退机制：如果获取失败，使用空字符串作为指纹
- ✅ 日志警告：在 debug 模式下输出警告
- ✅ 不阻塞安装：允许安装继续，只是版本追踪不精确
- ✅ 未来优化：download 命令应该在下载时获取并保存指纹

**影响**：
- 更新检测可能不准确（false positive）
- 用户可以手动运行 update 命令强制更新

### Trade-off 1: 统一 v3 格式 vs 兼容 Skills CLI

**权衡**：采用统一 v3 格式，与 Skills CLI 的项目级 v1 格式不兼容

**优点**：
- 简化代码逻辑
- 便于未来维护和扩展

**缺点**：
- 从 Skills CLI 迁移需要重新安装技能
- 锁文件格式不兼容

**决策理由**：简化设计优先，迁移成本可接受（一次性操作）

### Trade-off 2: 自动扫描 vs 安装速度

**权衡**：INBOX 技能默认自动扫描，增加安装时间

**优点**：
- 提高安全性
- 保护用户免受恶意代码

**缺点**：
- 安装时间增加（扫描需要几秒）
- 某些场景（离线、CI/CD）可能不需要扫描

**决策理由**：安全优先，提供 `--skip-scan` 满足快速安装需求

### Trade-off 3: Copy 模式 vs 磁盘空间

**权衡**：copy 模式占用更多磁盘空间（每个安装都是完整副本）

**优点**：
- 隔离性好，不受源变化影响
- 跨平台兼容性好

**缺点**：
- 磁盘空间占用大（特别是大型技能）
- 更新时需要重新复制

**决策理由**：Phase 2 优先实现简单可靠的 copy 模式，未来可添加 symlink 优化

## Migration Plan

### 部署步骤

1. **Phase 1: 复制核心代码**
   - 复制 `skill-lock.ts`, `local-lock.ts`, `installer.ts`, `agents.ts`
   - 修改 `local-lock.ts` 版本号为 v3
   - 验证编译通过

2. **Phase 2: 实现 install 命令**
   - 实现命令行参数解析
   - 实现源类型识别（INBOX vs 本地路径）
   - 实现安装逻辑（copy 模式）

3. **Phase 3: 集成扫描和锁文件更新**
   - 集成 scan 命令（自动扫描）
   - 实现双锁文件更新
   - 实现 INBOX 清理

4. **Phase 4: 测试和文档**
   - 编写单元测试
   - 编写 help 信息
   - 更新文档

### 回滚策略

如果发现严重问题：
1. 回退代码到上一个稳定版本
2. 删除新创建的锁文件（如果格式错误）
3. 重新安装技能（使用旧版本）

### 兼容性保证

- ✅ 与 Skills CLI 的全局锁文件格式兼容（v3）
- ⚠️ 与 Skills CLI 的项目锁文件格式不兼容（v1 vs v3）
- ✅ 与 wopal-cli-core 和 wopal-cli-download 的接口兼容
