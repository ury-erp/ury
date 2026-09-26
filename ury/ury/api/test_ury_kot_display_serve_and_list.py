# Copyright (c) 2026, Tridz Technologies Pvt. Ltd and contributors
# See license.txt
"""Tests for the kitchen-display-facing endpoints in ury_kot_display.py that
had zero test reference (COVERAGE_GAP_ANALYSIS.md Table 1, Top 15 item #6):
`serve_kot`, `get_site_name`, `kot_list`, `served_kot_list`. This is an
ironic gap: the KOT generation/execution pipeline is heavily tested
elsewhere, but the actual display layer the kitchen screen calls was not.
`confirm_cancel_kot` already has coverage in test_ury_kot_display.py
alongside this file.

Mocked per this track's read-path convention -- these are all
read/status-transition endpoints over an already-created URY KOT, not the
document's own lifecycle hooks.
"""

from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_kot_display import (
	build_dashboard_summary,
	get_site_name,
	serve_kot,
)

MODULE = "ury.ury.api.ury_kot_display"


class TestGetSiteName(FrappeTestCase):
	def test_returns_current_site(self):
		with patch(f"{MODULE}.frappe.local") as mock_local:
			mock_local.site = "p2round3.local"
			result = get_site_name()
		self.assertEqual(result, {"site_name": "p2round3.local"})


class TestBuildDashboardSummary(FrappeTestCase):
	"""Pure function -- no mocking needed."""

	def test_empty_list_returns_empty_summary(self):
		self.assertEqual(build_dashboard_summary([]), [])

	def test_kots_without_production_are_skipped(self):
		kots = [{"production": None, "order_status": "Ready For Prepare"}]
		self.assertEqual(build_dashboard_summary(kots), [])

	def test_groups_by_production_and_counts_ready_vs_pending(self):
		kots = [
			{"production": "Main Kitchen", "order_status": "Ready For Prepare", "name": "KOT-1"},
			{"production": "Main Kitchen", "order_status": "In Progress", "name": "KOT-2"},
			{"production": "Bar", "order_status": "Ready For Prepare", "name": "KOT-3"},
		]
		summary = build_dashboard_summary(kots)
		by_name = {row["name"]: row for row in summary}

		self.assertEqual(set(by_name.keys()), {"Main Kitchen", "Bar"})

		main = by_name["Main Kitchen"]
		self.assertEqual(main["active_orders"], 2)
		self.assertEqual(main["ready_orders"], 1)
		self.assertEqual(main["pending_orders"], 1)
		self.assertEqual(len(main["orders"]), 2)

		bar = by_name["Bar"]
		self.assertEqual(bar["active_orders"], 1)
		self.assertEqual(bar["ready_orders"], 1)
		self.assertEqual(bar["pending_orders"], 0)


class TestServeKot(FrappeTestCase):
	def test_serve_kot_updates_status_and_timing(self):
		creation_time = datetime(2026, 1, 1, 12, 0, 0)
		current_time = datetime(2026, 1, 1, 12, 15, 0)

		mock_kot_doc = MagicMock()
		mock_kot_doc.creation = creation_time
		mock_kot_doc.branch = "Branch A"

		with patch(f"{MODULE}.frappe.request", None), \
			patch(f"{MODULE}.frappe.get_doc", return_value=mock_kot_doc) as mock_get_doc, \
			patch(f"{MODULE}.frappe.has_permission", return_value=True), \
			patch(f"{MODULE}.getBranch", return_value="Branch A"), \
			patch(f"{MODULE}.get_datetime", return_value=current_time), \
			patch(f"{MODULE}.frappe.db.set_value") as mock_set_value:
			serve_kot("KOT-0001")

		mock_get_doc.assert_called_once_with("URY KOT", "KOT-0001")
		# 15 minutes of production time
		calls = {call.args[2]: call.args[3] for call in mock_set_value.call_args_list}
		self.assertEqual(calls["order_status"], "Served")
		self.assertEqual(calls["start_time_serv"], "12:15:00")
		self.assertAlmostEqual(calls["production_time"], 15.0)

	def test_serve_kot_raises_without_write_permission(self):
		mock_kot_doc = MagicMock()

		with patch(f"{MODULE}.frappe.request", None), \
			patch(f"{MODULE}.frappe.get_doc", return_value=mock_kot_doc), \
			patch(f"{MODULE}.frappe.has_permission", return_value=False):
			with self.assertRaises(frappe.PermissionError):
				serve_kot("KOT-0001")

	def test_serve_kot_rejects_non_post_requests(self):
		mock_request = MagicMock()
		mock_request.method = "GET"

		with patch(f"{MODULE}.frappe.request", mock_request):
			with self.assertRaises(frappe.PermissionError):
				serve_kot("KOT-0001")
