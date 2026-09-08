import unittest
from unittest.mock import patch

import frappe

from ury.ury.report_api.day_close import get_close_day_checklist


def _get_all_by_doctype(fulfilment_rows):
	def get_all(doctype, *args, **kwargs):
		if doctype == "POS Profile":
			return []
		if doctype == "URY Fulfilment Record":
			return fulfilment_rows
		if doctype in ("URY Fulfilment Posting Intent", "URY Stock Reservation"):
			return []
		return []
	return get_all


class TestDayCloseFulfilmentBlocker(unittest.TestCase):
	@patch("ury.ury.report_api.day_close.require_manager")
	@patch("ury.ury.report_api.day_close.frappe.get_all")
	@patch("ury.ury.report_api.day_close.frappe.db.get_value", return_value="URY Co")
	@patch("ury.ury.report_api.day_close.frappe.db.count", return_value=0)
	def test_unposted_fulfilment_is_a_blocker(self, _count, _value, get_all, _manager):
		get_all.side_effect = _get_all_by_doctype(
			[{"name": "FR-1", "posted_to_erpnext": 0, "posting_reference": None}]
		)
		result = get_close_day_checklist("BR-1", "2026-09-04")
		item = next(row for row in result["items"] if row["key"] == "fulfilment_posting")
		self.assertTrue(item["blocking"])
		self.assertEqual(item["count"], 1)

	@patch("ury.ury.report_api.day_close.require_manager")
	@patch("ury.ury.report_api.day_close.frappe.get_all")
	@patch("ury.ury.report_api.day_close.frappe.db.get_value", return_value="URY Co")
	@patch("ury.ury.report_api.day_close.frappe.db.count", return_value=0)
	def test_posted_fulfilment_does_not_block(self, _count, _value, get_all, _manager):
		get_all.side_effect = _get_all_by_doctype(
			[{"name": "FR-1", "posted_to_erpnext": 1, "posting_reference": "STE-1"}]
		)
		result = get_close_day_checklist("BR-1", "2026-09-04")
		item = next(row for row in result["items"] if row["key"] == "fulfilment_posting")
		self.assertFalse(item["blocking"])
