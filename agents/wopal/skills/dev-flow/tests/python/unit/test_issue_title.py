#!/usr/bin/env python3
# test_issue_title.py - Test extract_scope and validate_issue_title functions
#
# Test Case U4: Issue title scope extraction and mandatory validation
#
# Scenarios:
#   1. extract_scope: title with scope -> returns scope string
#   2. extract_scope: title without scope -> returns empty string
#   3. validate_issue_title: valid format with scope -> passes
#   4. validate_issue_title: missing scope -> fails with error
#   5. validate_issue_title: description too long -> fails
#   6. validate_issue_title: invalid type -> fails
#
# Note: Tests the new mandatory scope requirement from #110

import unittest
import sys
import os

# Add scripts directory to path for imports
SCRIPTS_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))
sys.path.insert(0, os.path.join(SCRIPTS_DIR, 'scripts'))

from dev_flow.domain.issue.title import extract_scope, extract_type, validate_issue_title, ValidationError


class TestExtractScope(unittest.TestCase):
    """Test extract_scope function"""

    def test_title_with_scope_returns_scope_string(self):
        """extract_scope: title with scope returns scope string"""
        title = "feat(cli): add skills remove command"
        scope = extract_scope(title)
        self.assertEqual(scope, "cli")

    def test_title_with_dev_flow_scope(self):
        """extract_scope: title with dev-flow scope"""
        title = "fix(dev-flow): repair workflow bugs"
        scope = extract_scope(title)
        self.assertEqual(scope, "dev-flow")

    def test_title_without_scope_returns_empty(self):
        """extract_scope: title without scope returns empty"""
        title = "refactor: unify plan status management"
        scope = extract_scope(title)
        self.assertEqual(scope, "")

    def test_title_with_multi_part_scope(self):
        """extract_scope: title with multi-part scope (hyphenated)"""
        title = "feat(wopal-plugin): add new feature"
        scope = extract_scope(title)
        self.assertEqual(scope, "wopal-plugin")

    def test_title_with_underscore_scope(self):
        """extract_scope: title with underscore in scope"""
        title = "feat(wopal_plugin): add new feature"
        scope = extract_scope(title)
        self.assertEqual(scope, "wopal_plugin")


class TestExtractType(unittest.TestCase):
    """Test extract_type function"""

    def test_extract_type_feat(self):
        """extract_type: feat type"""
        title = "feat(cli): add skills remove command"
        type_val = extract_type(title)
        self.assertEqual(type_val, "feat")

    def test_extract_type_fix(self):
        """extract_type: fix type"""
        title = "fix(dev-flow): handle edge case"
        type_val = extract_type(title)
        self.assertEqual(type_val, "fix")

    def test_extract_type_without_scope(self):
        """extract_type: type without scope"""
        title = "refactor: unify plan status management"
        type_val = extract_type(title)
        self.assertEqual(type_val, "refactor")

    def test_extract_type_empty_on_invalid_format(self):
        """extract_type: returns empty on invalid format"""
        title = "invalid title format"
        type_val = extract_type(title)
        self.assertEqual(type_val, "")


class TestValidateIssueTitle(unittest.TestCase):
    """Test validate_issue_title function"""

    def test_valid_format_with_scope_passes(self):
        """validate_issue_title: valid format with scope passes"""
        valid_title = "feat(cli): add skills remove"
        # Should not raise exception
        validate_issue_title(valid_title)

    def test_valid_fix_type_with_scope(self):
        """validate_issue_title: valid fix type with scope"""
        valid_title = "fix(dev-flow): handle edge case"
        validate_issue_title(valid_title)

    def test_valid_enhance_type_with_scope(self):
        """validate_issue_title: valid enhance type with scope"""
        valid_title = "enhance(plugin): optimize performance"
        validate_issue_title(valid_title)

    def test_valid_perf_type_with_scope(self):
        """validate_issue_title: valid perf type with scope"""
        valid_title = "perf(dev-flow): reduce label sync overhead"
        validate_issue_title(valid_title)

    def test_valid_refactor_type_with_scope(self):
        """validate_issue_title: valid refactor type with scope"""
        valid_title = "refactor(cli): reorganize commands"
        validate_issue_title(valid_title)

    def test_valid_docs_type_with_scope(self):
        """validate_issue_title: valid docs type with scope"""
        valid_title = "docs(plugin): update readme"
        validate_issue_title(valid_title)

    def test_valid_test_type_with_scope(self):
        """validate_issue_title: valid test type with scope"""
        valid_title = "test(cli): add unit tests"
        validate_issue_title(valid_title)

    def test_valid_chore_type_with_scope(self):
        """validate_issue_title: valid chore type with scope"""
        valid_title = "chore(dev-flow): cleanup scripts"
        validate_issue_title(valid_title)

    def test_missing_scope_fails(self):
        """validate_issue_title: missing scope fails"""
        no_scope_title = "refactor: unify plan status management"
        with self.assertRaises(ValidationError) as context:
            validate_issue_title(no_scope_title)
        # Error should mention scope
        error_msg = str(context.exception)
        self.assertTrue(
            "scope" in error_msg.lower() or "mandatory" in error_msg.lower(),
            f"Error should mention scope requirement: {error_msg}"
        )

    def test_description_too_long_fails(self):
        """validate_issue_title: description too long fails"""
        long_title = "feat(cli): this is a very long description that exceeds fifty characters limit"
        with self.assertRaises(ValidationError) as context:
            validate_issue_title(long_title)
        error_msg = str(context.exception)
        self.assertTrue(
            "50" in error_msg or "long" in error_msg.lower() or "description" in error_msg.lower(),
            f"Error should mention description length: {error_msg}"
        )

    def test_invalid_type_fails(self):
        """validate_issue_title: invalid type fails"""
        invalid_type_title = "invalid(cli): some description"
        with self.assertRaises(ValidationError) as context:
            validate_issue_title(invalid_type_title)
        error_msg = str(context.exception)
        self.assertTrue(
            "type" in error_msg.lower() or "invalid" in error_msg.lower(),
            f"Error should mention invalid type: {error_msg}"
        )

    def test_title_too_long_fails(self):
        """validate_issue_title: total title too long (>72 chars) fails"""
        # Create a title that is >72 chars but description <=50 chars
        # feat(cli-long-scope-name): description here (with some padding to make it over 72 chars)
        long_title = "feat(very-long-scope-name-here): description with padding to exceed limit"
        with self.assertRaises(ValidationError) as context:
            validate_issue_title(long_title)
        error_msg = str(context.exception)
        self.assertTrue(
            "72" in error_msg or "title" in error_msg.lower() or "long" in error_msg.lower(),
            f"Error should mention title length: {error_msg}"
        )

    def test_empty_description_fails(self):
        """validate_issue_title: empty description fails"""
        empty_desc_title = "feat(cli): "
        with self.assertRaises(ValidationError) as context:
            validate_issue_title(empty_desc_title)
        error_msg = str(context.exception)
        self.assertTrue(
            "empty" in error_msg.lower() or "description" in error_msg.lower(),
            f"Error should mention empty description: {error_msg}"
        )

    def test_invalid_format_no_colon_fails(self):
        """validate_issue_title: invalid format without colon fails"""
        invalid_format = "feat(cli) add skills remove"
        with self.assertRaises(ValidationError) as context:
            validate_issue_title(invalid_format)
        error_msg = str(context.exception)
        self.assertTrue(
            "format" in error_msg.lower() or "colon" in error_msg.lower(),
            f"Error should mention format: {error_msg}"
        )


if __name__ == '__main__':
    unittest.main()