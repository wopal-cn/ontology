#!/usr/bin/env python3
# sync.py - Issue sync operations for dev-flow
#
# Provides:
#   - sync_status_label: Sync Issue status label based on plan status
#   - sync_plan_to_issue_body: Update Issue body with plan content
#   - ensure_issue_labels: Ensure Issue has correct labels from plan metadata
#
# Ported from lib/plan-sync.sh, lib/labels.sh

import subprocess
import re
from pathlib import Path

from dev_flow.domain.labels import plan_type_to_issue_label
from dev_flow.domain.plan.metadata import get_plan_project, get_plan_type


def _resolve_repo(repo: str = None) -> str:
    """Resolve repository name.
    
    Args:
        repo: Optional explicit repo (owner/repo format)
        
    Returns:
        Repository name in owner/repo format
    """
    if repo:
        return repo
    
    # Try to get from gh CLI
    try:
        result = subprocess.run(
            ['gh', 'repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'],
            capture_output=True,
            text=True,
            check=True
        )
        return result.stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return ""


def _get_issue_labels(issue_number: int, repo: str) -> list:
    """Get current labels for an issue.
    
    Args:
        issue_number: Issue number
        repo: Repository in owner/repo format
        
    Returns:
        List of label names
    """
    try:
        result = subprocess.run(
            ['gh', 'issue', 'view', str(issue_number), '--repo', repo, '--json', 'labels', '--jq', '.labels[].name'],
            capture_output=True,
            text=True,
            check=True
        )
        return result.stdout.strip().split('\n') if result.stdout.strip() else []
    except (subprocess.CalledProcessError, FileNotFoundError):
        return []


# Status label group (4-state model)
STATUS_LABELS = ["status/planning", "status/in-progress", "status/verifying", "status/done"]


def plan_status_to_issue_label(status: str) -> str:
    """Map plan status to Issue label (4-state model).
    
    Args:
        status: Plan status (planning, executing, verifying, done)
        
    Returns:
        Corresponding Issue label name
    """
    label_map = {
        "planning": "status/planning",
        "executing": "status/in-progress",
        "verifying": "status/verifying",
        "done": "status/done",
    }
    return label_map.get(status, "")


def sync_status_label(issue_number: int, status: str, repo: str = None) -> None:
    """Sync Issue status label based on plan status.
    
    Uses batch sync to ensure only one status label is active.
    
    Args:
        issue_number: Issue number
        status: Plan status (planning, executing, verifying)
        repo: Repository in owner/repo format
    """
    repo = _resolve_repo(repo)
    if not repo:
        return
    
    # Check gh CLI availability
    try:
        subprocess.run(['gh', '--version'], capture_output=True, check=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        return
    
    target_label = plan_status_to_issue_label(status)
    if not target_label:
        return
    
    # Get current labels
    current_labels = _get_issue_labels(issue_number, repo)
    
    # Build add/remove lists
    labels_to_remove = [l for l in STATUS_LABELS if l in current_labels and l != target_label]
    labels_to_add = [target_label] if target_label not in current_labels else []
    
    if not labels_to_add and not labels_to_remove:
        return
    
    # Batch sync using single gh call
    args = ['gh', 'issue', 'edit', str(issue_number), '--repo', repo]
    for label in labels_to_remove:
        args.extend(['--remove-label', label])
    for label in labels_to_add:
        args.extend(['--add-label', label])
    
    subprocess.run(args, capture_output=True)


def sync_plan_to_issue_body(issue_number: int, plan_file: str, repo: str = None, workspace_root: str = None) -> None:
    """Sync approved plan content to Issue body.
    
    Updates Issue body with plan content (Goal, Scope, AC, etc.)
    
    Args:
        issue_number: Issue number
        plan_file: Path to plan file
        repo: Repository in owner/repo format
        workspace_root: Workspace root path
    """
    repo = _resolve_repo(repo)
    if not repo:
        return
    
    if not Path(plan_file).exists():
        return
    
    # Check gh CLI availability
    try:
        subprocess.run(['gh', '--version'], capture_output=True, check=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        return
    
    # Build plan body content from plan file
    plan_name = Path(plan_file).stem
    body = _build_issue_body_from_plan(plan_file, plan_name, repo, workspace_root)
    
    # Update Issue body
    subprocess.run(
        ['gh', 'issue', 'edit', str(issue_number), '--repo', repo, '--body', body],
        capture_output=True,
    )


def _build_issue_body_from_plan(plan_file: str, plan_name: str, repo: str, workspace_root: str = None) -> str:
    """Build Issue body content from plan file.
    
    Args:
        plan_file: Path to plan file
        plan_name: Plan name (for URL)
        repo: Repository
        workspace_root: Workspace root
        
    Returns:
        Formatted Issue body
    """
    content = Path(plan_file).read_text()
    
    # Extract Goal section
    goal = _extract_section(content, "Goal")
    
    # Extract In Scope section
    in_scope = _extract_section(content, "In Scope")
    
    # Extract Out of Scope section
    out_of_scope = _extract_section(content, "Out of Scope")
    
    # Extract Acceptance Criteria section
    acceptance_criteria = _extract_section(content, "Acceptance Criteria")
    
    # Build plan URL
    project = get_plan_project(plan_file)
    if workspace_root and project:
        plan_path = f"docs/products/{project}/plans/{plan_name}.md"
    else:
        plan_path = f"docs/products/plans/{plan_name}.md"
    plan_url = f"https://github.com/{repo}/blob/main/{plan_path}"
    
    # Build body sections
    sections = []
    
    # Goal section
    sections.append(f"## Goal\n\n{goal or '<目标描述>'}")
    
    # In Scope section
    sections.append(f"## In Scope\n\n{in_scope or '- 范围项 1'}")
    
    # Out of Scope section
    sections.append(f"## Out of Scope\n\n{out_of_scope or '- 不做的项（原因）'}")
    
    # Acceptance Criteria section
    sections.append(f"## Acceptance Criteria\n\n{acceptance_criteria or '- 验收条件 1'}")
    
    # Related Resources table
    sections.append("## Related Resources\n\n| Resource | Link |\n|----------|------|\n| Plan | [{}]({}) |".format(plan_name, plan_url))
    
    return "\n\n".join(sections)


def _extract_section(content: str, heading: str) -> str:
    """Extract section content from markdown.
    
    Args:
        content: Markdown content
        heading: Section heading (without ## prefix)
        
    Returns:
        Section content (without heading), or empty string
    """
    # Match ## Heading to next ## heading
    pattern = rf'^## {heading}\s*\n(.*?)(?=^##[^#]|\Z)'
    match = re.search(pattern, content, re.MULTILINE | re.DOTALL)
    if match:
        return match.group(1).strip()
    return ""


# Project label group
PROJECT_LABELS = ["project/ontology", "project/wopal-cli", "project/space"]


def plan_project_to_issue_label(project: str) -> str:
    """Map project name to Issue label.
    
    Args:
        project: Project name
        
    Returns:
        Issue label name, or empty string
    """
    if project in ["ontology", "wopal-cli", "space"]:
        return f"project/{project}"
    return ""


def ensure_issue_labels(issue_number: int, plan_file: str, repo: str = None) -> None:
    """Ensure Issue has correct labels based on Plan metadata.
    
    Syncs status, type, and project labels.
    
    Args:
        issue_number: Issue number
        plan_file: Path to plan file
        repo: Repository in owner/repo format
    """
    repo = _resolve_repo(repo)
    if not repo:
        return
    
    if not Path(plan_file).exists():
        return
    
    # Check gh CLI availability
    try:
        subprocess.run(['gh', '--version'], capture_output=True, check=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        return
    
    # Get metadata from plan
    plan_type = get_plan_type(plan_file)
    plan_project = get_plan_project(plan_file)
    
    # Type label
    type_label = ""
    if plan_type:
        try:
            type_label = plan_type_to_issue_label(plan_type)
        except Exception:
            pass
    
    # Project label
    project_label = plan_project_to_issue_label(plan_project)
    
    # Sync labels
    if type_label:
        sync_type_label_group(issue_number, type_label, repo)
    
    if project_label:
        sync_project_label_group(issue_number, project_label, repo)


# Type label group
TYPE_LABELS = ["type/feature", "type/bug", "type/perf", "type/refactor", "type/docs", "type/test", "type/chore"]


def sync_type_label_group(issue_number: int, target_label: str, repo: str) -> None:
    """Sync type label group on Issue.
    
    Args:
        issue_number: Issue number
        target_label: Target type label
        repo: Repository
    """
    current_labels = _get_issue_labels(issue_number, repo)
    
    labels_to_remove = [l for l in TYPE_LABELS if l in current_labels and l != target_label]
    labels_to_add = [target_label] if target_label not in current_labels else []
    
    if not labels_to_add and not labels_to_remove:
        return
    
    # Ensure label exists
    ensure_label_exists(target_label, repo)
    
    args = ['gh', 'issue', 'edit', str(issue_number), '--repo', repo]
    for label in labels_to_remove:
        args.extend(['--remove-label', label])
    for label in labels_to_add:
        args.extend(['--add-label', label])
    
    subprocess.run(args, capture_output=True)


def sync_project_label_group(issue_number: int, target_label: str, repo: str) -> None:
    """Sync project label group on Issue.
    
    Args:
        issue_number: Issue number
        target_label: Target project label
        repo: Repository
    """
    current_labels = _get_issue_labels(issue_number, repo)
    
    labels_to_remove = [l for l in PROJECT_LABELS if l in current_labels and l != target_label]
    labels_to_add = [target_label] if target_label not in current_labels else []
    
    if not labels_to_add and not labels_to_remove:
        return
    
    args = ['gh', 'issue', 'edit', str(issue_number), '--repo', repo]
    for label in labels_to_remove:
        args.extend(['--remove-label', label])
    for label in labels_to_add:
        args.extend(['--add-label', label])
    
    subprocess.run(args, capture_output=True)


def ensure_label_exists(label_name: str, repo: str) -> None:
    """Ensure a label exists in the repo.
    
    Args:
        label_name: Label name to ensure
        repo: Repository
    """
    # Get label properties
    color, description = _get_label_props(label_name)
    
    # Create label (ignore if already exists)
    subprocess.run(
        ['gh', 'label', 'create', label_name, '--repo', repo, '--color', color, '--description', description],
        capture_output=True,
    )


def _get_label_props(label_name: str) -> tuple:
    """Get label color and description.
    
    Args:
        label_name: Label name
        
    Returns:
        Tuple of (color, description)
    """
    # Default colors and descriptions for dev-flow labels
    props_map = {
        "status/planning": ("fbca04", "Planning"),
        "status/in-progress": ("1d76db", "Currently in progress"),
        "status/verifying": ("5319e7", "Awaiting user verification"),
        "status/done": ("0e8a16", "User validation passed"),
        "type/feature": ("1d76db", "New feature"),
        "type/bug": ("d73a4a", "Bug fix"),
        "type/perf": ("5319e7", "Performance optimization"),
        "type/refactor": ("cfd3d0", "Code refactoring"),
        "type/docs": ("0075ca", "Documentation"),
        "type/test": ("fbca04", "Testing"),
        "type/chore": ("f9d0c4", "Chore/maintenance"),
        "project/ontology": ("5319e7", "ontology project"),
        "project/wopal-cli": ("1d76db", "wopal-cli project"),
        "project/space": ("0e8a16", "space-level changes"),
    }
    
    return props_map.get(label_name, ("dddddd", ""))