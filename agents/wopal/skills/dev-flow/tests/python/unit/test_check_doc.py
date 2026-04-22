#!/usr/bin/env python3
# test_check_doc.py - Test check_doc_plan function
#
# Test Case U2: check-doc rejects bad Task/Test structure and accepts good samples
#
# Scenarios:
#   1. valid-issue-plan.md -> should pass
#   2. valid-no-issue-plan.md -> should pass
#   3. bad-changes-numbered.md -> should reject (numbered list format)
#   4. bad-testplan-empty.md -> should reject (empty Test Plan)
#   5. bad-user-validation-no-checkbox.md -> should reject (missing checkbox)
#   6. good-user-validation-checked.md -> should pass
#   7. old-plan-no-techcontext.md -> should pass (backward compat)

import unittest
import sys
import os

# Add scripts directory to path for imports
SCRIPTS_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))
sys.path.insert(0, os.path.join(SCRIPTS_DIR, 'scripts'))

from dev_flow.domain.validation import check_doc_plan, ValidationError


class TestCheckDocPlan(unittest.TestCase):
    """Test check_doc_plan function"""

    def setUp(self):
        self.fixtures_dir = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
            'fixtures', 'plans'
        )

    def test_valid_issue_plan_passes(self):
        """valid-issue-plan.md should pass"""
        plan_file = os.path.join(self.fixtures_dir, '106-fix-dev-flow-valid-issue-plan.md')
        check_doc_plan(plan_file)

    def test_valid_no_issue_plan_passes(self):
        """valid-no-issue-plan.md should pass"""
        plan_file = os.path.join(self.fixtures_dir, 'refactor-dev-flow-valid-no-issue-plan.md')
        check_doc_plan(plan_file)

    def test_bad_changes_numbered_rejected(self):
        """bad-changes-numbered.md should reject (numbered list format)"""
        plan_file = os.path.join(self.fixtures_dir, 'fix-bad-changes-numbered.md')
        with self.assertRaises(ValidationError) as context:
            check_doc_plan(plan_file)
        error_msg = str(context.exception)
        self.assertTrue(
            'numbered' in error_msg.lower() or 'step' in error_msg.lower() or '编号' in error_msg,
            f"Error should mention numbered list: {error_msg}"
        )

    def test_bad_empty_test_plan_rejected(self):
        """bad-testplan-empty.md should reject (empty Test Plan)"""
        plan_file = os.path.join(self.fixtures_dir, 'fix-bad-testplan-empty.md')
        with self.assertRaises(ValidationError) as context:
            check_doc_plan(plan_file)
        error_msg = str(context.exception)
        self.assertTrue(
            'test' in error_msg.lower() or 'plan' in error_msg.lower() or 'case' in error_msg.lower(),
            f"Error should mention Test Plan structure: {error_msg}"
        )

    def test_bad_user_validation_no_checkbox_rejected(self):
        """bad-user-validation-no-checkbox.md should reject (missing checkbox)"""
        plan_file = os.path.join(self.fixtures_dir, 'fix-bad-user-validation-no-checkbox.md')
        with self.assertRaises(ValidationError) as context:
            check_doc_plan(plan_file)
        error_msg = str(context.exception)
        self.assertTrue(
            'checkbox' in error_msg.lower() or 'validation' in error_msg.lower(),
            f"Error should mention checkbox: {error_msg}"
        )

    def test_good_user_validation_checked_passes(self):
        """good-user-validation-checked.md should pass"""
        plan_file = os.path.join(self.fixtures_dir, 'fix-good-user-validation-checked.md')
        check_doc_plan(plan_file)

    def test_old_plan_no_techcontext_passes(self):
        """old-plan-no-techcontext.md should pass (backward compat)"""
        plan_file = os.path.join(self.fixtures_dir, 'feature-old-plan-no-techcontext.md')
        check_doc_plan(plan_file)


if __name__ == '__main__':
    unittest.main()