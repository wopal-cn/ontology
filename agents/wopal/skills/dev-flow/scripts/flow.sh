#!/bin/bash
# dev-flow — hybrid wrapper (Phase 0: full fallback to legacy)
# Usage: flow.sh <command> <issue-or-plan> [options]
#
# This wrapper routes commands to either Python implementation or legacy Bash.
# During migration, unimplemented commands fall back to flow-legacy.sh.
#
# Migration status (Phase 0 - skeleton only):
#   - All commands → legacy fallback

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LEGACY_SCRIPT="$SCRIPT_DIR/flow-legacy.sh"

# Check if legacy script exists
if [[ ! -f "$LEGACY_SCRIPT" ]]; then
    echo "ERROR: flow-legacy.sh not found at $LEGACY_SCRIPT" >&2
    exit 1
fi

# Phase 0: Full legacy fallback
# As we migrate commands to Python, this routing logic will evolve
exec "$LEGACY_SCRIPT" "$@"