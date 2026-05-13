#!/usr/bin/env python3
# test_core_status.py - Test update_plan_status
#
# Test Case U3: Plan status update

import unittest
import sys
import tempfile
import shutil
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from support.bootstrap import ensure_scripts_path
ensure_scripts_path()

from dev_flow.core.status import update_plan_status


PLAN_TEMPLATE = """# test-plan

## Metadata

- **Type**: refactor
- **Target Project**: wopal-space
- **Created**: 2026-05-12
- **Status**: planning

## Goal

Test plan for status update.
"""


class TestUpdatePlanStatus(unittest.TestCase):
    """Test update_plan_status function."""

    def setUp(self):
        self.tmp_dir = tempfile.mkdtemp()
        self.plan_file = Path(self.tmp_dir) / "test-plan.md"
        self.plan_file.write_text(PLAN_TEMPLATE)

    def tearDown(self):
        shutil.rmtree(self.tmp_dir)

    def test_successful_status_update(self):
        """update_plan_status updates Status line and returns True."""
        result = update_plan_status(self.plan_file, "executing")
        self.assertTrue(result)

        content = self.plan_file.read_text()
        self.assertIn("- **Status**: executing", content)
        # Original line should be gone
        self.assertNotIn("- **Status**: planning", content)

    def test_noop_when_status_unchanged(self):
        """update_plan_status returns False when status unchanged."""
        result = update_plan_status(self.plan_file, "planning")
        self.assertFalse(result)

    def test_file_not_found_returns_false(self):
        """update_plan_status returns False for non-existent file."""
        nonexistent = Path(self.tmp_dir) / "no-such-file.md"
        result = update_plan_status(nonexistent, "executing")
        self.assertFalse(result)

    def test_only_updates_first_status_line(self):
        """update_plan_status only updates the first Status line."""
        multi_status = PLAN_TEMPLATE + """
## Notes

- **Status**: should-not-change
"""
        self.plan_file.write_text(multi_status)
        update_plan_status(self.plan_file, "done")

        content = self.plan_file.read_text()
        # First Status line updated
        self.assertIn("- **Status**: done", content)
        # Second Status-like line preserved
        self.assertIn("- **Status**: should-not-change", content)

    def test_preserves_other_content(self):
        """update_plan_status does not modify other Metadata fields."""
        update_plan_status(self.plan_file, "executing")

        content = self.plan_file.read_text()
        self.assertIn("- **Type**: refactor", content)
        self.assertIn("- **Target Project**: wopal-space", content)
        self.assertIn("- **Created**: 2026-05-12", content)


if __name__ == '__main__':
    unittest.main()
