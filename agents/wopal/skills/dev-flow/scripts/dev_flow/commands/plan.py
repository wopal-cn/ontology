#!/usr/bin/env python3
# plan.py - Plan command for dev-flow
#
# Ported from scripts/cmd/plan.sh
#
# Command:
#   plan <issue> - Create a Plan from Issue
#
# Flow:
#   1. Check if Plan already exists (find_plan_by_issue)
#   2. Get Issue info from GitHub
#   3. Extract title, project, type, scope from Issue
#   4. Generate plan name (make_plan_name)
#   5. Create plan file from template
#   6. Fill metadata (Issue, Type, Target Project, Created)
#   7. Update Issue Plan link
#   8. Output Plan file path

from __future__ import annotations

import argparse
import subprocess
import sys
import os
import json
import re
from pathlib import Path
from datetime import date

from dev_flow.domain.plan.find import find_plan_by_issue
from dev_flow.domain.plan.naming import make_plan_name, validate_plan_name, ValidationError
from dev_flow.domain.plan.metadata import get_plan_status
from dev_flow.domain.issue.title import extract_scope, extract_type
from dev_flow.domain.labels import normalize_plan_type
from dev_flow.domain.workflow import PLAN_STATES


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


def _get_issue_info(issue_number: int, repo: str) -> dict:
    """Get Issue info from GitHub."""
    result = subprocess.run(
        ["gh", "issue", "view", str(issue_number), "--repo", repo,
         "--json", "title,body,number,state,labels"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        log_error(f"Failed to get issue #{issue_number}")
        raise RuntimeError("gh issue view failed")
    
    return json.loads(result.stdout)


def _extract_project_from_labels(issue_info: dict) -> str:
    """Extract project name from issue labels."""
    for label in issue_info.get("labels", []):
        name = label.get("name", "")
        if name.startswith("project/"):
            return name[8:]  # Remove "project/" prefix
    return ""


def _title_to_slug(title: str) -> str:
    """Convert Issue title to slug (lowercase, hyphen-separated)."""
    # Extract description part: type(scope): description
    match = re.match(r'^[a-z]+\([^)]+\):\s*(.*)$', title)
    if match:
        description = match.group(1)
    else:
        description = title
    
    # Normalize: lowercase, replace spaces/punctuation with hyphens
    slug = description.lower()
    slug = re.sub(r'[^\w\s-]', '', slug)  # Remove special chars
    slug = re.sub(r'\s+', '-', slug)      # Replace spaces with hyphens
    slug = re.sub(r'-+', '-', slug)       # Collapse multiple hyphens
    slug = slug.strip('-')
    
    return slug


def _resolve_plan_dir(project: str, workspace_root: Path) -> Path:
    """Resolve Plan directory path."""
    if project:
        return workspace_root / "docs" / "products" / project / "plans"
    else:
        return workspace_root / "docs" / "products" / "plans"


def _build_repo_blob_url(repo: str, path: str) -> str:
    """Build GitHub blob URL for a file path."""
    # Get default branch
    result = subprocess.run(
        ["gh", "repo", "view", "--json", "defaultBranchRef", "-q", ".defaultBranchRef.name"],
        capture_output=True,
        text=True,
    )
    branch = result.stdout.strip() if result.returncode == 0 else "main"
    
    # Parse owner/repo
    parts = repo.split("/")
    if len(parts) == 2:
        owner, repo_name = parts
    else:
        owner = repo
        repo_name = repo
    
    return f"https://github.com/{owner}/{repo_name}/blob/{branch}/{path}"


def _update_issue_plan_link(issue_number: int, plan_name: str, repo: str) -> None:
    """Update Issue body with Plan link in Related Resources section."""
    # Build plan URL
    plan_rel_path = f"docs/products/plans/{plan_name}.md"
    plan_url = _build_repo_blob_url(repo, plan_rel_path)
    
    # Get current issue body
    issue_info = _get_issue_info(issue_number, repo)
    current_body = issue_info.get("body", "")
    
    # Find and update Related Resources section
    lines = current_body.split("\n")
    result_lines = []
    in_resources = False
    updated = False
    
    for line in lines:
        if line == "## Related Resources":
            in_resources = True
            result_lines.append(line)
            continue
        
        if in_resources and line.startswith("##") and not line.startswith("## Related Resources"):
            in_resources = False
            result_lines.append(line)
            continue
        
        if in_resources and "| Plan |" in line:
            result_lines.append(f"| Plan | [{plan_name}]({plan_url}) |")
            updated = True
            continue
        
        result_lines.append(line)
    
    # If section not found, append it
    if not updated:
        result_lines.append("")
        result_lines.append("## Related Resources")
        result_lines.append("")
        result_lines.append("| Resource | Link |")
        result_lines.append("|----------|------|")
        result_lines.append(f"| Plan | [{plan_name}]({plan_url}) |")
    
    updated_body = "\n".join(result_lines)
    
    # Update issue
    subprocess.run(
        ["gh", "issue", "edit", str(issue_number), "--repo", repo, "--body", updated_body],
        capture_output=True,
        text=True,
    )


def _ensure_issue_labels(issue_number: int, plan_file: str, repo: str) -> None:
    """Ensure Issue has status/planning label."""
    # Get current labels
    issue_info = _get_issue_info(issue_number, repo)
    current_labels = [l["name"] for l in issue_info.get("labels", [])]
    
    # Add status/planning if not present
    if "status/planning" not in current_labels:
        subprocess.run(
            ["gh", "issue", "edit", str(issue_number), "--repo", repo, "--add-label", "status/planning"],
            capture_output=True,
            text=True,
        )


def _print_existing_plan_info(plan_file: str, issue_number: int) -> None:
    """Print existing plan info and next action."""
    current_status = get_plan_status(plan_file)
    
    print(f"Plan: {plan_file}")
    print(f"Status: {current_status}")
    
    status_to_next = {
        "planning": f"Next: flow.sh approve {issue_number}",
        "executing": f"Next: flow.sh complete {issue_number}",
        "verifying": f"Next: flow.sh verify {issue_number} --confirm",
        "done": f"Next: flow.sh archive {issue_number}",
    }
    
    next_action = status_to_next.get(current_status, "Next: continue from current plan state")
    print(next_action)


# ============================================
# Create Plan from Template
# ============================================

def create_plan_from_template(
    plan_name: str,
    plan_dir: Path,
    issue_number: int,
    plan_type: str,
    project: str,
    workspace_root: Path,
) -> Path:
    """Create Plan file from template."""
    plan_file = plan_dir / f"{plan_name}.md"
    
    if plan_file.exists():
        log_error(f"Plan already exists: {plan_file}")
        raise FileExistsError(f"Plan already exists: {plan_file}")
    
    # Ensure directory exists
    plan_dir.mkdir(parents=True, exist_ok=True)
    
    # Read template
    template_path = workspace_root / "agents" / "wopal" / "skills" / "dev-flow" / "templates" / "plan.md"
    
    # Template might be in skill directory relative to workspace
    if not template_path.exists():
        # Try alternate path
        template_path = workspace_root / ".agents" / "skills" / "dev-flow" / "templates" / "plan.md"
    
    if not template_path.exists():
        log_error(f"Plan template not found at {template_path}")
        raise FileNotFoundError("Plan template not found")
    
    template_content = template_path.read_text()
    
    # Build metadata lines
    issue_line = f"- **Issue**: #{issue_number}"
    type_line = f"- **Type**: {plan_type}"
    project_line = f"- **Target Project**: {project}"
    created_date = date.today().strftime("%Y-%m-%d")
    
    # Replace placeholders
    content = template_content.replace("{plan_name}", plan_name)
    content = content.replace("{issue_line}", issue_line)
    content = content.replace("{type_line}", type_line)
    content = content.replace("{project_line}", project_line)
    content = content.replace("{date}", created_date)
    
    # Remove empty lines in metadata section (when lines are empty)
    lines = content.split("\n")
    cleaned_lines = []
    prev_empty = False
    
    for line in lines:
        is_empty = line.strip() == ""
        # Skip consecutive empty lines
        if is_empty and prev_empty:
            continue
        cleaned_lines.append(line)
        prev_empty = is_empty
    
    content = "\n".join(cleaned_lines)
    
    # Write plan file
    plan_file.write_text(content)
    
    return plan_file


# ============================================
# plan command
# ============================================

def cmd_plan(args: argparse.Namespace) -> int:
    """Create a Plan from Issue."""
    issue_number = args.issue
    
    if not issue_number:
        log_error("Missing issue number")
        log_error("Usage: flow.sh plan <issue>")
        return 1
    
    workspace_root = _find_workspace_root()
    repo = _get_space_repo()
    
    # 1. Check if Plan already exists
    try:
        plan_file = find_plan_by_issue(issue_number, str(workspace_root))
        _print_existing_plan_info(plan_file, issue_number)
        return 0
    except FileNotFoundError:
        # No existing plan, proceed to create
        pass
    
    # 2. Get Issue info
    log_info(f"Fetching Issue #{issue_number}")
    issue_info = _get_issue_info(issue_number, repo)
    title = issue_info.get("title", "")
    
    if not title:
        log_error(f"Issue #{issue_number} has no title")
        return 1
    
    # 3. Extract project from labels
    project = args.project or _extract_project_from_labels(issue_info)
    
    if not project:
        log_error(f"Cannot determine project from Issue #{issue_number}")
        log_error("Please add a 'project/<name>' label to the Issue")
        return 1
    
    # 4. Extract type and scope from title
    raw_type = extract_type(title)
    scope = extract_scope(title)
    
    if not scope:
        log_error(f"Issue title missing scope: {title}")
        log_error("Expected format: <type>(<scope>): <description>")
        return 1
    
    if not raw_type:
        log_error(f"Issue title missing type: {title}")
        return 1
    
    # Normalize type
    try:
        plan_type = normalize_plan_type(raw_type)
    except ValidationError as e:
        log_error(str(e))
        return 1
    
    # 5. Generate plan name
    slug = _title_to_slug(title)
    # Remove type prefix from slug (already in plan name)
    slug = re.sub(r'^^(fix|feat|feature|enhance|refactor|docs|chore|test)-', '', slug)
    
    try:
        plan_name = make_plan_name(issue_number, plan_type, scope, slug)
    except ValidationError as e:
        log_error(str(e))
        return 1
    
    log_info(f"Plan name: {plan_name}")
    
    # 6. Resolve plan directory
    plan_dir = _resolve_plan_dir(project, workspace_root)
    
    # 7. Create plan file from template
    try:
        plan_file = create_plan_from_template(
            plan_name,
            plan_dir,
            issue_number,
            plan_type,
            project,
            workspace_root,
        )
        log_success(f"Plan created: {plan_file}")
    except (FileExistsError, FileNotFoundError) as e:
        log_error(str(e))
        return 1
    
    # 8. Update Issue Plan link
    _update_issue_plan_link(issue_number, plan_name, repo)
    log_success(f"Issue #{issue_number} Plan link updated")
    
    # 9. Ensure Issue labels
    _ensure_issue_labels(issue_number, str(plan_file), repo)
    
    # Output summary
    print(f"Plan: {plan_file}")
    print(f"Issue: #{issue_number} | Project: {project} | Status: planning")
    print(f"Next: flow.sh approve {issue_number}")
    
    return 0


# ============================================
# argparse registration
# ============================================

def register_plan_parser(subparsers: argparse._SubParsersAction) -> None:
    """Register plan subcommand."""
    plan_parser = subparsers.add_parser(
        "plan",
        help="Create a Plan from Issue"
    )
    plan_parser.add_argument(
        "issue",
        type=int,
        nargs="?",
        help="Issue number"
    )
    plan_parser.add_argument(
        "--project",
        help="Override Target Project (extracted from Issue labels by default)"
    )