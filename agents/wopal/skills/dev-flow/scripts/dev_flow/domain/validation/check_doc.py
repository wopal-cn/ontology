#!/usr/bin/env python3
# check_doc.py - Plan Document Quality Check
#
# Provides:
#   - check_doc_plan: Plan document completeness validation
#   - check_user_validation: User Validation section gate check
#   - ValidationError: Exception for validation failures
#
# Ported from lib/check-doc.sh, lib/plan.sh

import re


class ValidationError(Exception):
    """Raised when plan validation fails"""
    pass


def check_doc_plan(plan_file: str) -> None:
    """
    Check Plan document completeness (execution-grade quality gate).
    
    Validates:
    - File naming convention
    - No placeholders
    - Required sections
    - Changes block format (checkbox, not numbered list)
    - Test Plan structure
    - User Validation section
    
    Args:
        plan_file: Path to plan file
        
    Raises:
        ValidationError: If validation fails
    """
    with open(plan_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    issues = []
    
    # Check for placeholders (exclude code blocks)
    content_no_codeblocks = _remove_code_blocks(content)
    placeholder_pattern = r'(<!-- *(TODO|FIXME)|\- \[ \] *(TODO|FIXME)|\*\*(TODO|FIXME)|(TODO|FIXME)[：:]|待补充|REQ-xxx|path/to/)'
    if re.search(placeholder_pattern, content_no_codeblocks):
        issues.append("Found placeholders in plan")
    
    # Check Changes block format - must use '- [ ] Step N:' not numbered list
    changes_issues = _check_changes_format(content)
    if changes_issues:
        issues.extend(changes_issues)
    
    # Check Test Plan structure
    testplan_issues = _check_test_plan_structure(content)
    if testplan_issues:
        issues.extend(testplan_issues)
    
    # Check User Validation structure
    uv_issues = _check_user_validation_structure(content)
    if uv_issues:
        issues.extend(uv_issues)
    
    if issues:
        raise ValidationError("\n".join(issues))


def check_user_validation(plan_file: str) -> None:
    """
    Check User Validation section passes the hard gate.
    
    Gate rules (strict):
    1. Must contain at least one named user scenario (#### Scenario)
    2. Must contain a final confirmation checkbox: '- [ ] 用户已完成...'
    3. The final confirmation checkbox must be checked ([x])
    
    Backward compat: old plans with no User Validation section still pass
    
    Args:
        plan_file: Path to plan file
        
    Raises:
        ValidationError: If validation fails
    """
    with open(plan_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Extract User Validation section (level-3 heading)
    uv_section = _extract_level3_section(content, "### User Validation")
    
    # Backward compat: no section = pass
    if not uv_section:
        return
    
    # Gate 1: Must have at least one scenario heading (####)
    scenario_count = len(re.findall(r'^####\s+', uv_section, re.MULTILINE))
    if scenario_count < 1:
        raise ValidationError("User Validation must contain at least one named user scenario (#### Scenario N:)")
    
    # Gate 2: Must contain final confirmation checkbox
    final_checkbox_match = re.search(r'^\s*-\s+\[[ x]\]\s+用户已完成', uv_section, re.MULTILINE)
    if not final_checkbox_match:
        raise ValidationError("User Validation must contain a final confirmation checkbox\n  Required: - [ ] 用户已完成上述功能验证并确认结果符合预期")
    
    # Gate 3: Final checkbox must be checked [x]
    checked_match = re.search(r'^\s*-\s+\[x\]\s+用户已完成', uv_section, re.MULTILINE)
    if not checked_match:
        raise ValidationError("User Validation final confirmation checkbox is NOT checked\n  The final checkbox must be checked by the user before verify --confirm")


def _remove_code_blocks(content: str) -> str:
    """Remove fenced code blocks from content"""
    return re.sub(r'^```.*?^```', '', content, flags=re.MULTILINE | re.DOTALL)


def _extract_level2_section(content: str, heading: str) -> str:
    """Extract level-2 section content (##) until next ## heading"""
    pattern = rf'^{heading}\s*\n(.*?)(?=^##[^#]|\Z)'
    match = re.search(pattern, content, re.MULTILINE | re.DOTALL)
    return match.group(1).strip() if match else ""


def _extract_level3_section(content: str, heading: str) -> str:
    """Extract level-3 section content (###) until next ## or ### heading"""
    pattern = rf'^{heading}\s*\n(.*?)(?=^##[^#]|^###[^#]|\Z)'
    match = re.search(pattern, content, re.MULTILINE | re.DOTALL)
    return match.group(1).strip() if match else ""


def _check_changes_format(content: str) -> list:
    """Check Changes blocks use checkbox format, not numbered list"""
    issues = []
    
    # Find each Task section
    task_pattern = r'^### Task \d+: (.+?)\n(.*?)(?=^### Task|^##[^#]|\Z)'
    tasks = re.findall(task_pattern, content, re.MULTILINE | re.DOTALL)
    
    for task_title, task_content in tasks:
        # Extract Changes block
        changes_match = re.search(r'\*\*Changes\*\*:\s*\n(.*?)(?:\*\*Verification\*\*:|^###|^##|\Z)', 
                                   task_content, re.MULTILINE | re.DOTALL)
        if not changes_match:
            continue
        
        changes_block = changes_match.group(1).strip()
        if not changes_block:
            continue
        
        # Check for numbered list format (1. 2. 3.)
        numbered_lines = re.findall(r'^\s*[0-9]+[\.\)]\s', changes_block, re.MULTILINE)
        if numbered_lines:
            issues.append(f"Task '{task_title}': **Changes** uses numbered list instead of '- [ ] Step N:' format")
    
    return issues


def _check_test_plan_structure(content: str) -> list:
    """Check Test Plan has proper Case structure"""
    issues = []
    
    testplan_section = _extract_level2_section(content, "## Test Plan")
    if not testplan_section:
        issues.append("Missing ## Test Plan (mandatory for execution-grade plans)")
        return issues
    
    # Check for N/A markers
    has_na_markers = bool(re.search(r'N/A\s*—', testplan_section))
    
    # Check for Case headings (##### Case or #### Case or just Case)
    # Accept both "##### Case U1:" and "#### 单元测试" followed by "##### Case"
    case_count = len(re.findall(r'^#{4,5}\s+Case\s+', testplan_section, re.MULTILINE))
    
    if case_count >= 1:
        # Validate each case has minimum structure
        # Case heading can be level-4 or level-5
        case_pattern = r'^#{4,5}\s*Case\s*([^#\n]+)\n(.*?)(?=^#{4,5}[^#]|\Z)'
        cases = re.findall(case_pattern, testplan_section, re.MULTILINE | re.DOTALL)
        
        for case_name, case_content in cases:
            case_content = case_content.strip()
            
            has_goal = bool(re.search(r'-\s*Goal:', case_content, re.IGNORECASE))
            has_fixture = bool(re.search(r'-\s*Fixture:', case_content, re.IGNORECASE))
            has_execution = bool(re.search(r'-\s*Execution:', case_content, re.IGNORECASE))
            has_evidence = bool(re.search(r'-\s*Expected\s*Evidence:', case_content, re.IGNORECASE) or 
                                re.search(r'-\s*Expected\s*Result:', case_content, re.IGNORECASE))
            has_step = bool(re.search(r'^\s*-\s+\[[ x]\]', case_content, re.MULTILINE))
            
            if not has_goal:
                issues.append(f"Test Case '{case_name.strip()}': missing '- Goal:'")
            if not has_fixture:
                issues.append(f"Test Case '{case_name.strip()}': missing '- Fixture:'")
            if not has_execution:
                issues.append(f"Test Case '{case_name.strip()}': missing '- Execution:' with step checkboxes")
            if not has_evidence:
                issues.append(f"Test Case '{case_name.strip()}': missing '- Expected Evidence:' or '- Expected Result:'")
            if not has_step:
                issues.append(f"Test Case '{case_name.strip()}': missing '- [ ] Step N:' in Execution")
    elif has_na_markers:
        # N/A categories with reasons - OK
        pass
    else:
        # No Case structure and no N/A markers
        test_item_lines = re.findall(r'^\s*-', testplan_section, re.MULTILINE)
        if test_item_lines:
            issues.append("## Test Plan has test items but no '##### Case' structure (use Case skeleton format)")
        else:
            issues.append("## Test Plan has no test cases or N/A markers")
    
    return issues


def _check_user_validation_structure(content: str) -> list:
    """Check User Validation structure for check_doc_plan (warning level)"""
    issues = []
    
    uv_section = _extract_level3_section(content, "### User Validation")
    
    if not uv_section:
        # Warning only (backward compat)
        return issues
    
    # Must have at least one scenario (#### heading)
    scenario_count = len(re.findall(r'^####\s+', uv_section, re.MULTILINE))
    if scenario_count < 1:
        issues.append("### User Validation: must have at least one named user scenario (#### Scenario N:)")
    
    # Must contain final confirmation checkbox
    final_checkbox_match = re.search(r'^\s*-\s+\[[ x]\]\s+用户已完成', uv_section, re.MULTILINE)
    if not final_checkbox_match:
        issues.append("### User Validation: must contain final confirmation checkbox\n  Required: - [ ] 用户已完成上述功能验证并确认结果符合预期")
    
    return issues


def check_acceptance_criteria(plan_file: str) -> None:
    """
    Check if all Agent Verification Acceptance Criteria are completed.
    
    This is a hard gate for complete command.
    
    Behavior:
    - If `### Agent Verification` sub-section exists: only check that section
    - If no sub-section: fallback to checking entire `## Acceptance Criteria` (backward compat)
    
    Args:
        plan_file: Path to plan file
        
    Raises:
        ValidationError: If any Agent Verification items are unchecked
    """
    with open(plan_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # First, try to extract `### Agent Verification` sub-section
    agent_ac_section = _extract_level3_section(content, "### Agent Verification")
    
    ac_section = ""
    section_name = ""
    
    # Check if `### Agent Verification` exists and has checkbox content
    if agent_ac_section and re.search(r'^\s*-\s+\[', agent_ac_section, re.MULTILINE):
        ac_section = agent_ac_section
        section_name = "Agent Verification"
    else:
        # Fallback: extract entire Acceptance Criteria section (backward compat)
        ac_section = _extract_level2_section(content, "## Acceptance Criteria")
        section_name = "Acceptance Criteria"
    
    # If no section or empty, pass
    if not ac_section or not re.search(r'-', ac_section):
        return
    
    # Check for unchecked items: - [ ]
    unchecked = re.findall(r'^\s*-\s+\[\s*\].*$', ac_section, re.MULTILINE)
    
    if unchecked:
        unchecked_str = "\n".join(unchecked)
        raise ValidationError(f"{section_name} not completed:\n\n{unchecked_str}\n\nPlease complete the remaining items and update the Plan file.")
    
    # Check if there are any checked items
    checked = re.findall(r'^\s*-\s+\[x\].*$', ac_section, re.MULTILINE)
    
    if not checked:
        # No items found - pass
        return