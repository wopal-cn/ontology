---
name: skill-master
description: ⚠️ MUST LOAD BEFORE any skill operation (install/update/deploy). Provides skill lifecycle commands (find/download/scan/install). Triggers on skill search, installation, INBOX management, or skill quality queries.
---

# Skill Master

## ⚠️ Critical: Shared vs Agent-Specific Skills

| Type | Path Pattern | Install Command |
|------|--------------|-----------------|
| **Shared** | Does NOT contain `agents/<agent>/skills/` | `wopal skills install /path` |
| **Agent-specific** | Contains `agents/<agent>/skills/` | `wopal skills install /path --agent <agent>` |

**Common mistake**: Forgetting `--agent <agent>` when installing agent-specific skills.

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
# Search
wopal skills find "query"

# Download & Scan
wopal skills download owner/repo@skill
wopal skills scan skill-name

# Install - shared skill
wopal skills install /path/to/skill --force

# Install - agent-specific skill (⚠️ use --agent)
wopal skills install /path/to/skill --agent <agent> --force

# Verify & Repair
wopal skills list
wopal skills merge
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

1. **Determine skill type first** — Check if source path contains `agents/<agent>/skills/`
2. **Use `--agent <agent>` for agent-specific skills** — Otherwise deploys to wrong location
3. **Verify after install** — `ls .agents/skills/<name>` and `wopal skills merge` if needed
4. **Never edit `.agents/skills/`** — Modify source and reinstall
5. **Scan before install** — Remote sources auto-scan; INBOX skills need explicit scan

## Browse Online

https://skills.sh/