# Troubleshooting Guide

## Common Issues

### 1. Agent Hangs or Produces Broken Output

**Symptoms:**
- Agent appears to hang with no output
- Output is garbled or missing colors
- Agent terminates unexpectedly

**Cause:** Process not properly backgrounded

**Solution:** Use `process-adapter start` for background execution:

```bash
# ❌ Wrong (will block terminal)
opencode run 'task'

# ✅ Correct (background execution)
process-adapter start "opencode run 'task'"
```

**Why:** Coding agents need proper background process management to function correctly.

---

### 2. Permission Denied (OpenCode)

**Symptoms:**
- OpenCode fails with "Permission denied"
- Agent cannot execute Bash commands
- Agent cannot edit files

**Cause:** Non-interactive mode auto-rejects permission requests

**Solution:** Pre-authorize permissions via environment variable:

```bash
export OPENCODE_PERMISSION='{
  "bash": {"*": "allow"},
  "edit": {"*": "allow"},
  "write": {"*": "allow"}
}'

opencode run "task"
```

**Alternative:** Inline environment variable:

```bash
OPENCODE_PERMISSION='{"bash":{"*":"allow"},"edit":{"*":"allow"},"write":{"*":"allow"}}' opencode run "task"
```

---

### 3. Agent Reads Unwanted Context

**Symptoms:**
- Agent reads files outside target directory
- Agent mentions unrelated project files
- Context window polluted with irrelevant information

**Cause:** Running in wrong directory

**Solution:** Use `--cwd` to limit context boundary:

```bash
# ❌ Wrong
process-adapter start "opencode run 'Fix bug in UserService'"

# ✅ Correct
process-adapter start "opencode run 'Fix bug in UserService'" --cwd projects/web/wopal
```

**Tip:** Always specify `--cwd` for focused execution.

---

### 4. Session Output Truncated

**Symptoms:**
- Long output gets cut off
- Cannot see full execution log
- Missing important messages

**Cause:** Output exceeds default buffer limit

**Solution:** Use `--limit` and `--offset`:

```bash
# View last 100 lines
process-adapter log <session-id> --limit 100

# View lines 50-150
process-adapter log <session-id> --offset 50 --limit 100

# Use monitor script
python3 scripts/monitor_session.py <session-id> --limit 100
```

---

### 5. Agent Asks Unexpected Questions

**Symptoms:**
- Agent prompts for confirmation
- Agent asks for clarification
- Workflow pauses unexpectedly

**Cause:** Task description ambiguous or permissions too restrictive

**Solution 1:** Provide more specific task description:

```bash
# ❌ Vague
opencode run "Fix the bug"

# ✅ Specific
opencode run "Fix the null pointer exception in UserService.authenticate() method"
```

**Solution 2:** Broaden permissions:

```bash
# Full permissions for OpenCode tasks
export OPENCODE_PERMISSION='{"bash":{"*":"allow"},"edit":{"*":"allow"},"write":{"*":"allow"}}'
```

---

### 7. Vite Dev Server Blocked by ngrok

**Symptoms:**
- "Blocked request. This host (...) is not allowed"
- ngrok tunnel returns 403
- Vite rejects external requests

**Cause:** Vite blocks unknown Host headers

**Solution:** Configure `allowedHosts` in `vite.config.*`:

```typescript
// vite.config.ts
export default {
  server: {
    host: true,
    allowedHosts: true  // Allow all hosts
    // OR
    allowedHosts: ['xxxx.ngrok-free.app']  // Allow specific host
  }
}
```

**Note:** Restart dev server after config change.

---

### 8. Background Process Killed (SIGKILL)

**Symptoms:**
- Long-running dev server terminates
- Background process disappears
- No error message

**Cause:** Process killed by supervisor or timeout

**Solution 1:** Use tmux for long-running processes:

```bash
# Start in tmux session
tmux new-session -d "npm run dev"

# Attach to monitor
tmux attach
```

**Solution 2:** Ensure proper background execution:

```bash
# ✅ Correct (properly backgrounded)
process-adapter start "npm run dev"
```

---

### 9. Shell Eats Backticks in Prompt

**Symptoms:**
- Prompt text modified unexpectedly
- Backticks disappear or cause errors
- Shell substitution executes prematurely

**Cause:** Shell interprets backticks before passing to agent

**Solution:** Use proper quoting or pass prompt from file:

```bash
# ❌ Wrong
process-adapter start "claude -p 'Use `npm test` to verify'"

# ✅ Correct (escape backticks)
process-adapter start "claude -p 'Use \`npm test\` to verify'"

# ✅ Better (use file)
echo "Use \`npm test\` to verify" > /tmp/prompt.txt
process-adapter start "claude -p \"\$(cat /tmp/prompt.txt)\""
```

---

### 10. Agent Context Window Full

**Symptoms:**
- Agent becomes slow or unresponsive
- Agent forgets earlier instructions
- Quality degrades over long session

**Cause:** Context window exhausted

**Solution 1:** Use `/clear` between unrelated tasks:

```bash
# In interactive Claude Code session
/clear
```

**Solution 2:** Use `/compact` to preserve key details:

```bash
/compact Focus on authentication implementation
```

**Solution 3:** Start fresh session for new tasks:

```bash
# Kill old session
process-adapter kill <session-id>

# Start new session
process-adapter start "claude -p 'New task'" --cwd project
```

---

### 11. PTY Mode Not Available (macOS)

**Symptoms:**
- Warning: "PTY mode requested but fell back to normal mode"
- `process-adapter write` fails with "only supported in PTY mode"

**Cause:** macOS PTY device limit (`kern.tty.ptmx_max`)

**Impact:**
- ❌ Cannot send interactive input via `write`
- ✅ All other functionality works normally
- ✅ Coding agents work with pre-configured permissions

**Solution:** Use pre-configured permissions instead of interactive input:

```bash
# Pre-configure full permissions
OPENCODE_PERMISSION='{"bash":{"*":"allow"},"edit":{"*":"allow"},"write":{"*":"allow"}}' opencode run "task"

# Or use auto-confirm flags
npm install --yes
git commit -m "message"
```

---

## Diagnostic Commands

### Check Agent Installation

```bash
# OpenCode
opencode --version
```

### Test Minimal Execution

```bash
# OpenCode
process-adapter start "opencode run 'Return only: OK'"
```

### List Active Sessions

```bash
process-adapter list
process-adapter list --running
process-adapter list --finished
```

### Monitor Session Output

```bash
# Basic
process-adapter log <session-id>

# With limit
process-adapter log <session-id> --limit 100

# With filtering
python3 scripts/monitor_session.py <session-id> --filter "error|warning"

# Continuous monitoring
python3 scripts/monitor_session.py <session-id> --watch
```

---

## Error Messages Reference

### "Permission denied"

**Agent:** OpenCode

**Cause:** Insufficient permissions

**Fix:** Add permission configuration (see Permission Denied sections above)

---

### "Process timed out"

**Agent:** Any

**Cause:** Task exceeded timeout limit

**Fix:** Increase timeout or break task into smaller chunks

---

### "Session not found"

**Agent:** Any

**Cause:** Invalid sessionId or session expired

**Fix:** List sessions with `process-adapter list` to find valid IDs

---

### "write() is only supported in PTY mode"

**Agent:** Any

**Cause:** Trying to use `process-adapter write` without PTY

**Fix:** On macOS, PTY mode is limited. Use pre-configured permissions instead.

---

## Prevention Checklist

Before launching agent:

- [ ] Process properly backgrounded with `process-adapter start`
- [ ] `--cwd` specified for context boundary
- [ ] Permissions pre-configured (OpenCode)
- [ ] Task description is specific
- [ ] Timeout appropriate for task complexity

After launching agent:

- [ ] Monitor with `process-adapter log`
- [ ] Check for permission prompts
- [ ] Verify expected file changes
- [ ] Run tests to validate implementation
- [ ] Clean up sessions when done with `process-adapter remove`
