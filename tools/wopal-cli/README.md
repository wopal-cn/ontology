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
```

### Passthrough Commands

```bash
wopal find [query]    # Search for skills (via Skills CLI)
```

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
│   ├── list.ts         # Skills list command
│   └── passthrough.ts  # Passthrough to Skills CLI
└── utils/
    ├── env-loader.ts   # Environment variable loader
    ├── inbox-utils.ts  # INBOX utility functions
    ├── logger.ts       # Logging utility
    └── skill-utils.ts  # Skill parsing utilities
```

## Dependencies

- `commander` - CLI framework
- `picocolors` - Terminal colors
- `gray-matter` - Markdown frontmatter parsing
- `dotenv` - Environment variable loading

## Development

```bash
pnpm build     # Build TypeScript
pnpm dev       # Run in development mode
```

## Next Steps

This CLI will be extended with the following commands:

- `wopal download` - Download skills from GitHub
- `wopal scan` - Security scan for skills
- `wopal install` - Install skills from INBOX
- `wopal check` - Check for updates
- `wopal update` - Update installed skills
