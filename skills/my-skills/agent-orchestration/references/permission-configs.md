# Permission Configuration Patterns

## Overview

Coding agents need permission configuration to perform file operations, run commands, and make changes. Different agents use different permission models.

## OpenCode Permission Configuration

### Environment Variable (Recommended)

OpenCode reads permissions from `OPENCODE_PERMISSION` environment variable in non-interactive mode:

```bash
export OPENCODE_PERMISSION='{
  "bash": {"*": "allow"},
  "edit": {"*": "allow"},
  "write": {"*": "allow"}
}'
```

### Permission Scopes

#### Full Access (High Risk)

```json
{
  "bash": {"*": "allow"},
  "edit": {"*": "allow"},
  "write": {"*": "allow"}
}
```

**Use Case**: Trusted sandbox, OpenSpec-driven tasks with full implementation

**Risk**: Agent can execute any command and modify any file

#### Specific Commands (Low Risk)

```json
{
  "bash": {
    "npm test": "allow",
    "npm run lint": "allow",
    "git status": "allow"
  },
  "read": {"*": "allow"}
}
```

**Use Case**: Read-only analysis with specific test commands

**Risk**: Low, limited to explicitly allowed commands

#### File Type Restrictions

```json
{
  "edit": {
    "*.ts": "allow",
    "*.tsx": "allow",
    "*.json": "allow"
  },
  "write": {
    "src/**": "allow"
  }
}
```

**Use Case**: Restrict modifications to specific file types or directories

**Risk**: Medium, prevents accidental modification of config files

### Common Patterns

#### Pattern 1: OpenSpec Implementation

```bash
export OPENCODE_PERMISSION='{
  "bash": {"*": "allow"},
  "edit": {"*": "allow"},
  "write": {"*": "allow"}
}'

opencode run 'Read openspec/changes/add-auth/tasks.md and implement all tasks.'
```

**Rationale**: Full permissions needed for implementation

#### Pattern 2: Read-Only Analysis

```bash
export OPENCODE_PERMISSION='{
  "bash": {
    "npm test": "allow",
    "git *": "allow"
  },
  "read": {"*": "allow"}
}'

opencode run 'Analyze the authentication module and suggest improvements.'
```

**Rationale**: No write permissions, only analysis

#### Pattern 3: Test-Driven Development

```bash
export OPENCODE_PERMISSION='{
  "bash": {
    "npm test": "allow",
    "npm run lint": "allow"
  },
  "edit": {
    "*.test.ts": "allow",
    "src/**/*.ts": "allow"
  },
  "write": {
    "*.test.ts": "allow"
  }
}'

opencode run 'Write tests for the UserService class.'
```

**Rationale**: Limited to source and test files

