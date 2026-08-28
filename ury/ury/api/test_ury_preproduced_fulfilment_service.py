"""Tests for ury_preproduced_fulfilment_service.

Static-review note: none of these tests have been executed in this
environment -- there is no live bench/site/DB available, only a detached
checkout of the app source. They are written and hand-traced to the same
mocking pattern used by `ury/ury/api/test_ury_kot_execution_service.py` and
`ury/ury/api/test_ury_reservation_service.py` (patching `frappe.db.exists`,
`frappe.db.get_value`, `frappe.get_all`, `frappe.get_doc`,
`frappe.has_permission`, and `frappe.session`, plus patching
`fulfil_reservation` itself at the module boundary rather than re-mocking
its own internals), so the module under test never touches a real database
or the reservation module's own DB calls.
"""

import inspect
import json
from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_preproduced_fulfilment_service import (
	FulfilmentError,
	fulfil_preproduced_order,
)


MODULE = "ury.ury.api.ury_preproduced_fulfilment_service"


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


class TestSuccessfulFulfilment(FrappeTestCase):
	def setUp(self):
		# fulfil_preproduced_order() calls frappe.utils.now(), which
		# otherwise chains into get_system_settings() ->
		# get_cached_doc("System Settings") -- a real DB/cache path
		# these unit tests do not stub. Fix the clock instead of
		# routing that lookup through the get_doc mocks below.
		now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
		now_patcher.start()
		self.addCleanup(now_patcher.stop)

	def test_fulfils_reservation_and_creates_fulfilment_record(self):
		get_doc_side_effect, created = _new_doc_recorder()

		with patch(f"{MODULE}.frappe.db.exists", side_effect=_existence_side_effect()), patch(
			f"{MODULE}.frappe.has_permission", return_value=True
		), patch(f"{MODULE}.frappe.get_all", side_effect=_get_all_side_effect(execution_state="READY")), patch(
			f"{MODULE}.frappe.db.get_value", side_effect=_kot_scope_side_effect()
		), patch(
			f"{MODULE}.frappe.get_doc", side_effect=get_doc_side_effect
		), patch(
			f"{MODULE}.fulfil_reservation"
		) as mock_fulfil_reservation, patch(
			f"{MODULE}.frappe.session"
		) as mock_session:
			mock_session.user = "waiter1@example.com"
			result = fulfil_preproduced_order(
				kot="KOT-1", item_code="ITEM-1", qty=2, reservation_ref="RES-GROUP-1"
			)

		mock_fulfil_reservation.assert_called_once_with("RES-GROUP-1")
		self.assertFalse(result["idempotent_replay"])
		self.assertFalse(result["posted_to_erpnext"])
		self.assertEqual(result["fulfilment_type"], "PRE_PRODUCED")
		self.assertEqual(created[0]["kot"], "KOT-1")
		self.assertEqual(created[0]["item_code"], "ITEM-1")
		self.assertEqual(created[0]["reservation_ref"], "RES-GROUP-1")
		self.assertEqual(created[0]["posted_to_erpnext"], 0)
		created[0].insert.assert_called_once_with(ignore_permissions=False)
		audit = json.loads(created[0]["audit_log"])
		self.assertEqual(audit[0]["event"], "fulfil")
		self.assertEqual(audit[0]["actor"], "waiter1@example.com")

	def test_served_state_also_accepted(self):
		get_doc_side_effect, created = _new_doc_recorder()

		with patch(f"{MODULE}.frappe.db.exists", side_effect=_existence_side_effect()), patch(
			f"{MODULE}.frappe.has_permission", return_value=True
		), patch(f"{MODULE}.frappe.get_all", side_effect=_get_all_side_effect(execution_state="SERVED")), patch(
			f"{MODULE}.frappe.db.get_value", side_effect=_kot_scope_side_effect()
		), patch(
			f"{MODULE}.frappe.get_doc", side_effect=get_doc_side_effect
		), patch(
			f"{MODULE}.fulfil_reservation"
		) as mock_fulfil_reservation, patch(
			f"{MODULE}.frappe.session"
		) as mock_session:
			mock_session.user = "waiter1@example.com"
			result = fulfil_preproduced_order(
				kot="KOT-2", item_code="ITEM-1", qty=1, reservation_ref="RES-GROUP-2"
			)

		mock_fulfil_reservation.assert_called_once_with("RES-GROUP-2")
		self.assertFalse(result["idempotent_replay"])


class TestRejectedReservationNotReserved(FrappeTestCase):
	def setUp(self):
		# fulfil_preproduced_order() calls frappe.utils.now(), which
		# otherwise chains into get_system_settings() ->
		# get_cached_doc("System Settings") -- a real DB/cache path
		# these unit tests do not stub. Fix the clock instead of
		# routing that lookup through the get_doc mocks below.
		now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
		now_patcher.start()
		self.addCleanup(now_patcher.stop)

	def test_fulfil_reservation_failure_propagates_and_no_record_created(self):
		"""If the reservation does not exist, or is not in Reserved state,
		`fulfil_reservation` itself raises `frappe.ValidationError`. This
		module must let that propagate (fail closed) and must NOT create a
		`URY Fulfilment Record` row -- confirmed here via frappe.get_doc
		never being called.
		"""
		get_doc_side_effect, created = _new_doc_recorder()

		with patch(f"{MODULE}.frappe.db.exists", side_effect=_existence_side_effect()), patch(
			f"{MODULE}.frappe.has_permission", return_value=True
		), patch(f"{MODULE}.frappe.get_all", side_effect=_get_all_side_effect(execution_state="READY")), patch(
			f"{MODULE}.frappe.db.get_value", side_effect=_kot_scope_side_effect()
		), patch(
			f"{MODULE}.frappe.get_doc", side_effect=get_doc_side_effect
		), patch(
			f"{MODULE}.fulfil_reservation", side_effect=frappe.ValidationError("not Reserved")
		), patch(
			f"{MODULE}.frappe.session"
		) as mock_session:
			mock_session.user = "waiter1@example.com"
			with self.assertRaises(frappe.ValidationError):
				fulfil_preproduced_order(
					kot="KOT-3", item_code="ITEM-1", qty=1, reservation_ref="RES-NOT-RESERVED"
				)

		self.assertEqual(created, [])


class TestRejectedExecutionNotReady(FrappeTestCase):
	def setUp(self):
		# fulfil_preproduced_order() calls frappe.utils.now(), which
		# otherwise chains into get_system_settings() ->
		# get_cached_doc("System Settings") -- a real DB/cache path
		# these unit tests do not stub. Fix the clock instead of
		# routing that lookup through the get_doc mocks below.
		now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
		now_patcher.start()
		self.addCleanup(now_patcher.stop)

	def _assert_rejected(self, execution_state):
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
			with self.assertRaises(FulfilmentError) as ctx:
				fulfil_preproduced_order(
					kot="KOT-4", item_code="ITEM-1", qty=1, reservation_ref="RES-GROUP-4"
				)

		self.assertEqual(ctx.exception.reason_code, "EXECUTION_NOT_READY")
		# Reservation must never be touched if the execution gate rejects.
		mock_fulfil_reservation.assert_not_called()
		self.assertEqual(created, [])

	def test_rejected_when_queued(self):
		self._assert_rejected("QUEUED")

	def test_rejected_when_in_preparation(self):
		self._assert_rejected("IN_PREPARATION")

	def test_rejected_when_no_execution_row_yet(self):
		self._assert_rejected(None)


class TestIdempotentReplay(FrappeTestCase):
	def setUp(self):
		# fulfil_preproduced_order() calls frappe.utils.now(), which
		# otherwise chains into get_system_settings() ->
		# get_cached_doc("System Settings") -- a real DB/cache path
		# these unit tests do not stub. Fix the clock instead of
		# routing that lookup through the get_doc mocks below.
		now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
		now_patcher.start()
		self.addCleanup(now_patcher.stop)

	def test_repeat_call_same_kot_item_returns_original_no_double_fulfil(self):
		"""A second call for the same (kot, item_code) that already has a
		PRE_PRODUCED `URY Fulfilment Record` row must return that row
		unchanged -- it must NOT re-check execution state, must NOT call
		`fulfil_reservation` again (which would itself fail closed on an
		already-Fulfilled reservation), and must NOT insert a second row.
		"""
		prior_row = frappe._dict(
			{
				"name": "FULFIL-1",
				"kot": "KOT-5",
				"item_code": "ITEM-1",
				"qty": 3,
				"reservation_ref": "RES-GROUP-5",
				"fulfilment_type": "PRE_PRODUCED",
				"branch": "Branch A",
				"company": "Company A",
				"actor": "waiter1@example.com",
				"fulfilled_at": "2026-08-28 10:00:00",
				"posted_to_erpnext": 0,
			}
		)
		get_doc_side_effect, created = _new_doc_recorder()

		with patch(f"{MODULE}.frappe.db.exists", side_effect=_existence_side_effect()), patch(
			f"{MODULE}.frappe.has_permission", return_value=True
		), patch(
			f"{MODULE}.frappe.get_all",
			side_effect=_get_all_side_effect(execution_state=None, prior_fulfilment=[prior_row]),
		), patch(
			f"{MODULE}.frappe.db.get_value"
		) as mock_get_value, patch(
			f"{MODULE}.frappe.get_doc", side_effect=get_doc_side_effect
		), patch(
			f"{MODULE}.fulfil_reservation"
		) as mock_fulfil_reservation, patch(
			f"{MODULE}.frappe.session"
		) as mock_session:
			mock_session.user = "waiter2@example.com"
			result = fulfil_preproduced_order(
				kot="KOT-5", item_code="ITEM-1", qty=3, reservation_ref="RES-GROUP-5"
			)

		self.assertTrue(result["idempotent_replay"])
		self.assertEqual(result["name"], "FULFIL-1")
		self.assertEqual(result["actor"], "waiter1@example.com")
		mock_fulfil_reservation.assert_not_called()
		mock_get_value.assert_not_called()
		self.assertEqual(created, [])


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


class TestNoRealStockMutationAPI(FrappeTestCase):
	def setUp(self):
		# fulfil_preproduced_order() calls frappe.utils.now(), which
		# otherwise chains into get_system_settings() ->
		# get_cached_doc("System Settings") -- a real DB/cache path
		# these unit tests do not stub. Fix the clock instead of
		# routing that lookup through the get_doc mocks below.
		now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
		now_patcher.start()
		self.addCleanup(now_patcher.stop)

	def test_source_never_references_real_stock_mutation_apis(self):
		"""Grep-style static check: the service module and its own new
		doctype controller must never reference a real ERPNext stock
		mutation API (`Stock Entry`, `frappe.db.set_value(..., "Bin", ...)`,
		or `.submit()` on any stock document). This is the same "fail
		closed by construction" evidence V3-32's tests use for its own
		"never creates a real ERPNext Stock Entry" claim.
		"""
		import ury.ury.api.ury_preproduced_fulfilment_service as service_module
		import ury.ury.doctype.ury_fulfilment_record.ury_fulfilment_record as controller_module

		forbidden = ["Stock Entry", "frappe.db.set_value", ".submit()"]
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
