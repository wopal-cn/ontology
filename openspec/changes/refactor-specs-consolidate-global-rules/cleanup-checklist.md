# 重复规范清理清单

## 发现的重复定义

### 1. wopal-cli-skills-download/spec.md

**文件位置**: `openspec/specs/wopal-cli-skills-download/spec.md`

**重复内容**:
- 第 122 行：`- **AND** 所有文本使用英文`
- 第 123 行：`- **AND** 包含 SOURCE FORMAT / EXAMPLES / OPTIONS / NOTES / WORKFLOW 章节`

**对应的全局规范**: 
- `wopal-cli-cli-ux-guidelines/spec.md` 第 11 行：所有用户界面输出 SHALL 使用英文
- `wopal-cli-cli-ux-guidelines/spec.md` 帮助文档结构要求

### 2. wopal-cli-skills-scan/spec.md

**文件位置**: `openspec/specs/wopal-cli-skills-scan/spec.md`

**重复内容**:
- 第 26 行：`- **AND** 所有输出使用英文`
- 第 32 行：`- **AND** 所有输出使用英文`

**对应的全局规范**: 
- `wopal-cli-cli-ux-guidelines/spec.md` 第 11 行：所有用户界面输出 SHALL 使用英文

### 3. wopal-cli-skills-list/spec.md

**文件位置**: `openspec/specs/wopal-cli-skills-list/spec.md`

**重复内容**:
- 第 23 行：`- **AND** 所有标签使用英文`

**对应的全局规范**: 
- `wopal-cli-cli-ux-guidelines/spec.md` 第 11 行：所有用户界面输出 SHALL 使用英文

## 不需要清理的内容

以下内容虽然涉及"使用英文"，但是具体的能力需求，不是全局规范的重复：

- **wopal-cli-skills-list/spec.md** 第 17 行：`- **AND** 标题使用英文 "Skills:"` （具体输出格式要求）
- **wopal-cli-skills-inbox/spec.md** 第 25 行：`- **AND** 标题使用英文 "INBOX Skills:"` （具体输出格式要求）

## 总结

需要清理的规格：3 个
需要清理的重复定义：5 处
