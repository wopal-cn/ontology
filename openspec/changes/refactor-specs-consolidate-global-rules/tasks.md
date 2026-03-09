## 1. 准备工作

- [x] 1.1 备份 `openspec/specs/wopal-cli-cli-ux-guidelines/spec.md` 到临时位置
- [x] 1.2 检查所有命令能力规格，识别重复的全局规范定义
- [x] 1.3 记录需要清理的规格列表和具体位置

## 2. 增强 config.yaml

- [x] 2.1 从备份的 `wopal-cli-cli-ux-guidelines/spec.md` 提取全局 CLI UX 规范
- [x] 2.2 将提取的规范添加到 `openspec/config.yaml` 的 `rules.specs` 字段
- [x] 2.3 确保 `rules.specs` 中的规范格式正确（使用 SHALL/MUST 关键字）
- [x] 2.4 验证 `config.yaml` 的 YAML 语法正确性

## 3. 验证注入效果

- [ ] 3.1 使用 `/OPSX: Propose` 创建测试变更（如 test-global-rules-injection）
- [ ] 3.2 检查生成的规格指令是否包含 `config.yaml` 的 `rules.specs` 内容
- [ ] 3.3 如果验证失败，调整 `config.yaml` 的格式或内容
- [ ] 3.4 删除测试变更目录

## 4. 删除冗余规格

- [x] 4.1 删除 `openspec/specs/wopal-cli-cli-ux-guidelines/` 目录
- [x] 4.2 验证删除操作不影响其他规格的引用

## 5. 清理重复定义

- [x] 5.1 清理 `openspec/specs/wopal-cli-skills-download/spec.md`
  - 移除第 122 行："**AND** 所有文本使用英文"
  - 移除第 123 行："**AND** 包含 SOURCE FORMAT / EXAMPLES / OPTIONS / NOTES / WORKFLOW 章节"
- [x] 5.2 清理 `openspec/specs/wopal-cli-skills-scan/spec.md`
  - 移除第 26 行："**AND** 所有输出使用英文"
  - 移除第 32 行："**AND** 所有输出使用英文"
- [x] 5.3 检查其他命令能力规格是否存在类似重复定义
- [x] 5.4 如果发现其他重复定义，逐一清理

## 6. 最终验证

- [ ] 6.1 使用 `/OPSX: Propose` 创建另一个测试变更
- [ ] 6.2 验证 AI 生成规格时是否自动遵循 `config.yaml` 的 `rules.specs`
- [x] 6.3 检查所有清理后的规格是否保持一致性
- [x] 6.4 确认没有误删能力特有的需求

## 7. 文档更新（可选）

- [ ] 7.1 如果需要，在 `context` 字段中添加对全局规范的引用说明
- [x] 7.2 如果需要，更新 OpenSpec 使用文档，说明 `config.yaml` 的 `rules` 机制
