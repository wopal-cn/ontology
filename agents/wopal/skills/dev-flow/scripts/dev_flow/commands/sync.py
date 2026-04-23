#!/usr/bin/env python3
# sync.py - Sync commands for dev-flow
#
# Ported from scripts/cmd/sync.sh and lib/plan-sync.sh
#
# Commands:
#   sync <issue> - Sync Plan to Issue (body + labels)
#   sync <issue> --body-only - Only update Issue body
#   sync <issue> --labels-only - Only update labels

from __future__ import annotations

import argparse
import subprocess
import sys
import json
import os
import re
from pathlib import Path

from dev_flow.domain.plan.find import find_plan_by_issue, _find_workspace_root
from dev_flow.domain.issue.link import build_repo_blob_url
from dev_flow.domain.labels import (
    normalize_plan_type,
    plan_type_to_issue_label,
    ValidationError,
)


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


def ensure_label_exists(label: str, repo: str) -> None:
    """Ensure a label exists in the repo."""
    # Check if label exists
    result = subprocess.run(
        ["gh", "label", "list", "--repo", repo, "--json", "name", "-q", f'.[] | select(.name == "{label}")'],
        capture_output=True,
        text=True,
    )
    if result.stdout.strip():
        return  # Label exists
    
    # Create label with default color
    subprocess.run(
        ["gh", "label", "create", label, "--repo", repo, "--color", "dddddd"],
        capture_output=True,
        text=True,
    )


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


def extract_primary_plan_issue(plan_file: str) -> str:
    """Extract first Issue number from Plan metadata."""
    metadata = get_plan_metadata(plan_file)
    issue_line = metadata.get('issue', '')
    
    # Pattern: #123, #456 -> extract first number
    match = re.search(r'#(\d+)', issue_line)
    return match.group(1) if match else ''


# ============================================
# Plan Content Extraction (from plan-sync.sh)
# ============================================

def _extract_plan_section(plan_file: str, section: str, limit: int = 0) -> str:
    """
    Extract a markdown section body from a plan file.
    
    Handles fenced code blocks (```) — only matches ## headings outside code blocks.
    """
    content = []
    in_code = False
    found = False
    count = 0
    
    with open(plan_file, 'r') as f:
        for line in f:
            if line.strip().startswith('```'):
                in_code = not in_code
                continue
            
            if not in_code and line.strip() == f"## {section}":
                found = True
                continue
            
            if found and not in_code and line.startswith("##") and not line.startswith(f"## {section}"):
                break
            
            if found and not in_code:
                content.append(line)
                count += 1
                if limit > 0 and count >= limit:
                    break
    
    return ''.join(content).strip()


def _extract_technical_context_subsection(plan_file: str, subsection: str) -> str:
    """
    Extract a named subsection from Technical Context.
    
    Subsection names: Confirmed Bugs, Content Model Defects, Cleanup Scope, Key Findings
    """
    content = []
    in_subsection = False
    
    with open(plan_file, 'r') as f:
        for line in f:
            if line.strip() == f"### {subsection}":
                in_subsection = True
                continue
            
            if in_subsection and (line.startswith("###") or (line.startswith("##") and not line.startswith("###"))):
                break
            
            if in_subsection:
                content.append(line)
    
    return ''.join(content).strip()


def _plan_has_audit_subsections(plan_file: str) -> bool:
    """Check if Plan has Technical Context named subsections."""
    subsections = ["Confirmed Bugs", "Content Model Defects", "Cleanup Scope", "Key Findings"]
    
    with open(plan_file, 'r') as f:
        content = f.read()
    
    for subsection in subsections:
        if f"### {subsection}" in content:
            return True
    
    return False


def _extract_acceptance_criteria(plan_file: str) -> str:
    """Extract Acceptance Criteria section (including Agent/User sub-sections)."""
    content = []
    in_section = False
    
    with open(plan_file, 'r') as f:
        for line in f:
            if line.strip() == "## Acceptance Criteria":
                in_section = True
                continue
            
            if in_section and line.startswith("## ") and not line.startswith("## Acceptance Criteria"):
                break
            
            if in_section:
                content.append(line)
    
    return ''.join(content).strip()


def _extract_technical_context_top(plan_file: str) -> str:
    """Extract Technical Context top-level content (before first ### subsection)."""
    content = []
    in_section = False
    
    with open(plan_file, 'r') as f:
        for line in f:
            if line.strip() == "## Technical Context":
                in_section = True
                continue
            
            if in_section and line.startswith("## ") and not line.startswith("## Technical Context"):
                break
            
            if in_section and line.startswith("###"):
                break
            
            if in_section:
                content.append(line)
    
    # Remove empty lines
    return '\n'.join(line for line in content if line.strip())


# ============================================
# Issue Body Construction (from plan-sync.sh)
# ============================================

def _render_issue_section(heading: str, content: str, placeholder: str = "") -> str:
    """Render a markdown section with heading."""
    if not content:
        content = placeholder
    
    return f"## {heading}\n\n{content}\n"


def _render_related_resources_table(reference: str, plan_link: str) -> str:
    """Render Related Resources table."""
    rows = []
    
    if reference:
        rows.append(f"| Research | {reference} |")
    
    rows.append(f"| Plan | {plan_link} |")
    
    return "## Related Resources\n\n" + "\n".join(rows) + "\n"


def build_issue_body_from_plan(plan_file: str, plan_name: str, repo: str) -> str:
    """
    Build normalized issue body from approved plan content.
    
    This preserves checkbox states from Agent Verification.
    """
    has_audit_sections = _plan_has_audit_subsections(plan_file)
    
    # Extract Goal
    goal = _extract_plan_section(plan_file, "Goal", 5)
    
    # Extract Background based on Plan structure
    if has_audit_sections:
        background = _extract_technical_context_top(plan_file)
        confirmed_bugs = _extract_technical_context_subsection(plan_file, "Confirmed Bugs")
        content_model_defects = _extract_technical_context_subsection(plan_file, "Content Model Defects")
        cleanup_scope = _extract_technical_context_subsection(plan_file, "Cleanup Scope")
        key_findings = _extract_technical_context_subsection(plan_file, "Key Findings")
    else:
        background = _extract_plan_section(plan_file, "Technical Context", 20)
        confirmed_bugs = ""
        content_model_defects = ""
        cleanup_scope = ""
        key_findings = ""
    
    # Extract scope sections
    in_scope = _extract_plan_section(plan_file, "In Scope", 50)
    out_of_scope = _extract_plan_section(plan_file, "Out of Scope", 20)
    
    # Extract Acceptance Criteria
    acceptance_criteria = _extract_acceptance_criteria(plan_file)
    
    # Get project
    metadata = get_plan_metadata(plan_file)
    project = metadata.get('project', '')
    
    # Build Plan link
    if project:
        plan_path = f"docs/products/{project}/plans/{plan_name}.md"
    else:
        plan_path = f"docs/products/plans/{plan_name}.md"
    
    github_url = build_repo_blob_url(repo, plan_path)
    plan_link = f"[{plan_name}]({github_url})"
    
    # Build sections
    sections = ""
    
    # Goal section
    sections += _render_issue_section("Goal", goal, "<目标描述>")
    sections += "\n"
    
    # Background section
    sections += _render_issue_section("Background", background, "<背景描述>")
    sections += "\n"
    
    # Audit sections (only for Plans with subsections)
    if has_audit_sections:
        if confirmed_bugs:
            sections += _render_issue_section("Confirmed Bugs", confirmed_bugs, "")
            sections += "\n"
        
        if content_model_defects:
            sections += _render_issue_section("Content Model Defects", content_model_defects, "")
            sections += "\n"
        
        if cleanup_scope:
            sections += _render_issue_section("Cleanup Scope", cleanup_scope, "")
            sections += "\n"
        
        if key_findings:
            sections += _render_issue_section("Key Findings", key_findings, "")
            sections += "\n"
    
    # In Scope section
    in_scope_text = in_scope if in_scope else "- 范围项 1"
    sections += _render_issue_section("In Scope", in_scope_text, "- 范围项 1")
    sections += "\n"
    
    # Out of Scope section
    out_of_scope_text = out_of_scope if out_of_scope else "- 不做的项（原因）"
    sections += _render_issue_section("Out of Scope", out_of_scope_text, "- 不做的项（原因）")
    sections += "\n"
    
    # Acceptance Criteria section
    ac_text = acceptance_criteria if acceptance_criteria else "- 验收条件 1"
    sections += _render_issue_section("Acceptance Criteria", ac_text, "- 验收条件 1")
    sections += "\n"
    
    # Related Resources table
    sections += _render_related_resources_table("", plan_link)
    
    return sections


# ============================================
# Sync Operations
# ============================================

def sync_plan_to_issue(issue_number: str, plan_file: str, repo: str) -> int:
    """
    Sync approved plan to Issue body.
    
    This replaces the entire Issue body with normalized content from Plan.
    Preserves Agent Verification checkbox states.
    """
    if not os.path.isfile(plan_file):
        log_warn(f"Plan file not found: {plan_file}")
        return 1
    
    if not shutil_which("gh"):
        log_warn("gh CLI not available, skipping issue sync")
        return 0
    
    log_info(f"Syncing plan to Issue #{issue_number}...")
    
    plan_name = get_plan_name(plan_file)
    new_body = build_issue_body_from_plan(plan_file, plan_name, repo)
    
    # Update Issue body
    result = subprocess.run(
        ["gh", "issue", "edit", issue_number, "--repo", repo, "--body", new_body],
        capture_output=True,
        text=True,
    )
    
    if result.returncode != 0:
        log_warn(f"Failed to update Issue #{issue_number}")
        return 1
    
    log_success(f"Issue #{issue_number} updated with plan content")
    return 0


def plan_status_to_issue_label(plan_status: str) -> str:
    """Map plan status to Issue label (4-state model)."""
    mapping = {
        'planning': 'status/planning',
        'executing': 'status/in-progress',
        'verifying': 'status/verifying',
        'done': 'status/done',
    }
    return mapping.get(plan_status, '')


def plan_project_to_issue_label(project: str) -> str:
    """Map project name to Issue label."""
    valid_projects = ['ontology', 'wopal-cli', 'space']
    if project in valid_projects:
        return f"project/{project}"
    return ''


def sync_status_label_group(issue_number: str, desired_label: str, repo: str) -> None:
    """Sync status label group - remove others, add desired."""
    status_labels = ["status/planning", "status/in-progress", "status/verifying", "status/done"]
    
    # Get current labels
    issue_info = get_issue_info(issue_number, repo)
    current_labels = [l['name'] for l in issue_info.get('labels', [])]
    
    # Build add/remove args
    add_labels = [desired_label] if desired_label else []
    remove_labels = [l for l in status_labels if l in current_labels and l != desired_label]
    
    if not add_labels and not remove_labels:
        return
    
    # Single gh call with all label ops
    args = ["gh", "issue", "edit", issue_number, "--repo", repo]
    for label in remove_labels:
        args.extend(["--remove-label", label])
    for label in add_labels:
        args.extend(["--add-label", label])
    
    subprocess.run(args, capture_output=True, text=True)


def sync_type_label_group(issue_number: str, desired_label: str, repo: str) -> None:
    """Sync type label group - remove others, add desired."""
    type_labels = ["type/feature", "type/bug", "type/perf", "type/refactor", "type/docs", "type/test", "type/chore"]
    
    # Get current labels
    issue_info = get_issue_info(issue_number, repo)
    current_labels = [l['name'] for l in issue_info.get('labels', [])]
    
    # Build add/remove args
    add_labels = [desired_label] if desired_label else []
    remove_labels = [l for l in type_labels if l in current_labels and l != desired_label]
    
    if not add_labels and not remove_labels:
        return
    
    # Ensure desired label exists
    if desired_label:
        ensure_label_exists(desired_label, repo)
    
    # Single gh call with all label ops
    args = ["gh", "issue", "edit", issue_number, "--repo", repo]
    for label in remove_labels:
        args.extend(["--remove-label", label])
    for label in add_labels:
        args.extend(["--add-label", label])
    
    subprocess.run(args, capture_output=True, text=True)


def sync_project_label_group(issue_number: str, desired_label: str, repo: str) -> None:
    """Sync project label group - remove others, add desired."""
    project_labels = ["project/ontology", "project/wopal-cli", "project/space"]
    
    # Get current labels
    issue_info = get_issue_info(issue_number, repo)
    current_labels = [l['name'] for l in issue_info.get('labels', [])]
    
    # Build add/remove args
    add_labels = [desired_label] if desired_label else []
    remove_labels = [l for l in project_labels if l in current_labels and l != desired_label]
    
    if not add_labels and not remove_labels:
        return
    
    # Ensure desired label exists
    if desired_label:
        ensure_label_exists(desired_label, repo)
    
    # Single gh call with all label ops
    args = ["gh", "issue", "edit", issue_number, "--repo", repo]
    for label in remove_labels:
        args.extend(["--remove-label", label])
    for label in add_labels:
        args.extend(["--add-label", label])
    
    subprocess.run(args, capture_output=True, text=True)


def ensure_issue_labels(issue_number: str, plan_file: str, repo: str) -> int:
    """
    Ensure Issue has correct labels based on Plan metadata.
    
    This ensures status, type, and project labels are correct.
    """
    if not os.path.isfile(plan_file):
        log_warn(f"Plan file not found: {plan_file}")
        return 1
    
    if not shutil_which("gh"):
        log_warn("gh CLI not available, skipping label sync")
        return 0
    
    # Extract metadata from Plan
    metadata = get_plan_metadata(plan_file)
    plan_type = metadata.get('type', '')
    plan_project = metadata.get('project', '')
    plan_status = metadata.get('status', 'draft')
    
    # Status label
    status_label = plan_status_to_issue_label(plan_status)
    
    # Type label
    type_label = ""
    if plan_type:
        try:
            normalized_type = normalize_plan_type(plan_type)
            type_label = plan_type_to_issue_label(normalized_type)
        except ValidationError:
            pass
    
    # Project label
    project_label = plan_project_to_issue_label(plan_project)
    
    # Sync label groups
    sync_status_label_group(issue_number, status_label, repo)
    sync_type_label_group(issue_number, type_label, repo)
    sync_project_label_group(issue_number, project_label, repo)
    
    return 0


def shutil_which(cmd: str) -> bool:
    """Check if command exists."""
    return subprocess.run(["which", cmd], capture_output=True).returncode == 0


# ============================================
# find_plan: Smart lookup (Issue number OR Plan name)
# ============================================

def find_plan(input: str) -> str:
    """
    Find Plan by Issue number OR Plan name.
    
    - If numeric → find_plan_by_issue
    - If string → search all plan directories
    """
    if not input:
        log_error("Issue number or Plan name required")
        raise ValueError("input required")
    
    # Numeric input → Issue lookup
    if re.match(r'^[0-9]+$', input):
        return find_plan_by_issue(int(input))
    
    # String input → search all plan directories
    workspace_root = _find_workspace_root()
    search_dir = Path(workspace_root) / "docs" / "products"
    
    if not search_dir.exists():
        log_error("No plan directory found")
        raise FileNotFoundError("No plan directory")
    
    # Search: docs/products/plans/ and docs/products/*/plans/
    matches = []
    
    # Global plans
    global_plans_dir = search_dir / "plans"
    if global_plans_dir.exists():
        for f in global_plans_dir.glob("*.md"):
            if f.stem == input or input in f.stem:
                matches.append(str(f))
    
    # Project plans (excluding done)
    for project_dir in search_dir.iterdir():
        if project_dir.is_dir() and project_dir.name != "plans":
            plans_dir = project_dir / "plans"
            if plans_dir.exists():
                for f in plans_dir.glob("*.md"):
                    if "done" not in str(f.parent) and (f.stem == input or input in f.stem):
                        matches.append(str(f))
    
    if not matches:
        log_error(f"No plan found matching: {input}")
        raise FileNotFoundError(f"No plan found: {input}")
    
    if len(matches) > 1:
        log_error(f"Multiple plans matched: {input}")
        for m in matches:
            print(f"  - {m}", file=sys.stderr)
        raise ValueError(f"Multiple plans: {input}")
    
    return matches[0]


# ============================================
# cmd_sync: Sync Plan to Issue
# ============================================

def cmd_sync(args: argparse.Namespace) -> int:
    """Manually sync Plan content back to Issue without state transition."""
    input_arg = args.issue_or_plan
    body_only = args.body_only
    labels_only = args.labels_only
    
    if not input_arg:
        log_error("Issue number or Plan name required")
        print("Usage: flow.sh sync <issue-or-plan> [--body-only] [--labels-only]")
        return 1
    
    if body_only and labels_only:
        log_error("--body-only and --labels-only cannot be used together")
        return 1
    
    try:
        plan_file = find_plan(input_arg)
    except (FileNotFoundError, ValueError) as e:
        log_error(f"No plan found for: {input_arg}")
        return 1
    
    issue_number = extract_primary_plan_issue(plan_file)
    if not issue_number:
        log_error(f"Plan has no linked Issue: {plan_file}")
        return 1
    
    repo = get_space_repo()
    
    # Sync body (unless labels_only)
    if not labels_only:
        rc = sync_plan_to_issue(issue_number, plan_file, repo)
        if rc != 0:
            return rc
    
    # Sync labels (unless body_only)
    if not body_only:
        rc = ensure_issue_labels(issue_number, plan_file, repo)
        if rc != 0:
            return rc
    
    print(f"Synced Issue: #{issue_number}")
    print(f"Plan: {plan_file}")
    
    if body_only:
        print("Mode: body only")
    elif labels_only:
        print("Mode: labels only")
    else:
        print("Mode: body + labels")
    
    return 0


# ============================================
# argparse registration
# ============================================

def register_sync_parser(subparsers: argparse._SubParsersAction) -> None:
    """Register sync subcommand."""
    sync_parser = subparsers.add_parser("sync", help="Sync Plan to Issue")
    sync_parser.add_argument("issue_or_plan", nargs="?", help="Issue number or Plan name")
    sync_parser.add_argument("--body-only", action="store_true", help="Only update Issue body")
    sync_parser.add_argument("--labels-only", action="store_true", help="Only update labels")