#!/usr/bin/env python3
# query.py - Query commands for dev-flow
#
# Ported from scripts/cmd/query.sh
#
# Commands:
#   query status <issue> - Show Issue/Plan status
#   query list - List all active Plans

from __future__ import annotations

import argparse
import subprocess
import sys
import json
import os
import re
from pathlib import Path

from dev_flow.domain.plan.find import find_plan_by_issue, _find_workspace_root


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


def log_step(msg: str) -> None:
    print(f"\033[0;36m[STEP]\033[0m {msg}")


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


def get_issue_info(issue_number: str, repo: str) -> dict:
    """Get issue info as JSON dict."""
    result = subprocess.run(
        ["gh", "issue", "view", issue_number, "--repo", repo,
         "--json", "title,body,number,state,labels"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        log_error(f"Failed to get issue #{issue_number}")
        raise RuntimeError("gh issue view failed")
    
    return json.loads(result.stdout)


# ============================================
# Plan Metadata Helpers
# ============================================

def get_plan_metadata(plan_file: str) -> dict:
    """
    Extract metadata from Plan file.
    
    Returns dict with: status, prd, issue, created, mode, project, type
    """
    if not os.path.isfile(plan_file):
        return {}
    
    metadata = {}
    
    with open(plan_file, 'r') as f:
        content = f.read()
    
    # Extract metadata fields using simple regex
    import re
    
    # Status line: - **Status**: planning
    status_match = re.search(r'^\- \*\*Status\*\*:\s*(.+)', content, re.MULTILINE)
    metadata['status'] = status_match.group(1).strip() if status_match else 'draft'
    
    # PRD line: - **PRD**: `path`
    prd_match = re.search(r'^\- \*\*PRD\*\*:\s*`(.+)`', content, re.MULTILINE)
    metadata['prd'] = prd_match.group(1).strip() if prd_match else ''
    
    # Issue line: - **Issue**: #123
    issue_match = re.search(r'^\- \*\*Issue\*\*:\s*(.+)', content, re.MULTILINE)
    metadata['issue'] = issue_match.group(1).strip() if issue_match else ''
    
    # Created line: - **Created**: 2026-04-22
    created_match = re.search(r'^\- \*\*Created\*\*:\s*(.+)', content, re.MULTILINE)
    metadata['created'] = created_match.group(1).strip() if created_match else ''
    
    # Mode line: - **Mode**: lite
    mode_match = re.search(r'^\- \*\*Mode\*\*:\s*(.+)', content, re.MULTILINE)
    metadata['mode'] = mode_match.group(1).strip() if mode_match else 'lite'
    
    # Target Project line: - **Target Project**: ontology
    project_match = re.search(r'^\- \*\*Target Project\*\*:\s*(.+)', content, re.MULTILINE)
    metadata['project'] = project_match.group(1).strip() if project_match else ''
    
    # Type line: - **Type**: feature
    type_match = re.search(r'^\- \*\*Type\*\*:\s*(.+)', content, re.MULTILINE)
    metadata['type'] = type_match.group(1).strip().lower() if type_match else ''
    
    return metadata


def get_plan_name(plan_file: str) -> str:
    """Get plan name from file path."""
    return Path(plan_file).stem


def extract_slug(plan_name: str) -> str:
    """
    Extract slug from plan name (last segment).
    
    With Issue: 42-fix-task-wait-bug -> task-wait-bug
    Without Issue: refactor-optimize-files -> optimize-files
    """
    # Remove issue-number prefix (if present)
    name = re.sub(r'^[0-9]+-', '', plan_name)
    # Remove type prefix
    name = re.sub(r'^(feature|enhance|fix|refactor|docs|chore|test)-', '', name)
    return name


# ============================================
# cmd_status: Show Issue/Plan status
# ============================================

def cmd_query_status(args: argparse.Namespace) -> int:
    """Show Issue and Plan status."""
    issue_number = args.issue
    
    if not issue_number:
        log_error("Issue number required")
        print("Usage: flow.sh query status <issue>")
        return 1
    
    repo = get_space_repo()
    
    log_step(f"Fetching Issue #{issue_number} info...")
    
    try:
        issue_info = get_issue_info(issue_number, repo)
    except RuntimeError:
        log_error(f"Issue #{issue_number} not found")
        return 1
    
    title = issue_info.get('title', '')
    state = issue_info.get('state', '')
    labels = [l['name'] for l in issue_info.get('labels', [])]
    
    print("")
    print(f"Issue #{issue_number}")
    print(f"  Title: {title}")
    print(f"  State: {state}")
    print(f"  Labels: {' '.join(labels)}")
    print("")
    
    # Try to find linked Plan
    try:
        plan_file = find_plan_by_issue(int(issue_number))
    except FileNotFoundError:
        log_warn("No plan linked to this Issue")
        return 0
    
    plan_name = get_plan_name(plan_file)
    metadata = get_plan_metadata(plan_file)
    
    status = metadata.get('status', 'draft')
    prd = metadata.get('prd', '')
    project = metadata.get('project', '')
    created = metadata.get('created', '')
    
    print(f"Plan: {plan_name}")
    print(f"  File: {plan_file}")
    print(f"  Status: {status}")
    print(f"  PRD: {prd or '<none>'}")
    print(f"  Created: {created}")
    
    # Check worktree status
    slug = extract_slug(plan_name)
    branch = f"issue-{issue_number}-{slug}"
    worktree_path = ""
    
    if project:
        workspace_root = _find_workspace_root()
        worktree_path = str(Path(workspace_root) / ".worktrees" / f"{project}-{branch}")
    
    if worktree_path and os.path.isdir(worktree_path):
        print("")
        print(f"Worktree: {worktree_path}")
        # Get branch in worktree
        try:
            result = subprocess.run(
                ["git", "branch", "--show-current"],
                cwd=worktree_path,
                capture_output=True,
                text=True,
            )
            wt_branch = result.stdout.strip() or "detached"
            print(f"  Branch: {wt_branch}")
        except Exception:
            print("  Branch: (unknown)")
    
    print("")
    print("State Machine (4-state): planning -> executing -> verifying -> done")
    print(f"               Current: {status}")
    
    return 0


# ============================================
# cmd_list: List active Plans
# ============================================

def cmd_query_list(args: argparse.Namespace) -> int:
    """List all active Plans from GitHub Issues."""
    print("Active Plans (from GitHub Issues)")
    print("==================================")
    print("")
    
    try:
        repo = get_space_repo()
    except RuntimeError:
        log_error("Cannot get repo info")
        return 1
    
    # Search for active issues with status labels
    # Use gh search API to find issues with status labels
    result = subprocess.run(
        ["gh", "issue", "list", "--repo", repo, "--state", "open",
         "--search", "label:status/planning OR label:status/in-progress OR label:status/verifying",
         "--json", "number,title,labels",
         "--jq", r'.[] | "\(.number)|\(.title)|\(.labels | map(.name) | join(","))"'],
        capture_output=True,
        text=True,
    )
    
    issues = result.stdout.strip()
    
    if not issues:
        print("No active issues found.")
        return 0
    
    count = 0
    for line in issues.split('\n'):
        if not line:
            continue
        
        parts = line.split('|')
        if len(parts) < 3:
            continue
        
        number, title, labels_str = parts[0], parts[1], parts[2]
        labels = labels_str.split(',') if labels_str else []
        
        # Determine status label
        status_label = "unknown"
        for label in labels:
            label = label.strip()
            if label == "status/planning":
                status_label = "planning"
            elif label == "status/in-progress":
                status_label = "executing"
            elif label == "status/verifying":
                status_label = "verifying"
        
        count += 1
        print(f"[{status_label}] #{number}: {title}")
    
    print("")
    print(f"Total: {count} active issue(s)")
    
    return 0


# ============================================
# argparse registration
# ============================================

def register_query_parser(subparsers: argparse._SubParsersAction) -> None:
    """Register query subcommand and its subcommands."""
    query_parser = subparsers.add_parser("query", help="Query plans and issues")
    query_subparsers = query_parser.add_subparsers(dest="query_cmd")
    
    # query status
    status_parser = query_subparsers.add_parser("status", help="Show Issue/Plan status")
    status_parser.add_argument("issue", nargs="?", help="Issue number")
    
    # query list
    list_parser = query_subparsers.add_parser("list", help="List all active Plans")


def cmd_query(args: argparse.Namespace) -> int:
    """Dispatch query subcommand."""
    if args.query_cmd == "status":
        return cmd_query_status(args)
    elif args.query_cmd == "list":
        return cmd_query_list(args)
    else:
        log_error(f"Unknown query subcommand: {args.query_cmd}")
        return 1