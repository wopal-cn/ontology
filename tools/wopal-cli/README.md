# wopal-cli

Wopal Skills CLI - Manage AI agent skills with INBOX workflow.

## Installation

```bash
cd projects/agent-tools/tools/wopal-cli
pnpm install
pnpm build
npm link  # Optional: make 'wopal' available globally
```

## Usage

### Global Options

```bash
wopal --version        # Show version
wopal --help           # Show help
wopal --debug          # Enable debug mode
```

### INBOX Commands

INBOX is a staging area for skills before installation.

```bash
wopal inbox list              # List all skills in INBOX
wopal inbox show <skill>      # Show skill details
wopal inbox remove <skill>    # Remove a skill from INBOX
```

### List Command

```bash
wopal list            # List all skills (INBOX + installed)
wopal list --info     # Show skill descriptions
wopal list -i         # Short form
wopal list --local    # Show only project-level installed skills
wopal list --global   # Show only global-level installed skills
```

### Install Command

Install skills from INBOX or local path to Agent directories.

**Basic Usage:**

```bash
# Install from INBOX (project-level, default)
wopal skills install <skill-name>

# Install from INBOX (global-level)
wopal skills install <skill-name> -g

# Install from local path
wopal skills install ./my-skills/<skill-name>

# Force overwrite existing skill
wopal skills install <skill-name> --force

# Skip security scan for INBOX skills
wopal skills install <skill-name> --skip-scan
```

**Options:**

- `-g, --global` - Install to global scope (~/.agents/skills/)
- `--force` - Force overwrite if skill already exists
- `--skip-scan` - Skip security scan for INBOX skills
- `--mode <mode>` - Install mode (copy or symlink, default: copy)
- `-d, --debug` - Enable debug logging

**Examples:**

```bash
# Install a skill downloaded to INBOX
wopal skills download owner/repo/skill-name
wopal skills install skill-name

# Install local skill in development
wopal skills install ./my-skills/my-custom-skill

# Install globally for all projects
wopal skills install skill-name -g
```

**Lock Files:**

- Project-level: `./skills-lock.json` (committed to Git)
- Global-level: `~/.agents/.skill-lock.json` (local management)
- Both use unified v3 format with version fingerprints

**Notes:**

- INBOX skills are automatically scanned for security (use `--skip-scan` to disable)
- INBOX skills are removed after successful installation
- Local skills remain in source location after installation
- Symlink mode is not yet implemented

### Passthrough Commands

```bash
wopal find [query]    # Search for skills (via Skills CLI)
```

### Download Command

Download skills from GitHub repositories.

```bash
# Download skill from default branch (main/master)
wopal skills download owner/repo/skill-name

# Download from specific branch
wopal skills download owner/repo/skill-name --branch develop

# Download from tag
wopal skills download owner/repo/skill-name --tag v1.0.0

# Force re-download
wopal skills download owner/repo/skill-name --force
```

**Options:**

- `--branch <branch>` - Download from specific branch
- `--tag <tag>` - Download from specific tag
- `--force` - Force re-download if already in INBOX
- `-d, --debug` - Enable debug logging

## Configuration

### Environment Variables

Create `~/.wopal/.env` for default configuration:

```bash
# INBOX directory path (default: ~/.wopal/skills/INBOX)
SKILL_INBOX_DIR=/path/to/inbox

# Installed skills directory (default: ~/.wopal/skills)
WOPAL_SKILLS_DIR=/path/to/skills
```

### Debug Mode

When running with `--debug` or `-d`:

1. Loads `.env` from current working directory instead of `~/.wopal/.env`
2. Outputs logs to `./logs/wopal-cli.log`

## Architecture

```
src/
├── cli.ts              # CLI entry point
├── commands/
│   ├── inbox.ts        # INBOX management commands
│   ├── install.ts      # Skill installation command
│   ├── list.ts         # Skills list command
│   ├── download.ts     # Download skills from GitHub
│   └── passthrough.ts  # Passthrough to Skills CLI
├── types/
│   └── lock.ts         # Lock file type definitions
└── utils/
    ├── env-loader.ts   # Environment variable loader
    ├── hash.ts         # Skill folder hash computation
    ├── inbox-utils.ts  # INBOX utility functions
    ├── lock-manager.ts # Lock file management
    ├── logger.ts       # Logging utility
    ├── metadata.ts     # Skill metadata handling
    ├── skill-lock.ts   # GitHub Tree SHA fetching
    ├── skill-utils.ts  # Skill parsing utilities
    └── source-parser.ts # Source URL parsing
```

## Dependencies

- `commander` - CLI framework
- `picocolors` - Terminal colors
- `gray-matter` - Markdown frontmatter parsing
- `dotenv` - Environment variable loading
- `fs-extra` - Enhanced file system operations
- `simple-git` - Git operations

## Development

```bash
npm run build     # Build TypeScript
npm run dev       # Run in development mode
npm run test      # Run tests in watch mode
npm run test:run  # Run tests once
```

## Next Steps

This CLI will be extended with the following commands:

- `wopal skills scan` - Security scan for skills (in progress)
- `wopal skills check` - Check for updates
- `wopal skills update` - Update installed skills
