#!/usr/bin/env python3
# decompose.py - Decompose PRD into Issues
#
# Ported from scripts/cmd/utility.sh (cmd_decompose_prd)
#
# Parses a PRD file, extracts Implementation Phases sections,
# and creates GitHub Issues for each phase.

from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys

from dev_flow.domain.plan.find import _find_workspace_root


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


def create_phase_issue(phase_num: str, phase_title: str, project: str, prd_path: str) -> str | None:
    """Create a GitHub Issue for a single PRD phase.
    
    Args:
        phase_num: Phase number (e.g., "1")
        phase_title: Phase title text
        project: Target project name (e.g., "ontology")
        prd_path: Relative path to PRD file
        
    Returns:
        Issue number string if created, None if failed
    """
    issue_body = (
        "## Source\n"
        "\n"
        f"From PRD: [{prd_path}](../{prd_path})\n"
        "\n"
        "## Phase Description\n"
        "\n"
        f"{phase_title}\n"
        "\n"
        "---\n"
        "\n"
        "This Issue was auto-created by dev-flow decompose-prd."
    )
    
    issue_title = f"[Phase {phase_num}] {phase_title}"
    
    try:
        repo = get_space_repo()
    except RuntimeError:
        log_error("Cannot get repo info for Issue creation")
        return None
    
    result = subprocess.run(
        ["gh", "issue", "create",
         "--repo", repo,
         "--title", issue_title,
         "--body", issue_body,
         "--label", "status/planning",
         "--label", f"project/{project or 'space'}",
         "--label", "type/feature"],
        capture_output=True,
        text=True,
    )
    
    if result.returncode != 0:
        log_error(f"Failed to create Issue for Phase {phase_num}")
        return None
    
    # Extract issue number from URL (e.g., https://github.com/owner/repo/issues/42)
    url = result.stdout.strip()
    match = re.search(r'/issues/(\d+)$', url)
    if match:
        return match.group(1)
    
    return None


def extract_phases(prd_content: str) -> list[tuple[str, str]]:
    """Extract phases from PRD content.
    
    Looks for "## Implementation Phases" section and extracts
    ### Phase N: <title> headings.
    
    Args:
        prd_content: Full PRD markdown content
        
    Returns:
        List of (phase_num, phase_title) tuples
    """
    phases = []
    
    # Pattern: ### Phase N: Title or ### Phase N Title
    pattern = re.compile(r'^###\s+Phase\s+(\d+):?\s+(.+)', re.MULTILINE)
    
    for match in pattern.finditer(prd_content):
        phase_num = match.group(1)
        phase_title = match.group(2).strip()
        phases.append((phase_num, phase_title))
    
    return phases


def extract_implementation_phases_section(prd_content: str) -> str | None:
    """Extract the ## Implementation Phases section from PRD content.
    
    Args:
        prd_content: Full PRD markdown content
        
    Returns:
        Content of the Implementation Phases section, or None if not found
    """
    # Match ## Implementation Phases section until next ## heading
    pattern = re.compile(
        r'^##\s+Implementation\s+Phases\n(.*?)(?=\n##\s+)',
        re.MULTILINE | re.DOTALL,
    )
    match = pattern.search(prd_content)
    
    if match:
        return match.group(1)
    
    return None


# ============================================
# cmd_decompose: Create Issues from PRD
# ============================================

def cmd_decompose(args: argparse.Namespace) -> int:
    """Create Issues from PRD phases.
    
    Parses a PRD file, extracts Implementation Phases, and creates
    GitHub Issues for each phase.
    """
    prd_path = args.prd_path
    dry_run = args.dry_run
    project = args.project or "space"
    
    if not prd_path:
        log_error("PRD path required")
        print("Usage: flow.sh decompose-prd <prd-path> [--dry-run] [--project <name>]")
        return 1
    
    workspace_root = _find_workspace_root()
    full_prd_path = os.path.join(workspace_root, prd_path)
    
    if not os.path.isfile(full_prd_path):
        log_error(f"PRD file not found: {full_prd_path}")
        return 1
    
    log_info(f"Parsing PRD: {prd_path}")
    
    with open(full_prd_path, 'r') as f:
        prd_content = f.read()
    
    # Try to extract Implementation Phases section first
    phases_section = extract_implementation_phases_section(prd_content)
    
    if phases_section:
        print("")
        log_info("Found Implementation Phases section")
        print("")
        phases = extract_phases(phases_section)
    else:
        log_warn("No '## Implementation Phases' section found in PRD")
        print("Looking for Phase sections...")
        phases = extract_phases(prd_content)
    
    if not phases:
        log_warn("No Phase sections found in PRD")
        return 0
    
    created_issues = []
    
    for phase_num, phase_title in phases:
        print("")
        print(f"Phase {phase_num}: {phase_title}")
        
        if dry_run:
            print(f"  Would create Issue: [Phase {phase_num}] {phase_title}")
            continue
        
        issue_num = create_phase_issue(phase_num, phase_title, project, prd_path)
        if issue_num:
            created_issues.append(f"# {issue_num}")
            log_success(f"Issue #{issue_num} created: [Phase {phase_num}] {phase_title}")
        else:
            log_error(f"Failed to create Issue for Phase {phase_num}")
    
    if not dry_run and created_issues:
        print("")
        log_success(f"Created {len(created_issues)} Issues: {' '.join(created_issues)}")
    
    return 0


# ============================================
# argparse registration
# ============================================

def register_decompose_parser(subparsers: argparse._SubParsersAction) -> None:
    """Register decompose-prd subcommand."""
    decompose_parser = subparsers.add_parser(
        "decompose-prd",
        help="Create Issues from PRD phases",
    )
    decompose_parser.add_argument(
        "prd_path",
        nargs="?",
        help="Path to PRD file (relative to workspace root)",
    )
    decompose_parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be created without creating Issues",
    )
    decompose_parser.add_argument(
        "--project",
        help="Target project name (default: space)",
    )