import json
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_stock_authority_shadow_report import get_shadow_comparison_report

MODULE = "ury.ury.api.ury_stock_authority_shadow_report"


def _intent(item_code, accepted_qty, components, stock_entry="STE-0001", branch="Branch A"):
	return {
		"name": f"UFPI-{item_code}",
		"order_ref": "ORD-1",
		"kot": "KOT-1",
		"kot_item": "KOTI-1",
		"production_policy": "MADE_TO_ORDER",
		"erpnext_stock_entry": stock_entry,
		"frozen_payload_json": json.dumps(
			{
				"item_code": item_code,
				"accepted_qty": accepted_qty,
				"components": components,
			}
		),
		"posted_at": "2026-09-10 12:05:00",
	}


class TestGetShadowComparisonReport(FrappeTestCase):
	def setUp(self):
		super().setUp()
		self.closing_entries = [
			{
				"name": "PCE-0001",
				"pos_profile": "Profile A",
				"period_start_date": "2026-09-10 08:00:00",
				"period_end_date": "2026-09-10 20:00:00",
				"posting_date": "2026-09-10",
			}
		]

	def _run(self, native_sle_rows, intents, policy_by_item):
		def fake_get_all(doctype, **kwargs):
			if doctype == "POS Profile":
				return ["Profile A"]
			if doctype == "POS Closing Entry":
				return self.closing_entries
			if doctype == "POS Invoice Reference":
				return ["POSI-0001"]
			if doctype == "POS Invoice":
				return ["SI-CONS-0001"]
			if doctype == "Stock Ledger Entry":
				return native_sle_rows
			if doctype == "URY Fulfilment Posting Intent":
				return intents
			raise AssertionError(f"unexpected get_all call for {doctype}")

		def fake_resolve_context(item_code, branch):
			policy = policy_by_item.get(item_code)
			return {"production_policy": policy} if policy else None

		with patch(f"{MODULE}.frappe.get_all", side_effect=fake_get_all), patch(
			f"{MODULE}.resolve_production_context", side_effect=fake_resolve_context
		):
			return get_shadow_comparison_report("Branch A", "2026-09-01", "2026-09-15")

	def test_consistent_made_to_order_case(self):
		native_rows = [
			{"item_code": "Burger", "actual_qty": -10, "warehouse": "Kitchen WH - URY"},
		]
		intents = [
			_intent(
				"Burger",
				10,
				[{"item_code": "Bun", "qty": 10}, {"item_code": "Patty", "qty": 10}],
			)
		]
		report = self._run(native_rows, intents, {"Burger": "MADE_TO_ORDER"})

		items = report["closing_entries"][0]["items"]
		self.assertEqual(len(items), 1)
		burger = items[0]
		self.assertEqual(burger["item_code"], "Burger")
		self.assertEqual(burger["production_policy"], "MADE_TO_ORDER")
		self.assertTrue(burger["expected_shadow_entry"])
		self.assertEqual(burger["native_deduction_qty"], 10)
		self.assertEqual(burger["shadow_production_qty"], 10)
		self.assertTrue(burger["consistent"])
		self.assertIsNone(burger["discrepancy_reason"])
		raw = {row["item_code"]: row["qty"] for row in burger["shadow_raw_material_consumption"]}
		self.assertEqual(raw, {"Bun": 10, "Patty": 10})
		self.assertEqual(report["summary"]["total_discrepancies"], 0)

	def test_pre_produced_case_is_trivially_consistent_with_no_shadow_entry(self):
		native_rows = [
			{"item_code": "Mojito", "actual_qty": -5, "warehouse": "Bar WH - URY"},
		]
		report = self._run(native_rows, [], {"Mojito": "PRE_PRODUCED"})

		items = report["closing_entries"][0]["items"]
		self.assertEqual(len(items), 1)
		mojito = items[0]
		self.assertEqual(mojito["production_policy"], "PRE_PRODUCED")
		self.assertFalse(mojito["expected_shadow_entry"])
		self.assertEqual(mojito["native_deduction_qty"], 5)
		self.assertEqual(mojito["shadow_production_qty"], 0)
		self.assertTrue(mojito["consistent"])
		self.assertIsNone(mojito["discrepancy_reason"])
		self.assertEqual(report["summary"]["total_discrepancies"], 0)

	def test_inconsistent_case_is_flagged(self):
		# Production posted a shadow Manufacture entry for 8 units, but the
		# sale side only deducted 5 -- e.g. 3 units were cancelled after
		# READY with no write-off decided yet (G-08).
		native_rows = [
			{"item_code": "Pizza", "actual_qty": -5, "warehouse": "Kitchen WH - URY"},
		]
		intents = [_intent("Pizza", 8, [{"item_code": "Dough", "qty": 8}])]
		report = self._run(native_rows, intents, {"Pizza": "MADE_TO_ORDER"})

		items = report["closing_entries"][0]["items"]
		self.assertEqual(len(items), 1)
		pizza = items[0]
		self.assertFalse(pizza["consistent"])
		self.assertIn("Native deducted", pizza["discrepancy_reason"])
		self.assertEqual(report["summary"]["total_discrepancies"], 1)


class TestGetShadowComparisonReportPermissionBoundary(FrappeTestCase):
	"""Real, un-mocked negative-permission coverage.

	Fixed as part of this test round: `get_shadow_comparison_report` had NO
	permission check at all in source -- confirmed by reading the function
	directly, it went straight from the whitelist decorator to input
	validation (`branch`/`from_date`/`to_date` presence) with no
	`require_manager()`/role/branch-access call anywhere, unlike every
	sibling report_api-style reporting endpoint in this codebase
	(`report_api/day_close.py`, `financial.py`, `customers.py`, etc., all
	call `require_manager()` as the first line of the function body). Any
	authenticated user -- including one with no roles at all -- could pull
	this financial/production reconciliation report for any branch. Fixed
	by adding the identical `require_manager()` call, in the identical
	position (first line of the function body), used by every other
	report_api-family reporting endpoint in this app; no other behavior
	changed. This test is the negative-permission coverage for that fix.
	"""

	NEGATIVE_USER = "test_shadow_report_negative@example.com"

	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		if not frappe.db.exists("User", cls.NEGATIVE_USER):
			frappe.get_doc(
				{
					"doctype": "User",
					"email": cls.NEGATIVE_USER,
					"first_name": "Shadow Report Negative",
					"send_welcome_email": 0,
					"roles": [],
				}
			).insert(ignore_permissions=True)

	def setUp(self):
		frappe.set_user("Administrator")

	def tearDown(self):
		frappe.set_user("Administrator")

	def test_roleless_user_is_rejected_before_any_report_query_runs(self):
		frappe.set_user(self.NEGATIVE_USER)
		with self.assertRaises(frappe.PermissionError):
			get_shadow_comparison_report("Branch A", "2026-09-01", "2026-09-15")
