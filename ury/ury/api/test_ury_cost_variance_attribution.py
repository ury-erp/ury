# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt
#
# Unit tests against mocked frappe calls (matching the test_ury_bom_compiler.py
# / test_ury_wastage.py convention) rather than a live bench -- no bench/Docker
# is available in this task's worktree. These were reviewed by hand (traced
# call-by-call against ury_cost_variance_attribution.py) rather than executed
# against a real site; see the task report for that walkthrough. Static
# validation performed: python3 -m py_compile and git diff --check.

import unittest
from unittest.mock import patch

import frappe

from ury.ury.api.ury_cost_variance_attribution import (
    compute_posted_cost,
    compute_theoretical_cost,
    compute_variance,
)


MOD = "ury.ury.api.ury_cost_variance_attribution"
BOM_MOD = "ury.ury.api.ury_bom_compiler"


def _bom_vector(components, bom="BOM-BURGER-001", source="bom_explosion_item"):
    return {
        "item_code": "Burger",
        "bom": bom,
        "qty": None,
        "company": "URY Co",
        "source": source,
        "components": components,
    }


class TestComputeTheoreticalCost(unittest.TestCase):
    @patch(f"{MOD}._valuation_rate")
    @patch(f"{MOD}.compile_bom_vector")
    def test_theoretical_cost_is_sum_of_qty_times_rate(self, mock_compile, mock_rate):
        # Hand-traceable example: Bun 10 @ 2.0 = 20.0, Patty 10 @ 15.0 = 150.0,
        # Cheese Slice 20 @ 3.5 = 70.0 -> total 240.0
        mock_compile.return_value = _bom_vector(
            [
                {"component_item": "Bun", "qty": 10, "stock_uom": "Nos", "qty_per_unit": 1},
                {"component_item": "Patty", "qty": 10, "stock_uom": "Nos", "qty_per_unit": 1},
                {"component_item": "Cheese Slice", "qty": 20, "stock_uom": "Nos", "qty_per_unit": 2},
            ]
        )
        rates = {"Bun": 2.0, "Patty": 15.0, "Cheese Slice": 3.5}
        mock_rate.side_effect = lambda item_code, company: rates[item_code]

        result = compute_theoretical_cost("Burger", 10, "URY Co")

        self.assertEqual(result["theoretical_cost"], 240.0)
        by_item = {c["component_item"]: c for c in result["components"]}
        self.assertEqual(by_item["Bun"]["cost"], 20.0)
        self.assertEqual(by_item["Patty"]["cost"], 150.0)
        self.assertEqual(by_item["Cheese Slice"]["cost"], 70.0)

    def test_missing_company_fails_closed(self):
        with self.assertRaises(frappe.ValidationError):
            compute_theoretical_cost("Burger", 10, None)

    @patch(f"{MOD}._valuation_rate")
    @patch(f"{MOD}.compile_bom_vector")
    def test_missing_valuation_rate_treated_as_zero_not_crash(self, mock_compile, mock_rate):
        mock_compile.return_value = _bom_vector(
            [{"component_item": "FreeGarnish", "qty": 5, "stock_uom": "Nos", "qty_per_unit": 0.5}]
        )
        mock_rate.return_value = 0.0

        result = compute_theoretical_cost("Burger", 10, "URY Co")

        self.assertEqual(result["theoretical_cost"], 0.0)


class TestComputePostedCost(unittest.TestCase):
    @patch(f"{MOD}._valuation_rate")
    @patch(f"{MOD}._resolve_fulfilment_record")
    def test_posted_cost_is_theoretical_equivalent_when_not_posted(self, mock_resolve, mock_rate):
        mock_resolve.return_value = {
            "name": "FR-001",
            "kot": "KOT-001",
            "item_code": "Burger",
            "qty": 10,
            "company": "URY Co",
            "posted_to_erpnext": 0,
        }
        mock_rate.return_value = 24.0

        result = compute_posted_cost("FR-001", "URY Co")

        self.assertFalse(result["posted_to_erpnext"])
        self.assertTrue(result["is_theoretical_equivalent"])
        self.assertEqual(result["posted_cost"], 240.0)

    def test_missing_company_fails_closed(self):
        with self.assertRaises(frappe.ValidationError):
            compute_posted_cost("FR-001", None)

    @patch(f"{MOD}.frappe.get_all")
    @patch(f"{MOD}.frappe.db.get_value")
    def test_company_mismatch_fails_closed(self, mock_get_value, mock_get_all):
        mock_get_value.return_value = None
        mock_get_all.return_value = [
            frappe._dict(
                name="FR-001",
                kot="KOT-001",
                item_code="Burger",
                qty=10,
                company="Other Co",
                posted_to_erpnext=0,
            )
        ]

        with self.assertRaises(frappe.ValidationError):
            compute_posted_cost("KOT-001", "URY Co")

    @patch(f"{MOD}.frappe.get_all")
    @patch(f"{MOD}.frappe.db.get_value")
    def test_no_matching_record_fails_closed(self, mock_get_value, mock_get_all):
        mock_get_value.return_value = None
        mock_get_all.return_value = []

        with self.assertRaises(frappe.ValidationError):
            compute_posted_cost("KOT-MISSING", "URY Co")


class TestComputeVariance(unittest.TestCase):
    def setUp(self):
        # compute_variance() calls frappe.utils.now(), which otherwise
        # chains into get_system_settings() -> get_cached_doc("System
        # Settings") -- a real DB/cache path these unit tests do not
        # stub. Fix the clock instead of routing that lookup through
        # the get_doc mocks below.
        now_patcher = patch(f"{MOD}.frappe.utils.now", return_value="2024-01-01 00:00:00")
        now_patcher.start()
        self.addCleanup(now_patcher.stop)

    @patch(f"{MOD}.compute_theoretical_cost")
    def test_variance_vs_theoretical_is_zero_when_posted_equals_theoretical(self, mock_theoretical):
        mock_theoretical.return_value = {"theoretical_cost": 240.0}

        result = compute_variance("Burger", 10, "URY Co")

        self.assertEqual(result["theoretical_cost"], 240.0)
        self.assertEqual(result["posted_cost"], 240.0)
        self.assertEqual(result["variance_vs_theoretical"], 0.0)
        self.assertIsNone(result["counted_qty"])
        self.assertIsNone(result["variance_vs_counted"])
        self.assertIn("theoretical-equivalent", result["reason"])

    @patch(f"{MOD}.compute_theoretical_cost")
    def test_positive_variance_when_counted_qty_exceeds_expected(self, mock_theoretical):
        # theoretical_cost=240 for qty=10 -> rate 24/unit. Counted 12 units
        # actually consumed -> counted_cost=288, variance_vs_counted=+48
        # (more was consumed than the BOM said should have been -- shrinkage).
        mock_theoretical.return_value = {"theoretical_cost": 240.0}

        result = compute_variance("Burger", 10, "URY Co", counted_qty=12)

        self.assertEqual(result["counted_cost"], 288.0)
        self.assertEqual(result["variance_vs_counted"], 48.0)

    @patch(f"{MOD}.compute_theoretical_cost")
    def test_negative_variance_when_counted_qty_below_expected(self, mock_theoretical):
        # Counted 8 units (less than the 10 the BOM expected) -> counted_cost=192,
        # variance_vs_counted=-48 (less was consumed than expected -- surplus/error).
        mock_theoretical.return_value = {"theoretical_cost": 240.0}

        result = compute_variance("Burger", 10, "URY Co", counted_qty=8)

        self.assertEqual(result["counted_cost"], 192.0)
        self.assertEqual(result["variance_vs_counted"], -48.0)

    @patch(f"{MOD}.compute_theoretical_cost")
    def test_zero_qty_fails_closed(self, mock_theoretical):
        with self.assertRaises(frappe.ValidationError):
            compute_variance("Burger", 0, "URY Co")
        mock_theoretical.assert_not_called()

    @patch(f"{MOD}.compute_theoretical_cost")
    def test_negative_counted_qty_fails_closed(self, mock_theoretical):
        mock_theoretical.return_value = {"theoretical_cost": 240.0}
        with self.assertRaises(frappe.ValidationError):
            compute_variance("Burger", 10, "URY Co", counted_qty=-1)

    def test_missing_company_fails_closed(self):
        with self.assertRaises(frappe.ValidationError):
            compute_variance("Burger", 10, None)

    @patch(f"{MOD}.frappe.get_doc")
    @patch(f"{MOD}.compute_theoretical_cost")
    def test_persist_true_inserts_snapshot_doc(self, mock_theoretical, mock_get_doc):
        mock_theoretical.return_value = {"theoretical_cost": 240.0}
        mock_doc = mock_get_doc.return_value
        mock_doc.name = "CVS-001"

        result = compute_variance("Burger", 10, "URY Co", persist=True)

        mock_get_doc.assert_called_once()
        called_dict = mock_get_doc.call_args[0][0]
        self.assertEqual(called_dict["doctype"], "URY Cost Variance Snapshot")
        self.assertEqual(called_dict["theoretical_cost"], 240.0)
        mock_doc.insert.assert_called_once_with(ignore_permissions=False)
        self.assertEqual(result["snapshot"], "CVS-001")

    @patch(f"{MOD}.frappe.get_doc")
    @patch(f"{MOD}.compute_theoretical_cost")
    def test_persist_false_never_touches_db(self, mock_theoretical, mock_get_doc):
        mock_theoretical.return_value = {"theoretical_cost": 240.0}

        result = compute_variance("Burger", 10, "URY Co")

        mock_get_doc.assert_not_called()
        self.assertNotIn("snapshot", result)


if __name__ == "__main__":
    unittest.main()
