#!/usr/bin/env python3
# metadata.py - Plan metadata extraction operations
#
# Provides:
#   - get_plan_field: Extract arbitrary field from Plan metadata
#   - get_plan_project: Extract Target Project field
#   - get_plan_type: Extract Type field
#
# Ported from lib/plan.sh get_plan_field()

import re
from pathlib import Path


def get_plan_field(plan_path: str, field_name: str) -> str:
    """
    Extract arbitrary field value from Plan metadata section.
    
    Metadata format: "- **FieldName**: value"
    
    Args:
        plan_path: Path to Plan markdown file
        field_name: Field name to extract (e.g., "Target Project", "Type")
        
    Returns:
        Field value string, or empty string if not found
    """
    path = Path(plan_path)
    if not path.exists():
        return ""
    
    content = path.read_text()
    
    # Match metadata field: - **FieldName**: value
    pattern = rf'^\- \*\*{re.escape(field_name)}\*\*:\s*(.+)$'
    match = re.search(pattern, content, re.MULTILINE)
    
    if match:
        return match.group(1).strip()
    
    return ""


def get_plan_project(plan_path: str) -> str:
    """
    Extract Target Project from Plan metadata.
    
    Args:
        plan_path: Path to Plan markdown file
        
    Returns:
        Project name (e.g., "ontology"), or empty string if not found
    """
    return get_plan_field(plan_path, "Target Project")


def get_plan_type(plan_path: str) -> str:
    """
    Extract Type from Plan metadata.
    
    Args:
        plan_path: Path to Plan markdown file
        
    Returns:
        Type name (e.g., "feature", "fix"), or empty string if not found
    """
    return get_plan_field(plan_path, "Type")


def get_plan_issue(plan_path: str) -> int | None:
    """
    Extract Issue number from Plan metadata.
    
    Args:
        plan_path: Path to Plan markdown file
        
    Returns:
        Issue number, or None if not found
    """
    issue_field = get_plan_field(plan_path, "Issue")
    
    if not issue_field:
        return None
    
    # Format: "#123" or "123"
    match = re.search(r'#?(\d+)', issue_field)
    if match:
        return int(match.group(1))
    
    return None


def get_plan_status(plan_path: str) -> str:
    """
    Extract Status from Plan metadata.
    
    Args:
        plan_path: Path to Plan markdown file
        
    Returns:
        Status name (e.g., "planning", "done"), or empty string if not found
    """
    return get_plan_field(plan_path, "Status")