# Copyright (c) 2026, Tridz Technologies Pvt. Ltd and contributors
# See license.txt
"""Edge-case coverage for three previously-untested state-machine paths
(task B6):

  1. `ury_kot_display.served_kot_list` (~line 208) -- branch filtering and
     empty-result handling. No direct test existed for this endpoint.
  2. `ury_kot_cancellation_service.cancel_after_ready` (~line 372) --
     double-cancel is rejected (second call on an already
     CANCELLED_AFTER_READY row), and an already-SERVED item cannot be
     cancelled via this path either.
  3. `ury_kot_item_execution_service.mark_item_ready` (~line 461) --
     out-of-order transition (QUEUED straight to READY, skipping
     IN_PREPARATION) and already-READY idempotency (replay of the same
     idempotency_key on a row already in READY).

Mocked per this track's established convention for these three modules
(patching `frappe.db.sql`, `frappe.db.exists`, `frappe.db.get_value`,
`frappe.get_all`, `frappe.get_doc`, and `frappe.session`/`frappe.get_roles`
so the module under test never touches a real database) -- the same
pattern used by `test_ury_kot_cancellation_service.py`,
`test_ury_kot_item_execution_service.py`, and
`test_ury_kot_display_serve_and_list.py`. Not executed against a live
bench/site in this environment; hand-traced against the source.
"""

from unittest.mock import MagicMock, patch

from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_kot_cancellation_service import (
	CancellationError,
	cancel_after_ready,
)
from ury.ury.api.ury_kot_display import served_kot_list
from ury.ury.api.ury_kot_execution_service import (
	CANCELLED_AFTER_READY,
	READY,
	SERVED,
)
from ury.ury.api.ury_kot_item_execution_service import (
	ItemExecutionError,
	QUEUED,
	READY as ITEM_READY,
	mark_item_ready,
)

DISPLAY_MODULE = "ury.ury.api.ury_kot_display"
CANCELLATION_MODULE = "ury.ury.api.ury_kot_cancellation_service"
ITEM_EXECUTION_MODULE = "ury.ury.api.ury_kot_item_execution_service"


# ---------------------------------------------------------------------------
# served_kot_list
# ---------------------------------------------------------------------------


class TestServedKotListBranchFiltering(FrappeTestCase):
	"""`served_kot_list` filters `URY KOT` by the caller's own branch
	(via `getBranch()`), not globally. Verify the branch actually used in
	the `frappe.get_list` filter is the one `getBranch()` returned, and
	that an empty result set is handled without error.
	"""

	def _pos_profile_values(self, branch):
		def _get_value(doctype, filters=None, fieldname=None, *args, **kwargs):
			if doctype == "POS Profile":
				# custom_kot_warning_time / custom_reset_order_number_daily /
				# custom_kot_alert lookups -- distinct per fieldname so the
				# test can tell them apart if needed.
				if fieldname == "custom_kot_warning_time":
					return 10
				if fieldname == "custom_reset_order_number_daily":
					return 0
				if fieldname == "custom_kot_alert":
					return 1
				return None
			if doctype == "URY KOT":
				return None
			return None

		return _get_value

	def test_filters_by_caller_branch_and_returns_empty_when_no_kots(self):
		with patch(f"{DISPLAY_MODULE}.getBranch", return_value="Branch B") as mock_get_branch, \
			patch(f"{DISPLAY_MODULE}.frappe.utils.now", return_value="2026-01-01 12:00:00"), \
			patch(f"{DISPLAY_MODULE}.frappe.utils.add_to_date", return_value="2026-01-01 09:00:00"), \
			patch(f"{DISPLAY_MODULE}.frappe.db.get_value", side_effect=self._pos_profile_values("Branch B")), \
			patch(f"{DISPLAY_MODULE}.frappe.get_list", return_value=[]) as mock_get_list:
			result = served_kot_list()

		mock_get_branch.assert_called_once()
		# The branch filter passed to frappe.get_list must be exactly the
		# branch getBranch() resolved -- not hardcoded, not omitted.
		_, kwargs = mock_get_list.call_args
		self.assertEqual(kwargs["filters"]["branch"], "Branch B")
		self.assertEqual(kwargs["filters"]["order_status"], "Served")

		# Empty result set: no KOTs for this branch is a normal, valid
		# response shape -- not an error.
		self.assertEqual(result["KOT"], [])
		self.assertEqual(result["Branch"], "Branch B")

	def test_does_not_leak_kots_from_a_different_branch(self):
		"""frappe.get_list is the only place branch scoping happens (this
		module does no client-side branch filtering of the returned rows),
		so the real assertion is on the filter dict itself: a KOT belonging
		to another branch must never be requested from get_list in the
		first place.
		"""
		with patch(f"{DISPLAY_MODULE}.getBranch", return_value="Branch A"), \
			patch(f"{DISPLAY_MODULE}.frappe.utils.now", return_value="2026-01-01 12:00:00"), \
			patch(f"{DISPLAY_MODULE}.frappe.utils.add_to_date", return_value="2026-01-01 09:00:00"), \
			patch(f"{DISPLAY_MODULE}.frappe.db.get_value", side_effect=self._pos_profile_values("Branch A")), \
			patch(f"{DISPLAY_MODULE}.frappe.get_list", return_value=[]) as mock_get_list:
			served_kot_list()

		_, kwargs = mock_get_list.call_args
		self.assertNotEqual(kwargs["filters"].get("branch"), "Branch B")
		self.assertEqual(kwargs["filters"]["branch"], "Branch A")


# ---------------------------------------------------------------------------
# cancel_after_ready -- double-cancel / already-served rejection
# ---------------------------------------------------------------------------


def _existence_side_effect(kot_exists=True):
	def _exists(doctype, name=None):
		if doctype == "DocType":
			return True
		if doctype == "URY KOT":
			return kot_exists
		return False

	return _exists


def _kot_scope_patches(branch="Branch A", company="Company A", production="UNIT-1"):
	def _get_value(doctype, *args, **kwargs):
		import frappe

		if doctype == "URY KOT":
			return frappe._dict({"branch": branch, "production": production})
		if doctype == "Branch":
			return company
		return None

	return _get_value


def _existing_row(name="EXEC-1", state=READY):
	import frappe

	return frappe._dict({"name": name, "state": state})


class TestCancelAfterReadyRejectsDoubleCancelAndAlreadyServed(FrappeTestCase):
	def setUp(self):
		now_patcher = patch(f"{CANCELLATION_MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
		now_patcher.start()
		self.addCleanup(now_patcher.stop)

	def _run_and_expect_invalid_transition(self, locked_state):
		with patch(f"{CANCELLATION_MODULE}.frappe.db.exists", side_effect=_existence_side_effect()), \
			patch(f"{CANCELLATION_MODULE}.frappe.db.sql", return_value=[dict(_existing_row(state=locked_state))]), \
			patch(f"{CANCELLATION_MODULE}.frappe.db.get_value", side_effect=_kot_scope_patches()), \
			patch(f"{CANCELLATION_MODULE}.frappe.session") as mock_session, \
			patch(f"{CANCELLATION_MODULE}.frappe.get_roles", return_value=["URY Manager"]):
			mock_session.user = "manager1@example.com"
			with self.assertRaises(CancellationError) as ctx:
				cancel_after_ready(
					"KOT-1", manager_confirmed_by="manager1@example.com",
				)
		self.assertEqual(ctx.exception.reason_code, "INVALID_EXECUTION_TRANSITION")

	def test_double_cancel_after_ready_is_rejected(self):
		"""A KOT already moved to CANCELLED_AFTER_READY cannot be
		cancelled again through this same path -- `_current_state` no
		longer reports READY, so the function must fail closed rather
		than silently re-writing the same terminal state or throwing an
		unrelated error.
		"""
		self._run_and_expect_invalid_transition(CANCELLED_AFTER_READY)

	def test_already_served_item_cannot_be_cancelled_after_ready(self):
		"""Once an item has progressed to SERVED, `cancel_after_ready`
		(which only accepts state == READY) must reject it -- serving is a
		later, non-cancellable step in this KOT-level execution lifecycle.
		"""
		self._run_and_expect_invalid_transition(SERVED)


# ---------------------------------------------------------------------------
# mark_item_ready -- out-of-order transition and already-ready idempotency
# ---------------------------------------------------------------------------


class TestMarkItemReadyStateEdges(FrappeTestCase):
	def setUp(self):
		now_patcher = patch(f"{ITEM_EXECUTION_MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
		now_patcher.start()
		self.addCleanup(now_patcher.stop)

	def _row(self, **overrides):
		import frappe

		base = {
			"name": "ITEM-EXEC-1",
			"state": QUEUED,
			"idempotency_key": None,
			"revision_key": "rev-1",
			"started_by": None,
			"started_at": None,
			"ready_by": None,
			"ready_at": None,
			"served_by": None,
			"served_at": None,
			"kot": "KOT-1",
			"kot_item": "KOT-ITEM-1",
			"branch": "Branch A",
			"company": "Company A",
			"production_unit": "UNIT-1",
			"audit_log": "[]",
		}
		base.update(overrides)
		return frappe._dict(base)

	def _make_doc(self, row):
		doc = MagicMock()
		doc.audit_log = row["audit_log"]
		doc.kot = row["kot"]
		doc.name = row["name"]

		def _set(field, value):
			setattr(doc, field, value)

		doc.set = MagicMock(side_effect=_set)
		# as_dict reflects the mutated row for _result_dict()
		mutated = dict(row)

		def _as_dict():
			mutated["state"] = doc.state
			return mutated

		doc.as_dict = _as_dict
		doc.state = row["state"]
		return doc

	def test_out_of_order_transition_queued_direct_to_ready_is_allowed(self):
		"""`_transition`'s guard explicitly permits QUEUED -> READY
		(skipping IN_PREPARATION/start) for a made-to-order item that is
		marked ready in one step. This is intentional, not a gap: assert
		it succeeds and lands in READY with no error, matching the
		module's documented transition table (QUEUED allows target
		IN_PREPARATION or READY).
		"""
		row = self._row(state=QUEUED, idempotency_key=None)
		doc = self._make_doc(row)

		with patch(f"{ITEM_EXECUTION_MODULE}._require_item_execution_doctype"), \
			patch(f"{ITEM_EXECUTION_MODULE}._require_kot_item"), \
			patch(f"{ITEM_EXECUTION_MODULE}.frappe.session") as mock_session, \
			patch(f"{ITEM_EXECUTION_MODULE}._kot_for_item", return_value="KOT-1"), \
			patch(f"{ITEM_EXECUTION_MODULE}._kot_scope", return_value=("Branch A", "Company A", "UNIT-1")), \
			patch(f"{ITEM_EXECUTION_MODULE}._require_execution_actor"), \
			patch(f"{ITEM_EXECUTION_MODULE}._find_prior_result", return_value=None), \
			patch(f"{ITEM_EXECUTION_MODULE}._lock_item_execution_row", return_value=row), \
			patch(f"{ITEM_EXECUTION_MODULE}.frappe.get_doc", return_value=doc), \
			patch(f"{ITEM_EXECUTION_MODULE}._audit"), \
			patch(f"{ITEM_EXECUTION_MODULE}._sync_kot_execution"), \
			patch("ury.ury.api.ury_stock_policy.get_branch_stock_policy") as mock_policy:
			mock_session.user = "chef1@example.com"
			mock_policy.return_value = MagicMock(realtime_production_posting_enabled=False)

			result = mark_item_ready("KOT-ITEM-1", "idem-key-1")

		self.assertEqual(result["state"], ITEM_READY)
		self.assertFalse(result["idempotent_replay"])
		doc.save.assert_called_once()

	def test_already_ready_replay_is_idempotent_not_an_error(self):
		"""Replaying `mark_item_ready` with the same idempotency_key
		against a row already in READY must return the existing result
		with `idempotent_replay=True` -- it must NOT raise
		INVALID_EXECUTION_TRANSITION just because target == current
		state.
		"""
		row = self._row(state=ITEM_READY, idempotency_key="idem-key-1", ready_by="chef1@example.com", ready_at="2024-01-01 00:00:00")

		with patch(f"{ITEM_EXECUTION_MODULE}._require_item_execution_doctype"), \
			patch(f"{ITEM_EXECUTION_MODULE}._require_kot_item"), \
			patch(f"{ITEM_EXECUTION_MODULE}.frappe.session") as mock_session, \
			patch(f"{ITEM_EXECUTION_MODULE}._kot_for_item", return_value="KOT-1"), \
			patch(f"{ITEM_EXECUTION_MODULE}._kot_scope", return_value=("Branch A", "Company A", "UNIT-1")), \
			patch(f"{ITEM_EXECUTION_MODULE}._require_execution_actor"), \
			patch(f"{ITEM_EXECUTION_MODULE}._find_prior_result", return_value=None), \
			patch(f"{ITEM_EXECUTION_MODULE}._lock_item_execution_row", return_value=row), \
			patch(f"{ITEM_EXECUTION_MODULE}.frappe.get_doc") as mock_get_doc, \
			patch(f"{ITEM_EXECUTION_MODULE}._audit") as mock_audit, \
			patch(f"{ITEM_EXECUTION_MODULE}._sync_kot_execution") as mock_sync:
			mock_session.user = "chef1@example.com"

			result = mark_item_ready("KOT-ITEM-1", "idem-key-1")

		self.assertEqual(result["state"], ITEM_READY)
		self.assertTrue(result["idempotent_replay"])
		# No write path was touched: same-state replay short-circuits
		# before frappe.get_doc/save, _audit, or _sync_kot_execution.
		mock_get_doc.assert_not_called()
		mock_audit.assert_not_called()
		mock_sync.assert_not_called()

	def test_out_of_order_transition_backward_from_served_is_rejected(self):
		"""Sanity check on the other direction of "out of order": a row
		already SERVED cannot be pushed back to READY -- SERVED is not in
		the guard's allowed source-state set.
		"""
		row = self._row(state=SERVED, idempotency_key="idem-key-2")

		with patch(f"{ITEM_EXECUTION_MODULE}._require_item_execution_doctype"), \
			patch(f"{ITEM_EXECUTION_MODULE}._require_kot_item"), \
			patch(f"{ITEM_EXECUTION_MODULE}.frappe.session") as mock_session, \
			patch(f"{ITEM_EXECUTION_MODULE}._kot_for_item", return_value="KOT-1"), \
			patch(f"{ITEM_EXECUTION_MODULE}._kot_scope", return_value=("Branch A", "Company A", "UNIT-1")), \
			patch(f"{ITEM_EXECUTION_MODULE}._require_execution_actor"), \
			patch(f"{ITEM_EXECUTION_MODULE}._find_prior_result", return_value=None), \
			patch(f"{ITEM_EXECUTION_MODULE}._lock_item_execution_row", return_value=row):
			mock_session.user = "chef1@example.com"
			with self.assertRaises(ItemExecutionError) as ctx:
				mark_item_ready("KOT-ITEM-1", "idem-key-3")

		self.assertEqual(ctx.exception.reason_code, "INVALID_EXECUTION_TRANSITION")
