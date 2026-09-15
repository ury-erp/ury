"""Permission/authorization tests for `ury_kot_execution_service.py`'s three
whitelisted transition endpoints (`start_execution`, `mark_ready`,
`serve_execution`) -- this module had zero permission coverage before this
file (see TRACK.md Phase 4).

Mock-based unit tests (frappe.db.* / frappe.get_roles / frappe.session),
matching the established pattern in this package
(`ury/ury/hooks/test_ury_pos_closing_entry.py`,
`ury/ury/report_api/test_commission.py`): the behaviour under test is
authorization control flow, not a real DB round-trip.

Two things are pinned here:

  1. `mark_ready`'s `manager_override` gate (`_require_manager`) genuinely
     works: a non-manager passing `manager_override=True` is rejected with
     `ExecutionError(NOT_PERMITTED)`; a real manager is allowed through to
     the transition logic.

  2. A REAL GAP was found and FIXED here: `_require_kot_branch_scope()` --
     the function this module's own docstring says exists to enforce
     "V3-50's Branch, Company, and Permission Invariants"
     (`BRANCH_SCOPE_MISMATCH` is a defined, documented reason code) -- was
     defined at module level but never called anywhere in `_transition()`
     or any of the three whitelisted entrypoints (confirmed by direct
     source read and `grep`, which returned only its own `def` line before
     the fix). This meant ANY authenticated user (not just
     Administrator/System Manager) could call
     `start_execution`/`mark_ready`/`serve_execution` on a KOT belonging to
     a branch they have no relationship to at all -- the branch-scoped
     multi-tenancy boundary this track's Phase 4 explicitly prioritized was
     unenforced for this module's write-path, matching the sibling module
     `ury_kot_item_execution_service.py`'s already-correct
     `_require_kot_branch_scope(branch, user)` call in its own
     `_require_execution_actor()`.

     Fixed by adding the equivalent call in `_transition()`, right after
     `branch, company, production_unit = _kot_scope(kot)` -- the same
     point in the control flow the item-execution sibling uses.
     `test_branch_scope_helper_itself_is_correct` already proved the
     helper's own logic was fine in isolation; `test_transition_now_enforces_branch_scope_guard`
     (below) is the regression test proving it's actually wired in and a
     cross-branch caller is rejected, replacing the prior
     gap-documentation test of the same name that asserted the opposite.
"""

from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api import ury_kot_execution_service as svc

MODULE = "ury.ury.api.ury_kot_execution_service"


class TestMarkReadyManagerOverrideGate(FrappeTestCase):
	"""`mark_ready(..., manager_override=True)` must reject a non-manager
	and allow a real manager through to the transition attempt."""

	def test_non_manager_with_override_denied(self):
		with patch(f"{MODULE}._require_execution_doctype"), \
			patch(f"{MODULE}._require_kot"), \
			patch(f"{MODULE}.frappe.session") as mock_session, \
			patch(f"{MODULE}.frappe.get_roles", return_value=["Employee"]), \
			patch(f"{MODULE}._find_prior_result", return_value=None), \
			patch(f"{MODULE}._kot_scope", return_value=("Branch A", "Company A", None)), \
			patch(f"{MODULE}._require_kot_branch_scope"), \
			patch(f"{MODULE}._lock_execution_row", return_value=None):
			mock_session.user = "waiter@ury.test"
			with self.assertRaises(svc.ExecutionError) as ctx:
				svc.mark_ready("KOT-0001", "idem-1", manager_override=True)
			self.assertEqual(ctx.exception.reason_code, svc.NOT_PERMITTED)

	def test_manager_with_override_is_not_rejected_by_the_gate(self):
		# current_state starts as QUEUED (no locked row); manager_override
		# widens READY-from-non-IN_PREPARATION only for an actual manager --
		# reaching the write path (not raising NOT_PERMITTED) proves the
		# gate let a real manager through.
		fake_doc = MagicMock()
		fake_doc.as_dict.return_value = {"name": "UKE-0001", "state": svc.READY}

		with patch(f"{MODULE}._require_execution_doctype"), \
			patch(f"{MODULE}._require_kot"), \
			patch(f"{MODULE}.frappe.session") as mock_session, \
			patch(f"{MODULE}.frappe.get_roles", return_value=["URY Manager"]), \
			patch(f"{MODULE}._find_prior_result", return_value=None), \
			patch(f"{MODULE}._kot_scope", return_value=("Branch A", "Company A", None)), \
			patch(f"{MODULE}._require_kot_branch_scope"), \
			patch(f"{MODULE}._lock_execution_row", return_value=None), \
			patch(f"{MODULE}.frappe.get_doc", return_value=fake_doc), \
			patch(f"{MODULE}.append_audit"):
			mock_session.user = "manager@ury.test"
			result = svc.mark_ready("KOT-0001", "idem-1", manager_override=True)
			self.assertEqual(result["name"], "UKE-0001")
			self.assertEqual(result["state"], svc.READY)
			fake_doc.insert.assert_called_once_with(ignore_permissions=False)

	def test_no_override_never_consults_manager_roles(self):
		# manager_override defaults to False -- _require_manager's own body
		# short-circuits on `if not manager_override: return`, so a normal
		# start_execution/mark_ready call for a user with zero roles must
		# never be blocked by the manager gate at all (it may still fail
		# the ordinary forward-transition check, which is not this test's
		# concern).
		with patch(f"{MODULE}.frappe.get_roles") as mock_roles:
			svc._require_manager("nobody@ury.test", manager_override=False)
			mock_roles.assert_not_called()


class TestBranchScopeGapFinding(FrappeTestCase):
	"""Covers the branch-scope guard's own logic and, below, that it is
	actually wired into `_transition()` -- see module docstring above for
	the gap this closes."""

	def test_branch_scope_helper_itself_is_correct(self):
		"""The helper's own logic is sound in isolation: a non-privileged
		user whose active branch differs from the KOT's branch is rejected.
		This proves the gap below is a wiring omission, not a broken
		helper."""
		with patch(f"{MODULE}.frappe.session") as mock_session, \
			patch(f"{MODULE}.frappe.get_roles", return_value=["Employee"]), \
			patch("ury.ury_pos.api.getBranch", return_value="Branch B"):
			mock_session.user = "waiter@ury.test"
			with self.assertRaises(svc.ExecutionError) as ctx:
				svc._require_kot_branch_scope("Branch A", user="waiter@ury.test")
			self.assertEqual(ctx.exception.reason_code, svc.BRANCH_SCOPE_MISMATCH)

	def test_branch_scope_helper_allows_matching_branch(self):
		with patch(f"{MODULE}.frappe.session") as mock_session, \
			patch(f"{MODULE}.frappe.get_roles", return_value=["Employee"]), \
			patch("ury.ury_pos.api.getBranch", return_value="Branch A"):
			mock_session.user = "waiter@ury.test"
			svc._require_kot_branch_scope("Branch A", user="waiter@ury.test")  # must not raise

	def test_transition_now_enforces_branch_scope_guard(self):
		"""FIXED: start_execution now rejects a KOT scoped to "Branch A" when
		the caller's active branch is "Branch B" (a different tenant's
		branch) -- `_require_kot_branch_scope` is invoked by `_transition`
		right after `_kot_scope` resolves the KOT's branch, matching the
		sibling `ury_kot_item_execution_service.py`'s existing pattern."""
		with patch(f"{MODULE}._require_execution_doctype"), \
			patch(f"{MODULE}._require_kot"), \
			patch(f"{MODULE}.frappe.session") as mock_session, \
			patch(f"{MODULE}.frappe.get_roles", return_value=["Employee"]), \
			patch(f"{MODULE}._find_prior_result", return_value=None), \
			patch(f"{MODULE}._kot_scope", return_value=("Branch A", "Company A", None)), \
			patch("ury.ury_pos.api.getBranch", return_value="Branch B"):
			mock_session.user = "waiter-in-branch-b@ury.test"
			with self.assertRaises(svc.ExecutionError) as ctx:
				svc.start_execution("KOT-0001", "idem-1")
			self.assertEqual(ctx.exception.reason_code, svc.BRANCH_SCOPE_MISMATCH)

	def test_transition_allows_caller_in_the_same_branch(self):
		"""A caller whose active branch matches the KOT's branch is not
		rejected by the guard and reaches the write path."""
		fake_doc = MagicMock()
		fake_doc.as_dict.return_value = {"name": "UKE-0002", "state": svc.IN_PREPARATION}

		with patch(f"{MODULE}._require_execution_doctype"), \
			patch(f"{MODULE}._require_kot"), \
			patch(f"{MODULE}.frappe.session") as mock_session, \
			patch(f"{MODULE}.frappe.get_roles", return_value=["Employee"]), \
			patch(f"{MODULE}._find_prior_result", return_value=None), \
			patch(f"{MODULE}._kot_scope", return_value=("Branch A", "Company A", None)), \
			patch(f"{MODULE}._lock_execution_row", return_value=None), \
			patch(f"{MODULE}.frappe.get_doc", return_value=fake_doc), \
			patch(f"{MODULE}.append_audit"), \
			patch("ury.ury_pos.api.getBranch", return_value="Branch A"):
			mock_session.user = "waiter-in-branch-a@ury.test"
			result = svc.start_execution("KOT-0001", "idem-1")
			self.assertEqual(result["name"], "UKE-0002")
			self.assertEqual(result["state"], svc.IN_PREPARATION)
