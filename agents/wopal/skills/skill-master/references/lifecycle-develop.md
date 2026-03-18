---
title: Skill Development Lifecycle
description: Workflow for developing, optimizing, and deploying skills
---

# Skill Development Lifecycle

## ⚠️ Critical: Shared vs Agent-Specific Skills

| Type | Source Location | Reinstall Command |
|------|-----------------|-------------------|
| **Shared** | `projects/agent-tools/skills/<name>/` | `wopal skills install /path --force` |
| **Wopal-specific** | `projects/agent-tools/agents/wopal/skills/<name>/` | `wopal skills install /path --agent wopal --force` |

**Common mistake**: Reinstalling Wopal-specific skills without `--agent wopal` deploys to wrong location.

## Create New Skill

Use `skill-creator` for guided creation with scaffolding, validation, and optimization.

## Directory Structure

```
<skill-name>/
├── SKILL.md          # Required
├── scripts/         # If automation needed
├── references/      # Optional
└── templates/       # Optional
```

## SKILL.md Format

```yaml
---
name: skill-name
description: Description (1-1024 chars, include trigger contexts)
---
```

Optional fields: `license`, `compatibility`, `metadata`

## Naming Rules

- 1-64 chars, lowercase letters, numbers, single hyphens
- No leading/trailing `-`, no consecutive `--`
- Regex: `^[a-z0-9]+(-[a-z0-9]+)*$`
- Must match directory name

## Code Requirements

| Item | Requirement |
|------|-------------|
| Language | Python or Shell |
| Shebang | Python: `#!/usr/bin/env python` |
| Permission | `chmod +x` for scripts |
| Error handling | Return proper exit codes |

## Optimize Existing Skills

**Never edit `.agents/skills/` directly — modify source and reinstall.**

### Workflow

```bash
# 1. Find source path
cat .agents/skills/<name>/.source.json | jq -r '.source'

# 2. Determine skill type from source path:
#    - Contains "agents/wopal/skills/" → Wopal-specific
#    - Otherwise → Shared

# 3. Edit in source directory
#    - Shared: projects/agent-tools/skills/<name>/
#    - Wopal-specific: projects/agent-tools/agents/wopal/skills/<name>/

# 4. Reinstall with correct parameters
# Shared skill:
wopal skills install /path/to/shared/skill --force

# Wopal-specific skill (⚠️ must include --agent wopal):
wopal skills install /path/to/wopal/skill --agent wopal --force

# 5. Verify
ls .agents/skills/<name>
wopal skills merge  # If symlink broken
```

### Common Optimizations

| Task | Action |
|------|--------|
| Fix bugs | Edit scripts, reinstall with `--force` |
| Improve description | Update SKILL.md metadata |
| Add features | Extend scripts/SKILL.md |
| Enhance triggers | Update description keywords |

## Best Practices

- Keep SKILL.md <500 lines; move details to `references/`
- Progressive loading for complex skills
- Extract to `references/*.md` with frontmatter when large
- **Always verify after reinstall**: `ls .agents/skills/<name>`