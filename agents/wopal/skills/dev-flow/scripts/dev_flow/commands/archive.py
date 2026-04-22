#!/usr/bin/env python3
# archive.py - Archive command for dev-flow
#
# Ported from scripts/cmd/archive.sh
#
# Command:
#   archive <issue> - Archive a completed Plan
#
# Flow:
#   1. Find Plan file (by issue number)
#   2. Check Plan status is "done"
#   2.5. Sync Plan to Issue (body + labels)
#   3. Gate: Check Target Project repo is clean (WARNING + prompt on dirty)
#   4. Move Plan file to plans/done/YYYYMMDD-<plan-name>.md
#   5. Update Issue Plan link
#   6. Close GitHub Issue

from __future__ import annotations

import argparse
import subprocess
import sys
import os
import re
from pathlib import Path
from datetime import date

from dev_flow.domain.plan.find import find_plan_by_issue
from dev_flow.domain.plan.metadata import (
    get_plan_project,
    get_plan_type,
    get_plan_issue,
    get_plan_status,
)
from dev_flow.domain.workflow import parse_plan_status
from dev_flow.domain.plan.link import update_issue_plan_link
from dev_flow.domain.issue.sync import (
    sync_plan_to_issue_body,
    sync_status_label,
    ensure_issue_labels,
)
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
# Gate: Target Project Repo Clean Check (WARNING)
# ============================================

def check_project_repo_gate(plan_path: str, workspace_root: Path) -> bool:
    """
    Gate: Check if Target Project repo has uncommitted changes.
    
    WARNING behavior: Displays warning and prompts for confirmation.
    User can choose to proceed or abort.
    
    Args:
        plan_path: Path to Plan file
        workspace_root: Workspace root path
        
    Returns:
        True if repo is clean or user confirms to proceed, False if user aborts
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
        log_warn(f"Target Project '{project}' has uncommitted changes!")
        log_warn(f"Project path: {project_path}")
        log_warn("")
        
        plan_issue = get_plan_issue(plan_path)
        plan_type = get_plan_type(plan_path) or "chore"
        
        log_warn("Uncommitted changes will not be archived. You can commit and push manually:")
        log_warn(f"  cd {project_path}")
        if plan_issue:
            log_warn(f"  git add <files> && git commit -m \"{plan_type}: #{plan_issue} <description>\" && git push")
        else:
            log_warn(f"  git add <files> && git commit -m \"{plan_type}: <description>\" && git push")
        log_warn("")
        
        # Prompt for confirmation (WARNING, not blocking)
        try:
            response = input("Continue archiving anyway? [y/N] ").strip().lower()
        except EOFError:
            response = "n"
        
        if response not in ("y", "yes"):
            log_info("Archive aborted by user")
            return False
        
        log_info("Continuing archive despite uncommitted changes...")
        return True
    
    return True


# ============================================
# Archive Plan File
# ============================================

def archive_plan_file(plan_path: str, workspace_root: Path) -> str:
    """
    Move Plan file to done/ directory with date prefix.
    
    Uses git mv if plan is tracked, otherwise uses regular mv.
    
    Args:
        plan_path: Path to Plan file
        workspace_root: Workspace root path
        
    Returns:
        Path to archived file
    """
    plan_file = Path(plan_path)
    
    if not plan_file.exists():
        log_error(f"Plan file not found: {plan_path}")
        raise FileNotFoundError(f"Plan file not found: {plan_path}")
    
    # Determine destination
    plan_dir = plan_file.parent
    done_dir = plan_dir / "done"
    done_dir.mkdir(parents=True, exist_ok=True)
    
    archive_date = date.today().strftime("%Y%m%d")
    archived_name = f"{archive_date}-{plan_file.name}"
    archived_file = done_dir / archived_name
    
    # Check if plan is tracked in git
    plan_rel = plan_file.relative_to(workspace_root)
    archived_rel = archived_file.relative_to(workspace_root)
    
    is_tracked = subprocess.run(
        ["git", "ls-files", "--error-unmatch", str(plan_rel)],
        cwd=str(workspace_root),
        capture_output=True,
    ).returncode == 0
    
    if is_tracked:
        # Use git mv
        subprocess.run(
            ["git", "mv", str(plan_rel), str(archived_rel)],
            cwd=str(workspace_root),
            capture_output=True,
            check=True,
        )
    else:
        # Use regular mv
        plan_file.rename(archived_file)
    
    return str(archived_file)


# ============================================
# Close Issue
# ============================================

def close_issue(issue_number: int, repo: str, comment: str) -> bool:
    """
    Close GitHub Issue with comment.
    
    Args:
        issue_number: Issue number
        repo: Repository in owner/repo format
        comment: Comment to add when closing
        
    Returns:
        True if closed successfully
    """
    result = subprocess.run(
        ["gh", "issue", "close", str(issue_number),
         "--repo", repo, "--comment", comment],
        capture_output=True,
        text=True,
    )
    
    return result.returncode == 0


# ============================================
# Commit Archived Plan
# ============================================

def commit_archived_plan(
    archived_file: str,
    issue_number: int | None,
    workspace_root: Path
) -> bool:
    """
    Commit and push archived plan in space repo.
    
    Args:
        archived_file: Path to archived plan file
        issue_number: Issue number (optional)
        workspace_root: Workspace root path
        
    Returns:
        True if committed successfully
    """
    # Check staged changes
    result = subprocess.run(
        ["git", "diff", "--cached", "--quiet"],
        cwd=str(workspace_root),
        capture_output=True,
    )
    
    # returncode 0 = no staged changes
    # returncode 1 = has staged changes
    if result.returncode == 0:
        log_warn("No staged changes for archived plan")
        return True
    
    if result.returncode != 1:
        log_warn("Failed to inspect staged changes")
        return False
    
    # Build commit message
    if issue_number:
        commit_msg = f"chore: archive plan #{issue_number}"
    else:
        plan_name = Path(archived_file).stem
        commit_msg = f"chore: archive plan {plan_name}"
    
    # Commit
    result = subprocess.run(
        ["git", "commit", "-m", commit_msg],
        cwd=str(workspace_root),
        capture_output=True,
        text=True,
    )
    
    if result.returncode != 0:
        log_warn("Failed to commit archived plan")
        return False
    
    # Push
    result = subprocess.run(
        ["git", "push"],
        cwd=str(workspace_root),
        capture_output=True,
        text=True,
    )
    
    if result.returncode != 0:
        log_warn("Failed to push archived plan")
        return False
    
    return True


# ============================================
# archive command
# ============================================

def cmd_archive(args: argparse.Namespace) -> int:
    """Archive a completed Plan."""
    issue_number = args.issue
    
    if not issue_number:
        log_error("Missing issue number")
        log_error("Usage: flow.sh archive <issue>")
        return 1
    
    workspace_root = _find_workspace_root()
    
    # 1. Find Plan file
    try:
        plan_path = find_plan_by_issue(issue_number, str(workspace_root))
    except FileNotFoundError:
        log_error(f"No plan found for issue #{issue_number}")
        return 1
    
    log_info(f"Found plan: {plan_path}")
    
    # 2. Check Plan status is "done"
    current_status = parse_plan_status(plan_path)
    
    if not current_status:
        # Fallback to metadata status
        current_status = get_plan_status(plan_path)
    
    if current_status != "done":
        log_error(f"Plan must be in done state to archive (current: {current_status})")
        log_error("")
        
        # Suggest next action based on current status
        suggestion_map = {
            "planning": "Run: flow.sh approve <issue> --confirm",
            "executing": "Run: flow.sh complete <issue>",
            "verifying": "Run: flow.sh verify <issue> --confirm",
        }
        
        suggestion = suggestion_map.get(current_status, "Check plan status")
        log_error(suggestion)
        
        return 1
    
    # 2.5. Sync Plan to Issue before archiving (if Issue exists)
    repo = _get_space_repo()
    plan_issue = get_plan_issue(plan_path) or issue_number
    
    if plan_issue:
        log_info(f"Syncing Plan #{plan_issue} to Issue...")
        
        # Sync body: update Issue body with plan content
        sync_plan_to_issue_body(
            issue_number=plan_issue,
            plan_file=plan_path,
            repo=repo,
            workspace_root=str(workspace_root),
        )
        
        # Sync status label: ensure "status/done" label is set
        sync_status_label(
            issue_number=plan_issue,
            status="done",
            repo=repo,
        )
        
        # Sync labels: ensure type and project labels are correct
        ensure_issue_labels(
            issue_number=plan_issue,
            plan_file=plan_path,
            repo=repo,
        )
        
        log_success(f"Plan synced to Issue #{plan_issue}")
    
    # 3. Gate: Check Target Project repo is clean (WARNING, prompt for confirmation)
    if not check_project_repo_gate(plan_path, workspace_root):
        # User aborted
        return 1
    
    # 4. Archive Plan file
    try:
        archived_file = archive_plan_file(plan_path, workspace_root)
        log_success(f"Plan archived: {archived_file}")
    except Exception as e:
        log_error(f"Failed to archive plan: {e}")
        return 1
    
    # Get plan_type for commit message
    plan_type = get_plan_type(plan_path) or "chore"
    
    # 5. Update Issue Plan link
    update_issue_plan_link(
        issue_number=plan_issue,
        plan_file=archived_file,
        repo=repo,
        workspace_root=str(workspace_root),
    )
    
    # 6. Stage all changes (rename + sync content updates)
    archived_rel = Path(archived_file).relative_to(workspace_root)
    subprocess.run(
        ["git", "add", str(archived_rel)],
        cwd=str(workspace_root),
        capture_output=True,
        check=True,
    )

    # 7. Commit archived plan
    commit_archived_plan(archived_file, plan_issue, workspace_root)
    
    # 7. Close Issue
    if plan_issue:
        if close_issue(plan_issue, repo, "Plan archived. Closing issue."):
            log_success(f"Issue #{plan_issue} closed")
        else:
            log_warn(f"Failed to close Issue #{plan_issue}")
    
    # Output summary
    print("Status: archived")
    print(f"File: {archived_file}")
    if plan_issue:
        print(f"Issue: #{plan_issue} (closed)")
    
    return 0


# ============================================
# argparse registration
# ============================================

def register_archive_parser(subparsers: argparse._SubParsersAction) -> None:
    """Register archive subcommand."""
    archive_parser = subparsers.add_parser(
        "archive",
        help="Archive a completed Plan"
    )
    archive_parser.add_argument(
        "issue",
        type=int,
        nargs="?",
        help="Issue number"
    )