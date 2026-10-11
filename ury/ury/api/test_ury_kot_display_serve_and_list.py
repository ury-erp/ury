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

		with patch(f"{MODULE}.frappe.request", None), \
			patch(f"{MODULE}.frappe.get_doc", return_value=mock_kot_doc) as mock_get_doc, \
			patch(f"{MODULE}.frappe.has_permission", return_value=True), \
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


class TestServeKotEnsuresReadyBeforeServe(FrappeTestCase):
	"""Regression: an order must never reach "Served" while its item
	execution rows never went READY. The READY transition is what attaches
	the real-time production posting intent -- without it, MTO Work Orders
	stay "In Process" forever and the Manufacture Stock Entry is never
	posted (CBTEST / MFG-WO-2026-00092 incident: KOT-URY-00091 was served
	from a surface that only flipped order_status, leaving the execution
	row QUEUED and the linked Work Order unmanufactured)."""

	def _serve(self):
		mock_kot_doc = MagicMock()
		mock_kot_doc.creation = datetime(2026, 1, 1, 12, 0, 0)
		with patch(f"{MODULE}.frappe.request", None), \
			patch(f"{MODULE}.frappe.get_doc", return_value=mock_kot_doc), \
			patch(f"{MODULE}.frappe.has_permission", return_value=True), \
			patch(f"{MODULE}.get_datetime", return_value=datetime(2026, 1, 1, 12, 15, 0)), \
			patch(f"{MODULE}.frappe.db.set_value") as mock_set_value:
			serve_kot("KOT-0001")
		return {call.args[2]: call.args[3] for call in mock_set_value.call_args_list}

	def test_pending_rows_are_marked_ready_before_serve(self):
		with patch(f"{MODULE}.frappe.get_all", return_value=["URYKOTITM00180"]), \
			patch("ury.ury.api.ury_kot_item_execution_service.mark_item_ready") as mock_ready:
			calls = self._serve()

		mock_ready.assert_called_once_with(
			"URYKOTITM00180", "serve-auto-ready:KOT-0001:URYKOTITM00180"
		)
		self.assertEqual(calls["order_status"], "Served")

	def test_no_pending_rows_skips_ready_transition(self):
		with patch(f"{MODULE}.frappe.get_all", return_value=[]), \
			patch("ury.ury.api.ury_kot_item_execution_service.mark_item_ready") as mock_ready:
			calls = self._serve()

		mock_ready.assert_not_called()
		self.assertEqual(calls["order_status"], "Served")

	def test_ready_failure_does_not_block_serve(self):
		# Serving the customer must never be blocked by a production-posting
		# hiccup; the failure is logged (the READY transition's own savepoint
		# guarantees it never half-applies).
		with patch(f"{MODULE}.frappe.get_all", return_value=["URYKOTITM00180"]), \
			patch("ury.ury.api.ury_kot_item_execution_service.mark_item_ready", side_effect=Exception("boom")), \
			patch(f"{MODULE}.frappe.log_error") as mock_log_error:
			calls = self._serve()

		mock_log_error.assert_called_once()
		self.assertEqual(calls["order_status"], "Served")
