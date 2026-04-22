#!/usr/bin/env python3
# test_related_resources_links.py - Test Related Resources link update
#
# Test Case: update_issue_link updates existing English Related Resources row
#
# Scenarios:
#   1. update_issue_link updates existing English Related Resources row

import unittest
import subprocess
import os
import tempfile
import shutil


class TestRelatedResourcesLinks(unittest.TestCase):
    """Test update_issue_link function for Related Resources table"""

    def setUp(self):
        # Get skill dir (tests/python/integration -> skill_dir)
        test_file = os.path.abspath(__file__)
        self.skill_dir = os.path.dirname(os.path.dirname(
            os.path.dirname(os.path.dirname(test_file))))
        self.flow_bin = os.environ.get('FLOW_BIN', 'scripts/flow.sh')

        # Create temp directory for fake gh and state
        self.tmp_dir = tempfile.mkdtemp()
        self.bin_dir = os.path.join(self.tmp_dir, 'bin')
        self.state_dir = os.path.join(self.tmp_dir, 'state')
        os.makedirs(self.bin_dir)
        os.makedirs(self.state_dir)

        # Create fake gh stub
        self._create_fake_gh()

        # Create initial body with Related Resources table
        self._create_initial_body()

    def tearDown(self):
        shutil.rmtree(self.tmp_dir)

    def _create_fake_gh(self):
        """Create fake gh stub that simulates issue view/edit"""
        gh_path = os.path.join(self.bin_dir, 'gh')

        gh_script = '''#!/usr/bin/env python3
import os
import sys

args = sys.argv[1:]
state_dir = os.environ.get('GH_STATE_DIR', '/tmp/state')

if args[0] == 'repo' and args[1] == 'view':
    print('sampx/wopal-space')
    sys.exit(0)

elif args[0] == 'issue' and args[1] == 'view':
    body_file = os.path.join(state_dir, 'body.md')
    print(open(body_file).read() if os.path.exists(body_file) else '')
    sys.exit(0)

elif args[0] == 'issue' and args[1] == 'edit':
    # Capture edit args to file
    edit_file = os.path.join(state_dir, 'edit-args.txt')
    with open(edit_file, 'w') as f:
        for arg in args[2:]:
            f.write(arg + '\\n')
    sys.exit(0)

else:
    print(f'unexpected gh call: {args}', file=sys.stderr)
    sys.exit(1)
'''

        with open(gh_path, 'w') as f:
            f.write(gh_script)
        os.chmod(gh_path, 0o755)

    def _create_initial_body(self):
        """Create initial body with Related Resources table containing placeholder Plan link"""
        body = """## Goal

Old goal

## Related Resources

| Resource | Link |
|----------|------|
| Plan | _待关联_ |
"""
        with open(os.path.join(self.state_dir, 'body.md'), 'w') as f:
            f.write(body)

    def test_update_issue_link_updates_existing_row(self):
        """update_issue_link updates existing English Related Resources row"""
        env = os.environ.copy()
        env['PATH'] = self.bin_dir + ':' + env.get('PATH', '')
        env['GH_STATE_DIR'] = self.state_dir

        # Create driver script that calls update_issue_link (matches Bash test)
        driver_script = f'''
#!/bin/bash
set -euo pipefail
source "{self.skill_dir}/lib/common.sh"
source "{self.skill_dir}/lib/labels.sh"
source "{self.skill_dir}/lib/issue.sh"
update_issue_link 120 sampx/wopal-space plan "[plan](https://github.com/sampx/wopal-space/blob/main/docs/products/ontology/plans/120.md)"
'''

        driver_path = os.path.join(self.tmp_dir, 'run.sh')
        with open(driver_path, 'w') as f:
            f.write(driver_script)
        os.chmod(driver_path, 0o755)

        result = subprocess.run(
            ['bash', driver_path],
            capture_output=True,
            text=True,
            env=env,
            cwd=self.skill_dir
        )

        self.assertEqual(result.returncode, 0,
                         f'update_issue_link should succeed: {result.stderr}')

        # Check edit args captured Related Resources section and plan link
        edit_file = os.path.join(self.state_dir, 'edit-args.txt')
        self.assertTrue(os.path.exists(edit_file), 'edit-args.txt should exist')

        with open(edit_file) as f:
            edit_args = f.read()

        self.assertIn('## Related Resources', edit_args,
                      'edit args should contain Related Resources section')
        self.assertIn('[plan](https://github.com/sampx/wopal-space/blob/main/docs/products/ontology/plans/120.md)',
                      edit_args,
                      'edit args should contain plan link')


if __name__ == '__main__':
    unittest.main()