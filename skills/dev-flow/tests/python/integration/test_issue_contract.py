#!/usr/bin/env python3
# test_issue_contract.py - Test Issue renderer contract consistency
#
# Test Case I1: Issue renderer three-way output shares same contract
#
# Scenarios:
#   1. build_structured_issue_body (fix type) -> has audit sections
#   2. build_structured_issue_body (non-fix type) -> no audit sections
#   3. Section order is consistent
#   4. Perf/Refactor/Docs/Test templates render dedicated sections
#   5. Empty optional sections are suppressed

import unittest
import sys
import os

# Add scripts directory to path for imports
SCRIPTS_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))
sys.path.insert(0, os.path.join(SCRIPTS_DIR, 'scripts'))

from dev_flow.domain.issue.body import build_structured_issue_body


def extract_sections(content):
    """Extract section headings from body"""
    lines = content.split('\n')
    sections = []
    for line in lines:
        if line.startswith('## '):
            sections.append(line[3:])
    return sections


class TestIssueContract(unittest.TestCase):
    """Test Issue renderer contract"""

    def test_fix_type_has_audit_sections(self):
        """Fix type Issue body has audit sections"""
        body = build_structured_issue_body(
            type='fix',
            goal='Fix push detection bug',
            background='approve.sh uses wrong logic',
            confirmed_bugs='Bug 1: wrong detection',
            content_model_defects='Defect: missing renderer',
            cleanup_scope='Only approve.sh',
            key_findings='Findings: need file-level commit',
            scope='Fix push detection',
            out_of_scope='No state machine change',
            reference='docs/xxx.md'
        )
        sections = extract_sections(body)
        
        self.assertIn('Goal', sections)
        self.assertIn('Background', sections)
        self.assertIn('Confirmed Bugs', sections)
        self.assertIn('Content Model Defects', sections)
        self.assertIn('Cleanup Scope', sections)
        self.assertIn('Key Findings', sections)
        self.assertIn('In Scope', sections)
        self.assertIn('Out of Scope', sections)
        self.assertIn('Acceptance Criteria', sections)
        self.assertIn('Related Resources', sections)

    def test_non_fix_type_no_audit_sections(self):
        """Non-fix type Issue body has no audit sections"""
        body = build_structured_issue_body(
            type='feature',
            goal='Add new feature',
            background='Background for feature',
            scope='In scope items',
            out_of_scope='Out of scope items',
            reference='reference.md'
        )
        sections = extract_sections(body)
        
        self.assertIn('Goal', sections)
        self.assertIn('Background', sections)
        self.assertIn('In Scope', sections)
        self.assertIn('Out of Scope', sections)
        
        # Should NOT contain audit sections
        self.assertNotIn('Confirmed Bugs', sections)
        self.assertNotIn('Content Model Defects', sections)

    def test_section_order_is_consistent(self):
        """Section order is consistent"""
        body = build_structured_issue_body(
            type='fix',
            goal='Fix push detection bug',
            background='approve.sh uses wrong logic',
            confirmed_bugs='Bug 1: wrong detection',
            content_model_defects='Defect: missing renderer',
            key_findings='Findings: need file-level commit',
            scope='Fix push detection',
            reference='docs/xxx.md'
        )
        
        lines = body.split('\n')
        positions = {}
        for i, line in enumerate(lines):
            if line.startswith('## '):
                positions[line[3:]] = i
        
        # Assert order: Goal < Background < Confirmed Bugs < Content Model Defects < Key Findings < In Scope
        self.assertLess(positions['Goal'], positions['Background'])
        self.assertLess(positions['Background'], positions['Confirmed Bugs'])
        self.assertLess(positions['Confirmed Bugs'], positions['Content Model Defects'])
        self.assertLess(positions['Content Model Defects'], positions['Key Findings'])
        self.assertLess(positions['Key Findings'], positions['In Scope'])

    def test_perf_refactor_docs_test_templates(self):
        """Perf/Refactor/Docs/Test templates render dedicated sections"""
        perf_body = build_structured_issue_body(type='perf', goal='Speed up', baseline='200ms', target='120ms')
        self.assertIn('Baseline', extract_sections(perf_body))
        
        refactor_body = build_structured_issue_body(type='refactor', goal='Refactor', affected_components='a,b', refactor_strategy='extract modules')
        self.assertIn('Affected Components', extract_sections(refactor_body))
        
        docs_body = build_structured_issue_body(type='docs', goal='Docs', target_documents='README', audience='contributors')
        self.assertIn('Target Documents', extract_sections(docs_body))
        
        test_body = build_structured_issue_body(type='test', goal='Tests', test_scope='CLI', test_strategy='integration')
        self.assertIn('Test Strategy', extract_sections(test_body))

    def test_empty_optional_sections_suppressed(self):
        """Empty optional sections are suppressed"""
        body = build_structured_issue_body(type='feature', goal='Only goal')
        
        self.assertNotIn('Background', extract_sections(body))
        self.assertNotIn('In Scope', extract_sections(body))


if __name__ == '__main__':
    unittest.main()