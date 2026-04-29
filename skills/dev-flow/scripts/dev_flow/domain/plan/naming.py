#!/usr/bin/env python3
# naming.py - Plan naming domain operations
#
# Provides:
#   - validate_plan_name: Validate plan file naming convention
#   - make_plan_name: Generate plan name from components
#
# Ported from lib/plan.sh

import re


class ValidationError(Exception):
    """Raised when validation fails"""
    pass


# Valid types for plan name
VALID_TYPES = ['feature', 'enhance', 'fix', 'refactor', 'docs', 'chore', 'test']


def validate_plan_name(name: str) -> None:
    """
    Validate Plan naming convention.
    
    Naming: <issue_number>-<type>-<scope>-<slug>.md OR <type>-<scope>-<slug>.md (no Issue)
    
    Scope is mandatory in the regex structure (at least one segment after type is interpreted as scope).
    
    Note: The regex cannot distinguish old format (no scope) from new format
    when the old slug happens to have 2+ segments. Scope enforcement happens at
    plan creation time (via extract_scope from Issue title), not at regex validation time.
    The regex only checks structural format.
    
    Args:
        name: Plan name string (without .md extension)
        
    Raises:
        ValidationError: If name is invalid
    """
    # Support two formats: with Issue prefix or without
    # Scope is mandatory: <issue_number>-<type>-<scope>-<slug> or <type>-<scope>-<slug>
    pattern = r'^([0-9]+)?-?(feature|enhance|fix|refactor|docs|chore|test)-([a-z0-9]+)-([a-z0-9-]+)$'
    
    if not re.match(pattern, name):
        raise ValidationError(
            f"Invalid plan name: {name}\n"
            "\n"
            "Plan naming convention (scope is mandatory):\n"
            "  <issue_number>-<type>-<scope>-<slug>.md  (with Issue)\n"
            "  <type>-<scope>-<slug>.md                 (no Issue)\n"
            "\n"
            "Types: feature, enhance, fix, refactor, docs, chore, test\n"
            "  - feature: new functionality\n"
            "  - enhance: improvement/optimization\n"
            "  - fix: bug fix\n"
            "  - refactor: code refactoring\n"
            "Scope: short lowercase identifier (e.g., cli, dev-flow, plugin)\n"
            "Slug: short lowercase with hyphens\n"
            "\n"
            "Examples:\n"
            "  110-feature-dev-flow-improve-plan-naming\n"
            "  15-feature-cli-add-skills-remove\n"
            "  fix-dev-flow-handle-expired-tokens (no Issue)"
        )


def make_plan_name(
    issue_number: int | None,
    plan_type: str,
    scope: str,
    slug: str
) -> str:
    """
    Generate plan name from components.
    
    Args:
        issue_number: Issue number (optional)
        plan_type: Plan type (will be normalized)
        scope: Scope string (e.g., "dev-flow")
        slug: Slug string (e.g., "improve-plan-naming")
        
    Returns:
        Plan name string
    """
    # Normalize type
    normalized_type = _normalize_type(plan_type)
    
    if issue_number:
        return f"{issue_number}-{normalized_type}-{scope}-{slug}"
    else:
        return f"{normalized_type}-{scope}-{slug}"


def _normalize_type(raw_type: str) -> str:
    """
    Normalize plan type to canonical value.
    
    Args:
        raw_type: Raw type string
        
    Returns:
        Normalized type: feature|enhance|fix|refactor|docs|test|chore
        
    Raises:
        ValidationError: If type is invalid
    """
    raw = raw_type.lower()
    
    if raw in ('feat', 'feature'):
        return 'feature'
    elif raw in ('enhance', 'enhancement'):
        return 'enhance'
    elif raw in ('fix', 'bug'):
        return 'fix'
    elif raw in ('perf', 'performance'):
        return 'perf'  # Note: perf is not in VALID_TYPES for plan names
    elif raw == 'refactor':
        return 'refactor'
    elif raw in ('docs', 'doc', 'documentation'):
        return 'docs'
    elif raw in ('chore', 'ci'):
        return 'chore'
    elif raw == 'test':
        return 'test'
    else:
        raise ValidationError(f"Invalid plan type: {raw_type}")