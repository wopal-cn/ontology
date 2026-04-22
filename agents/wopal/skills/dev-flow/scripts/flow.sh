#!/bin/bash
# dev-flow — hybrid wrapper (Phase 5: issue/query/sync/archive/approve/complete/verify routed to Python)
# Usage: flow.sh <command> <issue-or-plan> [options]
#
# This wrapper routes commands to either Python implementation or legacy Bash.
# During migration, unimplemented commands fall back to flow-legacy.sh.
#
# Migration status (Phase 5):
#   - issue create/update → Python
#   - query status/list → Python
#   - sync → Python
#   - archive → Python (with Target Project repo dirty gate)
#   - approve → Python (with Target Project repo dirty gate)
#   - complete → Python
#   - verify → Python
#   - help → Python
#   - plan → Python

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LEGACY_SCRIPT="$SCRIPT_DIR/flow-legacy.sh"
PYTHON_SCRIPT="$SCRIPT_DIR/flow.py"

# Commands routed to Python implementation
PYTHON_COMMANDS="issue|plan|query|sync|archive|complete|verify|help"

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