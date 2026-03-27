---
name: mac-reminder
description: >
  Manage personal todos via macOS Reminders.app. ⚠️ MUST use when user asks to "add a todo", 
  "remind me", "记一下", "加个待办", "待办列表", "完成待办", "查看待办", or any personal 
  task/reminder management. 🔴 Trigger even when user doesn't explicitly say "reminder" if the 
  intent is personal task tracking. Use todowrite for session-level coding steps; use dev-flow 
  for product plans.
allowed-tools:
  - Bash
  - Read
---

# mac-reminder — Personal Todo Management

Manage personal daily tasks via macOS Reminders.app. Not for coding todos or product plans.

## When to Use

| User Intent | Skill |
|-------------|-------|
| Personal reminders, daily tasks, "remind me to..." | **This skill** |
| Session coding steps, tracking implementation | `todowrite` tool |
| Product/feature plans, Issue-driven development | `dev-flow` skill |

## Workflow

1. Identify operation from user intent
2. Execute `reminder.sh` with appropriate command
3. Return human-readable result

## Operations

### List Reminders

```bash
./scripts/reminder.sh list [status]
# status: pending (default) | done | all
```

**Output:**
```
☐ Buy milk
☐ Call dentist
☑ Submit report
```

**When:** User asks to "看看待办", "show my todos", "what do I need to do"

### Add Reminder

```bash
./scripts/reminder.sh add "<name>"
```

**Output:**
```
Added: Buy milk tomorrow (id: x-apple-reminder://...)
```

**When:** User says "帮我记一下...", "add a todo", "remind me to..."

### Complete Reminder

```bash
./scripts/reminder.sh complete "<query>"
```

**Features:**
- Fuzzy match: query can be partial name (case-insensitive)
- Single match: marks complete immediately
- Multiple matches: prompts user to be more specific
- No match: shows error

**Output:**
```
Completed: Buy milk
```

**When:** User says "xxx完成了", "mark xxx as done", "complete xxx"

### Delete Reminder

```bash
./scripts/reminder.sh delete "<query>"
```

**Features:** Same fuzzy matching as `complete`

**Output:**
```
Deleted: Old task
```

**When:** User says "删除xxx", "remove xxx", "don't need xxx anymore"

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `REMINDER_LIST` | 提醒 | Target Reminders list |

Override with environment variable:
```bash
REMINDER_LIST="Work" ./scripts/reminder.sh list
```

## Prerequisites

1. **Automation Permission**: First run triggers macOS permission prompt
   - Approve in: System Settings > Privacy & Security > Automation
   - Enable "Reminders" for Terminal/iterm

2. **iCloud Sync**: Changes sync to iPhone/iPad automatically (1-2 min delay)

3. **Default List**: Script uses "提醒" list by default; create in Reminders.app if missing

## Time Handling Rules

When user says relative time words, default to reasonable hours:

| User says | Interpreted as |
|-----------|---------------|
| 明天/后天/下周X | That day at **9:00 AM** |
| 今晚/今天晚上 | Today at **20:00** |
| 今天下午 | Today at **14:00** |
| 今天上午 | Today at **9:00** |

**Never use 0:00** — humans sleep at night. Use `current date + N days` then set hours to 9.

## Execution

Always execute from skill root directory:
```bash
cd .agents/skills/mac-reminder
./scripts/reminder.sh <command>
```

## Examples

| User Prompt | Command |
|-------------|---------|
| "帮我记一下明天买牛奶" | `./scripts/reminder.sh add "明天买牛奶"` |
| "看看我的待办" | `./scripts/reminder.sh list` |
| "买牛奶完成了" | `./scripts/reminder.sh complete "牛奶"` |
| "删除旧的待办" | `./scripts/reminder.sh delete "旧"` |
| "显示已完成的" | `./scripts/reminder.sh list done` |
| "所有待办" | `./scripts/reminder.sh list all` |

## Reference

For AppleScript patterns and performance optimization, see `references/applescript.md`.

## Test Cases

These verify skill quality after implementation:

1. **Add and List**
   - User: "帮我记一下明天买牛奶"
   - Expected: Adds reminder, returns ID
   - Verify: `./scripts/reminder.sh list` shows "☐ 明天买牛奶"

2. **Complete**
   - User: "买牛奶完成了"
   - Expected: Fuzzy match finds "明天买牛奶", marks complete
   - Verify: `./scripts/reminder.sh list done` shows "☑ 明天买牛奶"

3. **Delete**
   - User: "删除买牛奶"
   - Expected: Fuzzy match, deletes reminder
   - Verify: Reminder no longer in list

4. **List Filter**
   - User: "看看我的待办" → shows pending only
   - User: "所有待办" → shows all (pending + done)