# 📋 Plan Master Skill

A persistent task/plan tracking system for Wopal workspace that tracks tasks across sessions with priorities, completion tracking, and heartbeat reminders.

## File Location

`memory/PLAN.md` (Wopal workspace specific location)

## Usage

Just talk naturally to your agent:

| Say this... | What happens |
|-------------|--------------|
| "Add X to plan" | Adds item (default: medium priority) |
| "Add X to high priority" | Adds as high priority |
| "What's on the plan?" | Shows the list |
| "Mark X done" | Moves item to Done section |
| "Remove X from plan" | Deletes the item |

## Priorities

- 🔴 **High** — Urgent items
- 🟡 **Medium** — Normal priority (default)
- 🟢 **Nice to Have** — Low priority / future ideas

## PLAN.md Format

The skill maintains a `PLAN.md` file in your workspace:

```markdown
# PLAN - Wopal Scratch Pad

*Last updated: 2026-01-17*

## 🔴 High Priority
- [ ] Important task (added: 2026-01-17)

## 🟡 Medium Priority
- [ ] Regular task (added: 2026-01-17)

## 🟢 Nice to Have
- [ ] Future idea (added: 2026-01-17)

## ✅ Done
- [x] Completed task (done: 2026-01-17)
```

## CLI Commands

The skill includes a bash script for direct use:

```bash
# Add items
bash scripts/plan.sh add high "Urgent task"
bash scripts/plan.sh add medium "Normal task"
bash scripts/plan.sh add low "Nice to have"

# Mark done (matches partial text)
bash scripts/plan.sh done "Urgent"

# Remove item
bash scripts/plan.sh remove "old task"

# List all
bash scripts/plan.sh list

# Quick summary (great for heartbeats)
bash scripts/plan.sh summary
```

## Heartbeat Integration

Add this to your `HEARTBEAT.md` to get reminders:

```markdown
## Active Monitoring Tasks

### Daily Plan Check
On each heartbeat:
- Run: bash skills/plan-master/scripts/plan.sh summary
- If high-priority items exist, mention them
- Flag stale items (>7 days old)
```

## Example Summary Output

```
📋 Plan: 7 items (2 high, 2 medium, 3 low)
🔴 High priority items:
  • Ingest low-code docs
  • Fix critical bug
⚠️ 1 stale item (>7 days old)
```