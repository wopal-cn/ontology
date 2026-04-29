#!/usr/bin/env python3
# test_issue_create_command.py - Test issue create command behavior
#
# Test Case: issue create command CLI behavior
#
# Scenarios:
#   1. issue create infers perf type from title (e.g., perf(dev-flow): ...)
#   2. issue create rejects title and explicit type mismatch

import unittest
import subprocess
import os
import tempfile
import shutil


class TestIssueCreateCommand(unittest.TestCase):
    """Test issue create command"""

    def setUp(self):
        # Get skill dir (tests/python/integration -> skill_dir)
        test_file = os.path.abspath(__file__)
        self.skill_dir = os.path.dirname(os.path.dirname(
            os.path.dirname(os.path.dirname(test_file))))
        self.flow_bin = os.environ.get('FLOW_BIN', 'scripts/flow.sh')

        # Create temp directory for fake gh and capture
        self.tmp_dir = tempfile.mkdtemp()
        self.bin_dir = os.path.join(self.tmp_dir, 'bin')
        self.capture_dir = os.path.join(self.tmp_dir, 'capture')
        os.makedirs(self.bin_dir)
        os.makedirs(self.capture_dir)

        # Create fake gh stub
        self._create_fake_gh()

    def tearDown(self):
        shutil.rmtree(self.tmp_dir)

    def _create_fake_gh(self):
        """Create fake gh stub that captures issue create arguments"""
        gh_path = os.path.join(self.bin_dir, 'gh')

        # Write inline gh stub (more portable than bash heredoc)
        gh_script = '''#!/usr/bin/env python3
import os
import sys

args = sys.argv[1:]
capture_dir = os.environ.get('GH_CAPTURE_DIR', '/tmp/capture')

if args[0] == 'repo' and args[1] == 'view':
    print('sampx/wopal-space')
    sys.exit(0)
elif args[0] == 'label' and args[1] == 'list':
    sys.exit(0)
elif args[0] == 'label' and args[1] == 'create':
    sys.exit(0)
elif args[0] == 'issue' and args[1] == 'create':
    # Capture args to file for inspection
    with open(os.path.join(capture_dir, 'issue-create-args.txt'), 'w') as f:
        for arg in args:
            f.write(arg + '\\n')
    print('https://github.com/sampx/wopal-space/issues/999')
    sys.exit(0)
else:
    print(f'unexpected gh call: {args}', file=sys.stderr)
    sys.exit(1)
'''

        with open(gh_path, 'w') as f:
            f.write(gh_script)
        os.chmod(gh_path, 0o755)

    def test_issue_create_infers_perf_type_from_title(self):
        """issue create infers perf type from title prefix"""
        env = os.environ.copy()
        env['PATH'] = self.bin_dir + ':' + env.get('PATH', '')
        env['GH_CAPTURE_DIR'] = self.capture_dir

        result = subprocess.run(
            [self.flow_bin, 'issue', 'create',
             '--title', 'perf(dev-flow): reduce label sync overhead',
             '--project', 'ontology',
             '--baseline', '200ms',
             '--target', '120ms'],
            cwd=self.skill_dir,
            capture_output=True,
            text=True,
            env=env
        )

        self.assertEqual(result.returncode, 0,
                         f'issue create should succeed: {result.stderr}')

        # Check captured gh args
        capture_file = os.path.join(self.capture_dir, 'issue-create-args.txt')
        with open(capture_file) as f:
            captured = f.read()

        self.assertIn('type/perf', captured,
                      'gh args should contain type/perf label')
        self.assertIn('## Baseline', captured,
                      'gh args body should contain Baseline section')
        self.assertIn('## Target', captured,
                      'gh args body should contain Target section')

    def test_issue_create_type_mismatch_rejected(self):
        """issue create rejects title type and explicit type mismatch"""
        env = os.environ.copy()
        env['PATH'] = self.bin_dir + ':' + env.get('PATH', '')
        env['GH_CAPTURE_DIR'] = self.capture_dir

        result = subprocess.run(
            [self.flow_bin, 'issue', 'create',
             '--title', 'perf(dev-flow): reduce label sync overhead',
             '--project', 'ontology',
             '--type', 'feature'],
            cwd=self.skill_dir,
            capture_output=True,
            text=True,
            env=env
        )

        # Should fail with mismatch
        self.assertNotEqual(result.returncode, 0,
                            'type mismatch should be rejected')
        self.assertIn('Type mismatch', result.stdout + result.stderr,
                      'output should mention Type mismatch')


if __name__ == '__main__':
    unittest.main()