# Reminders AppleScript Reference

> macOS Reminders.app automation via AppleScript. For deep understanding of batch operations and performance patterns.

## Object Model

```
Application "Reminders"
└── List (container for reminders)
    └── Reminder (individual task)
        ├── name: text
        ├── completed: boolean
        ├── id: text (unique identifier)
        ├── body: text (notes)
        ├── dueDate: date
        ├── creationDate: date (read-only)
        └── modificationDate: date (read-only)
```

## Batch Read Pattern (Critical for Performance)

**Why batch?** AppleScript `repeat` loop iterating over reminder objects is extremely slow with large datasets. Always use batch property retrieval + zip pattern.

### Pattern: Get All Properties at Once

```applescript
tell application "Reminders"
    set remList to list "提醒"
    
    -- Batch retrieve: O(1) calls vs O(n) in repeat loop
    set nms to name of every reminder in remList
    set cmps to completed of every reminder in remList
    set ids to id of every reminder in remList
    
    -- Returns: {"Task1, Task2, Task3", "false, true, false", "id1, id2, id3"}
    return {nms, cmps, ids}
end tell
```

### Zip Pattern in Bash

```bash
# Parse AppleScript result format: "name1, name2, completed1, completed2, ..."
# Or parse paired format depending on query structure
result=$(osascript -e '...')
echo "$result" | tr ',' '\n' | while read -r line; do
    # Process alternating or parallel data
done
```

## CRUD Operations

### Create

```applescript
tell application "Reminders"
    set remList to list "提醒"
    
    -- Basic creation
    make new reminder in remList with properties {name:"Buy milk"}
    
    -- With additional properties
    make new reminder in remList with properties {¬
        name:"Team meeting", ¬
        body:"Prepare slides", ¬
        dueDate:(current date) + 2 * days}
    
    -- Capture the created reminder
    set newReminder to make new reminder in remList with properties {name:"Task"}
    return id of newReminder  -- Returns unique ID for future reference
end tell
```

### Read (List)

```applescript
tell application "Reminders"
    set remList to list "提醒"
    
    -- All reminders
    name of every reminder in remList
    
    -- Filtered by completion status
    name of every reminder in remList whose completed is false
    name of every reminder in remList whose completed is true
    
    -- With multiple properties (batch pattern)
    set nms to name of every reminder in remList
    set cmps to completed of every reminder in remList
    return {nms, cmps}
end tell
```

### Update (Complete)

```applescript
tell application "Reminders"
    set remList to list "提醒"
    
    -- Find by ID (most reliable)
    set targetReminder to first reminder in remList whose id is "x-apple-reminder://..."
    set completed of targetReminder to true
    
    -- Find by name (may have duplicates)
    set targetReminder to first reminder in remList whose name is "Buy milk"
    set completed of targetReminder to true
    
    -- Update other properties
    set body of targetReminder to "Updated notes"
    set dueDate of targetReminder to (current date) + 1 * days
end tell
```

### Delete

```applescript
tell application "Reminders"
    set remList to list "提醒"
    
    -- Find by ID (recommended)
    set targetReminder to first reminder in remList whose id is "x-apple-reminder://..."
    delete targetReminder
    
    -- Find by name
    set targetReminder to first reminder in remList whose name is "Buy milk"
    delete targetReminder
end tell
```

## List Management

```applescript
tell application "Reminders"
    -- Get all list names
    name of every list
    -- Returns: {"提醒", "Tasks", "Shopping", ...}
    
    -- Create new list
    make new list with properties {name:"Work"}
    
    -- Check if list exists
    try
        set remList to list "提醒"
        -- List exists
    on error
        -- List doesn't exist
    end try
end tell
```

## Error Handling Pattern

```applescript
tell application "Reminders"
    try
        set remList to list "提醒"
        -- ... operations ...
        return "OK"
    on error errMsg
        return "ERROR:" & errMsg
    end try
end tell
```

## Known Limitations

### 1. JXA Timeout

JavaScript for Automation (JXA) bridge to Reminders has performance issues with large datasets. AppleScript is the recommended approach.

```javascript
// ❌ Avoid JXA for Reminders - may timeout with large lists
const Reminders = Application('Reminders');
const list = Reminders.lists.byName('提醒');
const reminders = list.reminders();  // Can hang with 100+ items
```

### 2. Repeat Loop Performance

```applescript
-- ❌ Slow: O(n) AppleScript calls
repeat with r in reminders in remList
    set rName to name of r  -- Each access is a separate call
end repeat

-- ✅ Fast: O(1) calls, then process in memory
set allNames to name of every reminder in remList
set allCompleted to completed of every reminder in remList
-- Process lists in AppleScript or return to caller
```

### 3. First-Time Authorization

When script first accesses Reminders:
- macOS prompts for Automation permission
- User must approve in: System Settings > Privacy & Security > Automation
- Terminal/iterm or the running app needs "Reminders" checkbox enabled

### 4. iCloud Sync Delay

Changes made via AppleScript sync to iPhone/iPad via iCloud:
- Usually instant for small changes
- May take 1-2 minutes for bulk operations
- No programmatic way to force sync

### 5. ID Format

Reminder IDs are not simple integers:
```
x-apple-reminder://<UUID>
```
Always treat IDs as opaque strings, not parseable values.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `REMINDER_LIST` | 提醒 | Target list name |

## Troubleshooting

### "Not authorized to send Apple events"

Run in Terminal:
```bash
# Grant automation permission
osascript -e 'tell application "Reminders" to get name of every list'
```

Then approve the prompt, or go to System Settings > Privacy & Security > Automation.

### List Not Found

Check available lists:
```bash
osascript -e 'tell application "Reminders" to get name of every list'
```

Set correct list name:
```bash
export REMINDER_LIST="Tasks"
./reminder.sh list
```

### Empty Results

List may be empty or all items completed:
```bash
./reminder.sh list all  # Show both pending and completed
```