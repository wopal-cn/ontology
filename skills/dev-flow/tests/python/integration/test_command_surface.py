#!/usr/bin/env python3
# test_command_surface.py - Test public command surface
#
# Test Case: flow.sh help exposes correct commands
#
# Scenarios:
#   1. help output contains "issue create" and "issue update"
#   2. help output does NOT contain "new-issue" (deprecated)

import unittest
import subprocess
import os


class TestCommandSurface(unittest.TestCase):
    """Test flow.sh help command surface"""

    def setUp(self):
        # Get skill directory (tests/python/integration -> skill dir)
        # Path: integration -> python -> tests -> dev-flow (skill_dir)
        test_file = os.path.abspath(__file__)
        self.skill_dir = os.path.dirname(os.path.dirname(
            os.path.dirname(os.path.dirname(test_file))))
        # Resolve FLOW_BIN to absolute path relative to skill_dir
        flow_bin_rel = os.environ.get('FLOW_BIN', 'scripts/flow.sh')
        self.flow_bin = os.path.join(self.skill_dir, flow_bin_rel)

    def test_help_exposes_issue_create_update(self):
        """flow.sh help exposes issue create/update"""
        result = subprocess.run(
            [self.flow_bin, 'help'],
            cwd=self.skill_dir,
            capture_output=True,
            text=True
        )

        self.assertEqual(result.returncode, 0, "help command should succeed")
        self.assertIn('issue create', result.stdout,
                      "help output should contain 'issue create'")
        self.assertIn('issue update', result.stdout,
                      "help output should contain 'issue update'")

    def test_help_no_new_issue(self):
        """flow.sh help no longer exposes new-issue"""
        result = subprocess.run(
            [self.flow_bin, 'help'],
            cwd=self.skill_dir,
            capture_output=True,
            text=True
        )

        self.assertEqual(result.returncode, 0, "help command should succeed")
        self.assertNotIn('new-issue', result.stdout,
                         "help output should not mention 'new-issue'")


if __name__ == '__main__':
    unittest.main()