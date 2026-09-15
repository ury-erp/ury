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

  2. A REAL, VERIFIED GAP (documented here, not silently papered over):
     `_require_kot_branch_scope()` -- the function this module's own
     docstring says exists to enforce "V3-50's Branch, Company, and
     Permission Invariants" (`BRANCH_SCOPE_MISMATCH` is a defined,
     documented reason code) -- is defined at module level but is NEVER
     CALLED anywhere in `_transition()` or any of the three whitelisted
     entrypoints. Confirmed by direct source read AND by
     `grep -n "_require_kot_branch_scope" ury_kot_execution_service.py`
     returning only its own `def` line -- zero call sites. This means, as
     the code stands, ANY authenticated user (not just Administrator/System
     Manager) can call `start_execution`/`mark_ready`/`serve_execution` on a
     KOT belonging to a branch they have no relationship to at all -- the
     branch-scoped multi-tenancy boundary this track's Phase 4 explicitly
     prioritized is unenforced for this module's write-path.

     `test_branch_scope_helper_itself_is_correct` proves the helper's own
     logic is fine in isolation (it does reject a mismatched branch when
     called directly) -- so this is a wiring gap (helper written, never
     invoked), not a broken helper. `test_transition_never_calls_branch_scope_guard`
     is the regression-guard/documentation test: it will start FAILING (in
     the useful direction) the moment someone wires the guard in, which is
     the point -- it exists to make the gap visible in CI rather than
     silently assumed-fixed.

     This is flagged for follow-up; fixing it (wiring the call in) is a
     product behavior change out of scope for this test-writing pass and
     needs its own review given the blast radius (would start rejecting
     currently-succeeding cross-branch calls in production).
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
	"""Documents a real, verified authorization gap: see module docstring
	above. Not a mock artifact -- confirmed by static analysis of the real
	source (zero call sites for `_require_kot_branch_scope` in this file)."""

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

	def test_transition_never_calls_branch_scope_guard(self):
		"""GAP: start_execution succeeds for a KOT scoped to "Branch A" from
		a session whose active branch is "Branch B" (a different tenant's
		branch) -- because `_require_kot_branch_scope` is never invoked by
		`_transition`. This test passes today because the guard is unwired;
		it is the documented regression marker for that fact, not an
		endorsement of the behavior. If this test starts failing after a
		future change wires the guard in, that is progress -- update/remove
		this test as part of that fix, don't just re-mock around it."""
		fake_doc = MagicMock()
		fake_doc.as_dict.return_value = {"name": "UKE-0002", "state": svc.IN_PREPARATION}

		with patch(f"{MODULE}._require_execution_doctype"), \
			patch(f"{MODULE}._require_kot"), \
			patch(f"{MODULE}.frappe.session") as mock_session, \
			patch(f"{MODULE}._find_prior_result", return_value=None), \
			patch(f"{MODULE}._kot_scope", return_value=("Branch A", "Company A", None)), \
			patch(f"{MODULE}._lock_execution_row", return_value=None), \
			patch(f"{MODULE}.frappe.get_doc", return_value=fake_doc), \
			patch(f"{MODULE}.append_audit"), \
			patch(f"{MODULE}._require_kot_branch_scope") as mock_branch_guard, \
			patch("ury.ury_pos.api.getBranch", return_value="Branch B"):
			mock_session.user = "waiter-in-branch-b@ury.test"
			# No role check, no branch-scope check -- succeeds regardless of
			# the caller's actual branch.
			result = svc.start_execution("KOT-0001", "idem-1")
			self.assertEqual(result["name"], "UKE-0002")
			self.assertEqual(result["state"], svc.IN_PREPARATION)
			mock_branch_guard.assert_not_called()
