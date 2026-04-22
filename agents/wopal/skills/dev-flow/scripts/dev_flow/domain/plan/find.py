#!/usr/bin/env python3
# find.py - Plan file search operations
#
# Provides:
#   - find_plan_by_issue: Find plan file by issue number (including archived)
#
# Ported from lib/plan.sh

import os
import glob


def find_plan_by_issue(issue_number: int, workspace_root: str = None) -> str:
    """
    Find plan file by issue number, searching active and archived directories.
    
    Search order:
    1. Active plans in docs/products/plans/
    2. Project-specific plans in docs/products/*/plans/
    3. Archived plans in docs/products/*/plans/done/ (YYYYMMDD-prefix)
    
    Args:
        issue_number: Issue number to search for
        workspace_root: Workspace root directory (optional, auto-detected if not provided)
        
    Returns:
        Path to plan file
        
    Raises:
        FileNotFoundError: If no matching plan found
    """
    if workspace_root is None:
        workspace_root = _find_workspace_root()
    
    # Pattern for issue-prefixed plan: <issue_number>-<type>-<scope>-<slug>.md
    pattern_prefix = f"{issue_number}-"
    
    # Search locations in order
    search_dirs = [
        # Space-level active plans
        os.path.join(workspace_root, "docs/products/plans"),
        # Project-level active plans
        *[d for d in glob.glob(os.path.join(workspace_root, "docs/products/*/plans")) if os.path.isdir(d)],
        # Archived plans (done directories)
        *[d for d in glob.glob(os.path.join(workspace_root, "docs/products/*/plans/done")) if os.path.isdir(d)],
    ]
    
    for search_dir in search_dirs:
        if not os.path.isdir(search_dir):
            continue
        
        # For archived directory, look for YYYYMMDD-<issue>-pattern
        if "done" in search_dir:
            # Archived files have date prefix: 20260422-120-xxx.md
            archived_pattern = os.path.join(search_dir, f"*-{pattern_prefix}*.md")
            matches = glob.glob(archived_pattern)
        else:
            # Active files: 120-xxx.md
            active_pattern = os.path.join(search_dir, f"{pattern_prefix}*.md")
            matches = glob.glob(active_pattern)
        
        if matches:
            # Return first match (there should only be one)
            return matches[0]
    
    raise FileNotFoundError(f"No plan found for issue #{issue_number}")


def _find_workspace_root() -> str:
    """Find workspace root by searching for .wopal or .git directory"""
    current = os.getcwd()
    
    while current != "/":
        if os.path.isdir(os.path.join(current, ".wopal")):
            return current
        if os.path.isdir(os.path.join(current, ".git")):
            return current
        current = os.path.dirname(current)
    
    return os.getcwd()