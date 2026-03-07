## 1. 复制核心代码

- [x] 1.1 复制 skill-lock.ts（全局锁文件管理）
- [x] 1.2 复制 local-lock.ts（项目锁文件管理）
- [x] 1.3 修改 local-lock.ts 版本号从 v1 改为 v3
- [x] 1.4 复制 installer.ts（安装逻辑，copy 相关部分）
- [x] 1.5 复制 agents.ts（Agent 定义和路径管理）
- [x] 1.6 复制 computeSkillFolderHash() 函数（本地技能版本指纹）
- [x] 1.7 复制 fetchSkillFolderHash() 函数（远程技能版本指纹）
- [x] 1.8 验证所有复制的代码编译通过

## 2. 实现锁文件类型定义

- [x] 2.1 创建 types/lock.ts
- [x] 2.2 定义 SkillLockEntry 接口（v3 格式）
- [x] 2.3 定义 SkillLockFile 接口（全局锁）
- [x] 2.4 定义 LocalSkillLockFile 接口（项目锁，v3 格式）
- [x] 2.5 导出所有锁文件相关类型

## 3. 实现锁文件管理器

- [x] 3.1 创建 utils/lock-manager.ts
- [x] 3.2 实现 readGlobalLock() - 读取全局锁文件
- [x] 3.3 实现 writeGlobalLock() - 写入全局锁文件
- [x] 3.4 实现 readProjectLock() - 读取项目锁文件
- [x] 3.5 实现 writeProjectLock() - 写入项目锁文件（字母排序）
- [x] 3.6 实现 addSkillToBothLocks() - 同时更新两个锁文件
- [x] 3.7 实现原子写入（临时文件 + 重命名）
- [x] 3.8 实现锁文件版本检测（< v3 返回空）

## 4. 实现 install 命令基础结构

- [x] 4.1 创建 commands/install.ts
- [x] 4.2 定义命令行参数（source, -g, --force, --skip-scan, --mode）
- [x] 4.3 实现源类型识别（INBOX vs 本地路径）
- [x] 4.4 集成 Logger 系统（支持 -d/--debug）
- [x] 4.5 实现错误处理和用户提示

## 5. 实现 INBOX 技能安装逻辑

- [x] 5.1 检查 INBOX/<skill> 是否存在
- [x] 5.2 读取 INBOX/<skill>/.source.json 元数据
- [x] 5.3 提取 skillFolderHash（如缺失调用 fetchSkillFolderHash）
- [x] 5.4 验证 SKILL.md 文件存在
- [x] 5.5 检查目标目录是否已存在同名技能
- [x] 5.6 显示警告或使用 --force 覆盖

## 6. 实现本地技能安装逻辑

- [x] 6.1 验证本地路径是否存在
- [x] 6.2 验证 SKILL.md 文件存在
- [x] 6.3 计算 skillFolderHash（computeSkillFolderHash）
- [x] 6.4 检查目标目录是否已存在同名技能
- [x] 6.5 显示警告或使用 --force 覆盖

## 7. 实现 copy 安装模式

- [x] 7.1 实现目标路径生成（项目级 vs 全局级）
- [x] 7.2 实现目录清理和创建（cleanAndCreateDirectory）
- [x] 7.3 实现技能文件复制（排除 .git, node_modules, metadata.json）
- [x] 7.4 验证复制成功
- [x] 7.5 返回安装路径

## 8. 集成安全扫描

- [x] 8.1 实现 INBOX 技能自动扫描逻辑
- [x] 8.2 调用 wopal skills scan <skill-name>
- [x] 8.3 解析扫描结果
- [x] 8.4 显示扫描结果到控制台
- [x] 8.5 高风险问题显示警告并询问用户
- [x] 8.6 实现 --skip-scan 跳过扫描
- [x] 8.7 本地技能跳过扫描

## 9. 实现锁文件更新

- [x] 9.1 构建锁文件条目（SkillLockEntry）
- [x] 9.2 设置 source, sourceType, sourceUrl, skillPath
- [x] 9.3 设置 skillFolderHash（远程或本地）
- [x] 9.4 设置 installedAt, updatedAt 时间戳
- [x] 9.5 调用 addSkillToBothLocks() 更新两个锁文件
- [x] 9.6 验证锁文件写入成功

## 10. 实现 INBOX 清理

- [x] 10.1 验证技能安装成功
- [x] 10.2 删除 INBOX/<skill> 目录
- [x] 10.3 记录删除日志（debug 模式）
- [x] 10.4 处理删除失败（显示警告但不阻塞）

## 11. 实现 list 命令

- [x] 11.1 创建 commands/list.ts
- [x] 11.2 读取项目锁文件和全局锁文件
- [x] 11.3 合并技能列表（去重）
- [x] 11.4 格式化输出（名称、源头、安装时间、范围）
- [x] 11.5 实现 --local 选项（只显示项目级）
- [x] 11.6 实现 --global 选项（只显示全局级）
- [x] 11.7 处理锁文件不存在的情况

## 12. 实现 help 信息

- [x] 12.1 编写 install 命令 help 信息（AI Agent 友好）
- [x] 12.2 包含命令格式说明
- [x] 12.3 包含参数说明（-g, --force, --skip-scan, --mode）
- [x] 12.4 包含示例（INBOX 安装、本地安装、全局安装）
- [x] 12.5 包含注意事项（锁文件、INBOX 清理）
- [x] 12.6 编写 list 命令 help 信息

## 13. 集成到 CLI 主入口

- [x] 13.1 在 src/index.ts 注册 install 命令
- [x] 13.2 在 src/index.ts 注册 list 命令
- [x] 13.3 验证命令行参数解析正确
- [x] 13.4 验证 -h/--help 显示 help 信息

## 14. 单元测试

- [x] 14.1 测试源类型识别（INBOX vs 本地路径）
- [x] 14.2 测试锁文件读取和写入
- [x] 14.3 测试锁文件版本检测（< v3 返回空）
- [x] 14.4 测试 computeSkillFolderHash() 函数
- [x] 14.5 测试 fetchSkillFolderHash() 函数（mock GitHub API）
- [x] 14.6 测试 copy 安装模式
- [x] 14.7 测试 INBOX 清理逻辑
- [x] 14.8 测试已存在技能的警告和覆盖

## 15. 集成测试

- [x] 15.1 测试从 INBOX 安装技能（项目级）
- [x] 15.2 测试从 INBOX 安装技能（全局级）
- [x] 15.3 测试从本地路径安装技能
- [x] 15.4 测试 --force 覆盖已存在技能
- [x] 15.5 测试 --skip-scan 跳过扫描
- [x] 15.6 测试锁文件更新（双锁文件）
- [x] 15.7 测试 list 命令列出技能
- [x] 15.8 测试 Logger 输出（-d 模式）

## 16. 文档和验证

- [x] 16.1 更新 README.md 添加 install 和 list 命令说明
- [x] 16.2 验证所有 Verification 清单项（proposal.md）
- [x] 16.3 运行 lint 和 typecheck
- [x] 16.4 运行所有测试
- [x] 16.5 手动测试典型工作流（download → scan → install → list）
