#!/usr/bin/env python3
# test_core_workflow.py - Test shared workflow helpers
#
# Test Cases U1 + U2: status guard + repo resolution

import unittest
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from support.bootstrap import ensure_scripts_path
ensure_scripts_path()

from dev_flow.core.workflow import guard_status, format_suggestion, resolve_space_repo


class TestGuardStatus(unittest.TestCase):
    """Test guard_status function."""

    @patch("dev_flow.core.workflow.log_error")
    def test_returns_true_when_status_matches(self, mock_log_error):
        result = guard_status("executing", "executing", "42")
        self.assertTrue(result)
        mock_log_error.assert_not_called()

    @patch("dev_flow.core.workflow.log_error")
    def test_returns_false_when_status_mismatch(self, mock_log_error):
        result = guard_status("planning", "executing", "42")
        self.assertFalse(result)
        self.assertTrue(mock_log_error.called)

    @patch("dev_flow.core.workflow.log_error")
    def test_prints_error_with_expected_and_current(self, mock_log_error):
        guard_status("planning", "executing", "42")
        calls = [str(c) for c in mock_log_error.call_args_list]
        self.assertTrue(any("executing" in c and "planning" in c for c in calls))

    @patch("dev_flow.core.workflow.log_error")
    def test_includes_suggestion_in_output(self, mock_log_error):
        guard_status("planning", "executing", "42")
        calls = [str(c) for c in mock_log_error.call_args_list]
        self.assertTrue(any("approve --confirm 42" in c for c in calls))


class TestFormatSuggestion(unittest.TestCase):
    """Test format_suggestion function."""

    def test_executing_planning_suggests_approve(self):
        result = format_suggestion("planning", "executing", "42")
        self.assertEqual(result, "Run: flow.sh approve --confirm 42")

    def test_executing_verifying_suggests_verify(self):
        result = format_suggestion("verifying", "executing", "42")
        self.assertEqual(result, "Run: flow.sh verify --confirm 42")

    def test_executing_done_suggests_archive(self):
        result = format_suggestion("done", "executing", "42")
        self.assertEqual(result, "Run: flow.sh archive 42")

    def test_verifying_planning_suggests_approve(self):
        result = format_suggestion("planning", "verifying", "test-plan")
        self.assertEqual(result, "Run: flow.sh approve --confirm test-plan")

    def test_verifying_executing_suggests_complete(self):
        result = format_suggestion("executing", "verifying", "test-plan")
        self.assertEqual(result, "Run: flow.sh complete test-plan")

    def test_done_planning_suggests_approve(self):
        result = format_suggestion("planning", "done", "my-plan")
        self.assertEqual(result, "Run: flow.sh approve --confirm my-plan")

    def test_done_executing_suggests_complete(self):
        result = format_suggestion("executing", "done", "my-plan")
        self.assertEqual(result, "Run: flow.sh complete my-plan")

    def test_done_verifying_suggests_verify(self):
        result = format_suggestion("verifying", "done", "my-plan")
        self.assertEqual(result, "Run: flow.sh verify --confirm my-plan")

    def test_unknown_status_returns_fallback(self):
        result = format_suggestion("unknown_status", "executing", "42")
        self.assertEqual(result, "Check plan status")

    def test_unknown_expected_returns_fallback(self):
        result = format_suggestion("executing", "unknown_expected", "42")
        self.assertEqual(result, "Check plan status")

    def test_works_with_plan_name_ref(self):
        result = format_suggestion("planning", "executing", "refactor-dev-flow-foo")
        self.assertIn("refactor-dev-flow-foo", result)


class TestResolveSpaceRepo(unittest.TestCase):
    """Test resolve_space_repo function."""

    def test_returns_empty_when_no_issue(self):
        result = resolve_space_repo(None, Path("/tmp"))
        self.assertEqual(result, "")

    def test_returns_empty_when_issue_zero(self):
        result = resolve_space_repo(0, Path("/tmp"))
        self.assertEqual(result, "")

    def test_returns_empty_when_issue_empty_string(self):
        result = resolve_space_repo("", Path("/tmp"))
        self.assertEqual(result, "")

    @patch("dev_flow.core.workflow.detect_space_repo")
    def test_returns_repo_when_issue_and_repo_resolvable(self, mock_detect):
        mock_detect.return_value = "sampx/wopal-space"
        result = resolve_space_repo(42, Path("/workspace"))
        self.assertEqual(result, "sampx/wopal-space")
        mock_detect.assert_called_once_with(Path("/workspace"))

    @patch("dev_flow.core.workflow.detect_space_repo")
    def test_returns_repo_with_string_issue(self, mock_detect):
        mock_detect.return_value = "owner/repo"
        result = resolve_space_repo("42", Path("/workspace"))
        self.assertEqual(result, "owner/repo")

    @patch("dev_flow.core.workflow.log_warn")
    @patch("dev_flow.core.workflow.detect_space_repo")
    def test_returns_empty_on_repo_error(self, mock_detect, mock_log_warn):
        mock_detect.side_effect = RuntimeError("No origin remote configured")
        result = resolve_space_repo(42, Path("/tmp"))
        self.assertEqual(result, "")
        mock_log_warn.assert_called_once()

    @patch("dev_flow.core.workflow.log_warn")
    @patch("dev_flow.core.workflow.detect_space_repo")
    def test_warns_on_repo_error(self, mock_detect, mock_log_warn):
        mock_detect.side_effect = RuntimeError("No origin remote configured")
        resolve_space_repo(42, Path("/tmp"))
        self.assertIn("Cannot determine space repo", str(mock_log_warn.call_args))

    @patch("dev_flow.core.workflow.detect_space_repo")
    def test_does_not_call_detect_when_no_issue(self, mock_detect):
        resolve_space_repo(None, Path("/tmp"))
        mock_detect.assert_not_called()


if __name__ == "__main__":
    unittest.main()
