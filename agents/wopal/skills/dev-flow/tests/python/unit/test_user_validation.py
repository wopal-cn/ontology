#!/usr/bin/env python3
# test_user_validation.py - Test check_user_validation function
#
# Test Case U3: check_user_validation only accepts explicit user confirmation checkbox
#
# Scenarios:
#   1. Plain text only (no checkbox) -> should fail
#   2. Checkbox unchecked -> should fail
#   3. Checkbox checked -> should succeed
#   4. No User Validation section -> should pass (backward compat)

import unittest
import sys
import os

# Add scripts directory to path for imports
SCRIPTS_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))
sys.path.insert(0, os.path.join(SCRIPTS_DIR, 'scripts'))

from dev_flow.domain.validation import check_user_validation, ValidationError


class TestUserValidation(unittest.TestCase):
    """Test check_user_validation function"""

    def setUp(self):
        self.fixtures_dir = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
            'fixtures', 'plans'
        )

    def test_plain_text_only_should_fail(self):
        """Plain text only (no checkbox) should fail"""
        plan_file = os.path.join(self.fixtures_dir, 'fix-bad-user-validation-no-checkbox.md')
        with self.assertRaises(ValidationError) as context:
            check_user_validation(plan_file)
        error_msg = str(context.exception)
        self.assertTrue(
            'checkbox' in error_msg.lower() or 'final' in error_msg.lower() or '确认' in error_msg,
            f"Error should mention missing checkbox: {error_msg}"
        )

    def test_checkbox_unchecked_should_fail(self):
        """Checkbox unchecked should fail"""
        plan_file = os.path.join(self.fixtures_dir, 'fix-good-user-validation-checked.md')
        # Create temp file with unchecked checkbox
        import tempfile
        import shutil
        with tempfile.NamedTemporaryFile(mode='w', suffix='.md', delete=False) as f:
            content = open(plan_file).read()
            # Replace checked with unchecked
            content = content.replace('- [x] 用户已完成', '- [ ] 用户已完成')
            f.write(content)
            temp_file = f.name
        try:
            with self.assertRaises(ValidationError) as context:
                check_user_validation(temp_file)
            error_msg = str(context.exception)
            self.assertTrue(
                'not' in error_msg.lower() or 'unchecked' in error_msg.lower() or '未勾选' in error_msg,
                f"Error should mention unchecked status: {error_msg}"
            )
        finally:
            os.unlink(temp_file)

    def test_checkbox_checked_should_succeed(self):
        """Checkbox checked should succeed"""
        plan_file = os.path.join(self.fixtures_dir, 'fix-good-user-validation-checked.md')
        check_user_validation(plan_file)

    def test_no_user_validation_section_passes(self):
        """No User Validation section should pass (backward compat)"""
        import tempfile
        with tempfile.NamedTemporaryFile(mode='w', suffix='.md', delete=False) as f:
            f.write("""# test-backward-compat

## Metadata

- **Status**: done

## Goal

Test backward compatibility

## In Scope

- Testing

## Implementation

### Task 1: Test

**Changes**:
- [x] Step 1: Test backward compat

## Test Plan

N/A

## Acceptance Criteria

### Agent Verification

- [x] Done
""")
            temp_file = f.name
        try:
            check_user_validation(temp_file)
        finally:
            os.unlink(temp_file)


if __name__ == '__main__':
    unittest.main()