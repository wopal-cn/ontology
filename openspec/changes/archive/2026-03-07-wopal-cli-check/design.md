## 背景依据 (Context)

`wopal` CLI 是一个使用 TypeScript、Node.js (>=20) 和 Commander.js 构建的 AI Agent 技能管理工具。我们正在引入一个名为 `wopal-cli-skills-source-tracking` 的核心能力，以便在安装或更新技能时跟踪原始的源信息。这能防止在远端未发生变更时，意外使用远程源覆盖掉用户在本地的私人修改。由于目前整个安装流程中缺乏能校验真实源码是否被更改的计算和比对机制，我们需要为此建立一套统一的版本指纹追踪方案。

## 目标 (Goals) 与非目标 (Non-Goals)

**目标:**
- 依据 Specs 规范，搭建"统一的版本指纹校验机制"以追溯技能的演进来源。
- 用这套机制在更新流程中精准拦截，防止发生意外覆写本地定制技能。
- 保证这套机制能够和底层的 `pnpm` 以及 `ESM modules` 环境完美兼容。

**非目标:**
- 我们不再重新造指纹算法的轮子，也不会重构全部的技能安装流水线。
- 不会向用户推销多余 UI，只需抛出清晰的版本冲突拦截警告。
- 不重新定义任何已在 `lock-management` 权威清单中定调的基础概念。

## 关键设计与决策 (Decisions)

### 决策 1: 版本指纹算法溯源
我们将直接依托（复用）已在 `lock-management` 规范中声明并界定的共享定义，不再自己实现或冗余声明哈希比对校验逻辑，`wopal-cli-skills-source-tracking` 功能主要作直接调用。
*原因:* 为了坚守项目规定的 "Single Source of Truth" (唯一真理源) 的架构准则，最大化降低代码耦合与重复定义的歧义风险。

### 决策 2: 变更拦截测算逻辑
当要决定是否需要发起一次"更新"时，策略并不是直接对比远程修改的时间戳，而是硬实力去比对保存的 Origin（原始源标签/哈希）与现下远程最新的 Tag / Hash。
*原因:* 哪怕没有提交，由于时区或检出方式不同，时间戳也经常漂移；而哈希是真正具备抵御篡改能力的代码特征。

### 决策 3: 并发检查策略

系统应当限制并发检查数量以避免 GitHub API 限流。

**并发控制**:
- 最大并发数: 5 个同时检查
- 失败重试: 3 次，指数退避（1s, 2s, 4s）
- 单个请求超时: 10 秒
- 总检查超时: 5 分钟

**实现方式**:
```typescript
import pLimit from 'p-limit';

const limit = pLimit(5); // 最大 5 个并发

const checkPromises = skills.map(skill => 
  limit(() => checkSkill(skill))
);

const results = await Promise.allSettled(checkPromises);
```

*原因:* GitHub API 匿名请求限制为 60 次/小时，认证请求为 5000 次/小时。并发检查可能导致限流，需要控制并发数并提供重试机制。

### 决策 4: 技能类型判断逻辑

系统应当从锁文件的 `sourceType` 字段判断技能类型，选择不同的检测方法。

**判断逻辑**:
- **WHEN** `sourceType === "github"` → 调用 `fetchSkillFolderHash(source, skillPath, token)`
- **WHEN** `sourceType === "local"` → 调用 `computeSkillFolderHash(sourceUrl)`

*原因:* 统一从锁文件字段判断，避免硬编码路径推断逻辑。

### 决策 5: 本地 Hash 计算的文件范围

系统应当计算技能文件夹内所有文件的 hash，自动排除缓存和构建目录。

**包含文件**: 所有技能源码文件

**排除目录**:
- `.git/` - Git 仓库元数据
- `node_modules/` - Node.js 依赖
- `__pycache__/` - Python 缓存
- `.pytest_cache/` - pytest 缓存
- `.ruff_cache/` - Ruff 缓存
- `dist/` - 构建输出
- `build/` - 构建输出
- `.next/` - Next.js 构建
- `.nuxt/` - Nuxt.js 构建

*原因:* 缓存和构建产物不应纳入版本指纹计算，只计算源码文件以确保准确性。

## 风险评估与权衡 (Risks / Trade-offs)

- **风险:** 一些早前已经安装的旧版技能并不包含相关的指纹跟踪元信息，直接验证会导致全部失效。
  **缓解手段 (Mitigation):** 验证系统必须优雅降级——凡是缺失指纹标志位的安装，一律被当成旧时代的遗产（Legacy installations），回滚为每次更新都必须提示用户人工二次确认。
- **风险:** 计算哈希文件指纹会拖慢命令执行的响应性能。
  **缓解手段:** 切忌扫描全网磁盘或者深度校验 node_modules 子目录。针对 `manifest` 等最能反馈特征的核心元数据去调用轻量级哈希方法。
- **风险:** GitHub API 限流导致批量检查失败。
  **缓解手段:** 
  - 限制并发数为 5 个
  - 提供 3 次重试机制（指数退避）
  - 优先使用 GitHub Token（5000 次/小时 vs 60 次/小时）
  - 单个请求超时 10 秒
- **风险:** 本地技能源码被移动或删除，导致路径无效。
  **缓解手段:** 
  - 从锁文件 `sourceUrl` 字段读取绝对路径
  - 路径不存在时标记为 "source-missing"
  - 提示用户源码已被移动或删除

## 继续开放的问题 (Open Questions)

- 是否通过引入 `--force` 绕过校验系统强行覆盖更新，或者是强制在冲突时弹出的 Terminal 选项中允许选择 `Yes to all`？
