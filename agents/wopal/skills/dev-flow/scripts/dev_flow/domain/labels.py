#!/usr/bin/env python3
# labels.py - Dev-Flow Label Domain Operations
#
# Provides:
#   - normalize_plan_type: Normalize plan/issue type to canonical value
#   - plan_type_to_issue_label: Map canonical plan type to GitHub issue label
#   - issue_label_to_plan_type: Map GitHub issue label back to canonical plan type
#
# Ported from lib/labels.sh


class ValidationError(Exception):
    """Raised when validation fails"""
    pass


# Type normalization mapping
_TYPE_NORMALIZE_MAP = {
    'feat': 'feature',
    'feature': 'feature',
    'enhance': 'enhance',
    'enhancement': 'enhance',
    'fix': 'fix',
    'bug': 'fix',
    'perf': 'perf',
    'performance': 'perf',
    'refactor': 'refactor',
    'docs': 'docs',
    'doc': 'docs',
    'documentation': 'docs',
    'chore': 'chore',
    'ci': 'chore',
    'test': 'test',
}

# Canonical plan type -> GitHub issue label mapping
_PLAN_TYPE_TO_LABEL = {
    'feature': 'type/feature',
    'enhance': 'type/feature',  # enhance is a sub-type of feature
    'fix': 'type/bug',
    'perf': 'type/perf',
    'refactor': 'type/refactor',
    'docs': 'type/docs',
    'test': 'type/test',
    'chore': 'type/chore',
}

# GitHub issue label -> canonical plan type mapping
_LABEL_TO_PLAN_TYPE = {
    'type/feature': 'feature',
    'type/bug': 'fix',
    'type/perf': 'perf',
    'type/refactor': 'refactor',
    'type/docs': 'docs',
    'type/test': 'test',
    'type/chore': 'chore',
}


def normalize_plan_type(raw_type: str) -> str:
    """
    Normalize plan/issue type to canonical value.
    
    Args:
        raw_type: Raw type string (case insensitive)
        
    Returns:
        Canonical type: feature|enhance|fix|perf|refactor|docs|test|chore
        
    Raises:
        ValidationError: If type is invalid or empty
    """
    raw = (raw_type or '').lower()
    
    if not raw:
        raise ValidationError("Type cannot be empty")
    
    normalized = _TYPE_NORMALIZE_MAP.get(raw)
    if normalized is None:
        raise ValidationError(f"Invalid type: {raw_type}")
    
    return normalized


def plan_type_to_issue_label(plan_type: str) -> str:
    """
    Map canonical plan type to GitHub issue label.
    
    Args:
        plan_type: Canonical plan type
        
    Returns:
        GitHub issue label string (e.g., "type/feature")
        
    Raises:
        ValidationError: If plan_type is not a valid canonical type
    """
    label = _PLAN_TYPE_TO_LABEL.get(plan_type)
    if label is None:
        raise ValidationError(f"Invalid plan type for label mapping: {plan_type}")
    return label


def issue_label_to_plan_type(issue_label: str) -> str:
    """
    Map GitHub issue label back to canonical plan type.
    
    Args:
        issue_label: GitHub issue label (e.g., "type/feature")
        
    Returns:
        Canonical plan type string (e.g., "feature")
        
    Raises:
        ValidationError: If label is not a valid type label
    """
    plan_type = _LABEL_TO_PLAN_TYPE.get(issue_label)
    if plan_type is None:
        raise ValidationError(f"Invalid issue label for plan type mapping: {issue_label}")
    return plan_type