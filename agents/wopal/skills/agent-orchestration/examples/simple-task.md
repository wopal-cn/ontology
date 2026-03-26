# Simple Task Example

## Scenario

Quickly analyze the architecture of a project using OpenCode.

## Task

"Summarize the architecture of the ontology project, focusing on the core components and their interactions."

## Execution

### Step 1: Launch OpenCode (Background)

```bash
# Background (non-blocking, recommended)
SESSION=$(process-adapter start \
  "OPENCODE_PERMISSION='{\"bash\":{\"*\":\"allow\"},\"edit\":{\"*\":\"allow\"},\"write\":{\"*\":\"allow\"}}' \
   opencode run 'Read AGENTS.md and summarize the architecture of this project. Focus on core components and their interactions. Be concise (max 300 words).'" \
  --name summary-task \
  --cwd projects/ontology | awk '{print $3}')

echo "Session ID: $SESSION"
```

### Step 2: Monitor Output

```bash
# Check session status
process-adapter poll $SESSION

# View output
process-adapter log $SESSION

# Example output:
# The ontology project is organized into several key areas:
# 1. **commands/** - Custom slash commands (11 total)
# 2. **rules/** - Conditional trigger rules (6 total)
# 3. **skills/** - Deployable skill packages
# ...
```

### Step 3: Cleanup

```bash
process-adapter remove $SESSION
```

## Best Practices

### ✅ Do

- Use background mode for longer analysis tasks
- Specify `--cwd` to limit context to the target project
- Pre-configure permissions to avoid interruptions
- Keep prompts specific and concise

### ❌ Don't

- Run without `--cwd` (pollutes context with entire workspace)
- Use interactive mode for simple one-shot tasks

## Related Examples

- [OpenSpec Workflow](openspec-workflow.md) - Complex multi-step workflow
- [Parallel Tasks](parallel-agents.md) - Running multiple tasks simultaneously
