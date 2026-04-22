#!/usr/bin/env python3
# approve.py - Approve command for dev-flow
#
# Ported from scripts/cmd/approve.sh (simplified version)
#
# Command:
#   approve <issue> --confirm - Approve Plan and transition to executing phase
#
# Flow:
#   1. Find Plan file (by issue number)
#   2. Check Plan status is "planning"
#   3. Gate: Check Target Project repo is clean (BLOCK on dirty)
#   4. Validate state transition: planning -> executing
#   5. Update Plan status to "executing"
#   6. Update Issue Plan link
#   7. Output confirmation

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

from dev_flow.domain.plan.find import find_plan_by_issue
from dev_flow.domain.plan.metadata import get_plan_project, get_plan_issue, get_plan_status
from dev_flow.domain.workflow import parse_plan_status, is_valid_transition
from dev_flow.domain.plan.link import update_issue_plan_link
from dev_flow.infra.git import is_repo_dirty


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


def log_step(msg: str) -> None:
    print(f"\033[0;36m[STEP]\033[0m {msg}")


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


def _get_space_repo() -> str:
    """Get space repo in owner/repo format."""
    result = subprocess.run(
        ["gh", "repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        log_error("Cannot get repo info. Ensure gh CLI is configured")
        raise RuntimeError("gh repo view failed")
    return result.stdout.strip()


def _find_project_path(project: str, workspace_root: Path) -> Path | None:
    """
    Find project directory path.
    
    Standard mapping: projects/<project_name>
    
    Args:
        project: Project name from Plan metadata
        workspace_root: Workspace root path
        
    Returns:
        Project directory path, or None if not found
    """
    # Standard path: projects/<project_name>
    project_path = workspace_root / "projects" / project
    
    if project_path.exists():
        return project_path
    
    return None


# ============================================
# Gate: Target Project Repo Clean Check
# ============================================

def check_project_repo_gate(plan_path: str, workspace_root: Path) -> bool:
    """
    Gate: Check if Target Project repo has uncommitted changes.
    
    BLOCKING behavior: Returns False if repo is dirty.
    
    Args:
        plan_path: Path to Plan file
        workspace_root: Workspace root path
        
    Returns:
        True if repo is clean (or no Target Project), False if dirty
    """
    project = get_plan_project(plan_path)
    
    # No Target Project specified → skip gate
    if not project:
        log_info("No Target Project specified in Plan metadata, skipping repo gate")
        return True
    
    project_path = _find_project_path(project, workspace_root)
    
    if not project_path:
        log_warn(f"Target Project '{project}' directory not found at projects/{project}")
        # Not found → treat as clean (can't check)
        return True
    
    # Check if project path is a git repo
    if not (project_path / '.git').exists():
        log_info(f"Target Project '{project}' is not a git repo, skipping repo gate")
        return True
    
    # Check dirty state
    if is_repo_dirty(str(project_path)):
        log_error(f"Target Project '{project}' has dirty (uncommitted) changes")
        log_error(f"Project path: {project_path}")
        log_error("")
        log_error("Please commit and push project changes before approving:")
        log_error(f"  cd {project_path}")
        log_error("  git add <files> && git commit -m \"<message>\" && git push")
        log_error("")
        log_error("Alternatively, use --worktree flag to isolate execution:")
        log_error("  flow.sh approve <issue> --confirm --worktree")
        return False
    
    return True


# ============================================
# Update Plan Status
# ============================================

def update_plan_status(plan_path: str, new_status: str) -> bool:
    """
    Update Plan file status line.
    
    Args:
        plan_path: Path to Plan markdown file
        new_status: New status value (e.g., "executing")
        
    Returns:
        True if updated successfully
    """
    path = Path(plan_path)
    if not path.exists():
        log_error(f"Plan file not found: {plan_path}")
        return False
    
    content = path.read_text()
    
    # Update status line: - **Status**: planning -> - **Status**: executing
    import re
    new_content = re.sub(
        r'^\- \*\*Status\*\*:\s*\w+',
        f'- **Status**: {new_status}',
        content,
        count=1,
        flags=re.MULTILINE
    )
    
    if new_content == content:
        log_error("Failed to update status line in Plan file")
        return False
    
    path.write_text(new_content)
    return True


# ============================================
# approve command
# ============================================

def cmd_approve(args: argparse.Namespace) -> int:
    """Approve Plan and transition to executing phase."""
    issue_number = args.issue
    confirm = args.confirm
    
    if not issue_number:
        log_error("Missing issue number")
        log_error("Usage: flow.sh approve <issue> --confirm")
        return 1
    
    if not confirm:
        log_error("Missing --confirm flag")
        log_error("Usage: flow.sh approve <issue> --confirm")
        log_error("")
        log_error("Approve requires explicit confirmation to transition state")
        return 1
    
    workspace_root = _find_workspace_root()
    
    # 1. Find Plan file
    try:
        plan_path = find_plan_by_issue(issue_number, str(workspace_root))
    except FileNotFoundError:
        log_error(f"No plan found for issue #{issue_number}")
        return 1
    
    log_info(f"Found plan: {plan_path}")
    
    # 2. Check Plan status is "planning"
    current_status = parse_plan_status(plan_path)
    
    if not current_status:
        # Fallback to metadata status
        current_status = get_plan_status(plan_path)
    
    if current_status != "planning":
        log_error(f"Plan must be in planning state to approve (current: {current_status})")
        log_error("")
        
        # Suggest action based on current status
        if current_status == "executing":
            log_error("Plan already approved. Next: flow.sh complete <issue>")
        elif current_status == "verifying":
            log_error("Plan awaiting verification. Next: flow.sh verify <issue> --confirm")
        elif current_status == "done":
            log_error("Plan already archived.")
        else:
            log_error("Unknown status. Check plan file.")
        
        return 1
    
    # 3. Gate: Check Target Project repo is clean (BLOCK on dirty)
    if not check_project_repo_gate(plan_path, workspace_root):
        # Dirty repo → BLOCK (return non-zero)
        return 1
    
    # 4. Validate state transition: planning -> executing
    if not is_valid_transition(current_status, "executing"):
        log_error(f"Invalid state transition: {current_status} -> executing")
        return 1
    
    log_step("Transitioning state: planning -> executing")
    
    # 5. Update Plan status to "executing"
    if not update_plan_status(plan_path, "executing"):
        log_error("Failed to update Plan status")
        return 1
    
    log_success(f"Plan status updated to: executing")
    
    # 6. Update Issue Plan link (if Issue linked)
    plan_issue = get_plan_issue(plan_path)
    if plan_issue:
        repo = _get_space_repo()
        update_issue_plan_link(
            issue_number=plan_issue,
            plan_file=plan_path,
            repo=repo,
            workspace_root=str(workspace_root),
        )
    
    # 7. Output confirmation
    print("Status: executing")
    if plan_issue:
        print(f"Issue: #{plan_issue}")
    print("")
    print("Next: flow.sh complete <issue>")
    print("")
    print("实施完成后，执行: flow.sh complete <issue>")
    
    return 0


# ============================================
# argparse registration
# ============================================

def register_approve_parser(subparsers: argparse._SubParsersAction) -> None:
    """Register approve subcommand."""
    approve_parser = subparsers.add_parser(
        "approve",
        help="Approve Plan and transition to executing phase"
    )
    approve_parser.add_argument(
        "issue",
        type=int,
        nargs="?",
        help="Issue number"
    )
    approve_parser.add_argument(
        "--confirm",
        action="store_true",
        help="Confirm approval and transition state"
    )