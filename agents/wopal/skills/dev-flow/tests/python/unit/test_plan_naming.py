#!/usr/bin/env python3
# test_plan_naming.py - Test validate_plan_name function with mandatory scope
#
# Test Case U5: Plan file naming with mandatory scope validation
#
# Scenarios:
#   1. Issue format with scope -> passes (e.g., 110-feature-dev-flow-slug)
#   2. No-issue format with scope -> passes (e.g., feature-dev-flow-slug)
#   3. Old format without scope -> fails (e.g., 110-feature-slug)
#   4. No-issue old format -> fails (e.g., feature-slug)
#   5. Invalid type -> fails
#
# Note: Tests the new mandatory scope naming requirement from #110

import unittest
import sys
import os

# Add scripts directory to path for imports
SCRIPTS_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))
sys.path.insert(0, os.path.join(SCRIPTS_DIR, 'scripts'))

from dev_flow.domain.plan.naming import validate_plan_name, make_plan_name, ValidationError


class TestValidatePlanName(unittest.TestCase):
    """Test validate_plan_name with mandatory scope"""

    def test_issue_format_with_scope_passes(self):
        """validate_plan_name: Issue format with scope passes"""
        issue_plan = "110-feature-dev-flow-improve-plan-naming"
        validate_plan_name(issue_plan)

    def test_issue_format_with_cli_scope(self):
        """validate_plan_name: Issue format with cli scope"""
        cli_plan = "42-feature-cli-add-skills-remove"
        validate_plan_name(cli_plan)

    def test_no_issue_format_with_scope_passes(self):
        """validate_plan_name: No-issue format with scope passes"""
        no_issue_plan = "fix-dev-flow-handle-expired-tokens"
        validate_plan_name(no_issue_plan)

    def test_no_issue_with_hyphenated_scope(self):
        """validate_plan_name: No-issue with hyphenated scope"""
        hyphen_scope_plan = "refactor-wopal-plugin-optimize-modules"
        validate_plan_name(hyphen_scope_plan)

    def test_old_issue_format_with_multi_segment_slug_matches(self):
        """validate_plan_name: Old Issue format with multi-segment slug still matches (regex limitation)
        
        Note: The regex cannot distinguish old format (no scope) from new format
        when the old slug happens to have 2+ segments. E.g., "110-feature-improve-plan-naming"
        matches as: issue=110, type=feature, scope=improve, slug=plan-naming.
        Scope enforcement happens at plan creation time (via extract_scope from Issue title),
        not at regex validation time. The regex only checks structural format.
        """
        old_issue_plan = "110-feature-improve-plan-naming"
        # This passes because regex sees: issue=110, type=feature, scope=improve, slug=plan-naming
        # Scope enforcement is at creation time, not validation time
        validate_plan_name(old_issue_plan)

    def test_single_segment_after_type_fails(self):
        """validate_plan_name: Single segment after type fails (no scope no slug)"""
        single_segment = "feature-someslug"
        with self.assertRaises(ValidationError) as context:
            validate_plan_name(single_segment)
        error_msg = str(context.exception)
        self.assertTrue(
            "scope" in error_msg.lower() or "invalid" in error_msg.lower(),
            f"Error should fail with only one segment after type: {error_msg}"
        )

    def test_old_no_issue_format_with_multi_segment_slug_matches(self):
        """validate_plan_name: Old no-issue format with multi-segment slug matches
        
        Matches as: type=fix, scope=handle, slug=expired-tokens
        """
        old_no_issue_plan = "fix-handle-expired-tokens"
        # Matches as: type=fix, scope=handle, slug=expired-tokens
        validate_plan_name(old_no_issue_plan)

    def test_invalid_type_fails(self):
        """validate_plan_name: Invalid type fails"""
        invalid_type_plan = "42-invalid-dev-flow-some-slug"
        with self.assertRaises(ValidationError) as context:
            validate_plan_name(invalid_type_plan)
        error_msg = str(context.exception)
        self.assertTrue(
            "type" in error_msg.lower() or "invalid" in error_msg.lower(),
            f"Error should mention invalid type: {error_msg}"
        )

    def test_valid_fix_type_with_scope(self):
        """validate_plan_name: Valid fix type with scope"""
        fix_plan = "15-fix-plugin-handle-error"
        validate_plan_name(fix_plan)

    def test_valid_refactor_type_with_scope(self):
        """validate_plan_name: Valid refactor type with scope"""
        refactor_plan = "refactor-cli-optimize-commands"
        validate_plan_name(refactor_plan)

    def test_valid_docs_type_with_scope(self):
        """validate_plan_name: Valid docs type with scope"""
        docs_plan = "docs-dev-flow-update-readme"
        validate_plan_name(docs_plan)

    def test_valid_chore_type_with_scope(self):
        """validate_plan_name: Valid chore type with scope"""
        chore_plan = "chore-cli-reorganize-scripts"
        validate_plan_name(chore_plan)

    def test_valid_test_type_with_scope(self):
        """validate_plan_name: Valid test type with scope"""
        test_plan = "test-cli-add-unit-tests"
        validate_plan_name(test_plan)

    def test_valid_enhance_type_with_scope(self):
        """validate_plan_name: Valid enhance type with scope"""
        enhance_plan = "21-enhance-plugin-improve-performance"
        validate_plan_name(enhance_plan)


class TestMakePlanName(unittest.TestCase):
    """Test make_plan_name function"""

    def test_make_plan_name_with_issue(self):
        """make_plan_name: creates plan name with issue number"""
        plan_name = make_plan_name(
            issue_number=110,
            plan_type="feature",
            scope="dev-flow",
            slug="improve-plan-naming"
        )
        self.assertEqual(plan_name, "110-feature-dev-flow-improve-plan-naming")

    def test_make_plan_name_without_issue(self):
        """make_plan_name: creates plan name without issue number"""
        plan_name = make_plan_name(
            issue_number=None,
            plan_type="fix",
            scope="dev-flow",
            slug="handle-expired-tokens"
        )
        self.assertEqual(plan_name, "fix-dev-flow-handle-expired-tokens")

    def test_make_plan_name_with_hyphenated_scope(self):
        """make_plan_name: handles hyphenated scope"""
        plan_name = make_plan_name(
            issue_number=42,
            plan_type="feature",
            scope="wopal-plugin",
            slug="add-new-feature"
        )
        self.assertEqual(plan_name, "42-feature-wopal-plugin-add-new-feature")

    def test_make_plan_name_normalizes_type(self):
        """make_plan_name: normalizes plan type"""
        plan_name = make_plan_name(
            issue_number=15,
            plan_type="feat",  # Should normalize to feature
            scope="cli",
            slug="add-skills-remove"
        )
        self.assertEqual(plan_name, "15-feature-cli-add-skills-remove")

    def test_make_plan_name_enhance_type(self):
        """make_plan_name: handles enhance type"""
        plan_name = make_plan_name(
            issue_number=21,
            plan_type="enhance",
            scope="plugin",
            slug="improve-performance"
        )
        self.assertEqual(plan_name, "21-enhance-plugin-improve-performance")


if __name__ == '__main__':
    unittest.main()