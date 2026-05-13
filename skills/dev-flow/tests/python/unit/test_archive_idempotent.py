#!/usr/bin/env python3
# test_archive_idempotent.py - Test archive_plan_file idempotency
#
# Test Case U4: archive already archived Plan is idempotent

import unittest
import sys
import tempfile
import shutil
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from support.bootstrap import ensure_scripts_path
ensure_scripts_path()

from dev_flow.commands.archive import archive_plan_file


PLAN_TEMPLATE = """# 20260512-demo

## Metadata

- **Type**: test
- **Target Project**: wopal-space
- **Created**: 2026-05-12
- **Status**: done

## Goal

Demo plan for archive idempotency test.
"""


class TestArchiveIdempotent(unittest.TestCase):
    """Test archive_plan_file idempotency for already archived Plans."""

    def setUp(self):
        self.tmp_dir = tempfile.mkdtemp()
        self.workspace_root = Path(self.tmp_dir) / "workspace"
        self.workspace_root.mkdir()

        # Create .wopal/.git worktree signature
        wopal_dir = self.workspace_root / ".wopal"
        wopal_dir.mkdir()
        (wopal_dir / ".git").write_text("gitdir: /some/path.git/worktrees/main\n")

        # Create done/ directory structure
        self.plans_dir = self.workspace_root / "docs" / "products" / "wopal-space" / "plans"
        self.done_dir = self.plans_dir / "done"
        self.done_dir.mkdir(parents=True)

    def tearDown(self):
        shutil.rmtree(self.tmp_dir)

    def test_already_archived_returns_same_path(self):
        """archive_plan_file returns same path when Plan is already in done/."""
        archived_plan = self.done_dir / "20260512-demo.md"
        archived_plan.write_text(PLAN_TEMPLATE)

        result = archive_plan_file(str(archived_plan), self.workspace_root)

        # Result should be the same path
        self.assertEqual(result, str(archived_plan))

    def test_no_double_done_directory(self):
        """archive_plan_file does not create done/done/ structure."""
        archived_plan = self.done_dir / "20260512-demo.md"
        archived_plan.write_text(PLAN_TEMPLATE)

        archive_plan_file(str(archived_plan), self.workspace_root)

        # done/done/ should not exist
        double_done = self.done_dir / "done"
        self.assertFalse(double_done.exists())

    def test_already_archived_with_date_prefix(self):
        """archive_plan_file handles Plans already with date prefix in done/."""
        archived_plan = self.done_dir / "20260512-20260512-demo.md"
        archived_plan.write_text(PLAN_TEMPLATE)

        result = archive_plan_file(str(archived_plan), self.workspace_root)
        self.assertEqual(result, str(archived_plan))

    def test_non_archived_plan_moves_to_done(self):
        """archive_plan_file moves unarchived Plan to done/ (non-idempotent case)."""
        # Create plan outside done/
        unarchived_plan = self.plans_dir / "demo.md"
        unarchived_plan.write_text(PLAN_TEMPLATE)

        result = archive_plan_file(str(unarchived_plan), self.workspace_root)

        # Result should be in done/ with date prefix
        self.assertIn("/done/", result)
        self.assertTrue(Path(result).parent == self.done_dir)
        # Original should be gone
        self.assertFalse(unarchived_plan.exists())


if __name__ == '__main__':
    unittest.main()
