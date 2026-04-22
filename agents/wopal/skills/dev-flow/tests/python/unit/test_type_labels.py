#!/usr/bin/env python3
# test_type_labels.py - Test type normalization and label mapping

import unittest
import sys
import os

# Add scripts directory to path for imports
SCRIPTS_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))
sys.path.insert(0, os.path.join(SCRIPTS_DIR, 'scripts'))

from dev_flow.domain.labels import (
    normalize_plan_type,
    plan_type_to_issue_label,
    issue_label_to_plan_type,
    ValidationError
)


class TestNormalizePlanType(unittest.TestCase):
    """Test normalize_plan_type function"""

    def test_feat_maps_to_feature(self):
        """normalize_plan_type: feat maps to feature"""
        self.assertEqual(normalize_plan_type("feat"), "feature")

    def test_feature_maps_to_feature(self):
        """normalize_plan_type: feature maps to feature"""
        self.assertEqual(normalize_plan_type("feature"), "feature")

    def test_enhance_maps_to_enhance(self):
        """normalize_plan_type: enhance maps to enhance"""
        self.assertEqual(normalize_plan_type("enhance"), "enhance")

    def test_enhancement_maps_to_enhance(self):
        """normalize_plan_type: enhancement maps to enhance"""
        self.assertEqual(normalize_plan_type("enhancement"), "enhance")

    def test_fix_maps_to_fix(self):
        """normalize_plan_type: fix maps to fix"""
        self.assertEqual(normalize_plan_type("fix"), "fix")

    def test_bug_maps_to_fix(self):
        """normalize_plan_type: bug maps to fix"""
        self.assertEqual(normalize_plan_type("bug"), "fix")

    def test_perf_maps_to_perf(self):
        """normalize_plan_type: perf maps to perf"""
        self.assertEqual(normalize_plan_type("perf"), "perf")

    def test_performance_maps_to_perf(self):
        """normalize_plan_type: performance maps to perf"""
        self.assertEqual(normalize_plan_type("performance"), "perf")

    def test_refactor_maps_to_refactor(self):
        """normalize_plan_type: refactor maps to refactor"""
        self.assertEqual(normalize_plan_type("refactor"), "refactor")

    def test_docs_maps_to_docs(self):
        """normalize_plan_type: docs maps to docs"""
        self.assertEqual(normalize_plan_type("docs"), "docs")

    def test_doc_maps_to_docs(self):
        """normalize_plan_type: doc maps to docs"""
        self.assertEqual(normalize_plan_type("doc"), "docs")

    def test_documentation_maps_to_docs(self):
        """normalize_plan_type: documentation maps to docs"""
        self.assertEqual(normalize_plan_type("documentation"), "docs")

    def test_chore_maps_to_chore(self):
        """normalize_plan_type: chore maps to chore"""
        self.assertEqual(normalize_plan_type("chore"), "chore")

    def test_ci_maps_to_chore(self):
        """normalize_plan_type: ci maps to chore"""
        self.assertEqual(normalize_plan_type("ci"), "chore")

    def test_test_maps_to_test(self):
        """normalize_plan_type: test maps to test"""
        self.assertEqual(normalize_plan_type("test"), "test")

    def test_invalid_type_raises_error(self):
        """normalize_plan_type: invalid type raises ValidationError"""
        with self.assertRaises(ValidationError):
            normalize_plan_type("invalid")

    def test_empty_type_raises_error(self):
        """normalize_plan_type: empty type raises ValidationError"""
        with self.assertRaises(ValidationError):
            normalize_plan_type("")

    def test_case_insensitive(self):
        """normalize_plan_type: case insensitive"""
        self.assertEqual(normalize_plan_type("FEAT"), "feature")
        self.assertEqual(normalize_plan_type("Feature"), "feature")
        self.assertEqual(normalize_plan_type("FIX"), "fix")


class TestPlanTypeToIssueLabel(unittest.TestCase):
    """Test plan_type_to_issue_label function"""

    def test_feature_maps_to_type_feature(self):
        """plan_type_to_issue_label: feature maps to type/feature"""
        self.assertEqual(plan_type_to_issue_label("feature"), "type/feature")

    def test_enhance_maps_to_type_feature(self):
        """plan_type_to_issue_label: enhance maps to type/feature"""
        self.assertEqual(plan_type_to_issue_label("enhance"), "type/feature")

    def test_fix_maps_to_type_bug(self):
        """plan_type_to_issue_label: fix maps to type/bug"""
        self.assertEqual(plan_type_to_issue_label("fix"), "type/bug")

    def test_perf_maps_to_type_perf(self):
        """plan_type_to_issue_label: perf maps to type/perf"""
        self.assertEqual(plan_type_to_issue_label("perf"), "type/perf")

    def test_refactor_maps_to_type_refactor(self):
        """plan_type_to_issue_label: refactor maps to type/refactor"""
        self.assertEqual(plan_type_to_issue_label("refactor"), "type/refactor")

    def test_docs_maps_to_type_docs(self):
        """plan_type_to_issue_label: docs maps to type/docs"""
        self.assertEqual(plan_type_to_issue_label("docs"), "type/docs")

    def test_test_maps_to_type_test(self):
        """plan_type_to_issue_label: test maps to type/test"""
        self.assertEqual(plan_type_to_issue_label("test"), "type/test")

    def test_chore_maps_to_type_chore(self):
        """plan_type_to_issue_label: chore maps to type/chore"""
        self.assertEqual(plan_type_to_issue_label("chore"), "type/chore")

    def test_invalid_type_raises_error(self):
        """plan_type_to_issue_label: invalid type raises ValidationError"""
        with self.assertRaises(ValidationError):
            plan_type_to_issue_label("invalid")


class TestIssueLabelToPlanType(unittest.TestCase):
    """Test issue_label_to_plan_type function"""

    def test_type_feature_maps_to_feature(self):
        """issue_label_to_plan_type: type/feature maps to feature"""
        self.assertEqual(issue_label_to_plan_type("type/feature"), "feature")

    def test_type_bug_maps_to_fix(self):
        """issue_label_to_plan_type: type/bug maps to fix"""
        self.assertEqual(issue_label_to_plan_type("type/bug"), "fix")

    def test_type_perf_maps_to_perf(self):
        """issue_label_to_plan_type: type/perf maps to perf"""
        self.assertEqual(issue_label_to_plan_type("type/perf"), "perf")

    def test_type_refactor_maps_to_refactor(self):
        """issue_label_to_plan_type: type/refactor maps to refactor"""
        self.assertEqual(issue_label_to_plan_type("type/refactor"), "refactor")

    def test_type_docs_maps_to_docs(self):
        """issue_label_to_plan_type: type/docs maps to docs"""
        self.assertEqual(issue_label_to_plan_type("type/docs"), "docs")

    def test_type_test_maps_to_test(self):
        """issue_label_to_plan_type: type/test maps to test"""
        self.assertEqual(issue_label_to_plan_type("type/test"), "test")

    def test_type_chore_maps_to_chore(self):
        """issue_label_to_plan_type: type/chore maps to chore"""
        self.assertEqual(issue_label_to_plan_type("type/chore"), "chore")

    def test_invalid_label_raises_error(self):
        """issue_label_to_plan_type: invalid label raises ValidationError"""
        with self.assertRaises(ValidationError):
            issue_label_to_plan_type("invalid")

    def test_unsupported_type_label_raises_error(self):
        """issue_label_to_plan_type: unsupported type label raises ValidationError"""
        with self.assertRaises(ValidationError):
            issue_label_to_plan_type("type/unknown")


class TestRoundTripConversion(unittest.TestCase):
    """Test round-trip conversion between plan type and issue label"""

    def test_feature_round_trip(self):
        """Round trip: feature -> type/feature -> feature"""
        plan_type = "feature"
        label = plan_type_to_issue_label(plan_type)
        back = issue_label_to_plan_type(label)
        self.assertEqual(back, plan_type)

    def test_fix_round_trip(self):
        """Round trip: fix -> type/bug -> fix"""
        plan_type = "fix"
        label = plan_type_to_issue_label(plan_type)
        back = issue_label_to_plan_type(label)
        self.assertEqual(back, plan_type)

    def test_perf_round_trip(self):
        """Round trip: perf -> type/perf -> perf"""
        plan_type = "perf"
        label = plan_type_to_issue_label(plan_type)
        back = issue_label_to_plan_type(label)
        self.assertEqual(back, plan_type)

    def test_enhance_round_trip(self):
        """Round trip: enhance -> type/feature -> feature (not enhance)"""
        # Note: enhance maps to type/feature, which maps back to feature
        # This is intentional - enhance is a sub-type of feature
        plan_type = "enhance"
        label = plan_type_to_issue_label(plan_type)
        back = issue_label_to_plan_type(label)
        self.assertEqual(back, "feature")


if __name__ == '__main__':
    unittest.main()