#!/bin/bash
# dev-flow — hybrid wrapper (Phase 5: all commands routed to Python)
# Usage: flow.sh <command> <issue-or-plan> [options]
#
# This wrapper routes all commands to Python implementation.
# Legacy Bash flow-legacy.sh is preserved as reference/fallback.
#
# Commands (all routed to Python):
#   - issue create/update
#   - plan (with --check/--deep/--prd, no-issue mode)
#   - approve (with --worktree, check-doc, stash)
#   - complete (with --pr, acceptance_criteria gate)
#   - verify (with --confirm gate, PR merged check, user_validation gate)
#   - archive (with sync before archive, project warning)
#   - query status/list
#   - sync
#   - decompose-prd
#   - reset
#   - help

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LEGACY_SCRIPT="$SCRIPT_DIR/flow-legacy.sh"
PYTHON_SCRIPT="$SCRIPT_DIR/flow.py"

# Commands routed to Python implementation
PYTHON_COMMANDS="issue|plan|query|sync|archive|approve|complete|verify|help|status|list|decompose-prd|reset"

# Check if legacy script exists
if [[ ! -f "$LEGACY_SCRIPT" ]]; then
    echo "ERROR: flow-legacy.sh not found at $LEGACY_SCRIPT" >&2
    exit 1
fi

# Get the command from arguments
CMD="${1:-}"

# Route to Python or legacy
if [[ "$CMD" =~ ^($PYTHON_COMMANDS)$ ]]; then
    exec python3 "$PYTHON_SCRIPT" "$@"
else
    exec "$LEGACY_SCRIPT" "$@"
fi