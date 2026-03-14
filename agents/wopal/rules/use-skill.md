---
trigger: always_on
---
# 技能调用规范

## 核心原则

| 原则 | 说明 |
|------|------|
| **调用从部署层** | 必须从 `.agents/skills/<name>/` 调用已部署技能 |
| **开发在源码** | 技能修改必须在源码中完成，然后部署 |
| **禁止越界** | 不得直接从 `projects/agent-tools/skills/` 执行（测试除外） |

## 环境变量

需要环境变量的技能，执行前加载：
```bash
source "./scripts/load-env.sh"
```

## 执行方式

- **进入目录**：执行前 `cd` 进入技能目录
- **Python 脚本**：`./scripts/xxx.py` 或 `python scripts/xxx.py`
- **Shell 脚本**：`./scripts/xxx.sh` 或 `bash scripts/xxx.sh`