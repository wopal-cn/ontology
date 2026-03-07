## 1. 核心检查逻辑实现 (Core Check Logic)

### 1.1 锁文件读取与合并
- [x] 1.1.1 实现从项目锁读取技能列表（`readProjectLock()`）
- [x] 1.1.2 实现从全局锁读取技能列表（`readGlobalLock()`）
- [x] 1.1.3 实现合并两个锁文件并去重（优先使用项目锁）
- [x] 1.1.4 实现 `--local` 选项（只读取项目锁）
- [x] 1.1.5 实现 `--global` 选项（只读取全局锁）

### 1.2 版本指纹比对
- [x] 1.2.1 从 `SkillLockEntry.sourceType` 判断技能类型
- [x] 1.2.2 远程技能：调用 `fetchSkillFolderHash(source, skillPath, token)`
- [x] 1.2.3 本地技能：从 `sourceUrl` 读取绝对路径
- [x] 1.2.4 本地技能：调用 `computeSkillFolderHash(sourceUrl)`
- [x] 1.2.5 比对最新 hash 与锁文件 `skillFolderHash`
- [x] 1.2.6 标记技能状态（up-to-date/update-available/source-missing）

### 1.3 并发控制
- [x] 1.3.1 安装 `p-limit` 依赖（`pnpm add p-limit`）
- [x] 1.3.2 实现并发限制器（最大 5 个并发）
- [x] 1.3.3 实现失败重试机制（3 次，指数退避）
- [x] 1.3.4 实现单个请求超时（10 秒）
- [x] 1.3.5 实现总检查超时（5 分钟）

## 2. 错误处理与降级 (Error Handling)

- [x] 2.1 处理 GitHub API 限流（显示警告 + 建议使用 Token）
- [x] 2.2 处理 GitHub API 网络错误（3 次重试）
- [x] 2.3 处理本地技能路径不存在（标记 source-missing）
- [x] 2.4 处理锁文件损坏（显示错误 + 建议重新安装）
- [x] 2.5 处理 `skillFolderHash` 字段缺失（提示旧版本，建议重新下载）
- [x] 2.6 处理并发检查部分失败（显示成功/失败统计）

## 3. 用户界面与反馈 (UI and Feedback)

### 3.1 进度显示
- [x] 3.1.1 显示总技能数量（"Checking 50 skills..."）
- [x] 3.1.2 显示当前检查进度（"Checking skill 1/50: skill-name"）
- [x] 3.1.3 显示检查类型（"Fetching GitHub Tree SHA..." 或 "Computing local hash..."）
- [x] 3.1.4 显示进度百分比（"[=====>    ] 50%"）

### 3.2 报告生成
- [x] 3.2.1 实现分组显示（up-to-date / update-available / source-missing）
- [x] 3.2.2 实现技能按字母排序
- [x] 3.2.3 实现颜色标识（✓ 绿色、⚠ 黄色、✗ 红色）
- [x] 3.2.4 显示技能详细信息（名称、类型、hash 前 8 位）
- [x] 3.2.5 显示建议更新命令
- [x] 3.2.6 显示统计摘要（总数、更新数、缺失数）

## 4. 命令行参数 (CLI Options)

- [x] 4.1 实现 `wopal skills check`（检查所有技能）
- [x] 4.2 实现 `wopal skills check <skill-name>`（检查指定技能）
- [x] 4.3 实现 `--local` 选项（只检查项目级技能）
- [x] 4.4 实现 `--global` 选项（只检查全局级技能）
- [x] 4.5 实现 `--json` 选项（输出 JSON 格式报告）
- [x] 4.6 实现帮助信息（`wopal skills check --help`）

## 5. 测试与验证 (Testing)

### 5.1 单元测试
- [x] 5.1.1 测试锁文件合并逻辑
- [x] 5.1.2 测试技能类型判断逻辑
- [x] 5.1.3 测试版本指纹比对逻辑
- [x] 5.1.4 测试并发控制逻辑
- [x] 5.1.5 测试错误处理逻辑

### 5.2 集成测试
- [x] 5.2.1 测试检查远程技能（GitHub）
- [x] 5.2.2 测试检查本地技能（my-skills）
- [x] 5.2.3 测试混合检查（远程 + 本地）
- [x] 5.2.4 测试检查不存在的技能
- [x] 5.2.5 测试 GitHub API 限流处理

### 5.3 手动验证
- [x] 5.3.1 验证 `wopal skills check` 显示正确报告
- [x] 5.3.2 验证 `wopal skills check --local` 只检查项目级
- [x] 5.3.3 验证 `wopal skills check --global` 只检查全局级
- [x] 5.3.4 验证进度显示正常
- [x] 5.3.5 验证报告格式符合规格

## 6. 文档更新 (Documentation)

- [x] 6.1 更新 `projects/agent-tools/AGENTS.md`（添加 check 命令说明）
- [x] 6.2 更新命令帮助信息（`--help` 输出）
- [x] 6.3 添加使用示例到规格文档
