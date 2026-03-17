---
name: skill-master
description: Master the full skill lifecycle using wopal-cli. Use when user wants to find, download, scan, install, develop, optimize, or evaluate AI agent skills. Triggers on queries about skill search, installation, INBOX management, or skill quality evaluation.
---

# Skill Master

Manage the complete skill lifecycle with wopal-cli.

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
| Repair symlinks | `lifecycle-install.md` | `wopal skills merge` |
| Create new skill | `lifecycle-develop.md` | Use `skill-creator` |
| Optimize/fix skill | `lifecycle-develop.md` | Edit source + reinstall |
| Evaluate skill | `evaluate-skill.md` | Read reference |

## Quick Commands

```bash
wopal skills find "query"
wopal skills download owner/repo@skill
wopal skills scan skill-name
wopal skills install skill-name
wopal skills install /path/to/source --force
wopal skills list
wopal skills merge
wopal skills inbox list
```

## When to Use

- User asks to find/search for skills
- User wants to install new capabilities
- User mentions skills.sh catalog
- User wants to develop or optimize a skill
- User wants to evaluate skill quality

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

1. Scan before install — Remote sources auto-scan; INBOX skills need explicit scan
2. Use `--rm-inbox` — Keeps INBOX clean after installation
3. Never edit `.agents/skills/` — Modify source and reinstall

## Browse Online

https://skills.sh/