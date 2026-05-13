#!/usr/bin/env python3
# workflow.py - Shared workflow helpers for dev-flow commands
#
# Provides:
#   - guard_status: Validate plan status matches expected state
#   - format_suggestion: Generate next-step suggestion for wrong-status scenarios
#   - resolve_space_repo: Issue-aware space repo resolution with fallback

from __future__ import annotations

from pathlib import Path

from dev_flow.core.logging import log_error, log_warn
from dev_flow.core.workspace import detect_space_repo


_STATUS_COMMANDS = {
    "executing": {
        "planning": "approve --confirm",
        "verifying": "verify --confirm",
        "done": "archive",
    },
    "verifying": {
        "planning": "approve --confirm",
        "executing": "complete",
        "done": "archive",
    },
    "done": {
        "planning": "approve --confirm",
        "executing": "complete",
        "verifying": "verify --confirm",
    },
}


def guard_status(
    current_status: str,
    expected_status: str,
    input_ref: str,
) -> bool:
    """Check if plan status matches expected status; print error if not.

    Returns True if status matches, False otherwise.
    """
    if current_status == expected_status:
        return True

    log_error(f"Plan must be in {expected_status} state (current: {current_status})")
    log_error("")

    suggestion = format_suggestion(current_status, expected_status, input_ref)
    log_error(suggestion)

    return False


def format_suggestion(
    current_status: str,
    expected_status: str,
    input_ref: str,
) -> str:
    """Format next-step suggestion for wrong-status scenarios.

    Returns a suggestion string like "Run: flow.sh approve <ref> --confirm"
    or "Check plan status" for unexpected status values.
    """
    status_commands = _STATUS_COMMANDS.get(expected_status, {})
    command = status_commands.get(current_status)

    if command:
        return f"Run: flow.sh {command} {input_ref}"

    return "Check plan status"


def resolve_space_repo(
    issue: int | str | None,
    workspace_root: Path,
) -> str:
    """Resolve space repo with issue-aware fallback.

    Returns owner/repo string if resolvable, empty string otherwise.

    Behavior:
    - No issue (None/0/"") -> return "" immediately (no repo needed)
    - Has issue -> try detect_space_repo, log warning on failure, return ""
    """
    if not issue:
        return ""

    try:
        return detect_space_repo(workspace_root)
    except Exception as e:
        log_warn(f"Cannot determine space repo, skipping Issue sync: {e}")
        return ""
