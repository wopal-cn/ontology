---
title: Skill Installation Lifecycle
description: Complete workflow for finding, downloading, scanning, and installing skills
---

# Skill Installation Lifecycle

## Commands

### Find Skills

```bash
wopal skills find "query"           # Basic search
wopal skills find openspec --limit 10
wopal skills find "deploy*" --verify  # Verify with temp download
wopal skills find ci-cd --json      # JSON output
```

### Download to INBOX

```bash
wopal skills download owner/repo@skill-name
wopal skills download owner/repo@skill-a,skill-b  # Multiple
wopal skills download owner/repo@skill --branch dev
wopal skills download owner/repo@skill --force
```

### Security Scan

```bash
wopal skills scan skill-name
wopal skills scan --all             # All INBOX skills
wopal skills scan skill-name --json
```

Scanner checks: C2 infrastructure, reverse shells, data exfiltration, malware, known CVEs.

### Install Skills

```bash
wopal skills install skill-name              # From INBOX
wopal skills install owner/repo@skill-name   # Remote (auto scan)
wopal skills install /absolute/path/to/skill # Local
wopal skills install skill-name --global
wopal skills install skill-name --rm-inbox   # Clean INBOX after
```

### Merge Skills

```bash
wopal skills merge          # Merge to adapter layer
wopal skills merge --dry-run
```

Merge combines: Shared (`.wopal/skills/`) + Wopal-specific (`.wopal/agents/wopal/skills/`)

### Manage INBOX

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
| Install skill | `wopal skills install` |
| Repair symlinks | `wopal skills merge` |
| View INBOX | `wopal skills inbox list` |

## Typical Sessions

| Scenario | Commands |
|----------|---------|
| Find and install | `find "api testing"` → present results → `download` → `scan` → `install` |
| Browse and evaluate | `find deploy --limit 20` → `download` → `inbox show --detail` |
| Bulk management | `scan --all` → report → `install <clean> --rm-inbox` |

## Installation Destinations

Three-layer architecture: **Source** → **Deploy** → **Adapter**

```bash
# Standard install (auto-merge)
wopal skills install /path/to/skill --skip-scan

# Agent-specific
wopal skills install /path/to/skill --agent wopal --skip-scan

# Verify
ls .agents/skills/
wopal skills merge  # Repair if needed
```

## Browse Online

https://skills.sh/