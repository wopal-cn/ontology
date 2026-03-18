---
title: Skill Installation Lifecycle
description: Complete workflow for finding, downloading, scanning, and installing skills
---

# Skill Installation Lifecycle

## ⚠️ Critical: Shared vs Agent-Specific Skills

**Before installing, determine the skill type:**

| Type | Source Location | Install Command | Deploy Location |
|------|-----------------|-----------------|-----------------|
| **Shared** | `projects/agent-tools/skills/<name>/` | `wopal skills install /path` | `.wopal/skills/` |
| **Wopal-specific** | `projects/agent-tools/agents/wopal/skills/<name>/` | `wopal skills install /path --agent wopal` | `.wopal/agents/wopal/skills/` |

**Common mistake**: Installing Wopal-specific skills without `--agent wopal` places them in the wrong location.

## Install Commands

```bash
# From INBOX
wopal skills install skill-name

# From remote (auto download + scan)
wopal skills install owner/repo@skill-name

# From local path - SHARED skill
wopal skills install /path/to/skill

# From local path - WOPAL-SPECIFIC skill (⚠️ must use --agent)
wopal skills install /path/to/skill --agent wopal

# Clean INBOX after install
wopal skills install skill-name --rm-inbox

# Overwrite existing
wopal skills install /path/to/skill --force
```

## ⚠️ After Install: Always Verify

```bash
# Check adapter layer has the skill
ls .agents/skills/<skill-name>

# If missing or broken, run merge
wopal skills merge
```

**Merge is auto-triggered by install, but verify afterwards.**

## Find Skills

```bash
wopal skills find "query"              # Basic search
wopal skills find openspec --limit 10  # Limit results
wopal skills find "deploy*" --verify   # Verify with temp download
wopal skills find ci-cd --json         # JSON output
```

## Download to INBOX

```bash
wopal skills download owner/repo@skill-name
wopal skills download owner/repo@skill-a,skill-b  # Multiple
wopal skills download owner/repo@skill --branch dev
wopal skills download owner/repo@skill --force
```

## Security Scan

```bash
wopal skills scan skill-name
wopal skills scan --all              # All INBOX skills
wopal skills scan skill-name --json
```

Scanner checks: C2 infrastructure, reverse shells, data exfiltration, malware, known CVEs.

## Merge Skills

```bash
wopal skills merge           # Merge to adapter layer
wopal skills merge --dry-run # Preview
```

Merge combines:
- Shared skills (`.wopal/skills/`)
- Wopal-specific skills (`.wopal/agents/wopal/skills/`) — overrides shared with same name

## Manage INBOX

```bash
wopal skills inbox list
wopal skills inbox show skill-name --detail
wopal skills inbox remove skill-name
```

## Decision Guide

| User Intent | Command |
|-------------|---------|
| Find/search skills | `wopal skills find` |
| Download for review | `wopal skills download` |
| Check security | `wopal skills scan` |
| Install shared skill | `wopal skills install /path` |
| Install Wopal-specific skill | `wopal skills install /path --agent wopal` |
| Repair symlinks | `wopal skills merge` |
| View INBOX | `wopal skills inbox list` |

## Typical Sessions

| Scenario | Commands |
|----------|---------|
| Find and install remote | `find "api testing"` → `download` → `scan` → `install` |
| Install local Wopal skill | `install /path --agent wopal` → `merge` → verify |
| Browse and evaluate | `find deploy --limit 20` → `download` → `inbox show --detail` |

## Browse Online

https://skills.sh/