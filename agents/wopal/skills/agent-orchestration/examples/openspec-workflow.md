# OpenSpec Workflow Example

## Scenario

Implement user authentication feature using OpenSpec artifacts to drive OpenCode agent.

## Prerequisites

1. OpenSpec artifacts exist in `openspec/changes/add-auth/`:
   - `proposal.md` - Feature proposal
   - `design.md` - Technical design
   - `specs.md` - Detailed specifications
   - `tasks.md` - Implementation tasks

2. Target project: `projects/web/wopal` (Astro project)

## Workflow

### Phase 1: Create OpenSpec Artifacts (Wopal)

```bash
# Wopal creates OpenSpec artifacts
/openspec-propose "Add user authentication with JWT tokens"

# Artifacts generated:
# - openspec/changes/add-auth/proposal.md
# - openspec/changes/add-auth/design.md
# - openspec/changes/add-auth/specs.md
# - openspec/changes/add-auth/tasks.md
```

**Wopal's Role:** Define what needs to be built

### Phase 2: Prepare Context (Optional)

```bash
# Generate execution summary
cd projects/web/wopal
../../projects/agent-tools/skills/my-skills/agent-orchestration/scripts/prepare_openspec_context.sh add-auth

# Output: openspec-context.md (consolidated view)
```

### Phase 3: Configure Permissions

```bash
# Pre-authorize OpenCode for full implementation
export OPENCODE_PERMISSION='{
  "bash": {"*": "allow"},
  "edit": {"*": "allow"},
  "write": {"*": "allow"}
}'
```

**Rationale:** Non-interactive mode requires pre-authorization

### Phase 4: Launch OpenCode Agent

```bash
WORKSPACE_ROOT="/Users/sam/coding/wopal/wopal-workspace"
SESSION=$(process-adapter start \
  "PROCESS_ADAPTER_SESSION_ID=add-auth \
   OPENCODE_PERMISSION='{\"bash\":{\"*\":\"allow\"},\"edit\":{\"*\":\"allow\"},\"write\":{\"*\":\"allow\"}}' \
   opencode run 'Read $WORKSPACE_ROOT/openspec/changes/add-auth/tasks.md and implement all tasks. Follow the specifications in specs.md. Test your implementation with npm test. Report a completion summary listing all files modified.'" \
  --name add-auth-impl \
  --cwd projects/web/wopal | awk '{print $3}')
echo "Session ID: $SESSION"
```

**Prompt Strategy:**
1. Read `tasks.md` (implementation checklist)
2. Reference `specs.md` (specifications)
3. Run tests (verification)
4. Report summary (accountability)

### Phase 5: Monitor Progress

```bash
# Check initial output
process-adapter log $SESSION

# Example output:
Reading openspec/changes/add-auth/tasks.md...
Found 5 tasks to implement:
1. Install JWT dependencies
2. Create auth middleware
3. Add login/logout routes
4. Implement token validation
5. Add auth tests

Starting implementation...
```

### Phase 6: Track Milestones

```bash
# Monitor for milestones
process-adapter log $SESSION --limit 50

# Example milestone outputs:
✓ Installed jsonwebtoken and bcryptjs
✓ Created src/middleware/auth.ts
✓ Added /api/login and /api/logout routes
✓ Implemented token validation in middleware
✓ Created tests/auth.test.ts

Running tests...
✓ All tests passed (12/12)
```

### Phase 7: Handle Questions (If Any)

```bash
# Check if agent asks questions
process-adapter poll $SESSION

# If agent asks question:
# "Should I use RS256 or HS256 algorithm for JWT?"
process-adapter write $SESSION "HS256"
```

### Phase 8: Verify Completion

```bash
# Check final status
process-adapter log $SESSION --limit 100

# Example completion summary:
Implementation complete!

Modified files:
- package.json (added dependencies)
- src/middleware/auth.ts (new)
- src/pages/api/login.ts (new)
- src/pages/api/logout.ts (new)
- src/pages/api/profile.ts (modified)
- tests/auth.test.ts (new)

Tests: ✓ All passed (12/12)
Lint: ✓ No errors
```

### Phase 9: Validate Implementation (Wopal)

```bash
# Wopal validates agent's work

# 1. Review changed files
git status

# 2. Run tests
npm test

# 3. Check against specs.md
# Compare implementation with openspec/changes/add-auth/specs.md

# 4. Test manually
npm run dev
# Test login, logout, protected routes
```

**Wopal's Role:** Verify agent implemented correctly

### Phase 10: Archive Change (Optional)

```bash
# If implementation validated
/openspec-archive-change add-auth

# Moves to: openspec/changes/archive/add-auth/
```

### Cleanup

```bash
process-adapter remove $SESSION
```

## Key Learnings

### What Worked

1. **OpenSpec as Contract** - Clear specification prevented scope creep
2. **Pre-authorized Permissions** - No interruptions during execution
3. **Background Mode** - Long task didn't block Wopal
4. **Test Requirement** - Agent verified own work
5. **Completion Summary** - Easy to see what changed

### What to Improve

1. **Checkpointing** - Could use `/rewind` if agent goes wrong direction
2. **Parallel Tasks** - Some tasks could run in parallel with worktrees
3. **Incremental Validation** - Validate after each task instead of at end

## Variations

### Variation 1: Interactive Mode

For complex features requiring back-and-forth:

```bash
bash pty:true \
  workdir:projects/web/wopal \
  command:"opencode"

# Then manually type:
# "Read openspec/changes/add-auth/tasks.md and let's implement together"
```

**Pros:** Can guide agent in real-time
**Cons:** Requires active monitoring

## Best Practices

### ✅ Do

- Use OpenSpec artifacts as execution contract
- Pre-authorize permissions for non-interactive mode
- Specify `workdir` to limit context
- Require agent to run tests
- Request completion summary
- Validate implementation after agent finishes

### ❌ Don't

- Launch without reading OpenSpec artifacts
- Forget to pre-authorize permissions
- Skip validation step
- Use interactive mode for simple tasks
- Forget to monitor background sessions

## Related Examples

- [Simple Task](simple-task.md) - Quick one-shot tasks
- [Parallel Agents](parallel-agents.md) - Multiple agents simultaneously
