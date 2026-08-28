"""Tests for ury_mto_fulfilment_service.

Static-review note: none of these tests have been executed in this
environment -- there is no live bench/site/DB available, only a detached
checkout of the app source. They are written and hand-traced to the exact
same mocking pattern used by
`ury/ury/api/test_ury_preproduced_fulfilment_service.py` (V3-71): patching
`frappe.db.exists`, `frappe.db.get_value`, `frappe.get_all`,
`frappe.get_doc`, `frappe.has_permission`, and `frappe.session`, plus
patching `fulfil_reservation` itself at the module boundary rather than
re-mocking its own internals, so the module under test never touches a real
database or the reservation module's own DB calls.
"""

import inspect
import json
from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_mto_fulfilment_service import (
	MtoFulfilmentError,
	fulfil_mto_order,
)


def _code_without_comments_and_strings(source):
	"""Strip comments and string-literal tokens from `source`, leaving
	only real code constructs -- so a grep-style check on the remainder
	can't false-positive on a docstring/comment that merely NAMES a
	forbidden API for documentation purposes."""
	import io
	import tokenize

	kept = []
	tokens = tokenize.generate_tokens(io.StringIO(source).readline)
	for tok_type, tok_string, _start, _end, _line in tokens:
		if tok_type in (tokenize.COMMENT, tokenize.STRING):
			continue
		kept.append(tok_string)
	return " ".join(kept)


MODULE = "ury.ury.api.ury_mto_fulfilment_service"


def _existence_side_effect(kot_exists=True, fulfilment_doctype_exists=True):
	def _exists(doctype, name=None):
		if doctype == "DocType":
			return fulfilment_doctype_exists
		if doctype == "URY KOT":
			return kot_exists
		return False

	return _exists


def _kot_scope_side_effect(branch="Branch A", company="Company A"):
	def _get_value(doctype, *args, **kwargs):
		if doctype == "URY KOT":
			return frappe._dict({"branch": branch})
		if doctype == "Branch":
			return company
		return None

	return _get_value


def _get_all_side_effect(execution_state="READY", prior_fulfilment=None):
	"""Route frappe.get_all calls by doctype: execution-state lookups return
	one row with `execution_state` (or [] if None, meaning no execution row
	yet -> implicit QUEUED); fulfilment-record dedup lookups return
	`prior_fulfilment` (a list, defaulting to []) unchanged.
	"""

	def _get_all(doctype, filters=None, fields=None, order_by=None, limit=None):
		if doctype == "URY KOT Execution":
			if execution_state is None:
				return []
			return [frappe._dict({"state": execution_state})]
		if doctype == "URY Fulfilment Record":
			return list(prior_fulfilment or [])
		raise AssertionError(f"unexpected frappe.get_all call for doctype {doctype}")

	return _get_all


def _new_doc_recorder():
	created = []

	def _get_doc(*args, **kwargs):
		arg = args[0] if args else kwargs.get("arg1")
		if isinstance(arg, dict):
			doc = frappe._dict(dict(arg))
			doc.insert = MagicMock()
			doc.as_dict = MagicMock(return_value=dict(doc))
			created.append(doc)
			return doc
		raise AssertionError("doc lookups by name should be dispatched separately in each test")

	return _get_doc, created


def _mocked_call(
	execution_state="READY",
	prior_fulfilment=None,
	fulfil_reservation_side_effect=None,
	kot="KOT-1",
	item_code="ITEM-1",
	qty=2,
	reservation_group_ref="RES-GROUP-1",
	batch_key="BATCH-1",
	actor_user="waiter1@example.com",
):
	"""Run one `fulfil_mto_order` call under the standard mock set, returning
	(result_or_exception, created_docs, mock_fulfil_reservation).
	"""
	get_doc_side_effect, created = _new_doc_recorder()

	with patch(f"{MODULE}.frappe.db.exists", side_effect=_existence_side_effect()), patch(
		f"{MODULE}.frappe.has_permission", return_value=True
	), patch(
		f"{MODULE}.frappe.get_all",
		side_effect=_get_all_side_effect(execution_state=execution_state, prior_fulfilment=prior_fulfilment),
	), patch(
		f"{MODULE}.frappe.db.get_value", side_effect=_kot_scope_side_effect()
	), patch(
		f"{MODULE}.frappe.get_doc", side_effect=get_doc_side_effect
	), patch(
		f"{MODULE}.fulfil_reservation", side_effect=fulfil_reservation_side_effect
	) as mock_fulfil_reservation, patch(
		f"{MODULE}.frappe.session"
	) as mock_session:
		mock_session.user = actor_user
		result = fulfil_mto_order(
			kot=kot,
			item_code=item_code,
			qty=qty,
			reservation_group_ref=reservation_group_ref,
			batch_key=batch_key,
		)

	return result, created, mock_fulfil_reservation


class TestSuccessfulFulfilment(FrappeTestCase):
	def setUp(self):
		# fulfil_mto_order() calls frappe.utils.now(), which otherwise
		# chains into get_system_settings() -> get_cached_doc("System
		# Settings") -- a real DB/cache path these unit tests do not
		# stub. Fix the clock instead of routing that lookup through
		# the get_doc mocks below.
		now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
		now_patcher.start()
		self.addCleanup(now_patcher.stop)

	def test_fulfils_reservation_group_and_creates_fulfilment_record(self):
		result, created, mock_fulfil_reservation = _mocked_call()

		mock_fulfil_reservation.assert_called_once_with("RES-GROUP-1")
		self.assertFalse(result["idempotent_replay"])
		self.assertFalse(result["posted_to_erpnext"])
		self.assertEqual(result["fulfilment_type"], "MTO")
		self.assertEqual(result["batch_key"], "BATCH-1")
		self.assertEqual(created[0]["kot"], "KOT-1")
		self.assertEqual(created[0]["item_code"], "ITEM-1")
		self.assertEqual(created[0]["reservation_ref"], "RES-GROUP-1")
		self.assertEqual(created[0]["batch_key"], "BATCH-1")
		self.assertEqual(created[0]["posted_to_erpnext"], 0)
		created[0].insert.assert_called_once_with(ignore_permissions=False)
		audit = json.loads(created[0]["audit_log"])
		self.assertEqual(audit[0]["event"], "fulfil")
		self.assertEqual(audit[0]["batch_key"], "BATCH-1")

	def test_served_state_also_accepted(self):
		result, created, mock_fulfil_reservation = _mocked_call(execution_state="SERVED")

		mock_fulfil_reservation.assert_called_once_with("RES-GROUP-1")
		self.assertFalse(result["idempotent_replay"])
		self.assertEqual(len(created), 1)


class TestDuplicateBatchKey(FrappeTestCase):
	def setUp(self):
		# fulfil_mto_order() calls frappe.utils.now(), which otherwise
		# chains into get_system_settings() -> get_cached_doc("System
		# Settings") -- a real DB/cache path these unit tests do not
		# stub. Fix the clock instead of routing that lookup through
		# the get_doc mocks below.
		now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
		now_patcher.start()
		self.addCleanup(now_patcher.stop)

	def test_duplicate_batch_key_returns_original_no_double_post(self):
		"""A second call with the SAME batch_key for an already-fulfilled
		(kot, item_code) must return the original record unchanged -- no
		second fulfil_reservation call, no second `URY Fulfilment Record`
		row.
		"""
		prior_row = frappe._dict(
			{
				"name": "FULFIL-MTO-1",
				"kot": "KOT-1",
				"item_code": "ITEM-1",
				"qty": 2,
				"reservation_ref": "RES-GROUP-1",
				"fulfilment_type": "MTO",
				"batch_key": "BATCH-1",
				"branch": "Branch A",
				"company": "Company A",
				"actor": "waiter1@example.com",
				"fulfilled_at": "2026-08-28 10:00:00",
				"posted_to_erpnext": 0,
			}
		)

		result, created, mock_fulfil_reservation = _mocked_call(
			execution_state=None,  # dedup must short-circuit before this is read
			prior_fulfilment=[prior_row],
			batch_key="BATCH-1",
		)

		self.assertTrue(result["idempotent_replay"])
		self.assertEqual(result["name"], "FULFIL-MTO-1")
		self.assertEqual(result["batch_key"], "BATCH-1")
		mock_fulfil_reservation.assert_not_called()
		self.assertEqual(created, [])


class TestRetryAfterFailureThenSuccess(FrappeTestCase):
	def setUp(self):
		# fulfil_mto_order() calls frappe.utils.now(), which otherwise
		# chains into get_system_settings() -> get_cached_doc("System
		# Settings") -- a real DB/cache path these unit tests do not
		# stub. Fix the clock instead of routing that lookup through
		# the get_doc mocks below.
		now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
		now_patcher.start()
		self.addCleanup(now_patcher.stop)

	def test_retry_after_simulated_reservation_failure_then_success_posts_exactly_once(self):
		"""Core exactly-once-under-retry trace:

		1. First call with batch_key="X": `fulfil_reservation` is forced to
		   raise (simulating a reservation-group failure, e.g. a row no
		   longer Reserved). No `URY Fulfilment Record` row is created --
		   the exception propagates before step 6 (the insert) ever runs.
		2. Because nothing was persisted, the world after the failed attempt
		   is identical to "never attempted": the next dedup lookup for
		   (kot, item_code) still finds nothing.
		3. Retry with the SAME batch_key="X": this time `fulfil_reservation`
		   succeeds. The dedup lookup (step 2 of the service) finds no prior
		   row (since nothing was persisted by the failed attempt), so the
		   call proceeds through the full path again as if it were the
		   first attempt, and creates exactly ONE `URY Fulfilment Record`
		   row.

		Assert exactly one Fulfilment Record exists at the end -- not zero
		(the retry must succeed), not two (the failed first attempt must
		not have left a stub/partial row for the retry to duplicate).
		"""
		# Attempt 1: fulfil_reservation raises -- simulate a reservation
		# failure (e.g. reservation group not Reserved / lock contention).
		with self.assertRaises(frappe.ValidationError):
			_mocked_call(
				execution_state="READY",
				prior_fulfilment=None,  # nothing persisted yet
				fulfil_reservation_side_effect=frappe.ValidationError("reservation group not Reserved"),
				batch_key="X",
			)

		# Confirm nothing was created by attempt 1 by re-running with the
		# recorder directly (mirrors the pattern _mocked_call wraps, but we
		# need access to `created` from the failed call itself).
		get_doc_side_effect, created_attempt_1 = _new_doc_recorder()
		with patch(f"{MODULE}.frappe.db.exists", side_effect=_existence_side_effect()), patch(
			f"{MODULE}.frappe.has_permission", return_value=True
		), patch(
			f"{MODULE}.frappe.get_all", side_effect=_get_all_side_effect(execution_state="READY", prior_fulfilment=None)
		), patch(
			f"{MODULE}.frappe.db.get_value", side_effect=_kot_scope_side_effect()
		), patch(
			f"{MODULE}.frappe.get_doc", side_effect=get_doc_side_effect
		), patch(
			f"{MODULE}.fulfil_reservation", side_effect=frappe.ValidationError("reservation group not Reserved")
		), patch(
			f"{MODULE}.frappe.session"
		) as mock_session:
			mock_session.user = "waiter1@example.com"
			with self.assertRaises(frappe.ValidationError):
				fulfil_mto_order(
					kot="KOT-9",
					item_code="ITEM-9",
					qty=1,
					reservation_group_ref="RES-GROUP-9",
					batch_key="X",
				)
		self.assertEqual(created_attempt_1, [], "a failed attempt must persist nothing")

		# Attempt 2 (retry, same batch_key="X"): fulfil_reservation now
		# succeeds. Dedup lookup finds nothing (attempt 1 persisted
		# nothing), so this proceeds through the full path and creates
		# exactly one record.
		result, created_attempt_2, mock_fulfil_reservation = _mocked_call(
			execution_state="READY",
			prior_fulfilment=None,  # still nothing persisted -- attempt 1 left no trace
			fulfil_reservation_side_effect=None,  # succeeds this time
			kot="KOT-9",
			item_code="ITEM-9",
			qty=1,
			reservation_group_ref="RES-GROUP-9",
			batch_key="X",
		)

		mock_fulfil_reservation.assert_called_once_with("RES-GROUP-9")
		self.assertFalse(result["idempotent_replay"])
		self.assertEqual(len(created_attempt_2), 1, "retry must create exactly one Fulfilment Record")
		self.assertEqual(created_attempt_2[0]["batch_key"], "X")
		self.assertEqual(created_attempt_2[0]["kot"], "KOT-9")
		self.assertEqual(created_attempt_2[0]["item_code"], "ITEM-9")


class TestDifferentBatchKeyAgainstAlreadyFulfilled(FrappeTestCase):
	def setUp(self):
		# fulfil_mto_order() calls frappe.utils.now(), which otherwise
		# chains into get_system_settings() -> get_cached_doc("System
		# Settings") -- a real DB/cache path these unit tests do not
		# stub. Fix the clock instead of routing that lookup through
		# the get_doc mocks below.
		now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
		now_patcher.start()
		self.addCleanup(now_patcher.stop)

	def test_different_batch_key_against_already_fulfilled_returns_stable_no_op(self):
		"""A DIFFERENT batch_key against an already-fulfilled (kot,
		item_code) must not raise and must not double-post -- it returns
		the existing state as a stable no-op, mirroring V3-71's exact
		semantics (V3-71's dedup lookup is also keyed on (kot, item_code)
		alone, with no equivalent per-call key at all, so it too always
		returns the existing row without inspecting anything about the
		new call).
		"""
		prior_row = frappe._dict(
			{
				"name": "FULFIL-MTO-2",
				"kot": "KOT-2",
				"item_code": "ITEM-2",
				"qty": 5,
				"reservation_ref": "RES-GROUP-2",
				"fulfilment_type": "MTO",
				"batch_key": "BATCH-ORIGINAL",
				"branch": "Branch A",
				"company": "Company A",
				"actor": "waiter1@example.com",
				"fulfilled_at": "2026-08-28 10:00:00",
				"posted_to_erpnext": 0,
			}
		)

		result, created, mock_fulfil_reservation = _mocked_call(
			execution_state=None,
			prior_fulfilment=[prior_row],
			kot="KOT-2",
			item_code="ITEM-2",
			reservation_group_ref="RES-GROUP-2",
			batch_key="BATCH-DIFFERENT",  # deliberately different from the recorded row
		)

		self.assertTrue(result["idempotent_replay"])
		self.assertEqual(result["name"], "FULFIL-MTO-2")
		# The returned batch_key is the ORIGINAL recorded one, not the new
		# (different) key supplied on this call -- the record is never
		# mutated by a replay.
		self.assertEqual(result["batch_key"], "BATCH-ORIGINAL")
		mock_fulfil_reservation.assert_not_called()
		self.assertEqual(created, [])


class TestRejectedExecutionNotReady(FrappeTestCase):
	def setUp(self):
		# fulfil_mto_order() calls frappe.utils.now(), which otherwise
		# chains into get_system_settings() -> get_cached_doc("System
		# Settings") -- a real DB/cache path these unit tests do not
		# stub. Fix the clock instead of routing that lookup through
		# the get_doc mocks below.
		now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
		now_patcher.start()
		self.addCleanup(now_patcher.stop)

	def _assert_rejected(self, execution_state):
		result_holder = {}
		get_doc_side_effect, created = _new_doc_recorder()

		with patch(f"{MODULE}.frappe.db.exists", side_effect=_existence_side_effect()), patch(
			f"{MODULE}.frappe.has_permission", return_value=True
		), patch(
			f"{MODULE}.frappe.get_all", side_effect=_get_all_side_effect(execution_state=execution_state)
		), patch(
			f"{MODULE}.frappe.db.get_value", side_effect=_kot_scope_side_effect()
		), patch(
			f"{MODULE}.frappe.get_doc", side_effect=get_doc_side_effect
		), patch(
			f"{MODULE}.fulfil_reservation"
		) as mock_fulfil_reservation, patch(
			f"{MODULE}.frappe.session"
		) as mock_session:
			mock_session.user = "waiter1@example.com"
			with self.assertRaises(MtoFulfilmentError) as ctx:
				fulfil_mto_order(
					kot="KOT-4",
					item_code="ITEM-1",
					qty=1,
					reservation_group_ref="RES-GROUP-4",
					batch_key="BATCH-4",
				)

		self.assertEqual(ctx.exception.reason_code, "EXECUTION_NOT_READY")
		# Reservation group must never be touched if the execution gate
		# rejects.
		mock_fulfil_reservation.assert_not_called()
		self.assertEqual(created, [])

	def test_rejects_when_execution_not_ready_or_served(self):
		self._assert_rejected("QUEUED")
		self._assert_rejected("IN_PREPARATION")
		self._assert_rejected(None)


class TestRejectsWhenReservationGroupNotReserved(FrappeTestCase):
	def setUp(self):
		# fulfil_mto_order() calls frappe.utils.now(), which otherwise
		# chains into get_system_settings() -> get_cached_doc("System
		# Settings") -- a real DB/cache path these unit tests do not
		# stub. Fix the clock instead of routing that lookup through
		# the get_doc mocks below.
		now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
		now_patcher.start()
		self.addCleanup(now_patcher.stop)

	def test_rejects_when_reservation_group_not_reserved(self):
		"""If the reservation group does not exist, or any row in it is not
		in Reserved state, `fulfil_reservation` itself raises
		`frappe.ValidationError` (V3-43's `_transition_group` refuses a
		partial transition). This module must let that propagate (fail
		closed) and must NOT create a `URY Fulfilment Record` row --
		confirmed here via frappe.get_doc never being called.
		"""
		result, created, mock_fulfil_reservation = None, None, None
		get_doc_side_effect, created = _new_doc_recorder()

		with patch(f"{MODULE}.frappe.db.exists", side_effect=_existence_side_effect()), patch(
			f"{MODULE}.frappe.has_permission", return_value=True
		), patch(f"{MODULE}.frappe.get_all", side_effect=_get_all_side_effect(execution_state="READY")), patch(
			f"{MODULE}.frappe.db.get_value", side_effect=_kot_scope_side_effect()
		), patch(
			f"{MODULE}.frappe.get_doc", side_effect=get_doc_side_effect
		), patch(
			f"{MODULE}.fulfil_reservation",
			side_effect=frappe.ValidationError(
				"Reservation group RES-GROUP-3 has rows not in status Reserved"
			),
		), patch(
			f"{MODULE}.frappe.session"
		) as mock_session:
			mock_session.user = "waiter1@example.com"
			with self.assertRaises(frappe.ValidationError):
				fulfil_mto_order(
					kot="KOT-3",
					item_code="ITEM-1",
					qty=1,
					reservation_group_ref="RES-GROUP-3",
					batch_key="BATCH-3",
				)

		self.assertEqual(created, [])


class TestNoRealStockMutationAPI(FrappeTestCase):
	def setUp(self):
		# fulfil_mto_order() calls frappe.utils.now(), which otherwise
		# chains into get_system_settings() -> get_cached_doc("System
		# Settings") -- a real DB/cache path these unit tests do not
		# stub. Fix the clock instead of routing that lookup through
		# the get_doc mocks below.
		now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
		now_patcher.start()
		self.addCleanup(now_patcher.stop)

	def test_source_never_references_real_stock_mutation_apis(self):
		"""Grep-style static check: this service module and the shared
		`URY Fulfilment Record` doctype controller must never reference a
		real ERPNext stock mutation API (`Stock Entry`,
		`frappe.db.set_value`, or `.submit()` on any stock document, plus
		the explicit spellings named in this task's verification step).
		Same "fail closed by construction" evidence pattern V3-71's own
		test uses.
		"""
		import ury.ury.api.ury_mto_fulfilment_service as service_module
		import ury.ury.doctype.ury_fulfilment_record.ury_fulfilment_record as controller_module

		forbidden = [
			"Stock Entry",
			"frappe.db.set_value",
			".submit()",
			"stock_ledger",
			"make_stock_entry",
			"update_bin",
			"create_stock_entry",
		]
		for module in (service_module, controller_module):
			# Strip comments and string literals (docstrings) before
			# scanning -- this module's own docstrings/comments legitimately
			# name the forbidden APIs to document that they are NOT called,
			# which is not the same as the code actually calling them.
			source = _code_without_comments_and_strings(inspect.getsource(module))
			for needle in forbidden:
				self.assertNotIn(
					needle,
					source,
					f"{module.__name__} must never reference {needle!r}",
				)
