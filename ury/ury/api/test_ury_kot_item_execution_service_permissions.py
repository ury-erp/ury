"""Permission/authorization tests for `ury_kot_item_execution_service.py`'s
`_require_execution_actor()` gate, which guards the whitelisted
`start_item_execution`/`mark_item_ready`/`serve_item_execution` entrypoints.
This module had zero permission coverage before this file (see TRACK.md
Phase 4).

Unlike its sibling `ury_kot_execution_service.py` (see
`test_ury_kot_execution_service_permissions.py`'s documented gap finding),
this module DOES correctly wire both a role check AND the branch-scope
guard (`_require_kot_branch_scope`) -- confirmed by source read
(`_require_execution_actor` calls both, and is itself called from
`_transition` before every mutation). These tests pin that this module's
authorization is genuinely enforced, in contrast to the unwired sibling.

Mock-based unit tests, matching the established pattern in this package.
"""

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api import ury_kot_item_execution_service as svc

MODULE = "ury.ury.api.ury_kot_item_execution_service"


class TestRequireExecutionActor(FrappeTestCase):
	def test_administrator_always_allowed_without_role_or_branch_check(self):
		with patch(f"{MODULE}.frappe.get_roles") as mock_roles:
			svc._require_execution_actor("Administrator", "Branch A", "Company A")
			mock_roles.assert_not_called()

	def test_user_without_execution_role_denied(self):
		with patch(f"{MODULE}.frappe.get_roles", return_value=["Employee"]):
			with self.assertRaises(svc.ItemExecutionError) as ctx:
				svc._require_execution_actor("waiter@ury.test", "Branch A", "Company A")
			self.assertEqual(ctx.exception.reason_code, svc.NOT_PERMITTED)

	def test_user_with_execution_role_but_wrong_branch_denied(self):
		"""Role alone is not enough -- a Chef assigned to Branch B must still
		be rejected for a KOT scoped to Branch A (the branch-scope guard is
		actually invoked, not just the role check)."""
		with patch(f"{MODULE}.frappe.get_roles", return_value=["Chef"]), \
			patch("ury.ury.api.ury_kot_execution_service._require_kot_branch_scope") as mock_guard:
			mock_guard.side_effect = Exception("BRANCH_SCOPE_MISMATCH")
			with self.assertRaises(Exception):
				svc._require_execution_actor("chef@ury.test", "Branch A", "Company A")
			mock_guard.assert_called_once_with("Branch A", "chef@ury.test")

	def test_user_with_execution_role_and_matching_branch_allowed(self):
		with patch(f"{MODULE}.frappe.get_roles", return_value=["Chef"]), \
			patch("ury.ury.api.ury_kot_execution_service._require_kot_branch_scope"):
			svc._require_execution_actor("chef@ury.test", "Branch A", "Company A")  # must not raise

	def test_missing_company_denied_even_with_role_and_branch_ok(self):
		with patch(f"{MODULE}.frappe.get_roles", return_value=["Chef"]), \
			patch("ury.ury.api.ury_kot_execution_service._require_kot_branch_scope"):
			with self.assertRaises(svc.ItemExecutionError) as ctx:
				svc._require_execution_actor("chef@ury.test", "Branch A", None)
			self.assertEqual(ctx.exception.reason_code, svc.NOT_PERMITTED)

	def test_manager_roles_are_also_execution_roles(self):
		"""EXECUTION_ROLES = MANAGER_ROLES | {Chef, URY Chef, Production
		Manager} -- a manager can execute items directly, not just chefs."""
		with patch(f"{MODULE}.frappe.get_roles", return_value=["URY Manager"]), \
			patch("ury.ury.api.ury_kot_execution_service._require_kot_branch_scope"):
			svc._require_execution_actor("manager@ury.test", "Branch A", "Company A")  # must not raise
