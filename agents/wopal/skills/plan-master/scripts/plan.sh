#!/bin/bash
# Plan Master Script
# Usage: plan.sh <command> [args]
#   add <priority> <item>  - Add item (priority: high|medium|low)
#   done <pattern>         - Mark matching item as done
#   remove <pattern>       - Remove matching item
#   list [priority]        - List items, optionally by priority
#   summary                - Quick summary for heartbeat
#   craft <name>           - Create structured plan template
#   delegate <pattern>     - Mark plan as delegated to fae
#   verify <pattern>       - Verify plan completeness

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

# Create structured plan template
craft_plan() {
    local plan_name="$1"
    
    if [[ -z "$plan_name" ]]; then
        echo "❌ Plan name required"
        echo "Usage: plan.sh craft <plan-name>"
        exit 1
    fi
    
    local plan_dir="${ROOT_DIR:-.}/docs/products/plans"
    local plan_file="$plan_dir/${plan_name}.md"
    
    mkdir -p "$plan_dir"
    
    if [[ -f "$plan_file" ]]; then
        echo "⚠️ Plan already exists: $plan_file"
        echo "Use a different name or edit existing plan"
        exit 1
    fi
    
    cat > "$plan_file" << 'EOF'
# PLAN_NAME_PLACEHOLDER

## 目标
<!-- 一句话描述计划目标 -->

## 背景
<!-- 为什么需要这个计划？解决什么问题？ -->

## 文件清单
- `path/to/file1.ts` - 创建/修改
- `path/to/file2.ts` - 创建/修改

## 实施步骤

### Step 1: <步骤名称>
**文件**: `path/to/file1.ts`

**操作**:
- [ ] 写测试
- [ ] 跑测试确认失败
- [ ] 写最小实现
- [ ] 跑测试确认通过

```typescript
// 完整可运行代码
```

**验证**: `npm test -- file1.test.ts`

### Step 2: <步骤名称>
<!-- 继续添加步骤... -->

## 完成标准
- [ ] 所有测试通过
- [ ] 无 lint 错误
- [ ] 功能验证通过

## 风险与依赖
<!-- 可选：列出潜在风险和依赖项 -->
EOF
    
    sed -i '' "s/PLAN_NAME_PLACEHOLDER/$plan_name/" "$plan_file" 2>/dev/null || \
    sed -i "s/PLAN_NAME_PLACEHOLDER/$plan_name/" "$plan_file"
    
    echo "✅ Created plan template: $plan_file"
    echo ""
    echo "Next steps:"
    echo "  1. Fill in the template with your plan details"
    echo "  2. Run: plan.sh verify $plan_name"
    echo "  3. Run: plan.sh delegate $plan_name (when ready for fae)"
}

# Mark plan as delegated to fae
delegate_plan() {
    local pattern="$1"
    
    if [[ -z "$pattern" ]]; then
        echo "❌ Plan name/pattern required"
        echo "Usage: plan.sh delegate <plan-name>"
        exit 1
    fi
    
    local plan_dir="${ROOT_DIR:-.}/docs/products/plans"
    local plan_file=$(ls "$plan_dir"/*${pattern}*.md 2>/dev/null | head -1)
    
    if [[ -z "$plan_file" ]]; then
        echo "❌ No plan found matching: $pattern"
        exit 1
    fi
    
    local plan_name=$(basename "$plan_file" .md)
    
    # Add delegated marker to plan file
    if ! grep -q "## 状态" "$plan_file"; then
        sed -i '' "1s/^/## 状态: 🚀 已委派给 fae\n\n/" "$plan_file" 2>/dev/null || \
        sed -i "1s/^/## 状态: 🚀 已委派给 fae\n\n/" "$plan_file"
    else
        sed -i '' "s/## 状态.*/## 状态: 🚀 已委派给 fae/" "$plan_file" 2>/dev/null || \
        sed -i "s/## 状态.*/## 状态: 🚀 已委派给 fae/" "$plan_file"
    fi
    
    # Add to PLAN.md as delegated item
    init_plan
    local entry="- [ ] [委派] $plan_name → fae (delegated: $DATE)"
    awk -v section="## 🟡 Medium Priority" -v entry="$entry" '
        $0 == section { print; print entry; next }
        { print }
    ' "$PLAN_FILE" > "$PLAN_FILE.tmp" && mv "$PLAN_FILE.tmp" "$PLAN_FILE"
    update_date
    
    echo "✅ Marked as delegated: $plan_file"
    echo "📋 Added to PLAN.md for tracking"
}

# Verify plan completeness
verify_plan() {
    local pattern="$1"
    
    if [[ -z "$pattern" ]]; then
        echo "❌ Plan name/pattern required"
        echo "Usage: plan.sh verify <plan-name>"
        exit 1
    fi
    
    local plan_dir="${ROOT_DIR:-.}/docs/products/plans"
    local plan_file=$(ls "$plan_dir"/*${pattern}*.md 2>/dev/null | head -1)
    
    if [[ -z "$plan_file" ]]; then
        echo "❌ No plan found matching: $pattern"
        exit 1
    fi
    
    local issues=0
    
    echo "🔍 Verifying: $plan_file"
    echo ""
    
    # Check 1: Completeness - no TODO or placeholders
    if grep -qi "TODO\|FIXME\|<!--.*-->" "$plan_file" 2>/dev/null; then
        echo "❌ Found TODO/FIXME/placeholders"
        grep -n "TODO\|FIXME\|<!--" "$plan_file" | head -5
        ((issues++))
    else
        echo "✅ No TODO/FIXME/placeholders"
    fi
    
    # Check 2: Has file list
    if grep -q "## 文件清单" "$plan_file"; then
        if grep -A 3 "## 文件清单" "$plan_file" | grep -q "\- \`"; then
            echo "✅ Has file list"
        else
            echo "⚠️ File list section exists but empty"
            ((issues++))
        fi
    else
        echo "❌ Missing file list section"
        ((issues++))
    fi
    
    # Check 3: Has implementation steps
    if grep -q "### Step" "$plan_file"; then
        local step_count=$(grep -c "### Step" "$plan_file")
        echo "✅ Has $step_count implementation steps"
    else
        echo "❌ Missing implementation steps"
        ((issues++))
    fi
    
    # Check 4: Has code blocks
    if grep -q '```' "$plan_file"; then
        local code_blocks=$(grep -c '```' "$plan_file")
        echo "✅ Has $((code_blocks / 2)) code blocks"
    else
        echo "⚠️ No code blocks found"
    fi
    
    # Check 5: Has verification commands
    if grep -qi "验证\|verify\|test" "$plan_file"; then
        echo "✅ Has verification commands"
    else
        echo "⚠️ No verification commands found"
    fi
    
    echo ""
    if [[ $issues -eq 0 ]]; then
        echo "✅ Plan verification passed"
    else
        echo "❌ Plan has $issues issue(s) to fix"
        exit 1
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
    craft)
        craft_plan "$2"
        ;;
    delegate)
        delegate_plan "$2"
        ;;
    verify)
        verify_plan "$2"
        ;;
    *)
        echo "Usage: plan.sh <command> [args]"
        echo "  add <priority> <item>  - Add item (priority: high|medium|low)"
        echo "  done <pattern>         - Mark matching item as done"
        echo "  remove <pattern>       - Remove matching item"
        echo "  list [priority]        - List items"
        echo "  summary                - Quick summary"
        echo "  craft <name>           - Create structured plan template"
        echo "  delegate <pattern>     - Mark plan as delegated to fae"
        echo "  verify <pattern>       - Verify plan completeness"
        exit 1
        ;;
esac