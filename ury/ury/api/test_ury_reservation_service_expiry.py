# Copyright (c) 2026, Tridz Technologies Pvt. Ltd and contributors
# See license.txt
"""Test for expire_stale_reservations() (COVERAGE_GAP_ANALYSIS.md Table 1,
Top 15 item #10: "a scheduled/background job that mutates reservation
state with no test"). Mocked per this track's read-path convention:
`frappe.get_all` is mocked to avoid a real Stock Reservation fixture set,
and `_transition_group` (which performs the actual real DB status mutation
and is exercised elsewhere in test_ury_reservation_service.py's
create/release/reconcile tests) is mocked here since this test's job is to
verify the *selection and grouping* logic, not re-prove the transition
helper's own correctness.
"""

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_reservation_service import (
	EXPIRED,
	RESERVATION_DOCTYPE,
	RESERVED,
	expire_stale_reservations,
)

MODULE = "ury.ury.api.ury_reservation_service"


class TestExpireStaleReservations(FrappeTestCase):
	def test_no_stale_rows_returns_empty_list_and_transitions_nothing(self):
		with patch(f"{MODULE}.frappe.get_all", return_value=[]) as mock_get_all, \
			patch(f"{MODULE}._transition_group") as mock_transition:
			result = expire_stale_reservations(60, now=frappe.utils.now_datetime())

		self.assertEqual(result, [])
		mock_transition.assert_not_called()
		# Confirm it queried the right doctype/status.
		_, kwargs = mock_get_all.call_args
		self.assertEqual(mock_get_all.call_args.args[0], RESERVATION_DOCTYPE)
		self.assertEqual(kwargs["filters"]["status"], RESERVED)

	def test_stale_rows_are_grouped_and_each_group_transitioned_once(self):
		rows = [
			frappe._dict({"name": "RES-1", "reservation_group": "GRP-A"}),
			frappe._dict({"name": "RES-2", "reservation_group": "GRP-A"}),
			frappe._dict({"name": "RES-3", "reservation_group": "GRP-B"}),
		]
		with patch(f"{MODULE}.frappe.get_all", return_value=rows), \
			patch(f"{MODULE}._transition_group") as mock_transition:
			result = expire_stale_reservations(60, now=frappe.utils.now_datetime())

		self.assertEqual(result, ["GRP-A", "GRP-B"])
		self.assertEqual(mock_transition.call_count, 2)
		called_groups = {call.args[0] for call in mock_transition.call_args_list}
		self.assertEqual(called_groups, {"GRP-A", "GRP-B"})
		for call in mock_transition.call_args_list:
			self.assertEqual(call.args[1], RESERVED)
			self.assertEqual(call.args[2], EXPIRED)

	def test_cutoff_is_derived_from_ttl_minutes_before_now(self):
		now = frappe.utils.get_datetime("2026-01-01 12:00:00")
		with patch(f"{MODULE}.frappe.get_all", return_value=[]) as mock_get_all, \
			patch(f"{MODULE}._transition_group"):
			expire_stale_reservations(30, now=now)

		_, kwargs = mock_get_all.call_args
		cutoff = kwargs["filters"]["creation"][1]
		expected_cutoff = frappe.utils.add_to_date(now, minutes=-30)
		self.assertEqual(cutoff, expected_cutoff)

	def test_defaults_now_to_current_time_when_not_provided(self):
		with patch(f"{MODULE}.frappe.get_all", return_value=[]), \
			patch(f"{MODULE}._transition_group"), \
			patch(f"{MODULE}.frappe.utils.now_datetime", return_value=frappe.utils.get_datetime("2026-03-01 08:00:00")) as mock_now:
			expire_stale_reservations(15)

		mock_now.assert_called_once()
