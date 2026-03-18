---
name: plan-master
description: ⚠️ MUST USE for task/plan tracking (never edit PLAN.md directly). Provides persistent task management with priorities. Triggers on "add to plan", "what's on the plan", "mark X done", "show plan", "remove from plan", or pending task queries.
---

# Plan Master

Manage a persistent PLAN.md scratch pad for task tracking across sessions.

## File Location

`memory/PLAN.md` (Wopal workspace specific location)

## Commands

### View Plan
When user asks: "what's on the plan?", "show plan", "pending tasks?"
```bash
cat memory/PLAN.md
```
Then summarize the items by priority.

### Add Item
When user says: "add X to plan", "plan: X", "remember to X"
```bash
bash skills/plan-master/scripts/plan.sh add "<priority>" "<item>"
```
Priorities: `high`, `medium`, `low` (default: medium)

Examples:
```bash
bash skills/plan-master/scripts/plan.sh add high "Ingest low-code docs"
bash skills/plan-master/scripts/plan.sh add medium "Set up Zendesk escalation"
bash skills/plan-master/scripts/plan.sh add low "Add user memory feature"
```

### Mark Done
When user says: "mark X done", "completed X", "finished X"
```bash
bash skills/plan-master/scripts/plan.sh done "<item-pattern>"
```
Matches partial text. Moves item to ✅ Done section with date.

### Remove Item
When user says: "remove X from plan", "delete X from plan"
```bash
bash skills/plan-master/scripts/plan.sh remove "<item-pattern>"
```

### List by Priority
```bash
bash skills/plan-master/scripts/plan.sh list high
bash skills/plan-master/scripts/plan.sh list medium
bash skills/plan-master/scripts/plan.sh list low
```

## Heartbeat Integration

On heartbeat, check PLAN.md:
1. Count high-priority items
2. Check for stale items (added >7 days ago)
3. If items exist, include brief summary in heartbeat response

Example heartbeat check:
```bash
bash skills/plan-master/scripts/plan.sh summary
```

## PLAN.md Format

```markdown
# PLANS

*Last updated: 2026-01-17*

## 🔴 High Priority
- [ ] Item one (added: 2026-01-17)
- [ ] Item two (added: 2026-01-15) ⚠️ STALE

## 🟡 Medium Priority
- [ ] Item three (added: 2026-01-17)

## 🟢 Nice to Have
- [ ] Item four (added: 2026-01-17)

## ✅ Done
- [x] Completed item (done: 2026-01-17)
```

## Response Format

When showing plan:
```
📋 **Plan** (3 items)

🔴 **High Priority** (1)
• Ingest low-code docs

🟡 **Medium Priority** (1)  
• Zendesk escalation from Discord

🟢 **Nice to Have** (1)
• User conversation memory

⚠️ 1 item is stale (>7 days old)
```