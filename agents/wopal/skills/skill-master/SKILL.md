---
name: skill-master
description: Master the full skill lifecycle using wopal-cli. Use this skill when user wants to find, download, scan, install, or manage AI agent skills. Triggers on queries about searching skills, installing new capabilities, browsing skill catalogs, or managing the INBOX.
---

# Skill Master

Manage the complete skill lifecycle with wopal-cli: find, download, scan, install, and manage skills.

## When to Use

- User asks to find/search for skills ("find a skill for X")
- User wants to install new skills or capabilities
- User mentions skills.sh or browsing skill catalogs
- User asks about available skills for a domain (testing, deployment, etc.)
- User wants to review or manage INBOX skills

## Core Workflow

```
1. Find      → wopal skills find <query>
2. Download  → wopal skills download <source>
3. Scan      → wopal skills scan <skill-name>
4. Install   → wopal skills install <skill-name>
```

## Commands

### Find Skills

Search skills.sh catalog:

```bash
# Basic search
wopal skills find "react testing"

# Limit results
wopal skills find openspec --limit 10

# Verify results (attempt temp download)
wopal skills find "deploy*" --verify

# JSON output for programmatic use
wopal skills find ci-cd --json
```

### Download to INBOX

Download skills for review before installation:

```bash
# GitHub source
wopal skills download owner/repo@skill-name

# Multiple skills
wopal skills download owner/repo@skill-a,skill-b

# Specific branch or tag
wopal skills download owner/repo@skill --branch dev
wopal skills download owner/repo@skill --tag v1.0.0

# Overwrite existing
wopal skills download owner/repo@skill --force
```

### Security Scan

Scan INBOX skills before installation:

```bash
# Scan single skill
wopal skills scan skill-name

# Scan all INBOX skills
wopal skills scan --all

# JSON output
wopal skills scan skill-name --json

# Skip auto-update, force rescan
wopal skills scan skill-name --no-update --force
```

Scanner checks for:
- C2 infrastructure patterns
- Reverse shells
- Data exfiltration
- Malware characteristics
- Known CVEs

### Install Skills

```bash
# From INBOX (after scan)
wopal skills install skill-name

# Remote source (auto download + scan)
wopal skills install owner/repo@skill-name

# Local path
wopal skills install /absolute/path/to/skill

# Global installation
wopal skills install skill-name --global

# Agent-specific installation
wopal skills install skill-name --agent wopal

# Remove from INBOX after install
wopal skills install skill-name --rm-inbox
```

**Note**: Space-level installations automatically merge skills to the adapter layer (`.agents/skills/`). No manual symlink needed.

### Merge Skills

Manually trigger adapter layer merge (usually auto-triggered by install):

```bash
# Merge all skills to adapter layer
wopal skills merge

# Preview without changes
wopal skills merge --dry-run
```

Merge combines:
- Shared skills (`.wopal/skills/`)
- Wopal-specific skills (`.wopal/agents/wopal/skills/`) — overrides shared with same name

### Manage INBOX

```bash
# List downloaded skills
wopal skills inbox list

# Show skill details
wopal skills inbox show skill-name
wopal skills inbox show skill-name --detail

# Remove from INBOX
wopal skills inbox remove skill-name
```

## Typical Sessions

### Session 1: Find and Install

```
User: "I need a skill for API testing"
→ wopal skills find "api testing"
→ Present results, recommend best match
→ User selects: "install the first one"
→ wopal skills download owner/repo@skill
→ wopal skills scan skill
→ wopal skills install skill
```

### Session 2: Browse and Evaluate

```
User: "What skills are available for deployment?"
→ wopal skills find deploy --limit 20
→ Present categorized results
→ User: "download the kubernetes one for review"
→ wopal skills download owner/repo@k8s-deploy
→ wopal skills inbox show k8s-deploy --detail
→ User reviews and decides
```

### Session 3: Bulk Management

```
User: "Scan all my downloaded skills"
→ wopal skills scan --all
→ Report results, flag issues
→ User: "install the clean ones"
→ For each clean skill: wopal skills install <name> --rm-inbox
```

## Decision Guide

| User Intent | Command |
|-------------|---------|
| "Find/search skills" | `wopal skills find` |
| "Download for review" | `wopal skills download` |
| "Check security" | `wopal skills scan` |
| "Install skill" | `wopal skills install` |
| "Repair/rebuild symlinks" | `wopal skills merge` |
| "What's in INBOX?" | `wopal skills inbox list` |
| "Show skill details" | `wopal skills inbox show` |

## Installation Destinations

Skills follow a three-layer deployment architecture: **Source** → **Deploy** → **Adapter**.

### Key Principle

Paths vary by workspace. Use `wopal skills install` with appropriate options — the CLI handles destination routing and adapter layer merge.

### Installation Commands

```bash
# Standard install (auto-merge to adapter layer)
wopal skills install /absolute/path/to/skill --skip-scan

# Agent-specific install
wopal skills install /absolute/path/to/skill --agent <agent-name> --skip-scan

# Overwrite existing
wopal skills install <source> --force
```

### Post-Install Verification

After installation, verify the skill is visible:

```bash
# Check adapter layer
ls .agents/skills/

# Or use merge to repair/rebuild
wopal skills merge
```

## Tips

1. **Always scan before install** — Remote sources auto-scan, but INBOX skills need explicit scan
2. **Use --rm-inbox** — Keeps INBOX clean after installation
3. **Verify search results** — `--verify` confirms skills are downloadable
4. **JSON for scripting** — `--json` output enables programmatic processing
5. **Merge repairs adapter layer** — Use `wopal skills merge` to rebuild symlinks if needed

## Browse Online

https://skills.sh/
