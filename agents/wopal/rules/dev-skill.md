---
trigger: model_decision
description: 用户要求开发、创建、部署、优化技能时，严格遵循此流程规范。
keywords:
  - '*开发*技能*'
  - '*实现*技能*'
  - '*创建*技能*'
  - '*添加*技能*'
  - '*部署*技能*'
  - '*优化*技能*'
  - '*测试*技能*'
  - '实现 skill'
  - 'develop skill'
  - 'deploy skill'
---

# 技能开发规范

## 开发工具

| 场景 | 工具 |
|------|------|
| 新建技能 | `skill-creator` |
| 搜索获取 | `skills-research` |
| 部署技能 | `skill-deployer` |

## 目录结构

```
<skill-name>/
├── SKILL.md          # 技能说明（必需）
├── scripts/          # 可执行脚本（必需）
└── examples/         # 使用示例（可选）
```

## SKILL.md 格式

```yaml
---
name: skill-name
description: 技能描述（1-1024 字符）
---
```

可选字段：`license`、`compatibility`、`metadata`

## 命名规则

- 1-64 字符，小写字母、数字、单连字符
- 禁止 `-` 开头/结尾，禁止连续 `--`
- 必须与目录名一致
- 正则：`^[a-z0-9]+(-[a-z0-9]+)*$`

## 代码要求

- 使用 Python 或 Shell 编写
- Python 脚本需 `#!/usr/bin/env python` 声明
- 赋予执行权限（`chmod +x`）
- 异常处理并返回正确退出码

## 现有技能优化

**⚠️ 严禁直接修改 `.agents/skills/` 中的已部署文件。**

### 流程

1. **定位源码**：查看 `version.json` 中的 `source_path`
   ```bash
   cat .agents/skills/<skill-name>/version.json | jq -r '.source_path'
   ```

2. **修改源码**：在源码目录进行开发

