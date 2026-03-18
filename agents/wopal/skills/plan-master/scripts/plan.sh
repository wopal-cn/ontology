#!/bin/bash
# Plan Master Script
# Usage: plan.sh <command> [args]
#   add <priority> <item>  - Add item (priority: high|medium|low)
#   done <pattern>         - Mark matching item as done
#   remove <pattern>       - Remove matching item
#   list [priority]        - List items, optionally by priority
#   summary                - Quick summary for heartbeat

set -e

# Auto-detect workspace root by finding .wopal or .git directory
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SEARCH_DIR="$SCRIPT_DIR"
while [[ "$SEARCH_DIR" != "/" ]]; do
  if [[ "$(basename "$SEARCH_DIR")" == ".wopal" ]]; then
    ROOT_DIR="$(dirname "$SEARCH_DIR")"
    break
  fi
  if [[ -d "$SEARCH_DIR/.wopal" ]]; then
    ROOT_DIR="$SEARCH_DIR"
    break
  fi
  SEARCH_DIR="$(dirname "$SEARCH_DIR")"
done

# Fallback to .git if .wopal not found
if [[ -z "$ROOT_DIR" ]]; then
  ROOT_DIR="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || echo "")"
fi

PLAN_FILE="${PLAN_FILE:-${ROOT_DIR:-.}/memory/PLAN.md}"
DATE=$(date +%Y-%m-%d)

# Ensure PLAN.md exists with proper structure
init_plan() {
    if [[ ! -f "$PLAN_FILE" ]]; then
        cat > "$PLAN_FILE" << 'EOF'
# PLANS

*Last updated: DATE_PLACEHOLDER*

## 🔴 High Priority

## 🟡 Medium Priority

## 🟢 Nice to Have

## ✅ Done

---

## Notes

EOF
        sed -i '' "s/DATE_PLACEHOLDER/$DATE/" "$PLAN_FILE" 2>/dev/null || \
        sed -i "s/DATE_PLACEHOLDER/$DATE/" "$PLAN_FILE"
    fi
}

# Update the "Last updated" date
update_date() {
    sed -i '' "s/\*Last updated:.*\*/*Last updated: $DATE*/" "$PLAN_FILE" 2>/dev/null || \
    sed -i "s/\*Last updated:.*\*/*Last updated: $DATE*/" "$PLAN_FILE"
}

# Add an item
add_item() {
    local priority="$1"
    local item="$2"
    
    init_plan
    
    local section=""
    case "$priority" in
        high)   section="## 🔴 High Priority" ;;
        medium) section="## 🟡 Medium Priority" ;;
        low)    section="## 🟢 Nice to Have" ;;
        *)      section="## 🟡 Medium Priority"; item="$priority $item" ;;
    esac
    
    # Find the section and add item after it
    local entry="- [ ] $item (added: $DATE)"
    
    # Use awk to insert after the section header
    awk -v section="$section" -v entry="$entry" '
        $0 == section { print; print entry; next }
        { print }
    ' "$PLAN_FILE" > "$PLAN_FILE.tmp" && mv "$PLAN_FILE.tmp" "$PLAN_FILE"
    
    update_date
    echo "✅ Added to $priority priority: $item"
}

# Mark item as done
mark_done() {
    local pattern="$1"
    
    # Find and move the item
    if grep -q "\- \[ \].*$pattern" "$PLAN_FILE"; then
        # Extract the item text
        local item=$(grep -m1 "\- \[ \].*$pattern" "$PLAN_FILE" | sed 's/- \[ \] //' | sed 's/ (added:.*//')
        
        # Remove from current location
        sed -i '' "/\- \[ \].*$pattern/d" "$PLAN_FILE" 2>/dev/null || \
        sed -i "/\- \[ \].*$pattern/d" "$PLAN_FILE"
        
        # Add to Done section
        local done_entry="- [x] $item (done: $DATE)"
        awk -v section="## ✅ Done" -v entry="$done_entry" '
            $0 == section { print; print entry; next }
            { print }
        ' "$PLAN_FILE" > "$PLAN_FILE.tmp" && mv "$PLAN_FILE.tmp" "$PLAN_FILE"
        
        update_date
        
        # Auto-cleanup old done items (>7 days)
        local week_ago=$(date -v-7d +%Y-%m-%d 2>/dev/null || date -d "7 days ago" +%Y-%m-%d)
        local archived=0
        
        # Find done items with dates older than week_ago
        while IFS= read -r done_date; do
            if [[ -n "$done_date" && "$done_date" < "$week_ago" ]]; then
                # Delete the line with this done date
                sed -i '' "/- \[x\].*(done: $done_date)/d" "$PLAN_FILE" 2>/dev/null || \
                sed -i "/- \[x\].*(done: $done_date)/d" "$PLAN_FILE"
                ((archived++))
            fi
        done < <(grep -oP '(?<=done: )[0-9]{4}-[0-9]{2}-[0-9]{2}' "$PLAN_FILE" 2>/dev/null || \
                  grep -oE 'done: [0-9]{4}-[0-9]{2}-[0-9]{2}' "$PLAN_FILE" | sed 's/done: //')
        
        if [[ $archived -gt 0 ]]; then
            echo "🧹 Archived $archived old done items"
        fi
        
        echo "✅ Marked done: $item"
    else
        echo "❌ No matching item found for: $pattern"
        exit 1
    fi
}

# Remove item completely
remove_item() {
    local pattern="$1"
    
    if grep -q "\- \[.\].*$pattern" "$PLAN_FILE"; then
        sed -i '' "/\- \[.\].*$pattern/d" "$PLAN_FILE" 2>/dev/null || \
        sed -i "/\- \[.\].*$pattern/d" "$PLAN_FILE"
        update_date
        echo "🗑️ Removed item matching: $pattern"
    else
        echo "❌ No matching item found for: $pattern"
        exit 1
    fi
}

# List items
list_items() {
    local priority="$1"
    
    init_plan
    
    if [[ -z "$priority" ]]; then
        cat "$PLAN_FILE"
    else
        local section=""
        case "$priority" in
            high)   section="High Priority" ;;
            medium) section="Medium Priority" ;;
            low)    section="Nice to Have" ;;
            done)   section="Done" ;;
        esac
        
        awk -v section="$section" '
            $0 ~ section { found=1 }
            found && /^## / && $0 !~ section { found=0 }
            found { print }
        ' "$PLAN_FILE"
    fi
}

# Summary for heartbeat
summary() {
    init_plan
    
    # Count by section (ensure numeric values)
    local high_count=$(awk '/🔴 High/,/^## 🟡/' "$PLAN_FILE" | grep -c "^- \[ \]" || true)
    local med_count=$(awk '/🟡 Medium/,/^## 🟢/' "$PLAN_FILE" | grep -c "^- \[ \]" || true)
    local low_count=$(awk '/🟢 Nice/,/^## ✅/' "$PLAN_FILE" | grep -c "^- \[ \]" || true)
    high_count=${high_count:-0}
    med_count=${med_count:-0}
    low_count=${low_count:-0}
    local total=$((high_count + med_count + low_count))
    
    # Check for stale items (>7 days old)
    local stale=0
    local week_ago=$(date -v-7d +%Y-%m-%d 2>/dev/null || date -d "7 days ago" +%Y-%m-%d)
    while IFS= read -r line; do
        if [[ "$line" =~ added:\ ([0-9]{4}-[0-9]{2}-[0-9]{2}) ]]; then
            local added="${BASH_REMATCH[1]}"
            if [[ "$added" < "$week_ago" ]]; then
                ((stale++))
            fi
        fi
    done < <(grep "^- \[ \]" "$PLAN_FILE")
    
    echo "📋 Plan: $total items ($high_count high, $med_count medium, $low_count low)"
    if [[ $stale -gt 0 ]]; then
        echo "⚠️ $stale stale items (>7 days old)"
    fi
    if [[ $high_count -gt 0 ]]; then
        echo "🔴 High priority items:"
        awk '/🔴 High/,/^## 🟡/' "$PLAN_FILE" | grep "^- \[ \]" | head -3 | sed 's/- \[ \] /  • /' | sed 's/ (added:.*//' | sed 's/\*\*//g'
    fi
}

# Main
case "$1" in
    add)
        add_item "$2" "$3"
        ;;
    done)
        mark_done "$2"
        ;;
    remove)
        remove_item "$2"
        ;;
    list)
        list_items "$2"
        ;;
    summary)
        summary
        ;;
    *)
        echo "Usage: plan.sh <command> [args]"
        echo "  add <priority> <item>  - Add item (priority: high|medium|low)"
        echo "  done <pattern>         - Mark matching item as done"
        echo "  remove <pattern>       - Remove matching item"
        echo "  list [priority]        - List items"
        echo "  summary                - Quick summary"
        exit 1
        ;;
esac