"""Permission/authorization tests for `ury_kot_cancellation_service.py`'s
manager-confirmation gate (`_verify_manager_confirmation`), which guards the
whitelisted `cancel_after_start`/`cancel_after_ready`/`cancel_partial`
entrypoints. This module had zero permission coverage before this file (see
TRACK.md Phase 4).

Mock-based unit tests, matching the established pattern in this package.
Pinned here (all from the function's own documented contract):

  1. A non-manager session user is rejected (whether or not they pass a
     `manager_confirmed_by` value) -- `CancellationError(MANAGER_CONFIRMATION_REQUIRED)`.
  2. A real manager session user is allowed through, returning their own
     identity as the verified confirmer.
  3. `manager_confirmed_by` naming a DIFFERENT user than the session is
     rejected outright, even if that named user really is a manager -- a
     client cannot assert someone else's confirmation on their behalf. This
     is the specific anti-spoofing property called out in the function's
     own docstring; a regression here would let a non-manager complete a
     manager-gated cancellation just by naming a manager's email in the
     request body.
  4. `cancel_before_start` (the one case that is NOT manager-gated by
     design -- QUEUED means nothing has been produced/consumed yet) is
     confirmed, by direct source read, to call neither `_is_manager` nor
     `_verify_manager_confirmation` -- documented here as an explicit
     design decision, not silently assumed.
"""

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api import ury_kot_cancellation_service as svc

MODULE = "ury.ury.api.ury_kot_cancellation_service"


class TestVerifyManagerConfirmation(FrappeTestCase):
	def test_non_manager_session_user_denied(self):
		with patch(f"{MODULE}.frappe.session") as mock_session, \
			patch(f"{MODULE}.frappe.get_roles", return_value=["Employee"]):
			mock_session.user = "waiter@ury.test"
			with self.assertRaises(svc.CancellationError) as ctx:
				svc._verify_manager_confirmation(manager_confirmed_by=None)
			self.assertEqual(ctx.exception.reason_code, svc.MANAGER_CONFIRMATION_REQUIRED)

	def test_manager_session_user_allowed_and_returned(self):
		with patch(f"{MODULE}.frappe.session") as mock_session, \
			patch(f"{MODULE}.frappe.get_roles", return_value=["URY Manager"]):
			mock_session.user = "manager@ury.test"
			result = svc._verify_manager_confirmation(manager_confirmed_by=None)
			self.assertEqual(result, "manager@ury.test")

	def test_manager_confirmed_by_matching_session_manager_allowed(self):
		with patch(f"{MODULE}.frappe.session") as mock_session, \
			patch(f"{MODULE}.frappe.get_roles", return_value=["URY Admin"]):
			mock_session.user = "admin@ury.test"
			result = svc._verify_manager_confirmation(manager_confirmed_by="admin@ury.test")
			self.assertEqual(result, "admin@ury.test")

	def test_manager_confirmed_by_naming_a_different_user_is_rejected(self):
		"""Anti-spoofing: even though 'realmanager@ury.test' really is a
		manager, a non-manager session cannot claim their confirmation by
		naming them in manager_confirmed_by."""
		with patch(f"{MODULE}.frappe.session") as mock_session, \
			patch(f"{MODULE}.frappe.get_roles", return_value=["URY Manager"]):
			mock_session.user = "waiter@ury.test"  # session user is NOT the named manager
			with self.assertRaises(svc.CancellationError) as ctx:
				svc._verify_manager_confirmation(manager_confirmed_by="realmanager@ury.test")
			self.assertEqual(ctx.exception.reason_code, svc.MANAGER_CONFIRMATION_REQUIRED)

	def test_non_manager_confirmed_by_self_still_denied(self):
		with patch(f"{MODULE}.frappe.session") as mock_session, \
			patch(f"{MODULE}.frappe.get_roles", return_value=["Employee"]):
			mock_session.user = "waiter@ury.test"
			with self.assertRaises(svc.CancellationError) as ctx:
				svc._verify_manager_confirmation(manager_confirmed_by="waiter@ury.test")
			self.assertEqual(ctx.exception.reason_code, svc.MANAGER_CONFIRMATION_REQUIRED)


class TestCancelBeforeStartIsIntentionallyUngated(FrappeTestCase):
	"""cancel_before_start is documented as not requiring manager
	confirmation (QUEUED == nothing produced/consumed yet). Confirmed by
	source read: it never calls _is_manager or _verify_manager_confirmation.
	This test pins that as a known design decision, not a silent gap."""

	def test_cancel_before_start_never_checks_manager_role(self):
		with patch(f"{MODULE}._require_execution_doctype"), \
			patch(f"{MODULE}._require_kot"), \
			patch(f"{MODULE}.frappe.session") as mock_session, \
			patch(f"{MODULE}._kot_scope", return_value=("Branch A", "Company A", None)), \
			patch(f"{MODULE}._current_state", return_value=(None, svc.QUEUED)), \
			patch(f"{MODULE}._write_cancellation", return_value={"name": "UKE-1"}), \
			patch(f"{MODULE}.frappe.get_roles") as mock_roles:
			mock_session.user = "waiter@ury.test"
			result = svc.cancel_before_start("KOT-0001")
			self.assertEqual(result["name"], "UKE-1")
			mock_roles.assert_not_called()
