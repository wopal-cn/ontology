#!/usr/bin/env python3
# body.py - Issue body domain operations
#
# Provides:
#   - build_structured_issue_body: Build structured Issue body from fields
#
# Ported from lib/issue.sh build_structured_issue_body()


def _render_section(heading: str, content: str, fallback: str = None) -> str:
    """
    Render a single issue section with consistent formatting.
    
    Args:
        heading: Section heading (without ## prefix)
        content: Section content
        fallback: Optional fallback if content is empty
        
    Returns:
        Formatted markdown section (with newline) or empty string
    """
    if content:
        return f"## {heading}\n\n{content}\n"
    elif fallback:
        return f"## {heading}\n\n{fallback}\n"
    return ""


def _format_list(raw_items: str, prefix: str = "- ") -> str:
    """
    Format comma-separated items as markdown list.
    
    Args:
        raw_items: Comma-separated items string
        prefix: List item prefix (default "- ")
        
    Returns:
        Formatted markdown list or empty string
    """
    if not raw_items:
        return ""
    
    items = [item.strip() for item in raw_items.split(',') if item.strip()]
    if not items:
        return ""
    
    return "\n".join(f"{prefix}{item}" for item in items)


def _render_related_resources_table(reference: str = None) -> str:
    """
    Build Related Resources table.
    
    Args:
        reference: Optional research document reference
        
    Returns:
        Formatted Related Resources section
    """
    lines = [
        "## Related Resources",
        "",
        "| Resource | Link |",
        "|----------|------|"
    ]
    
    if reference:
        lines.append(f"| Research | {reference} |")
    
    lines.append("| Plan | _待关联_ |")
    
    return "\n".join(lines) + "\n"


def build_structured_issue_body(**kwargs) -> str:
    """
    Build structured Issue body from individual fields.
    
    Section order for fix type:
        Goal → Background → Confirmed Bugs → Content Model Defects → 
        Cleanup Scope → Key Findings → In Scope → Out of Scope → 
        Acceptance Criteria → Related Resources
    
    Section order for other types:
        Goal → Background → [type-specific sections] → In Scope → 
        Out of Scope → Acceptance Criteria → Related Resources
    
    Args:
        type: Issue type (feature, fix, perf, refactor, docs, test, chore, enhance)
        goal: One-line goal description
        background: Background context
        confirmed_bugs: Confirmed bugs section (fix type only)
        content_model_defects: Content model defects section (fix type only)
        cleanup_scope: Cleanup scope section (fix type only)
        key_findings: Key findings section (fix type only)
        baseline: Performance baseline (perf type only)
        target: Performance target (perf type only)
        affected_components: Affected components list (refactor type only)
        refactor_strategy: Refactor strategy (refactor type only)
        target_documents: Target documents list (docs type only)
        audience: Target audience (docs type only)
        test_scope: Test scope (test type only)
        test_strategy: Test strategy (test type only)
        scope: In-scope items, comma-separated
        out_of_scope: Out-of-scope items, comma-separated
        reference: Research document path
        acceptance_criteria: Acceptance criteria
        
    Returns:
        Formatted Issue body markdown
    """
    issue_type = kwargs.get('type', 'feature')
    
    # Common fields
    goal = kwargs.get('goal', '')
    background = kwargs.get('background', '')
    scope = kwargs.get('scope', '')
    out_of_scope = kwargs.get('out_of_scope', '')
    reference = kwargs.get('reference', '')
    
    # Fix-specific fields
    confirmed_bugs = kwargs.get('confirmed_bugs', '')
    content_model_defects = kwargs.get('content_model_defects', '')
    cleanup_scope = kwargs.get('cleanup_scope', '')
    key_findings = kwargs.get('key_findings', '')
    
    # Perf-specific fields
    baseline = kwargs.get('baseline', '')
    target = kwargs.get('target', '')
    
    # Refactor-specific fields
    affected_components = kwargs.get('affected_components', '')
    refactor_strategy = kwargs.get('refactor_strategy', '')
    
    # Docs-specific fields
    target_documents = kwargs.get('target_documents', '')
    audience = kwargs.get('audience', '')
    
    # Test-specific fields
    test_scope = kwargs.get('test_scope', '')
    test_strategy = kwargs.get('test_strategy', '')
    
    sections = []
    
    # Goal (always present with fallback)
    sections.append(_render_section("Goal", goal, "<一句话描述目标>"))
    
    # Background (optional)
    if background:
        sections.append(_render_section("Background", background))
    
    # Type-specific sections
    if issue_type == 'fix':
        if confirmed_bugs:
            sections.append(_render_section("Confirmed Bugs", confirmed_bugs))
        if content_model_defects:
            sections.append(_render_section("Content Model Defects", content_model_defects))
        if cleanup_scope:
            sections.append(_render_section("Cleanup Scope", cleanup_scope))
        if key_findings:
            sections.append(_render_section("Key Findings", key_findings))
    
    elif issue_type == 'perf':
        if baseline:
            sections.append(_render_section("Baseline", baseline))
        if target:
            sections.append(_render_section("Target", target))
    
    elif issue_type == 'refactor':
        if affected_components:
            sections.append(_render_section("Affected Components", _format_list(affected_components)))
        if refactor_strategy:
            sections.append(_render_section("Refactor Strategy", refactor_strategy))
    
    elif issue_type == 'docs':
        if target_documents:
            sections.append(_render_section("Target Documents", _format_list(target_documents)))
        if audience:
            sections.append(_render_section("Audience", audience))
    
    elif issue_type == 'test':
        if test_scope:
            sections.append(_render_section("Test Scope", test_scope))
        if test_strategy:
            sections.append(_render_section("Test Strategy", test_strategy))
    
    # In Scope (optional)
    if scope:
        sections.append(_render_section("In Scope", _format_list(scope)))
    
    # Out of Scope (optional)
    if out_of_scope:
        sections.append(_render_section("Out of Scope", _format_list(out_of_scope)))
    
    # Acceptance Criteria (always present with fallback)
    sections.append(_render_section("Acceptance Criteria", "", "待 plan 阶段细化"))
    
    # Related Resources (always present)
    sections.append(_render_related_resources_table(reference))
    
    # Join sections with newline between each
    body = "\n".join(sections)
    
    return body