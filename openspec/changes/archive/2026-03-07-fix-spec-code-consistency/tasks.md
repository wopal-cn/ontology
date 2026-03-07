## 1. 环境变量命名修复

- [x] 1.1 将 wopal-cli-core 主规格中 `SKILL_INBOX_DIR` 替换为 `WOPAL_SKILL_INBOX_DIR`

## 2. 扫描失败处理逻辑修复

- [x] 2.1 将 wopal-cli-skills-install 主规格中扫描失败处理从"询问是否继续"改为硬性阻止（throw Error）

## 3. SkillMetadata 和版本指纹归一化

- [x] 3.1 在 wopal-cli-skills-lock-management 主规格中新增 SkillMetadata 接口定义（单一真相来源）
- [x] 3.2 在 wopal-cli-skills-lock-management 主规格中新增版本指纹完整机制（单一真相来源）
- [x] 3.3 将 wopal-cli-skills-install 主规格中 SkillMetadata 和版本指纹部分改为引用 wopal-cli-skills-lock-management
- [x] 3.4 将 wopal-cli-skills-download 主规格中 INBOX 元数据和版本指纹部分改为引用 wopal-cli-skills-lock-management

## 4. 规格目录与标题命名统一

- [x] 4.1 重命名主规格目录：skill-scan → wopal-cli-skills-scan, skill-install → wopal-cli-skills-install, skill-lock-management → wopal-cli-skills-lock-management
- [x] 4.2 统一 5 份主规格标题为 `# Capability: <目录名>` 格式
- [x] 4.3 更新活跃变更中的 delta spec 目录名和 Base Spec 引用路径

## 5. 验证

- [x] 5.1 逐份检查修改后的 5 份主规格，确认与 delta spec 描述一致且无遗漏
- [x] 5.2 确认所有活跃变更中的 delta spec 路径引用正确
