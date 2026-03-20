---
name: skills-research
description: Search and download AI agent skills from the skills.sh ecosystem. Use when user wants to find skills, download skills to INBOX for evaluation, or explore available skills from GitHub repositories.
---

# Skills Research

Search and download AI agent skills from the skills.sh ecosystem.

## When to Use This Skill

Use this skill when the user:

- Asks "how do I do X" where X might be a common task with an existing skill
- Says "find a skill for X" or "is there a skill for X"
- Wants to download skills for evaluation before deployment
- Wants to search for tools, templates, or workflows
- Mentions they wish they had help with a specific domain (design, testing, deployment, etc.)

## Scripts

### search-skills.py

Search for skills from the skills.sh ecosystem.

```bash
# Basic search
./scripts/search-skills.py "react testing"

# JSON output (for programmatic use)
./scripts/search-skills.py "install skill" --json
```

**Options:**
- `query` - Search keywords (required)
- `--json, -j` - Output as JSON format

### download-skill.py

Download skills from GitHub to local INBOX directory.

```bash
# Download by skill identifier
./scripts/download-skill.py vercel-labs/agent-skills@vercel-react-best-practices

# Download from GitHub URL
./scripts/download-skill.py https://github.com/vercel-labs/agent-skills/tree/main/skills/vercel-react-best-practices

# Specify destination
./scripts/download-skill.py owner/repo@skill --dest ~/my-skills

# Overwrite existing
./scripts/download-skill.py owner/repo@skill --force
```

**Options:**
- `source` - Skill identifier (owner/repo@skill) or GitHub URL (required)
- `--dest, -d` - Destination directory (default: projects/agent-tools/skills/download/INBOX)
- `--force, -f` - Overwrite existing skill
- `--verbose, -v` - Show detailed output

## Workflow

### Recommended Flow

```
1. Search for skills
   ./scripts/search-skills.py "react performance"
        ↓
2. Download to INBOX
   ./scripts/download-skill.py owner/repo@skill
        ↓
3. Security scan (use skill-security-scanner)
   ../skill-security-scanner/scripts/scan.sh INBOX/skill-name
        ↓
4. Evaluate and test the skill
        ↓
5. Deploy using skill-deployer
   ../skill-deployer/scripts/deploy-skill.py -s INBOX/skill -d .agents/skills/
```

## Security Scanning

After downloading, use `skill-security-scanner` to scan for security risks:

```bash
../skill-security-scanner/scripts/scan.sh INBOX/skill-name
```

The scanner checks for:
- C2 infrastructure patterns
- Reverse shell attempts
- Data exfiltration code
- Malware characteristics
- Dynamic code execution risks

## Common Skill Categories

| Category        | Example Queries                          |
| --------------- | ---------------------------------------- |
| Web Development | react, nextjs, typescript, css, tailwind |
| Testing         | testing, jest, playwright, e2e           |
| DevOps          | deploy, docker, kubernetes, ci-cd        |
| Documentation   | docs, readme, changelog, api-docs        |
| Code Quality    | review, lint, refactor, best-practices   |
| Design          | ui, ux, design-system, accessibility     |
| Productivity    | workflow, automation, git                |

## Direct CLI Usage

You can also use `npx skills` directly:

```bash
# Search
npx skills find react performance

# Install directly to agent directory
npx skills add vercel-labs/agent-skills@vercel-react-best-practices -g -y

# List installed skills
npx skills list
```

**Browse skills at:** https://skills.sh/

## Tips for Effective Searches

1. **Use specific keywords**: "react testing" is better than just "testing"
2. **Try alternative terms**: If "deploy" doesn't work, try "deployment" or "ci-cd"
3. **Check popular sources**: Many skills come from `vercel-labs/agent-skills` or `ComposioHQ/awesome-claude-skills`

## When No Skills Are Found

If no relevant skills exist:

1. Acknowledge that no existing skill was found
2. Offer to help with the task directly using your general capabilities
3. Suggest the user could create their own skill with `npx skills init`
