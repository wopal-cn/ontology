---
name: skill-master
description: |
    ⚠️ MUST LOAD BEFORE any skill operation (install/update/deploy). Provides skill lifecycle commands (find/download/scan/install). Triggers on skill search, installation, INBOX management, or skill quality queries.
    When to Use: 
    - User asks to find/search for skills
    - User wants to install new capabilities
    - User mentions skills.sh catalog
    - User wants to develop or optimize a skill
    - User wants to evaluate skill quality
---

## Core Workflow

```
Find → Download → Scan → Install → Develop → Optimize → Evaluate
```

## Scenario Router

| User Intent | Reference | Primary Command |
|-------------|-----------|-----------------|
| Find/search skills | `lifecycle-install.md` | `wopal skills find` |
| Download for review | `lifecycle-install.md` | `wopal skills download` |
| Scan security | `lifecycle-install.md` | `wopal skills scan` |
| Install skill | `lifecycle-install.md` | `wopal skills install` |
| Manage INBOX | `lifecycle-install.md` | `wopal skills inbox` |
| Remove skill | `lifecycle-install.md` | `wopal skills remove` |
| Create new skill | `lifecycle-develop.md` | Use `skill-creator` |
| Optimize/fix skill | `lifecycle-develop.md` | Edit source + reinstall |
| Evaluate skill | `evaluate-skill.md` | Read reference |

## Quick Commands

```bash
# Search
wopal skills find "query"

# Download & Scan
wopal skills download owner/repo@skill
wopal skills scan skill-name

# Install
wopal skills install /path/to/skill --force

# Remove
wopal skills remove <skill-name> --force
```

## Post-Install Verification

```bash
# 检查部署
ls -la .wopal/skills/<skill-name>/SKILL.md

# 查看已安装技能
wopal skills list
```

## Evaluate Skills

**For detailed evaluation with scoring rubric, read `references/evaluate-skill.md`.**

Quick check:

```bash
ls -la <skill-path>/
wc -l <skill-path>/SKILL.md
find <skill-path> -type f
```

| Dimension | What to Check |
|-----------|---------------|
| Content | SKILL.md depth, examples, edge cases |
| Utility | Problem-solving ability |
| Executability | Scripts, clear workflow |
| Compliance | Directory/naming/metadata |
| Maintainability | Dependencies, update needs |

| Score | Action |
|-------|--------|
| ≥4 stars | Install |
| 3 stars | Backup/Fix |
| ≤2 stars | Delete |

## Tips

1. **Verify after install** — `ls .wopal/skills/<name>/SKILL.md`
2. **Edit in workspace** — `.wopal/skills/<name>/` 可直接编辑
3. **Scan before install** — Downloaded skills need explicit scan

## Browse Online

https://skills.sh/