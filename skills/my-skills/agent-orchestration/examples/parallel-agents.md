# Parallel Tasks Example

## Scenario

Run two OpenCode tasks in parallel using separate worktrees for isolated development.

## Prerequisites

- Two OpenSpec changes ready: `change-1` and `change-2`
- `git-worktrees` skill available
- `process-adapter` installed

## Execution

### Step 1: Create Worktrees

```bash
WORKTREE=".agents/skills/git-worktrees/scripts/worktree.sh"
"$WORKTREE" create agent-tools feature/task-1
"$WORKTREE" create agent-tools feature/task-2
```

### Step 2: Clean Up Marker Files

```bash
rm -f /tmp/opencode-done-task-1 /tmp/opencode-done-task-2
```

### Step 3: Launch Parallel Tasks

```bash
WORKSPACE_ROOT="/Users/sam/coding/wopal/wopal-workspace"
PERM='{"bash":{"*":"allow"},"edit":{"*":"allow"},"write":{"*":"allow"},"read":{"*":"allow"},"external_directory":{"*":"allow"}}'

S1=$(process-adapter start \
  "PROCESS_ADAPTER_SESSION_ID=task-1 OPENCODE_PERMISSION='$PERM' \
   opencode run 'Read $WORKSPACE_ROOT/openspec/changes/change-1/tasks.md and implement all tasks. Run tests.'" \
  --name task-1 \
  --cwd .worktrees/agent-tools-feature-task-1 | awk '{print $3}')
echo "Task 1 Session: $S1"

S2=$(process-adapter start \
  "PROCESS_ADAPTER_SESSION_ID=task-2 OPENCODE_PERMISSION='$PERM' \
   opencode run 'Read $WORKSPACE_ROOT/openspec/changes/change-2/tasks.md and implement all tasks. Run tests.'" \
  --name task-2 \
  --cwd .worktrees/agent-tools-feature-task-2 | awk '{print $3}')
echo "Task 2 Session: $S2"
```

### Step 4: Monitor Progress

```bash
# Check both sessions
process-adapter list

# Watch specific session
process-adapter log $S1
process-adapter log $S2
```

### Step 5: Wait for Completion

```bash
WAIT=".agents/skills/agent-orchestration/scripts/wait-for-opencode.sh"

# Wait for task-1 (blocks until done or timeout)
"$WAIT" task-1 300

# Wait for task-2
"$WAIT" task-2 300
```

### Step 6: Verify and Merge

```bash
# Verify task-1 results
cd .worktrees/agent-tools-feature-task-1
npm test
git log --oneline -5

# Verify task-2 results
cd .worktrees/agent-tools-feature-task-2
npm test
git log --oneline -5
```

### Step 7: Cleanup

```bash
WORKTREE=".agents/skills/git-worktrees/scripts/worktree.sh"
"$WORKTREE" remove agent-tools feature/task-1
"$WORKTREE" remove agent-tools feature/task-2

process-adapter remove $S1
process-adapter remove $S2
```

## Key Points

- Each worktree is isolated — no risk of file conflicts between tasks
- Use absolute paths (`$WORKSPACE_ROOT`) for OpenSpec files in worktree mode
- `external_directory` permission is required when reading files outside the worktree
- `wait-for-opencode.sh` is sequential — it blocks until a task completes
- For true parallel monitoring, check `process-adapter list` periodically

## Related Examples

- [OpenSpec Workflow](openspec-workflow.md) - Single task workflow
- [Simple Task](simple-task.md) - Basic task execution
