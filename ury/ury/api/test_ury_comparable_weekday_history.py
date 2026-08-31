from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_dashboard import get_comparable_weekday_history


class TestComparableWeekdayHistory(FrappeTestCase):
	def _allow_history_access(self):
		patches = [
			patch("ury.ury.api.ury_dashboard.frappe.has_permission", return_value=True),
			patch("ury.ury.api.ury_dashboard.frappe.db.get_value", return_value="Company A"),
			patch("ury.ury.api.ury_dashboard._has_dashboard_cross_branch_access", return_value=False),
			patch("ury.ury.api.ury_dashboard.getBranch", return_value="Branch A"),
		]
		for active_patch in patches:
			active_patch.start()
			self.addCleanup(active_patch.stop)

	def test_query_is_scoped_and_excludes_plan_date(self):
		self._allow_history_access()

		with patch("ury.ury.api.ury_dashboard.frappe.db.sql", return_value=[]) as sql:
			result = get_comparable_weekday_history(
				"2026-09-12", "Branch A", "Company A", ["ITEM-1"]
			)

		self.assertEqual(
			result,
			{
				"plan_date": "2026-09-12",
				"branch": "Branch A",
				"company": "Company A",
				"sample_dates": [],
				"items": [],
			},
		)
		query, params = sql.call_args.args[:2]
		self.assertIn("pi.posting_date < %(plan_date)s", query)
		self.assertIn("WEEKDAY(pi.posting_date) = WEEKDAY(%(plan_date)s)", query)
		self.assertIn("pi.branch = %(branch)s", query)
		self.assertIn("pi.company = %(company)s", query)
		self.assertEqual(params["plan_date"], "2026-09-12")
		self.assertEqual(params["branch"], "Branch A")
		self.assertEqual(params["company"], "Company A")
		self.assertEqual(params["items"], ("ITEM-1",))

	def test_missing_scope_fails_closed(self):
		with self.assertRaises(frappe.ValidationError):
			get_comparable_weekday_history("2026-09-12", "", "Company A")

	def test_permission_denial_fails_before_query(self):
		with patch(
			"ury.ury.api.ury_dashboard.frappe.has_permission", return_value=False
		) as has_permission, patch(
			"ury.ury.api.ury_dashboard.frappe.db.sql"
		) as sql:
			with self.assertRaises(frappe.PermissionError):
				get_comparable_weekday_history("2026-09-12", "Branch A", "Company A")

		has_permission.assert_called_once_with("POS Invoice", "read")
		sql.assert_not_called()

	def test_missing_company_fails_before_query(self):
		with patch(
			"ury.ury.api.ury_dashboard.frappe.has_permission", return_value=True
		), patch(
			"ury.ury.api.ury_dashboard.frappe.db.get_value", return_value=None
		) as get_value, patch(
			"ury.ury.api.ury_dashboard.frappe.db.sql"
		) as sql:
			with self.assertRaises(frappe.PermissionError):
				get_comparable_weekday_history("2026-09-12", "Branch A", "Company A")

		get_value.assert_called_once_with("Branch", "Branch A", "company")
		sql.assert_not_called()

	def test_unassigned_branch_fails_before_query(self):
		with patch(
			"ury.ury.api.ury_dashboard.frappe.has_permission", return_value=True
		), patch(
			"ury.ury.api.ury_dashboard.frappe.db.get_value", return_value="Company A"
		), patch(
			"ury.ury.api.ury_dashboard._has_dashboard_cross_branch_access", return_value=False
		), patch(
			"ury.ury.api.ury_dashboard.getBranch", return_value="Branch B"
		) as get_branch, patch(
			"ury.ury.api.ury_dashboard.frappe.db.sql"
		) as sql:
			with self.assertRaises(frappe.PermissionError):
				get_comparable_weekday_history("2026-09-12", "Branch A", "Company A")

		get_branch.assert_called_once()
		sql.assert_not_called()

	def test_company_mismatch_fails_before_query(self):
		with patch(
			"ury.ury.api.ury_dashboard.frappe.has_permission", return_value=True
		), patch(
			"ury.ury.api.ury_dashboard.frappe.db.get_value", return_value="Company B"
		), patch(
			"ury.ury.api.ury_dashboard.frappe.db.sql"
		) as sql:
			with self.assertRaises(frappe.PermissionError):
				get_comparable_weekday_history("2026-09-12", "Branch A", "Company A")

		sql.assert_not_called()

	def test_multiple_item_filter_is_parameterized(self):
		self._allow_history_access()

		with patch("ury.ury.api.ury_dashboard.frappe.db.sql", return_value=[]) as sql:
			get_comparable_weekday_history(
				"2026-09-12", "Branch A", "Company A", '["ITEM-1", "ITEM-2"]'
			)

		query, params = sql.call_args.args[:2]
		self.assertIn("pii.item_code IN %(items)s", query)
		self.assertNotIn("ITEM-1", query)
		self.assertNotIn("ITEM-2", query)
		self.assertEqual(params["items"], ("ITEM-1", "ITEM-2"))

	def test_return_net_quantity_sql_contract(self):
		self._allow_history_access()

		with patch("ury.ury.api.ury_dashboard.frappe.db.sql", return_value=[]) as sql:
			get_comparable_weekday_history("2026-09-12", "Branch A", "Company A")

		normalized_query = " ".join(sql.call_args.args[0].split())
		self.assertIn(
			"SUM(CASE WHEN pi.is_return = 1 THEN -ABS(pii.qty) ELSE pii.qty END) AS net_qty",
			normalized_query,
		)

	def test_response_wraps_rows_into_expected_shape(self):
		self._allow_history_access()

		rows = [
			{"item_code": "ITEM-1", "posting_date": "2026-09-05", "net_qty": 10},
			{"item_code": "ITEM-1", "posting_date": "2026-08-29", "net_qty": 6},
			{"item_code": "ITEM-2", "posting_date": "2026-09-05", "net_qty": 3},
		]

		with patch("ury.ury.api.ury_dashboard.frappe.db.sql", return_value=rows), patch(
			"ury.ury.api.ury_dashboard.frappe.db.get_all",
			return_value=[
				{"item_code": "ITEM-1", "item_name": "Item One", "stock_uom": "Nos"},
				{"item_code": "ITEM-2", "item_name": "Item Two", "stock_uom": "Nos"},
			],
		):
			result = get_comparable_weekday_history("2026-09-12", "Branch A", "Company A")

		self.assertEqual(result["plan_date"], "2026-09-12")
		self.assertEqual(result["branch"], "Branch A")
		self.assertEqual(result["company"], "Company A")
		self.assertEqual(result["sample_dates"], ["2026-08-29", "2026-09-05"])
		self.assertEqual(len(result["items"]), 2)

		item_one = next(i for i in result["items"] if i["item_code"] == "ITEM-1")
		self.assertEqual(item_one["item_name"], "Item One")
		self.assertEqual(item_one["sample_days"], 2)
		self.assertEqual(item_one["total_qty"], 16)
		self.assertEqual(item_one["average_qty"], 8)
		self.assertEqual(len(item_one["history"]), 2)
