#!/bin/bash
# macOS Reminders CLI - Personal task management via AppleScript
# Usage: reminder.sh <command> [args]
# Commands: list [status], add <name> [--due DATE] [--priority N], complete <name>, delete <name>

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

REMINDER_LIST="${REMINDER_LIST:-提醒}"

PRIORITY_LABELS=("无" "低" "" "" "" "中" "" "" "" "高")

error_list_not_found() {
    echo "Error: List '$REMINDER_LIST' not found. Available lists:" >&2
    osascript -e 'tell application "Reminders" to get name of every list' 2>/dev/null | tr ',' '\n' | sed 's/^/  - /' >&2
    exit 1
}

error_no_match() {
    echo "Error: No reminder found matching '$1' in list '$REMINDER_LIST'" >&2
    exit 1
}

format_priority() {
    local p="$1"
    if [[ "$p" -eq 0 ]]; then return; fi
    local label="${PRIORITY_LABELS[$p]:-$p}"
    echo "[$label!]"
}

format_due() {
    local d="$1"
    if [[ -z "$d" || "$d" == "missing value" ]]; then return; fi
    echo "($d)"
}

cmd_list() {
    local status="${1:-pending}"
    
    local script
    case "$status" in
        all)
            script='
tell application "Reminders"
    try
        set remList to list "'"$REMINDER_LIST"'"
        set nms to name of every reminder in remList
        set cmps to completed of every reminder in remList
        set pris to priority of every reminder in remList
        set dats to due date of every reminder in remList
        set cnt to count of nms
        set output to ""
        repeat with i from 1 to cnt
            if item i of cmps then
                set mark to "☑"
            else
                set mark to "☐"
            end if
            set pri to item i of pris
            set priStr to ""
            if pri > 0 then
                if pri = 1 then
                    set priStr to " [低!]"
                else if pri = 5 then
                    set priStr to " [中!]"
                else if pri = 9 then
                    set priStr to " [高!]"
                else
                    set priStr to " [" & pri & "!]"
                end if
            end if
            set dueStr to ""
            set dueVal to item i of dats
            if dueVal is not missing value then
                set dueStr to " (" & (short date string of dueVal) & ")"
            end if
            set output to output & mark & " " & item i of nms & priStr & dueStr & linefeed
        end repeat
        return output
    on error
        return "LIST_NOT_FOUND"
    end try
end tell'
            ;;
        pending)
            script='
tell application "Reminders"
    try
        set remList to list "'"$REMINDER_LIST"'"
        set nms to name of every reminder in remList whose completed is false
        set pris to priority of every reminder in remList whose completed is false
        set dats to due date of every reminder in remList whose completed is false
        set cnt to count of nms
        if cnt = 0 then return "EMPTY"
        set output to ""
        repeat with i from 1 to cnt
            set pri to item i of pris
            set priStr to ""
            if pri > 0 then
                if pri = 1 then
                    set priStr to " [低!]"
                else if pri = 5 then
                    set priStr to " [中!]"
                else if pri = 9 then
                    set priStr to " [高!]"
                else
                    set priStr to " [" & pri & "!]"
                end if
            end if
            set dueStr to ""
            set dueVal to item i of dats
            if dueVal is not missing value then
                set dueStr to " (" & (short date string of dueVal) & ")"
            end if
            set output to output & "☐ " & item i of nms & priStr & dueStr & linefeed
        end repeat
        return output
    on error
        return "LIST_NOT_FOUND"
    end try
end tell'
            ;;
        done)
            script='
tell application "Reminders"
    try
        set remList to list "'"$REMINDER_LIST"'"
        set nms to name of every reminder in remList whose completed is true
        set pris to priority of every reminder in remList whose completed is true
        set dats to due date of every reminder in remList whose completed is true
        set cnt to count of nms
        if cnt = 0 then return "EMPTY"
        set output to ""
        repeat with i from 1 to cnt
            set pri to item i of pris
            set priStr to ""
            if pri > 0 then
                if pri = 1 then
                    set priStr to " [低!]"
                else if pri = 5 then
                    set priStr to " [中!]"
                else if pri = 9 then
                    set priStr to " [高!]"
                else
                    set priStr to " [" & pri & "!]"
                end if
            end if
            set dueStr to ""
            set dueVal to item i of dats
            if dueVal is not missing value then
                set dueStr to " (" & (short date string of dueVal) & ")"
            end if
            set output to output & "☑ " & item i of nms & priStr & dueStr & linefeed
        end repeat
        return output
    on error
        return "LIST_NOT_FOUND"
    end try
end tell'
            ;;
        *)
            echo "Error: Invalid status '$status'. Use: all, pending, done" >&2
            exit 1
            ;;
    esac
    
    local result
    result=$(osascript -e "$script" 2>/dev/null)
    
    if [[ "$result" == "LIST_NOT_FOUND" ]]; then
        error_list_not_found
    fi
    
    if [[ "$result" == "EMPTY" ]]; then
        echo "No reminders found."
        return
    fi
    
    if [[ -n "$result" ]]; then
        echo -n "$result"
    fi
}

cmd_add() {
    local name=""
    local due=""
    local priority=""
    
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --due)
                due="$2"
                shift 2
                ;;
            --priority)
                priority="$2"
                shift 2
                ;;
            -*)
                echo "Error: Unknown option '$1'" >&2
                echo "Usage: reminder.sh add <name> [--due DATE] [--priority N]" >&2
                exit 1
                ;;
            *)
                if [[ -z "$name" ]]; then
                    name="$1"
                else
                    name="$name $1"
                fi
                shift
                ;;
        esac
    done
    
    if [[ -z "$name" ]]; then
        echo "Error: Reminder name required" >&2
        echo "Usage: reminder.sh add <name> [--due DATE] [--priority N]" >&2
        exit 1
    fi
    
    if [[ -n "$priority" ]]; then
        case "$priority" in
            0|1|5|9) ;;
            low|Low|LOW) priority=1 ;;
            med|medium|Medium|MEDIUM) priority=5 ;;
            high|High|HIGH) priority=9 ;;
            *)
                echo "Error: Invalid priority '$priority'. Use: 0=none, 1=low, 5=medium, 9=high" >&2
                exit 1
                ;;
        esac
    fi
    
    local props="{name:\"$name\""
    if [[ -n "$priority" ]]; then
        props="$props, priority:$priority"
    fi
    if [[ -n "$due" ]]; then
        props="$props, due date:date \"$due\""
    fi
    props="$props}"
    
    local script='
tell application "Reminders"
    try
        set remList to list "'"$REMINDER_LIST"'"
        set newReminder to make new reminder in remList with properties '"$props"'
        return id of newReminder
    on error errMsg
        return "ERROR:" & errMsg
    end try
end tell'
    
    local result
    result=$(osascript -e "$script" 2>/dev/null)
    
    if [[ "$result" == ERROR:* ]]; then
        echo "Error: Failed to add reminder" >&2
        echo "$result" | sed 's/^ERROR://' >&2
        exit 1
    fi
    
    local summary="Added: $name"
    [[ -n "$priority" ]] && summary="$summary [${PRIORITY_LABELS[$priority]:-$priority} priority]"
    [[ -n "$due" ]] && summary="$summary (due: $due)"
    echo "$summary (id: $result)"
}

# complete <name> - Mark reminder as completed (fuzzy match)
cmd_complete() {
    local query="$1"
    
    if [[ -z "$query" ]]; then
        echo "Error: Reminder name required" >&2
        echo "Usage: reminder.sh complete <name>" >&2
        exit 1
    fi
    
    # Find and complete matching reminder via AppleScript (avoids Bash parsing issues)
    local script='
tell application "Reminders"
    try
        set remList to list "'"$REMINDER_LIST"'"
        set nms to name of every reminder in remList whose completed is false
        set cnt to count of nms
        set matches to {}
        repeat with i from 1 to cnt
            if (item i of nms) contains "'"$query"'" then
                set end of matches to item i of nms
            end if
        end repeat
        set matchCnt to count of matches
        if matchCnt = 0 then
            return "NO_MATCH"
        else if matchCnt > 1 then
            set output to "MULTI_MATCH:"
            repeat with m in matches
                set output to output & m & "|"
            end repeat
            return output
        else
            set targetName to item 1 of matches
            set targetReminder to first reminder in remList whose name is targetName
            set completed of targetReminder to true
            return "OK:" & targetName
        end if
    on error
        return "LIST_NOT_FOUND"
    end try
end tell'
    
    local result
    result=$(osascript -e "$script" 2>/dev/null)
    
    if [[ "$result" == "LIST_NOT_FOUND" ]]; then
        error_list_not_found
    elif [[ "$result" == "NO_MATCH" ]]; then
        error_no_match "$query"
    elif [[ "$result" == MULTI_MATCH:* ]]; then
        local names="${result#MULTI_MATCH:}"
        echo "Error: Multiple reminders match '$query'. Please be more specific:" >&2
        echo "$names" | tr '|' '\n' | while read -r n; do
            [[ -n "$n" ]] && echo "  - $n" >&2
        done
        exit 1
    elif [[ "$result" == OK:* ]]; then
        echo "Completed: ${result#OK:}"
    else
        echo "Error: Failed to complete reminder" >&2
        exit 1
    fi
}

# delete <name> - Delete reminder (fuzzy match)
cmd_delete() {
    local query="$1"
    
    if [[ -z "$query" ]]; then
        echo "Error: Reminder name required" >&2
        echo "Usage: reminder.sh delete <name>" >&2
        exit 1
    fi
    
    # Find and delete matching reminder via AppleScript
    local script='
tell application "Reminders"
    try
        set remList to list "'"$REMINDER_LIST"'"
        set nms to name of every reminder in remList
        set cnt to count of nms
        set matches to {}
        repeat with i from 1 to cnt
            if (item i of nms) contains "'"$query"'" then
                set end of matches to item i of nms
            end if
        end repeat
        set matchCnt to count of matches
        if matchCnt = 0 then
            return "NO_MATCH"
        else if matchCnt > 1 then
            set output to "MULTI_MATCH:"
            repeat with m in matches
                set output to output & m & "|"
            end repeat
            return output
        else
            set targetName to item 1 of matches
            set targetReminder to first reminder in remList whose name is targetName
            delete targetReminder
            return "OK:" & targetName
        end if
    on error
        return "LIST_NOT_FOUND"
    end try
end tell'
    
    local result
    result=$(osascript -e "$script" 2>/dev/null)
    
    if [[ "$result" == "LIST_NOT_FOUND" ]]; then
        error_list_not_found
    elif [[ "$result" == "NO_MATCH" ]]; then
        error_no_match "$query"
    elif [[ "$result" == MULTI_MATCH:* ]]; then
        local names="${result#MULTI_MATCH:}"
        echo "Error: Multiple reminders match '$query'. Please be more specific:" >&2
        echo "$names" | tr '|' '\n' | while read -r n; do
            [[ -n "$n" ]] && echo "  - $n" >&2
        done
        exit 1
    elif [[ "$result" == OK:* ]]; then
        echo "Deleted: ${result#OK:}"
    else
        echo "Error: Failed to delete reminder" >&2
        exit 1
    fi
}

# Show usage
show_usage() {
    cat <<EOF
macOS Reminders CLI - Personal task management

Usage: reminder.sh <command> [args]

Commands:
  list [status]              List reminders (status: all/pending/done, default: pending)
  add <name>                 Add a new reminder
    --due DATE               Due date (e.g. "2026-03-30", "March 30")
    --priority N             Priority: 0=none, 1=low, 5=medium, 9=high (also: low/med/high)
  complete <name>            Mark reminder as completed (fuzzy match)
  delete <name>              Delete reminder (fuzzy match)

Environment:
  REMINDER_LIST              List name (default: 提醒)

Examples:
  reminder.sh list
  reminder.sh list all
  reminder.sh add "Buy milk tomorrow" --due "2026-03-30" --priority high
  reminder.sh add "Call dentist" --priority 5
  reminder.sh complete "milk"
  reminder.sh delete "milk"
EOF
}

case "${1:-}" in
    list)
        cmd_list "${2:-pending}"
        ;;
    add)
        shift
        cmd_add "$@"
        ;;
    complete)
        cmd_complete "${2:-}"
        ;;
    delete)
        cmd_delete "${2:-}"
        ;;
    -h|--help|help)
        show_usage
        ;;
    "")
        show_usage
        exit 1
        ;;
    *)
        echo "Error: Unknown command '$1'" >&2
        show_usage
        exit 1
        ;;
esac