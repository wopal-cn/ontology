#!/usr/bin/env python3
# test_archive_project_repo_gate.py - Test archive command gate on dirty project repo
#
# Test Case: Archive blocks when target project repo has uncommitted changes
#
# Scenarios:
#   1. dirty project repo -> archive fails with explicit error
#   2. clean project repo -> archive succeeds normally

import unittest
import subprocess
import os
import tempfile
import shutil


class TestArchiveProjectRepoGate(unittest.TestCase):
    """Test archive command gate on project repo state"""

    def setUp(self):
        # Get skill dir (tests/python/integration -> skill_dir)
        test_file = os.path.abspath(__file__)
        self.skill_dir = os.path.dirname(os.path.dirname(
            os.path.dirname(os.path.dirname(test_file))))
        # Use FLOW_BIN env var or default to scripts/flow.sh
        flow_bin_rel = os.environ.get('FLOW_BIN', 'scripts/flow.sh')
        self.flow_bin = os.path.join(self.skill_dir, flow_bin_rel)

        # Create temp directory for fake workspace structure
        self.tmp_dir = tempfile.mkdtemp()
        self.bin_dir = os.path.join(self.tmp_dir, 'bin')
        self.state_dir = os.path.join(self.tmp_dir, 'state')
        os.makedirs(self.bin_dir)
        os.makedirs(self.state_dir)

        # Create fake workspace structure
        self._create_workspace_structure()

        # Create fake gh stub
        self._create_fake_gh()

    def tearDown(self):
        shutil.rmtree(self.tmp_dir)

    def _create_workspace_structure(self):
        """Create minimal workspace structure for archive test"""
        # docs/products/ontology/plans/ - for active plans (create first)
        plans_dir = os.path.join(
            self.tmp_dir, 'docs', 'products', 'ontology', 'plans')
        os.makedirs(plans_dir)

        # docs/products/ontology/plans/done/ - for archived plans (subdirectory)
        plans_done_dir = os.path.join(plans_dir, 'done')
        os.makedirs(plans_done_dir)

        # Create a plan in done state (archive requires done status)
        # Format matches plan.sh parser expectations
        self.plan_file = os.path.join(
            plans_dir, '121-dev-flow-clean-up-issue-scripts.md')
        with open(self.plan_file, 'w') as f:
            f.write('# 121-dev-flow-clean-up-issue-scripts\n')
            f.write('\n')
            f.write('## Metadata\n')
            f.write('\n')
            f.write('- **Issue**: #121\n')
            f.write('- **Type**: refactor\n')
            f.write('- **Target Project**: ontology\n')
            f.write('- **Created**: 2026-04-22\n')
            f.write('- **Status**: done\n')

        # Create projects directory
        self.projects_dir = os.path.join(self.tmp_dir, 'projects')
        os.makedirs(self.projects_dir)

        # Create target project directory (ontology)
        self.project_dir = os.path.join(self.projects_dir, 'ontology')
        os.makedirs(self.project_dir)

        # Initialize git repo in project directory
        subprocess.run(['git', 'init'], cwd=self.project_dir,
                       capture_output=True, check=True)
        subprocess.run(['git', 'config', 'user.email', 'test@test.com'],
                       cwd=self.project_dir, capture_output=True, check=True)
        subprocess.run(['git', 'config', 'user.name', 'Test'],
                       cwd=self.project_dir, capture_output=True, check=True)

        # Initialize git repo in workspace root (for plan archival)
        subprocess.run(['git', 'init'], cwd=self.tmp_dir,
                       capture_output=True, check=True)
        subprocess.run(['git', 'config', 'user.email', 'test@test.com'],
                       cwd=self.tmp_dir, capture_output=True, check=True)
        subprocess.run(['git', 'config', 'user.name', 'Test'],
                       cwd=self.tmp_dir, capture_output=True, check=True)

        # Add docs to root git and commit (so git mv works)
        subprocess.run(['git', 'add', 'docs'], cwd=self.tmp_dir,
                       capture_output=True, check=True)
        subprocess.run(['git', 'commit', '-m', 'init: add plan'],
                       cwd=self.tmp_dir, capture_output=True, check=True)

    def _create_fake_gh(self):
        """Create fake gh stub for archive operations"""
        gh_path = os.path.join(self.bin_dir, 'gh')

        gh_script = r'''#!/usr/bin/env python3
import os
import sys

args = sys.argv[1:]
state_dir = os.environ.get('GH_STATE_DIR', '/tmp/state')

if args[0] == 'repo' and args[1] == 'view':
    print('sampx/wopal-space')
    sys.exit(0)
elif args[0] == 'issue' and args[1] == 'view':
    # Return minimal issue body with plan link
    print('## Related Resources\n')
    print('| Resource | Link |')
    print('|----------|------|')
    print('| Plan | [121-dev-flow-clean-up-issue-scripts](https://github.com/sampx/wopal-space/blob/main/docs/products/ontology/plans/121-dev-flow-clean-up-issue-scripts.md) |')
    sys.exit(0)
elif args[0] == 'issue' and args[1] == 'edit':
    # Capture edit args
    with open(os.path.join(state_dir, 'edit-args.txt'), 'w') as f:
        for arg in args:
            f.write(arg + '\n')
    sys.exit(0)
elif args[0] == 'issue' and args[1] == 'close':
    # Capture close args
    with open(os.path.join(state_dir, 'close-args.txt'), 'w') as f:
        for arg in args:
            f.write(arg + '\n')
    sys.exit(0)
else:
    print('fake gh: ' + str(args), file=sys.stderr)
    sys.exit(0)  # Accept other calls for now
'''

        with open(gh_path, 'w') as f:
            f.write(gh_script)
        os.chmod(gh_path, 0o755)

    def test_archive_blocks_on_dirty_project_repo(self):
        """archive fails when project repo has uncommitted changes"""
        # Create a file in project and DON'T commit (dirty state)
        dirty_file = os.path.join(self.project_dir, 'dirty_file.txt')
        with open(dirty_file, 'w') as f:
            f.write('uncommitted changes')

        env = os.environ.copy()
        env['PATH'] = self.bin_dir + ':' + env.get('PATH', '')
        env['GH_STATE_DIR'] = self.state_dir

        result = subprocess.run(
            [self.flow_bin, 'archive', '121'],
            cwd=self.tmp_dir,
            capture_output=True,
            text=True,
            env=env
        )

        # Archive should FAIL with dirty repo gate
        # Current behavior: passes with warning only (test documents expected future behavior)
        self.assertNotEqual(result.returncode, 0,
                            f'archive should fail on dirty project repo: {result.stdout + result.stderr}')

        # Output should mention dirty/uncommitted
        output = result.stdout + result.stderr
        self.assertIn('dirty', output.lower(),
                      'output should mention dirty/uncommitted state')

    def test_archive_passes_on_clean_project_repo(self):
        """archive succeeds when project repo is clean"""
        # Create a file and commit it (clean state)
        clean_file = os.path.join(self.project_dir, 'clean_file.txt')
        with open(clean_file, 'w') as f:
            f.write('committed changes')

        subprocess.run(['git', 'add', 'clean_file.txt'],
                       cwd=self.project_dir, capture_output=True, check=True)
        subprocess.run(['git', 'commit', '-m', 'add clean file'],
                       cwd=self.project_dir, capture_output=True, check=True)

        env = os.environ.copy()
        env['PATH'] = self.bin_dir + ':' + env.get('PATH', '')
        env['GH_STATE_DIR'] = self.state_dir

        result = subprocess.run(
            [self.flow_bin, 'archive', '121'],
            cwd=self.tmp_dir,
            capture_output=True,
            text=True,
            env=env
        )

        # Archive should succeed with clean repo
        self.assertEqual(result.returncode, 0,
                         f'archive should succeed on clean project repo: {result.stderr}')

        # Output should show archived status
        output = result.stdout + result.stderr
        self.assertIn('archived', output.lower(),
                      'output should mention archived status')


if __name__ == '__main__':
    unittest.main()