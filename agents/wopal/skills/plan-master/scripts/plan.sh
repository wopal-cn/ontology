#!/bin/bash
# Plan Master Script
# Usage: plan.sh <command> [args]
#   add <priority> <item>  - Add item (priority: high|medium|low)
#   done <pattern>         - Mark matching item as done
#   remove <pattern>       - Remove matching item
#   list [priority]        - List items, optionally by priority
#   summary                - Quick summary for heartbeat
#   craft <name> [--project <name> | --global] [--issue <N>] - Create plan draft
#   refine <pattern> [--project <name> | --global] - Research and refine plan
#   review <pattern> [--project <name> | --global] - Review and confirm plan
#   execute <pattern> [--project <name> | --global] [--fae] [--worktree] - Execute plan

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

# Global variable for project context (set by --project or --global)
PLAN_PROJECT=""

# ============================================
# Path Resolution
# ============================================

resolve_plan_dir() {
    local project="${PLAN_PROJECT:-}"
    if [[ -n "$project" ]]; then
        echo "${ROOT_DIR:-.}/docs/products/${project}/plans"
    else
        echo "${ROOT_DIR:-.}/docs/products/plans"
    fi
}

resolve_plan_file() {
    local input="$1"
    local plan_dir
    plan_dir="$(resolve_plan_dir)"

    if [[ -z "$input" ]]; then
        echo "❌ Plan name/pattern required" >&2
        return 1
    fi

    if [[ -f "$input" ]]; then
        echo "$input"
        return 0
    fi

    local matches=("$plan_dir"/*"$input"*.md)

    if [[ ! -e "${matches[0]}" ]]; then
        echo "❌ No plan found matching: $input" >&2
        echo "   Searched in: $plan_dir" >&2
        return 1
    fi

    if [[ ${#matches[@]} -gt 1 ]]; then
        echo "❌ Multiple plans matched: $input" >&2
        printf '  - %s\n' "${matches[@]}" >&2
        return 1
    fi

    echo "${matches[0]}"
}

# ============================================
# PLAN.md Status Sync
# ============================================

# Update status marker in PLAN.md task item
update_plan_status() {
    local plan_name="$1"
    local new_status="$2"

    # Match format: - [ ] plan-name [status] (added: ...)
    if grep -q "\- \[ \].*${plan_name}" "$PLAN_FILE"; then
        # Check if status marker exists
        if grep -q "\- \[ \].*${plan_name}.*\[" "$PLAN_FILE"; then
            # Update existing status
            sed -i '' "s|\(\- \[ \].*${plan_name}.*\[\)[a-z]*\]|\1${new_status}]|" "$PLAN_FILE" 2>/dev/null || \
            sed -i "s|\(\- \[ \].*${plan_name}.*\[\)[a-z]*\]|\1${new_status}]|" "$PLAN_FILE"
        else
            # Add status marker after plan name
            sed -i '' "s|\(\- \[ \] \)${plan_name}\(.*\)|\1${plan_name} [${new_status}]\2|" "$PLAN_FILE" 2>/dev/null || \
            sed -i "s|\(\- \[ \] \)${plan_name}\(.*\)|\1${plan_name} [${new_status}]\2|" "$PLAN_FILE"
        fi
        update_date
        echo "📋 PLAN.md status updated: $new_status"
    fi
}

# Sync Issue Label based on plan status
# Usage: sync_issue_label <plan_file> <status>
# status: executing -> status/in-progress
#         completed -> status/in-review
#         validated -> status/done
sync_issue_label() {
    local plan_file="$1"
    local new_status="$2"

    # Extract Issue number from plan metadata
    local issue_number=""
    local issue_line
    issue_line="$(grep -m1 '^\- \*\*Issue\*\*:' "$plan_file")"
    if [[ "$issue_line" =~ \#([0-9]+) ]]; then
        issue_number="${BASH_REMATCH[1]}"
    fi

    if [[ -z "$issue_number" ]]; then
        return 0  # No Issue linked, skip
    fi

    # Map plan status to Issue label
    local label=""
    case "$new_status" in
        executing) label="status/in-progress" ;;
        completed) label="status/in-review" ;;
        validated) label="status/done" ;;
        *) return 0 ;;
    esac

    # Check if gh CLI is available
    if ! command -v gh &> /dev/null; then
        echo "⚠️ gh CLI not available, skipping Issue label sync"
        return 0
    fi

    # Remove old status labels and add new one
    local old_labels="status/planning status/in-progress status/in-review status/blocked"
    for old_label in $old_labels; do
        gh issue edit "$issue_number" --remove-label "$old_label" 2>/dev/null || true
    done

    gh issue edit "$issue_number" --add-label "$label" 2>/dev/null && \
        echo "🏷️ Issue #$issue_number label updated: $label" || \
        echo "⚠️ Failed to update Issue #$issue_number label"
}

# ============================================
# PLAN.md Management (Task Tracking)
# ============================================

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
        done < <(grep -oE 'done: [0-9]{4}-[0-9]{2}-[0-9]{2}' "$PLAN_FILE" | sed 's/done: //')
        
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

# ============================================
# Plan Lifecycle Management
# ============================================

# Create plan template
create_plan_template() {
    local plan_file="$1"
    local plan_name="$2"
    local prd_path="$3"
    local deep_mode="$4"
    local issue_number="$5"
    local target_project="$6"

    # Build Issue line
    local issue_line=""
    if [[ -n "$issue_number" ]]; then
        issue_line="- **Issue**: #${issue_number}"
    fi

    # Build Target Project line
    local project_line=""
    if [[ -n "$target_project" ]]; then
        project_line="- **Target Project**: ${target_project}"
    fi

    cat > "$plan_file" << EOF
# ${plan_name}

## 元数据

- **PRD**: \`${prd_path:-待关联（执行前必填）}\`
${issue_line}${project_line}- **Created**: $(date +%Y-%m-%d)
- **Status**: draft
- **Mode**: $( [[ "$deep_mode" == true ]] && echo "deep" || echo "lite" )

## 目标

<!-- 继承自 PRD Problem Statement，一句话描述 -->

## In Scope

- [ ] 待补充

## Out of Scope

- [ ] 待补充（需与 PRD Non-Goals 对齐）

## 文件清单

- \`path/to/file1.ts\` - 创建/修改

## 实施步骤

### Task 1: [任务名称]

**关联 PRD 需求**: REQ-xxx
**Files**:
- Modify: \`path/to/file1.ts\`

- [ ] Step 1: 具体操作
- [ ] Step 2: 验证

**验证**: \`npm test -- path/to/test\`

## 验收标准

- [ ] 对应 PRD Success Criteria 逐项覆盖
- [ ] 所有测试通过
- [ ] 功能验证通过

## 风险与依赖

- 待补充
EOF
}

# Validate plan name convention
validate_plan_name() {
    local name="$1"

    if [[ ! "$name" =~ ^([a-z0-9-]+)-(feature|enhance|fix|refactor|docs|test)-([a-z0-9-]+)$ ]]; then
        echo "❌ Invalid plan name: $name"
        echo ""
        echo "Plan naming convention:"
        echo "  <component>-<type>-<description>.md"
        echo ""
        echo "Components: plan-master, fae, wopal-cli, agent-tools, etc."
        echo "Types: feature, enhance, fix, refactor, docs, test"
        echo "  - feature: new functionality"
        echo "  - enhance: improvement/optimization"
        echo "  - fix: bug fix"
        echo "  - refactor: code refactoring"
        echo "Description: short lowercase with hyphens"
        echo ""
        echo "Examples:"
        echo "  fae-fix-task-wait-bug"
        echo "  wopal-cli-feature-session-messages"
        echo "  plan-master-enhance-validate-phase"
        exit 1
    fi
}

# Create structured plan template
craft_plan() {
    local plan_name="$1"
    shift

    local deep_mode=false
    local prd_path=""
    local project_specified=false
    local priority="medium"
    local no_track=false
    local issue_number=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --deep)
                deep_mode=true
                shift
                ;;
            --prd)
                prd_path="$2"
                shift 2
                ;;
            --project)
                PLAN_PROJECT="$2"
                project_specified=true
                shift 2
                ;;
            --global)
                PLAN_PROJECT=""
                project_specified=true
                shift
                ;;
            --priority)
                priority="$2"
                shift 2
                ;;
            --no-track)
                no_track=true
                shift
                ;;
            --issue)
                issue_number="$2"
                shift 2
                ;;
            *)
                echo "❌ Unknown argument: $1"
                exit 1
                ;;
        esac
    done

    if [[ -z "$plan_name" ]]; then
        echo "❌ Plan name required"
        echo "Usage: plan.sh craft <plan-name> [--project <name> | --global] [--deep] [--prd <prd-path>] [--issue <N>]"
        exit 1
    fi

    # Validate plan naming convention
    validate_plan_name "$plan_name"

    if [[ "$project_specified" != true ]]; then
        echo "⚠️ No project specified. Use --project <name> or --global"
        echo "   --project <name>  Project-level plan in docs/products/<name>/plans/"
        echo "   --global          Space-level plan in docs/products/plans/"
        exit 1
    fi

    local plan_dir
    plan_dir="$(resolve_plan_dir)"
    mkdir -p "$plan_dir"

    local plan_file="$plan_dir/${plan_name}.md"
    if [[ -f "$plan_file" ]]; then
        echo "⚠️ Plan already exists: $plan_file"
        exit 1
    fi

    if [[ -n "$prd_path" && ! -f "${ROOT_DIR:-.}/$prd_path" ]]; then
        echo "❌ PRD file not found: $prd_path"
        exit 1
    fi

    # Target project is the same as PLAN_PROJECT for project-level plans
    local target_project="$PLAN_PROJECT"

    create_plan_template "$plan_file" "$plan_name" "$prd_path" "$deep_mode" "$issue_number" "$target_project"
    echo "✅ Created plan: $plan_file"

    if [[ -n "$issue_number" ]]; then
        echo "🔗 Linked to Issue: #${issue_number}"
    fi

    if [[ "$deep_mode" == true ]]; then
        echo "📋 Deep mode: continue filling this file using the analysis checklist in SKILL.md"
    fi

    # Auto-add to PLAN.md tracking (with status marker)
    if [[ "$no_track" != true ]]; then
        local task_desc="$plan_name [draft]"
        bash "$SCRIPT_DIR/plan.sh" add "$priority" "$task_desc"
    fi
}

# Check plan document completeness (execution-grade quality gate)
check_doc_plan() {
    local pattern="$1"
    shift

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --project)
                PLAN_PROJECT="$2"
                shift 2
                ;;
            --global)
                PLAN_PROJECT=""
                shift
                ;;
            *)
                shift
                ;;
        esac
    done

    local plan_file
    plan_file="$(resolve_plan_file "$pattern")" || exit 1

    local issues=0
    local warnings=0

    echo "🔍 Verifying: $plan_file"
    echo ""

    # 1. Check for placeholders
    local placeholder_found=""
    if grep -nE 'TODO|FIXME|待补充|REQ-xxx|path/to/|\[[^]]*任务名称[^]]*\]' "$plan_file" > /dev/null 2>&1; then
        echo "❌ Found placeholders:"
        grep -nE 'TODO|FIXME|待补充|REQ-xxx|path/to/|\[[^]]*任务名称[^]]*\]' "$plan_file" | head -5
        ((issues++))
        placeholder_found="yes"
    else
        echo "✅ No placeholders"
    fi

    # 2. Check for unclosed HTML comments
    if grep -n '<!--' "$plan_file" | grep -v '<!--.*-->' > /dev/null 2>&1; then
        echo "❌ Found unclosed HTML comments:"
        grep -n '<!--' "$plan_file" | grep -v '<!--.*-->' | head -5
        ((issues++))
    elif [[ -z "$placeholder_found" ]]; then
        echo "✅ No HTML comment placeholders"
    fi

    # 3. PRD validation with type-based requirements
    # Extract plan type from filename by matching known types
    local plan_type=""
    local plan_basename=$(basename "$plan_file" .md)
    # Known plan types in order
    local known_types="feature enhance fix refactor docs test"
    for t in $known_types; do
        if [[ "$plan_basename" =~ -$t- ]] || [[ "$plan_basename" =~ -$t$ ]]; then
            plan_type="$t"
            break
        fi
    done

    local prd_line prd_path

    local prd_line prd_path
    prd_line="$(grep -m1 '^\- \*\*PRD\*\*:' "$plan_file")"
    # Extract path from backticks, or empty if none
    if [[ "$prd_line" =~ \`([^\`]+)\` ]]; then
        prd_path="${BASH_REMATCH[1]}"
    else
        prd_path=""
    fi

    if [[ "$plan_type" == "feature" ]]; then
        # feature type MUST have PRD
        if [[ -z "$prd_path" || "$prd_path" == *"待关联"* || ! -f "${ROOT_DIR:-.}/$prd_path" ]]; then
            echo "❌ feature type plan MUST have PRD: ${prd_path:-<none>}"
            ((issues++))
        else
            echo "✅ PRD linked: $prd_path"
        fi
    else
        # Other types: PRD optional
        if [[ -n "$prd_path" && "$prd_path" != *"待关联"* ]]; then
            if [[ ! -f "${ROOT_DIR:-.}/$prd_path" ]]; then
                echo "⚠️ PRD file not found: $prd_path"
                ((warnings++))
            else
                echo "✅ PRD linked: $prd_path (optional for $plan_type)"
            fi
        else
            echo "✅ No PRD (optional for $plan_type)"
        fi
    fi

    # 4. Required sections
    local missing_sections=0
    for section in "## 目标" "## In Scope" "## Out of Scope" "## 文件清单" "## 实施步骤" "## 验收标准"; do
        if grep -q "$section" "$plan_file"; then
            echo "✅ $section"
        else
            echo "❌ Missing section: $section"
            ((issues++))
            ((missing_sections++))
        fi
    done

    # 5. File list must not be empty (support list and table formats)
    local file_section
    file_section=$(grep -A 10 '^## 文件清单' "$plan_file")
    if echo "$file_section" | grep -qE '(\- `|^\| .*\.|^\| `)' 2>/dev/null; then
        echo "✅ File list populated"
    else
        echo "❌ Empty file list"
        ((issues++))
    fi

    # 6. Tasks must exist
    local task_count
    task_count="$(grep -c '^### Task ' "$plan_file" || true)"
    if [[ "${task_count:-0}" -eq 0 ]]; then
        echo "❌ No tasks found"
        ((issues++))
    else
        echo "✅ Task count: $task_count"
    fi

    # 7. Each task must have PRD requirement mapping (feature only) and verification command
    local prd_req_count verify_count
    prd_req_count="$(grep -c '^\*\*关联 PRD 需求\*\*:' "$plan_file" || true)"
    verify_count="$(grep -c '^\*\*验证\*\*:' "$plan_file" || true)"

    if [[ "${task_count:-0}" -gt 0 ]]; then
        # PRD requirement mapping only required for feature type
        if [[ "$plan_type" == "feature" ]]; then
            if [[ "${prd_req_count:-0}" -lt "${task_count:-0}" ]]; then
                echo "❌ Some tasks are missing PRD requirement mapping ($prd_req_count/$task_count)"
                ((issues++))
            else
                echo "✅ All tasks map to PRD requirements"
            fi
        else
            echo "✅ PRD mapping not required for $plan_type type"
        fi

        if [[ "${verify_count:-0}" -lt "${task_count:-0}" ]]; then
            echo "❌ Some tasks are missing verification commands ($verify_count/$task_count)"
            ((issues++))
        else
            echo "✅ All tasks have verification commands"
        fi
    fi

    # 8. Granularity check (heuristic)
    local checkbox_count
    checkbox_count="$(grep -c '^- \[ \] Step ' "$plan_file" || true)"
    if [[ "${checkbox_count:-0}" -lt "${task_count:-0}" ]]; then
        echo "⚠️ Task granularity may be too coarse (steps: $checkbox_count, tasks: $task_count)"
        ((warnings++))
    else
        echo "✅ Basic step granularity present"
    fi

    echo ""
    if [[ $issues -gt 0 ]]; then
        echo "❌ Plan failed verification ($issues issues, $warnings warnings)"
        exit 1
    fi

    echo "✅ Plan verification passed ($warnings warnings)"
}

# Execute plan after verification
execute_plan() {
    local pattern="$1"
    shift
    local delegate_mode=""
    local use_worktree=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --project)
                PLAN_PROJECT="$2"
                shift 2
                ;;
            --global)
                PLAN_PROJECT=""
                shift
                ;;
            --fae)
                delegate_mode="--fae"
                shift
                ;;
            --worktree)
                use_worktree=true
                shift
                ;;
            *)
                shift
                ;;
        esac
    done

    if [[ -z "$pattern" ]]; then
        echo "❌ Plan name/pattern required"
        echo "Usage: plan.sh execute <plan-name> [--project <name> | --global] [--fae] [--worktree]"
        exit 1
    fi

    local plan_file
    plan_file="$(resolve_plan_file "$pattern")" || exit 1

    local current_status
    current_status=$(grep '^\- \*\*Status\*\*:' "$plan_file" | sed 's/^.*: //')

    if [[ "$current_status" != "reviewed" ]]; then
        echo "❌ Plan status must be 'reviewed' to execute"
        echo "   Current status: $current_status"
        echo "   Run: plan.sh review \"$pattern\" first"
        exit 1
    fi

    echo "✅ Status check passed: reviewed"

    # Update status to executing
    if grep -q '^\- \*\*Status\*\*:' "$plan_file"; then
        sed -i '' 's/^\- \*\*Status\*\*: .*/- **Status**: executing/' "$plan_file" 2>/dev/null || \
        sed -i 's/^\- \*\*Status\*\*: .*/- **Status**: executing/' "$plan_file"
    fi

    echo ""
    echo "📋 Plan ready: $plan_file"
    echo "🚀 Status updated to: executing"

    # Sync status to PLAN.md
    local plan_name=$(basename "$plan_file" .md)
    update_plan_status "$plan_name" "executing"

    # Sync Issue label
    sync_issue_label "$plan_file" "executing"

    # Create worktree if requested
    if [[ "$use_worktree" == true ]]; then
        if [[ -z "$PLAN_PROJECT" ]]; then
            echo "❌ --worktree requires --project <name> (cannot use with --global)"
            exit 1
        fi

        # Extract Issue number from plan metadata for branch naming
        local issue_number=""
        local issue_line
        issue_line="$(grep -m1 '^\- \*\*Issue\*\*:' "$plan_file")"
        if [[ "$issue_line" =~ \#([0-9]+) ]]; then
            issue_number="${BASH_REMATCH[1]}"
        fi

        # Determine branch name: issue-{N}-{slug} or {plan-name}
        local branch_name
        if [[ -n "$issue_number" ]]; then
            # Extract slug from plan name (last segment after type)
            local slug
            slug=$(echo "$plan_name" | sed -E 's/.*-[a-z]+-([a-z0-9-]+)$/\1/')
            branch_name="issue-${issue_number}-${slug}"
        else
            branch_name="$plan_name"
        fi

        # Call git-worktrees skill to create worktree
        local worktree_script
        worktree_script="$SCRIPT_DIR/../git-worktrees/scripts/worktree.sh"

        if [[ ! -f "$worktree_script" ]]; then
            echo "❌ git-worktrees skill not found: $worktree_script"
            exit 1
        fi

        echo ""
        echo "🌳 Creating worktree for isolated execution..."
        echo "   Project: $PLAN_PROJECT"
        echo "   Branch: $branch_name"

        bash "$worktree_script" create "$PLAN_PROJECT" "$branch_name" --no-install --no-test

        echo ""
        echo "✅ Worktree created. Switch to it to execute the plan."
    else
        echo "🧭 Next: hand this plan file to the execution agent"
    fi

    if [[ "$delegate_mode" == "--fae" ]]; then
        echo "⚠️ --fae mode not implemented yet"
    fi
}

# Refine plan - research and iterate until ready for review
refine_plan() {
    local pattern="$1"
    shift

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --project) PLAN_PROJECT="$2"; shift 2 ;;
            --global) PLAN_PROJECT=""; shift ;;
            *) shift ;;
        esac
    done

    local plan_file
    plan_file="$(resolve_plan_file "$pattern")" || exit 1

    local current_status
    current_status=$(grep '^\- \*\*Status\*\*:' "$plan_file" | sed 's/^.*: //')

    if [[ "$current_status" != "draft" && "$current_status" != "refining" ]]; then
        echo "❌ Plan status must be 'draft' or 'refining' to refine"
        echo "   Current status: $current_status"
        exit 1
    fi

    # Update status to refining
    sed -i '' 's/^\- \*\*Status\*\*: .*/- **Status**: refining/' "$plan_file" 2>/dev/null || \
    sed -i 's/^\- \*\*Status\*\*: .*/- **Status**: refining/' "$plan_file"

    # Sync status to PLAN.md
    local plan_name=$(basename "$plan_file" .md)
    update_plan_status "$plan_name" "refining"

    echo "✅ Plan status: refining"
    echo ""
    echo "📋 Plan file: $plan_file"
    echo ""
    echo "🧭 Refine workflow:"
    echo "   1. Research codebase, understand context"
    echo "   2. Fill in all sections (Goal, Scope, Files, Tasks)"
    echo "   3. Run: plan.sh check-doc \"$pattern\""
    echo "   4. Iterate until check-doc passes"
    echo "   5. Run: plan.sh review \"$pattern\" when ready"
}

# Review plan - mark as ready for user confirmation
review_plan() {
    local pattern="$1"
    shift

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --project) PLAN_PROJECT="$2"; shift 2 ;;
            --global) PLAN_PROJECT=""; shift ;;
            *) shift ;;
        esac
    done

    local plan_file
    plan_file="$(resolve_plan_file "$pattern")" || exit 1

    local current_status
    current_status=$(grep '^\- \*\*Status\*\*:' "$plan_file" | sed 's/^.*: //')

    if [[ "$current_status" != "refining" ]]; then
        echo "❌ Plan status must be 'refining' to review"
        echo "   Current status: $current_status"
        echo "   Run: plan.sh refine \"$pattern\" first"
        exit 1
    fi

    # Run check-doc first
    echo "🔍 Running check-doc..."
    if ! bash "$SCRIPT_DIR/plan.sh" check-doc "$pattern" ${PLAN_PROJECT:+--project "$PLAN_PROJECT"} ${PLAN_PROJECT:-${GLOBAL_FLAG:-}}; then
        echo ""
        echo "❌ Plan failed check-doc. Continue refining."
        exit 1
    fi

    # Update status to reviewed
    sed -i '' 's/^\- \*\*Status\*\*: .*/- **Status**: reviewed/' "$plan_file" 2>/dev/null || \
    sed -i 's/^\- \*\*Status\*\*: .*/- **Status**: reviewed/' "$plan_file"

    # Sync status to PLAN.md
    local plan_name=$(basename "$plan_file" .md)
    update_plan_status "$plan_name" "reviewed"

    echo ""
    echo "✅ Plan status: reviewed"
    echo ""
    echo "📋 Plan ready for user confirmation: $plan_file"
    echo ""
    echo "🧭 Next: User reviews and approves, then run:"
    echo "   plan.sh execute \"$pattern\""
}

# Complete plan execution
complete_plan() {
    local pattern="$1"
    shift

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --project) PLAN_PROJECT="$2"; shift 2 ;;
            --global) PLAN_PROJECT=""; shift ;;
            *) shift ;;
        esac
    done

    local plan_file
    plan_file="$(resolve_plan_file "$pattern")" || exit 1

    local current_status
    current_status=$(grep '^\- \*\*Status\*\*:' "$plan_file" | sed 's/^.*: //')

    if [[ "$current_status" != "executing" ]]; then
        echo "❌ Plan status must be 'executing' to complete"
        echo "   Current status: $current_status"
        exit 1
    fi

    # Update status to completed
    sed -i '' 's/^\- \*\*Status\*\*: .*/- **Status**: completed/' "$plan_file" 2>/dev/null || \
    sed -i 's/^\- \*\*Status\*\*: .*/- **Status**: completed/' "$plan_file"

    # Sync status to PLAN.md
    local plan_name=$(basename "$plan_file" .md)
    update_plan_status "$plan_name" "completed"

    # Sync Issue label
    sync_issue_label "$plan_file" "completed"

    echo "✅ Plan execution completed: $plan_file"
    echo "🧭 Next: validate with real-world scenario, then run 'plan.sh validate \"$pattern\" --confirm'"
}

# Validate plan with user confirmation
validate_plan() {
    local pattern="$1"
    shift
    local confirmed=false

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --project) PLAN_PROJECT="$2"; shift 2 ;;
            --global) PLAN_PROJECT=""; shift ;;
            --confirm) confirmed=true; shift ;;
            *) shift ;;
        esac
    done

    local plan_file
    plan_file="$(resolve_plan_file "$pattern")" || exit 1

    local current_status
    current_status=$(grep '^\- \*\*Status\*\*:' "$plan_file" | sed 's/^.*: //')

    if [[ "$current_status" != "completed" ]]; then
        echo "❌ Plan status must be 'completed' to validate"
        echo "   Current status: $current_status"
        echo "   Run: plan.sh complete \"$pattern\""
        exit 1
    fi

    if [[ "$confirmed" != true ]]; then
        echo "⚠️  VALIDATION REQUIRED"
        echo ""
        echo "The plan execution is complete. Before archiving, you MUST:"
        echo "  1. Perform real-world scenario validation"
        echo "  2. Verify the changes work as expected"
        echo "  3. Confirm with the user (Sam)"
        echo ""
        echo "After validation passes, run:"
        echo "  plan.sh validate \"$pattern\" --confirm"
        exit 0
    fi

    # Update status to validated
    sed -i '' 's/^\- \*\*Status\*\*: .*/- **Status**: validated/' "$plan_file" 2>/dev/null || \
    sed -i 's/^\- \*\*Status\*\*: .*/- **Status**: validated/' "$plan_file"

    # Sync status to PLAN.md
    local plan_name=$(basename "$plan_file" .md)
    update_plan_status "$plan_name" "validated"

    # Sync Issue label
    sync_issue_label "$plan_file" "validated"

    echo "✅ Plan validated: $plan_file"
    echo "🧭 Next: archive the plan with 'plan.sh archive \"$pattern\"'"
}

# Archive completed plan
archive_plan() {
    local pattern="$1"
    shift

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --project) PLAN_PROJECT="$2"; shift 2 ;;
            --global) PLAN_PROJECT=""; shift ;;
            *) shift ;;
        esac
    done

    local plan_file
    plan_file="$(resolve_plan_file "$pattern")" || exit 1

    local current_status
    current_status=$(grep '^\- \*\*Status\*\*:' "$plan_file" | sed 's/^.*: //')

    if [[ "$current_status" != "validated" ]]; then
        echo "❌ Plan must be validated before archiving"
        echo "   Current status: $current_status"
        echo "   Run: plan.sh validate \"$pattern\" --confirm"
        exit 1
    fi

    # Move to done/ directory
    local plan_dir
    plan_dir="$(resolve_plan_dir)"
    local done_dir="$plan_dir/done"
    mkdir -p "$done_dir"

    local plan_name=$(basename "$plan_file")
    mv "$plan_file" "$done_dir/$plan_name"

    echo "✅ Plan archived: $done_dir/$plan_name"

    # Auto-update PLAN.md: find and mark related task as done
    local search_pattern="${plan_name%.md}"
    if grep -q "\- \[ \].*$search_pattern" "$PLAN_FILE"; then
        local item=$(grep -m1 "\- \[ \].*$search_pattern" "$PLAN_FILE" | sed 's/- \[ \] //' | sed 's/ (added:.*//')
        sed -i '' "/\- \[ \].*$search_pattern/d" "$PLAN_FILE" 2>/dev/null || \
        sed -i "/\- \[ \].*$search_pattern/d" "$PLAN_FILE"
        local done_entry="- [x] $item (done: $DATE)"
        awk -v section="## ✅ Done" -v entry="$done_entry" '
            $0 == section { print; print entry; next }
            { print }
        ' "$PLAN_FILE" > "$PLAN_FILE.tmp" && mv "$PLAN_FILE.tmp" "$PLAN_FILE"
        update_date
        echo "✅ PLAN.md task marked done: $item"
    else
        echo "⚠️  No matching task found in PLAN.md for: $search_pattern"
        echo "   You may need to manually update PLAN.md"
    fi

    echo "🧭 Next: commit the changes"
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
        shift
        craft_plan "$@"
        ;;
    check-doc)
        shift
        check_doc_plan "$@"
        ;;
    refine)
        shift
        refine_plan "$@"
        ;;
    review)
        shift
        review_plan "$@"
        ;;
    execute)
        shift
        execute_plan "$@"
        ;;
    complete)
        shift
        complete_plan "$@"
        ;;
    validate)
        shift
        validate_plan "$@"
        ;;
    archive)
        shift
        archive_plan "$@"
        ;;
    *)
        echo "Usage: plan.sh <command> [args]"
        echo "  add <priority> <item>  - Add item (priority: high|medium|low)"
        echo "  done <pattern>         - Mark matching item as done"
        echo "  remove <pattern>       - Remove matching item"
        echo "  list [priority]        - List items"
        echo "  summary                - Quick summary"
        echo ""
        echo "  craft <name> [--project <name> | --global] [--deep] [--prd <path>]"
        echo "      Create plan template"
        echo "      --project <name>  Project-level plan"
        echo "      --global          Space-level plan"
        echo "      --deep            Deep analysis mode"
        echo "      --prd <path>      Link to PRD file"
        echo "      --priority <lvl>  Priority for PLAN.md tracking (high|medium|low)"
        echo "      --no-track        Skip auto-tracking in PLAN.md"
        echo ""
        echo "  check-doc <pattern> [--project <name> | --global]"
        echo "      Check plan document completeness"
        echo ""
        echo "  refine <pattern> [--project <name> | --global]"
        echo "      Research and refine plan (draft → refining)"
        echo ""
        echo "  review <pattern> [--project <name> | --global]"
        echo "      Mark plan ready for user review (refining → reviewed)"
        echo ""
        echo "  execute <pattern> [--project <name> | --global] [--fae]"
        echo "      Execute plan after verification"
        echo ""
        echo "  complete <pattern> [--project <name> | --global]"
        echo "      Mark plan as completed (after execution)"
        echo ""
        echo "  validate <pattern> [--project <name> | --global] [--confirm]"
        echo "      Validate plan with user confirmation"
        echo "      --confirm  Confirm validation (required to proceed)"
        echo ""
        echo "  archive <pattern> [--project <name> | --global]"
        echo "      Archive validated plan to done/"
        exit 1
        ;;
esac
