---
name: skill-deployer
description: This skill deploys skills from the workspace's source code directory for skill development to the corresponding agent skills directory. You should use this skill when the user requests to deploy, install, or synchronize a skill. Or, when the skill has undergone code optimization, you should inquire with the user about using this skill for installation and deployment.
---

# Skill Deployer

Deploy AI agent skills from source to target directories.

## Quick Start

```bash
# Deploy skill (copy mode)
python3 scripts/deploy-skill.py --source /path/to/my-skill --dest .agents/skills/

# Deploy with symlink (for development)
python3 scripts/deploy-skill.py --source /path/to/my-skill --dest .agents/skills/ --symlink

# List available skills in a directory
python3 scripts/list-skills.py --dir ~/my-skills
```

## Target Directories

| Agent | Project Level | Global Level |
|-------|---------------|--------------|
| Universal | `.agents/skills/` | - |
| Claude Code | `.claude/skills/` | `~/.claude/skills/` |
| OpenCode | `.opencode/skills/` | `~/.config/opencode/skills/` |
| Codex | - | `~/.codex/skills/` |

## Scripts

### deploy-skill.py

Deploy a skill from source to target directory.

```bash
python3 scripts/deploy-skill.py -s <source> -d <target> [options]
```

**Options:**
- `--source, -s` - Source directory containing SKILL.md (required)
- `--dest, -d` - Target directory (required)
- `--symlink, -l` - Create symlink instead of copying
- `--force, -f` - Overwrite existing skill
- `--name, -n` - Custom skill name (defaults to source directory name)

**INBOX Auto-Move:**
Skills deployed from `INBOX/` are automatically moved to `universal/` (sibling directory) after deployment, where `universal/` stores accepted/installed universal skills. The `version.json` will record the new source path in universal.

### list-skills.py

List all skills in a directory.

```bash
python3 scripts/list-skills.py --dir <path> [--format json]
```

## .skillignore

Skills can include a `.skillignore` file to exclude files from deployment (similar to .gitignore):

```
tests/
logs/
__pycache__/
*.pyc
```

## Version Tracking

Each deployed skill includes a `version.json` file for tracking:

```json
{
  "name": "skill-deployer",
  "source_path": "projects/ontology/skills/my-skills/skill-deployer",
  "content_hash": "a1b2c3d4...",
  "deployed_at": "2026-02-28T14:15:00Z",
  "deploy_type": "copy"
}
```

**Fields:**
- `name` - Skill name
- `source_path` - Source directory (relative to project root)
- `content_hash` - SHA256 hash of source contents
- `deployed_at` - Deployment timestamp (ISO 8601)
- `deploy_type` - `copy` or `symlink`

### sync-skills.py

Check which deployed skills have source updates:

```bash
# View sync status
python3 scripts/sync-skills.py

# Interactive update outdated skills
python3 scripts/sync-skills.py --update

# JSON output
python3 scripts/sync-skills.py --json

# Custom target directory
python3 scripts/sync-skills.py --dest ~/.claude/skills/
```

**Options:**
- `--dest, -d` - Deployed skills directory (default: `.agents/skills/`)
- `--json` - Output in JSON format
- `--update` - Interactive update for outdated skills

**Sync States:**
- `updated` - Source has changed, needs redeployment
- `unchanged` - No changes detected
- `orphaned` - Deployed but source path no longer exists
- `untracked` - No version.json (deployed before sync feature)

## Notes

- Use `--symlink` during development for live updates
- Use copy mode (default) for production deployment
- Source must contain a valid SKILL.md file
- Symlink deployments are always marked as unchanged (no hash tracking needed)
