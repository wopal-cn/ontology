# Worktree Integration Guide

## Overview

When OpenCode runs in a worktree, it operates in an isolated directory that shares Git history with the parent project. This requires special handling for accessing OpenSpec files and other workspace resources.

## Path Resolution

### The Problem

```
Workspace Root: /Users/sam/coding/wopal/wopal-workspace/
OpenSpec Files: /Users/sam/coding/wopal/wopal-workspace/openspec/changes/add-auth/tasks.md

Worktree:       /Users/sam/coding/wopal/wopal-workspace/.worktrees/ontology-feature-auth/
                 (OpenCode runs here, so relative paths start here)
```

Relative path `openspec/changes/add-auth/tasks.md` resolves to the **worktree**, not the workspace root.

### The Solution

Always use **absolute paths** to reference workspace files from within worktrees:

```bash
WORKSPACE_ROOT="/Users/sam/coding/wopal/wopal-workspace"

opencode run "Read $WORKSPACE_ROOT/openspec/changes/add-auth/tasks.md and implement."
```

## Required Permissions

When OpenCode reads files outside its working directory, `external_directory` permission is required:

```bash
OPENCODE_PERMISSION='{
  "bash": {"*": "allow"},
  "edit": {"*": "allow"},
  "write": {"*": "allow"},
  "read": {"*": "allow"},
  "external_directory": {"*": "allow"}
}'
```

Without `external_directory`, OpenCode will auto-reject the permission request and fail to read tasks.md.

## Complete Workflow

### 1. Create Worktree

```bash
WORKTREE=".agents/skills/git-worktrees/scripts/worktree.sh"
"$WORKTREE" create ontology feature/add-auth
# Creates: .worktrees/ontology-feature-add-auth/
```

### 2. Set Up Variables

```bash
WORKSPACE_ROOT="/Users/sam/coding/wopal/wopal-workspace"
CHANGE="add-auth"
PROJECT="ontology"
BRANCH="feature/add-auth"
BRANCH_DIR=$(echo "$BRANCH" | tr '/' '-')
WORKTREE_DIR="$WORKSPACE_ROOT/.worktrees/$PROJECT-$BRANCH_DIR"
```

### 3. Launch OpenCode

```bash
rm -f /tmp/opencode-done-$CHANGE

SESSION=$(process-adapter start \
  "PROCESS_ADAPTER_SESSION_ID=$CHANGE \
   OPENCODE_PERMISSION='{\"bash\":{\"*\":\"allow\"},\"edit\":{\"*\":\"allow\"},\"write\":{\"*\":\"allow\"},\"read\":{\"*\":\"allow\"},\"external_directory\":{\"*\":\"allow\"}}' \
   opencode run 'Read $WORKSPACE_ROOT/openspec/changes/$CHANGE/tasks.md and implement all tasks. Run tests.'" \
  --name $CHANGE \
  --cwd "$WORKTREE_DIR" | awk '{print $3}')
```

### 4. Monitor and Verify

```bash
.agents/skills/agent-orchestration/scripts/wait-for-opencode.sh $CHANGE 300
process-adapter log $SESSION
```

### 5. Cleanup

```bash
process-adapter remove $SESSION
.agents/skills/git-worktrees/scripts/worktree.sh remove ontology feature/add-auth
```

## Common Pitfalls

### Pitfall 1: Relative Paths (File Not Found)

```bash
# ❌ Wrong — resolves relative to worktree, not workspace
opencode run "Read openspec/changes/add-auth/tasks.md"

# ✅ Correct — absolute path
opencode run "Read $WORKSPACE_ROOT/openspec/changes/add-auth/tasks.md"
```

### Pitfall 2: Missing external_directory Permission

```bash
# ❌ Wrong — will fail with permission auto-reject
OPENCODE_PERMISSION='{"bash":{"*":"allow"},"edit":{"*":"allow"},"write":{"*":"allow"}}'

# ✅ Correct — includes external_directory
OPENCODE_PERMISSION='{"bash":{"*":"allow"},"edit":{"*":"allow"},"write":{"*":"allow"},"read":{"*":"allow"},"external_directory":{"*":"allow"}}'
```

### Pitfall 3: Stale Marker Files

```bash
# ❌ Wrong — residual /tmp/opencode-done-add-auth causes false completion
SESSION=$(process-adapter start ...)

# ✅ Correct — always clean before launch
rm -f /tmp/opencode-done-$CHANGE
SESSION=$(process-adapter start ...)
```

### Pitfall 4: Old Worktree Format

```bash
# ❌ Old format (deprecated)
./scripts/worktree.sh create add-feature-x --subproject ontology

# ✅ New format
.agents/skills/git-worktrees/scripts/worktree.sh create ontology feature/add-auth
```

## Related

- [OpenSpec Workflow](openspec-workflow.md) - Complete end-to-end example
- [Parallel Tasks](parallel-agents.md) - Multiple worktrees in parallel
- [Permission Reference](../references/permission-configs.md) - All permission patterns
