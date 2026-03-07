## Why

通过对 5 份主规格（wopal-cli-core, wopal-cli-skills-download, wopal-cli-skills-scan, wopal-cli-skills-install, wopal-cli-skills-lock-management）与代码实现的交叉审计，发现了环境变量命名不一致、扫描失败处理逻辑矛盾、结构定义重复散落、规格目录与标题命名不统一等问题。这些不一致会导致后续 check/update 命令开发时产生歧义，也增加了多人协作和 Agent 自动实施时出错的风险。现在是所有基础命令（download/scan/install）刚完成集成的最佳窗口期，趁技术债未积累更多之前统一修复。

## What Changes

- **修复环境变量命名**：wopal-cli-core 规格中 `SKILL_INBOX_DIR` 改为 `WOPAL_SKILL_INBOX_DIR`，与代码实现和其他规格保持一致
- **修复扫描失败处理逻辑矛盾**：wopal-cli-skills-install 规格中"扫描发现高风险 → 询问是否继续"改为与代码一致的硬性阻止（throw Error），与 wopal-cli-skills-scan 退出码语义对齐
- **消除 SkillMetadata 重复定义**：将 SkillMetadata 接口定义统一收归 wopal-cli-skills-lock-management 规格，download 和 install 规格改为引用
- **消除版本指纹逻辑重复**：将版本指纹机制（远程 GitHub Tree SHA / 本地 SHA-256）的权威定义收归 wopal-cli-skills-lock-management 规格，download 和 install 规格改为引用
- **统一规格目录与标题命名**：将 skill-scan、skill-install、skill-lock-management 重命名为 wopal-cli-skills-scan、wopal-cli-skills-install、wopal-cli-skills-lock-management；统一所有规格标题为 `# Capability: <name>` 格式

## Capabilities

### New Capabilities

（无新增能力）

### Modified Capabilities

- `wopal-cli-core`: 环境变量 `SKILL_INBOX_DIR` → `WOPAL_SKILL_INBOX_DIR`；标题改为 `# Capability: wopal-cli-core`
- `wopal-cli-skills-install`: 移除扫描失败"询问是否继续"逻辑，改为硬性阻止；SkillMetadata 和版本指纹部分改为引用 wopal-cli-skills-lock-management；目录从 skill-install 重命名
- `wopal-cli-skills-lock-management`: 新增 SkillMetadata 接口定义作为单一真相来源；整合版本指纹完整定义；目录从 skill-lock-management 重命名
- `wopal-cli-skills-download`: 版本指纹获取细节改为引用 wopal-cli-skills-lock-management；标题从 skill-download 修正
- `wopal-cli-skills-scan`: 目录从 skill-scan 重命名；标题修正

## Impact

- **规格文件**：5 份主规格需要修改（wopal-cli-core, wopal-cli-skills-install, wopal-cli-skills-lock-management, wopal-cli-skills-download, wopal-cli-skills-scan）
- **代码文件**：无需修改（代码实现已经是正确的，本次是将规格对齐到代码）
- **API/接口**：无变化
- **依赖关系**：无变化
