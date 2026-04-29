#!/usr/bin/env python3
# title.py - Issue title domain operations
#
# Provides:
#   - extract_scope: Extract scope from Issue title
#   - extract_type: Extract type from Issue title
#   - validate_issue_title: Validate Issue title format and length
#
# Ported from lib/issue.sh

import re


class ValidationError(Exception):
    """Raised when validation fails"""
    pass


# Valid types for Issue title
VALID_TYPES = ['feat', 'fix', 'perf', 'refactor', 'docs', 'test', 'chore', 'enhance']


def extract_scope(title: str) -> str:
    """
    Extract scope from Issue title.
    
    Format: type(scope): description
    
    Args:
        title: Issue title string
        
    Returns:
        Scope string (e.g., "cli") or empty string if not found
    """
    # Match pattern: type(scope): description
    # Extract content between parentheses
    match = re.match(r'^[a-z]+\(([^)]+)\):', title)
    if match:
        return match.group(1)
    return ""


def extract_type(title: str) -> str:
    """
    Extract type from Issue title.
    
    Format: type(scope): description or type: description
    
    Args:
        title: Issue title string
        
    Returns:
        Type string (e.g., "feat") or empty string if not found
    """
    match = re.match(r'^([a-z]+)(\([^)]+\))?:', title)
    if match:
        return match.group(1)
    return ""


def validate_issue_title(title: str) -> None:
    """
    Validate Issue title format and length.
    
    Format: <type>(<scope>): <description>
    
    Constraints:
        - type must be valid (feat/fix/perf/refactor/docs/test/chore/enhance)
        - scope is MANDATORY (must be present in parentheses)
        - description <= 50 chars
        - total title <= 72 chars
        
    Args:
        title: Issue title string
        
    Raises:
        ValidationError: If title is invalid
    """
    # Check format: type(scope): description (scope is now mandatory)
    if not re.match(r'^[a-z]+\([^)]+\):\s*.+$', title):
        raise ValidationError(
            "Invalid title format. Expected: <type>(<scope>): <description>\n"
            "Scope is mandatory - must be enclosed in parentheses\n"
            f"Example: feat(cli): add skills remove command\n"
            f"Your title: {title}"
        )
    
    # Extract type
    type_val = extract_type(title)
    
    # Validate type
    if type_val not in VALID_TYPES:
        raise ValidationError(
            f"Invalid type: {type_val}\n"
            f"Valid types: feat, fix, perf, refactor, docs, test, chore, enhance"
        )
    
    # Extract scope
    scope = extract_scope(title)
    
    # Scope is now mandatory
    if not scope:
        raise ValidationError(
            "Scope is mandatory but not found in title\n"
            "Expected format: <type>(<scope>): <description>"
        )
    
    # Extract description (after type(scope): ), strip whitespace like Bash sed
    match = re.match(r'^[a-z]+\([^)]+\):\s*(.*)$', title)
    if match:
        description = match.group(1).strip()
    else:
        description = ""
    
    # Check description is not empty
    if not description:
        raise ValidationError("Description cannot be empty")
    
    # Check description length (<= 50 chars)
    if len(description) > 50:
        raise ValidationError(
            f"Description too long: {len(description)} chars (max 50)\n"
            f"Description: {description}"
        )
    
    # Check description is ASCII (English only)
    # Per AGENTS.md Issue 标题规范, description must be English imperative sentence
    if not description.isascii():
        raise ValidationError(
            f"Description must be English (ASCII characters only)\n"
            f"Per AGENTS.md Issue 标题规范: description should be English imperative sentence\n"
            f"Your description: {description}"
        )
    
    # Check total title length (<= 72 chars)
    if len(title) > 72:
        raise ValidationError(
            f"Title too long: {len(title)} chars (max 72)"
        )