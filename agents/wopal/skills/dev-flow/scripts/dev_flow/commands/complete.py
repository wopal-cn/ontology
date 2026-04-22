#!/usr/bin/env python3
# complete.py - Complete command for dev-flow
#
# Ported from scripts/cmd/complete.sh
#
# Command:
#   complete <issue> - Mark implementation complete, transition to verifying
#
# Flow:
#   1. Find Plan file (by issue number)
#   2. Check Plan status is "executing"
#   3. Validate state transition (executing -> verifying)
#   4. Update Plan status to "verifying"
#   5. Output confirmation

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from dev_flow.domain.plan.find import find_plan_by_issue
from dev_flow.domain.plan.metadata import get_plan_issue
from dev_flow.domain.workflow import (
    parse_plan_status,
    is_valid_transition,
)


# ============================================
# Logging
# ============================================

def log_info(msg: str) -> None:
    print(f"\033[0;34m[INFO]\033[0m {msg}")


def log_success(msg: str) -> None:
    print(f"\033[0;32m[OK]\033[0m {msg}")


def log_error(msg: str) -> None:
    print(f"\033[0;31m[ERROR]\033[0m {msg}", file=sys.stderr)


def log_warn(msg: str) -> None:
    print(f"\033[0;33m[WARN]\033[0m {msg}")


# ============================================
# Helpers
# ============================================

def _find_workspace_root() -> Path:
    """Find workspace root by searching for .wopal or .git directory."""
    current = Path.cwd()

    while current != current.parent:
        if (current / '.wopal').exists():
            return current
        if (current / '.git').exists():
            return current
        current = current.parent

    return Path.cwd()


def _update_plan_status(plan_path: str, new_status: str) -> bool:
    """
    Update Plan status field in metadata section.

    Args:
        plan_path: Path to Plan markdown file
        new_status: New status value (e.g., "verifying")

    Returns:
        True if updated successfully
    """
    path = Path(plan_path)
    if not path.exists():
        return False

    content = path.read_text()

    # Replace status line: - **Status**: <old> -> - **Status**: <new>
    import re
    pattern = r'^\- \*\*Status\*\*:\s*\w+'
    new_line = f'- **Status**: {new_status}'

    new_content = re.sub(pattern, new_line, content, count=1, flags=re.MULTILINE)

    if new_content == content:
        log_warn("Status field not found or unchanged")
        return False

    path.write_text(new_content)
    return True


# ============================================
# complete command
# ============================================

def cmd_complete(args: argparse.Namespace) -> int:
    """Mark implementation complete and transition to verifying."""
    issue_number = args.issue

    if not issue_number:
        log_error("Missing issue number")
        log_error("Usage: flow.sh complete <issue>")
        return 1

    workspace_root = _find_workspace_root()

    # 1. Find Plan file
    try:
        plan_path = find_plan_by_issue(issue_number, str(workspace_root))
    except FileNotFoundError:
        log_error(f"No plan found for issue #{issue_number}")
        return 1

    log_info(f"Found plan: {plan_path}")

    # 2. Check current Plan status
    current_status = parse_plan_status(plan_path)

    if not current_status:
        log_error("Cannot parse Plan status")
        return 1

    # 3. Validate state is "executing"
    if current_status != "executing":
        log_error(f"Plan must be in executing state to complete (current: {current_status})")
        log_error("")

        # Suggest next action based on current status
        suggestion_map = {
            "planning": "Run: flow.sh approve <issue> --confirm",
            "verifying": "Run: flow.sh verify <issue> --confirm",
            "done": "Plan already completed. Run: flow.sh archive <issue>",
        }

        suggestion = suggestion_map.get(current_status, "Check plan status")
        log_error(suggestion)

        return 1

    # 4. Validate state transition
    target_status = "verifying"

    if not is_valid_transition(current_status, target_status):
        log_error(f"Invalid state transition: {current_status} -> {target_status}")
        return 1

    # 5. Update Plan status to verifying
    if _update_plan_status(plan_path, target_status):
        log_success(f"Plan status updated: {target_status}")
    else:
        log_error("Failed to update Plan status")
        return 1

    # 6. Output confirmation
    plan_issue = get_plan_issue(plan_path) or issue_number

    print("")
    print("Status: verifying")
    print("")
    print("Implementation complete. Waiting for user verification.")
    print("")
    print("After user confirms, run:")
    print(f"  flow.sh verify {plan_issue} --confirm")

    return 0


# ============================================
# argparse registration
# ============================================

def register_complete_parser(subparsers: argparse._SubParsersAction) -> None:
    """Register complete subcommand."""
    complete_parser = subparsers.add_parser(
        "complete",
        help="Mark implementation complete, transition to verifying"
    )
    complete_parser.add_argument(
        "issue",
        type=int,
        nargs="?",
        help="Issue number"
    )