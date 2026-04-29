#!/usr/bin/env python3
# reset.py - Reset Plan to planning status
#
# Ported from scripts/cmd/utility.sh (cmd_reset)
#
# Resets a Plan's status to "planning" and syncs Issue labels.

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys

from dev_flow.domain.plan.find import find_plan, _find_workspace_root
from dev_flow.domain.workflow import plan_status_to_issue_label


# ============================================
# Logging
# ============================================

def log_info(msg: str) -> None:
    print(f"\033[0;34m[INFO]\033[0m {msg}")


def log_success(msg: str) -> None:
    print(f"\033[0;32m[OK]\033[0m {msg}")


def log_warn(msg: str) -> None:
    print(f"\033[0;33m[WARN]\033[0m {msg}")


def log_error(msg: str) -> None:
    print(f"\033[0;31m[ERROR]\033[0m {msg}", file=sys.stderr)


# ============================================
# GitHub CLI Helpers
# ============================================

def get_space_repo() -> str:
    """Get current repo in owner/repo format."""
    result = subprocess.run(
        ["gh", "repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        log_error("Cannot get repo info. Ensure you're in a git repo with gh CLI configured")
        raise RuntimeError("gh repo view failed")
    return result.stdout.strip()


def sync_status_label_group(issue_number: str, label: str, repo: str) -> None:
    """Sync Issue status label group - remove old status labels and add new one."""
    # Remove all status/* labels
    status_labels = ["status/planning", "status/in-progress", "status/verifying", "status/done"]
    
    for old_label in status_labels:
        subprocess.run(
            ["gh", "issue", "edit", issue_number, "--repo", repo, "--remove-label", old_label],
            capture_output=True,
        )
    
    # Add new status label
    subprocess.run(
        ["gh", "issue", "edit", issue_number, "--repo", repo, "--add-label", label],
        capture_output=True,
    )


def remove_issue_label(issue_number: str, label: str, repo: str) -> None:
    """Remove a label from an Issue."""
    subprocess.run(
        ["gh", "issue", "edit", issue_number, "--repo", repo, "--remove-label", label],
        capture_output=True,
    )


# ============================================
# Plan Helpers
# ============================================

def get_plan_name(plan_file: str) -> str:
    """Get plan name from file path."""
    return os.path.basename(plan_file).replace('.md', '')


def extract_primary_plan_issue(plan_file: str) -> str | None:
    """Extract the first Issue number from Plan metadata.
    
    Parses the "- **Issue**: #N" line from Plan frontmatter.
    
    Args:
        plan_file: Path to Plan markdown file
        
    Returns:
        First issue number string, or None if not found
    """
    with open(plan_file, 'r') as f:
        content = f.read()
    
    # Match: - **Issue**: #N or - **Issue**: #N, #M
    match = re.search(r'^\- \*\*Issue\*\*:\s*#(\d+)', content, re.MULTILINE)
    
    if match:
        return match.group(1)
    
    return None


def update_plan_status(plan_file: str, new_status: str) -> bool:
    """Update Plan file status.
    
    Args:
        plan_file: Path to Plan markdown file
        new_status: New status value (must be valid state)
        
    Returns:
        True if updated successfully, False otherwise
    """
    with open(plan_file, 'r') as f:
        content = f.read()
    
    # Check for existing status line
    if not re.search(r'^\- \*\*Status\*\*:', content, re.MULTILINE):
        log_error("Status line not found in Plan file")
        return False
    
    # Update status line
    updated_content = re.sub(
        r'^\- \*\*Status\*\*:\s*.+',
        f'- **Status**: {new_status}',
        content,
        flags=re.MULTILINE,
    )
    
    with open(plan_file, 'w') as f:
        f.write(updated_content)
    
    return True


# ============================================
# cmd_reset: Reset Plan to planning status
# ============================================

def cmd_reset(args: argparse.Namespace) -> int:
    """Reset Plan to planning status.
    
    Resets Plan's status to "planning" and syncs Issue labels.
    Works for both Issue-linked plans and no-issue plans.
    """
    input_ref = args.issue_or_plan
    
    if not input_ref:
        log_error("Issue number or Plan name required")
        print("Usage: flow.sh reset <issue-or-plan>")
        return 1
    
    workspace_root = _find_workspace_root()
    
    try:
        plan_file = find_plan(input_ref, workspace_root)
    except FileNotFoundError:
        log_error(f"No plan found for: {input_ref}")
        return 1
    
    plan_name = get_plan_name(plan_file)
    
    log_warn(f"Resetting plan '{plan_name}' to planning status (destructive)")
    
    # Update Plan status
    if not update_plan_status(plan_file, "planning"):
        return 1
    
    log_success(f"Plan status updated: planning")
    
    # Sync Issue label back to status/planning (if Issue exists)
    issue_number = extract_primary_plan_issue(plan_file)
    
    if issue_number:
        try:
            repo = get_space_repo()
            sync_status_label_group(issue_number, "status/planning", repo)
            log_info(f"Issue #{issue_number} label reset to status/planning")
            
            # Clear PR label if present
            remove_issue_label(issue_number, "pr/opened", repo)
        except RuntimeError:
            log_warn("Cannot sync Issue labels (gh CLI not configured)")
    
    print("")
    log_success(f"Plan reset to planning: {plan_file}")
    
    return 0


# ============================================
# argparse registration
# ============================================

def register_reset_parser(subparsers: argparse._SubParsersAction) -> None:
    """Register reset subcommand."""
    reset_parser = subparsers.add_parser(
        "reset",
        help="Reset Plan to planning status",
    )
    reset_parser.add_argument(
        "issue_or_plan",
        nargs="?",
        help="Issue number or Plan name",
    )