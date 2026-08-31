"""Tests for ury_kot_execution_service.

Static-review note: none of these tests have been executed in this
environment -- there is no live bench/site/DB available, only a detached
checkout of the app source. They are written and hand-traced to the same
mocking pattern used by `ury/ury/api/test_ury_reservation_service.py`
(patching `frappe.db.sql`, `frappe.db.exists`, `frappe.db.get_value`,
`frappe.get_all`, and `frappe.get_doc` so the module under test never
touches a real database), and reviewed by hand line-by-line against the
service module's logic. `test_concurrent_start_by_two_chefs_not_executed`
is additionally marked NOT EXECUTED / unexecutable by design -- see its
docstring.
"""

import json
from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_kot_execution_service import (
	IN_PREPARATION,
	QUEUED,
	READY,
	SERVED,
	ExecutionError,
	mark_ready,
	serve_execution,
	start_execution,
)


MODULE = "ury.ury.api.ury_kot_execution_service"


def _existence_side_effect(kot_exists=True):
	def _exists(doctype, name=None):
		if doctype == "DocType":
			return True
		if doctype == "URY KOT":
			return kot_exists
		return False

	return _exists


def _new_doc_recorder():
	"""Return a frappe.get_doc side_effect that records constructed docs."""
	created = []

	def _get_doc(*args, **kwargs):
		arg = args[0] if args else kwargs.get("arg1")
		if isinstance(arg, dict):
			doc = frappe._dict(dict(arg))
			doc.insert = MagicMock()
			doc.save = MagicMock()
			# as_dict() must reflect mutations made via doc.set(...) AFTER
			# construction (e.g. state/timestamp writes in _transition()), so it
			# has to be a lazy callable -- not a MagicMock(return_value=dict(doc))
			# snapshot taken at construction time, before any .set() calls happen.
			doc.as_dict = lambda _doc=doc: dict(_doc)
			doc.set = lambda field, value, _doc=doc: _doc.__setitem__(field, value)
			created.append(doc)
			return doc
		raise AssertionError("doc lookups by name should be dispatched separately in each test")

	return _get_doc, created


def _kot_scope_patches(branch="Branch A", company="Company A", production="UNIT-1"):
	"""Return the patch kwargs for `_kot_scope`'s two get_value calls.

	`_kot_scope` calls `frappe.db.get_value(KOT_DOCTYPE, kot, [...], as_dict=True)`
	then `frappe.db.get_value(BRANCH_DOCTYPE, branch, "company")`. A single
	side_effect distinguishes the two calls by doctype.
	"""

	def _get_value(doctype, *args, **kwargs):
		if doctype == "URY KOT":
			return frappe._dict({"branch": branch, "production": production})
		if doctype == "Branch":
			return company
		return None

	return _get_value


class TestQueuedMapping(FrappeTestCase):
	def setUp(self):
		# _transition() calls frappe.utils.now(), which otherwise
		# chains into get_system_settings() -> get_cached_doc("System
		# Settings") -- a real DB/cache path these unit tests do not
		# stub. Fix the clock instead of routing that lookup through
		# the get_doc mocks below.
		now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
		now_patcher.start()
		self.addCleanup(now_patcher.stop)

	def test_kot_with_no_execution_row_is_implicitly_queued(self):
		"""A KOT with no `URY KOT Execution` row yet is treated as QUEUED --
		this is the documented mapping for 'KOT submitted maps to QUEUED',
		since actual KOT-submission wiring to eagerly insert a row is out of
		scope for this task (it would require touching `ury_kot.py`).
		"""
		get_doc_side_effect, created = _new_doc_recorder()

		with patch(f"{MODULE}.frappe.db.exists", side_effect=_existence_side_effect()), patch(
			f"{MODULE}.frappe.get_all", return_value=[]
		), patch(f"{MODULE}.frappe.db.sql", return_value=[]), patch(
			f"{MODULE}.frappe.db.get_value", side_effect=_kot_scope_patches()
		), patch(
			f"{MODULE}.frappe.get_doc", side_effect=get_doc_side_effect
		), patch(
			f"{MODULE}.frappe.session"
		) as mock_session:
			mock_session.user = "chef1@example.com"
			result = start_execution("KOT-1", idempotency_key="KEY-1")

		self.assertEqual(result["state"], IN_PREPARATION)
		self.assertFalse(result["idempotent_replay"])
		self.assertEqual(created[0]["kot"], "KOT-1")
		# The seeded row starts life as QUEUED before this transition sets it
		# to IN_PREPARATION -- confirms the implicit-QUEUED convention.
		self.assertEqual(created[0]["state"], IN_PREPARATION)


class TestStartRecordsActorOnce(FrappeTestCase):
	def setUp(self):
		# _transition() calls frappe.utils.now(), which otherwise
		# chains into get_system_settings() -> get_cached_doc("System
		# Settings") -- a real DB/cache path these unit tests do not
		# stub. Fix the clock instead of routing that lookup through
		# the get_doc mocks below.
		now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
		now_patcher.start()
		self.addCleanup(now_patcher.stop)

	def test_start_records_actor_and_timestamp(self):
		get_doc_side_effect, created = _new_doc_recorder()

		with patch(f"{MODULE}.frappe.db.exists", side_effect=_existence_side_effect()), patch(
			f"{MODULE}.frappe.get_all", return_value=[]
		), patch(f"{MODULE}.frappe.db.sql", return_value=[]), patch(
			f"{MODULE}.frappe.db.get_value", side_effect=_kot_scope_patches()
		), patch(
			f"{MODULE}.frappe.get_doc", side_effect=get_doc_side_effect
		), patch(
			f"{MODULE}.frappe.session"
		) as mock_session:
			mock_session.user = "chef1@example.com"
			result = start_execution("KOT-1", idempotency_key="KEY-1", actor="chef1@example.com")

		self.assertEqual(result["started_by"], "chef1@example.com")
		self.assertIsNotNone(result["started_at"])
		audit = json.loads(created[0]["audit_log"])
		self.assertEqual(audit[0]["event"], "start")
		self.assertEqual(audit[0]["actor"], "chef1@example.com")


class TestDoubleStartSameKey(FrappeTestCase):
	def setUp(self):
		# _transition() calls frappe.utils.now(), which otherwise
		# chains into get_system_settings() -> get_cached_doc("System
		# Settings") -- a real DB/cache path these unit tests do not
		# stub. Fix the clock instead of routing that lookup through
		# the get_doc mocks below.
		now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
		now_patcher.start()
		self.addCleanup(now_patcher.stop)

	def test_double_start_with_same_idempotency_key_returns_original(self):
		"""A second call with the SAME idempotency_key must return the
		original transition result, not a duplicate state change -- the
		dedup lookup (`_find_prior_result`) short-circuits before any lock
		or write.
		"""
		prior_row = frappe._dict(
			{
				"name": "EXEC-1",
				"state": IN_PREPARATION,
				"idempotency_key": "KEY-1",
				"started_by": "chef1@example.com",
				"started_at": "2026-08-28 10:00:00",
				"ready_by": None,
				"ready_at": None,
				"served_by": None,
				"served_at": None,
			}
		)

		with patch(f"{MODULE}.frappe.db.exists", side_effect=_existence_side_effect()), patch(
			f"{MODULE}.frappe.get_all", return_value=[prior_row]
		) as mock_get_all, patch(f"{MODULE}.frappe.db.sql") as mock_sql, patch(
			f"{MODULE}.frappe.get_doc"
		) as mock_get_doc:
			result = start_execution("KOT-1", idempotency_key="KEY-1", actor="chef1@example.com")

		self.assertTrue(result["idempotent_replay"])
		self.assertEqual(result["started_by"], "chef1@example.com")
		self.assertEqual(result["name"], "EXEC-1")
		# No lock and no write should have happened for a pure replay.
		mock_sql.assert_not_called()
		mock_get_doc.assert_not_called()


class TestDoubleCompleteNoDuplicate(FrappeTestCase):
	def setUp(self):
		# _transition() calls frappe.utils.now(), which otherwise
		# chains into get_system_settings() -> get_cached_doc("System
		# Settings") -- a real DB/cache path these unit tests do not
		# stub. Fix the clock instead of routing that lookup through
		# the get_doc mocks below.
		now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
		now_patcher.start()
		self.addCleanup(now_patcher.stop)

	def test_double_serve_with_same_key_does_not_duplicate(self):
		prior_row = frappe._dict(
			{
				"name": "EXEC-1",
				"state": SERVED,
				"idempotency_key": "KEY-SERVE-1",
				"started_by": "chef1@example.com",
				"started_at": "2026-08-28 10:00:00",
				"ready_by": "chef1@example.com",
				"ready_at": "2026-08-28 10:05:00",
				"served_by": "waiter1@example.com",
				"served_at": "2026-08-28 10:10:00",
			}
		)

		with patch(f"{MODULE}.frappe.db.exists", side_effect=_existence_side_effect()), patch(
			f"{MODULE}.frappe.get_all", return_value=[prior_row]
		), patch(f"{MODULE}.frappe.db.sql") as mock_sql, patch(
			f"{MODULE}.frappe.get_doc"
		) as mock_get_doc:
			result = serve_execution("KOT-1", idempotency_key="KEY-SERVE-1", actor="waiter1@example.com")

		self.assertTrue(result["idempotent_replay"])
		self.assertEqual(result["served_by"], "waiter1@example.com")
		mock_sql.assert_not_called()
		mock_get_doc.assert_not_called()

	def test_repeat_serve_different_key_returns_existing_state_without_mutating(self):
		"""A second serve_execution call for an already-SERVED KOT, but with a
		DIFFERENT idempotency_key than the one that produced SERVED, must
		return the existing state as a stable already-applied response --
		not raise, and not duplicate/overwrite served_by/served_at.
		"""
		locked_row = frappe._dict(
			{
				"name": "EXEC-1",
				"state": SERVED,
				"idempotency_key": "KEY-SERVE-1",
				"started_by": "chef1@example.com",
				"started_at": "2026-08-28 10:00:00",
				"ready_by": "chef1@example.com",
				"ready_at": "2026-08-28 10:05:00",
				"served_by": "waiter1@example.com",
				"served_at": "2026-08-28 10:10:00",
			}
		)

		with patch(f"{MODULE}.frappe.db.exists", side_effect=_existence_side_effect()), patch(
			f"{MODULE}.frappe.get_all", return_value=[]
		), patch(f"{MODULE}.frappe.db.sql", return_value=[locked_row]), patch(
			f"{MODULE}.frappe.db.get_value", side_effect=_kot_scope_patches()
		), patch(
			f"{MODULE}.frappe.get_doc"
		) as mock_get_doc:
			result = serve_execution("KOT-1", idempotency_key="KEY-SERVE-2", actor="waiter2@example.com")

		self.assertTrue(result["idempotent_replay"])
		self.assertEqual(result["served_by"], "waiter1@example.com")
		mock_get_doc.assert_not_called()


class TestCompleteWithoutStart(FrappeTestCase):
	def setUp(self):
		# _transition() calls frappe.utils.now(), which otherwise
		# chains into get_system_settings() -> get_cached_doc("System
		# Settings") -- a real DB/cache path these unit tests do not
		# stub. Fix the clock instead of routing that lookup through
		# the get_doc mocks below.
		now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
		now_patcher.start()
		self.addCleanup(now_patcher.stop)

	def test_mark_ready_without_start_fails_closed(self):
		with patch(f"{MODULE}.frappe.db.exists", side_effect=_existence_side_effect()), patch(
			f"{MODULE}.frappe.get_all", return_value=[]
		), patch(f"{MODULE}.frappe.db.sql", return_value=[]), patch(
			f"{MODULE}.frappe.db.get_value", side_effect=_kot_scope_patches()
		):
			with self.assertRaises(ExecutionError):
				mark_ready("KOT-1", idempotency_key="KEY-2")

	def test_mark_ready_without_start_succeeds_with_manager_override(self):
		get_doc_side_effect, created = _new_doc_recorder()

		with patch(f"{MODULE}.frappe.db.exists", side_effect=_existence_side_effect()), patch(
			f"{MODULE}.frappe.get_all", return_value=[]
		), patch(f"{MODULE}.frappe.db.sql", return_value=[]), patch(
			f"{MODULE}.frappe.db.get_value", side_effect=_kot_scope_patches()
		), patch(
			f"{MODULE}.frappe.get_doc", side_effect=get_doc_side_effect
		), patch(
			f"{MODULE}.frappe.get_roles", return_value=["URY Manager"]
		):
			result = mark_ready(
				"KOT-1", idempotency_key="KEY-2", actor="manager1@example.com", manager_override=True
			)

		self.assertEqual(result["state"], READY)
		self.assertEqual(created[0]["ready_by"], "manager1@example.com")

	def test_manager_override_rejected_for_non_manager(self):
		with patch(f"{MODULE}.frappe.db.exists", side_effect=_existence_side_effect()), patch(
			f"{MODULE}.frappe.get_all", return_value=[]
		), patch(f"{MODULE}.frappe.db.sql", return_value=[]), patch(
			f"{MODULE}.frappe.db.get_value", side_effect=_kot_scope_patches()
		), patch(
			f"{MODULE}.frappe.get_roles", return_value=["Cashier"]
		):
			with self.assertRaises(ExecutionError):
				mark_ready(
					"KOT-1", idempotency_key="KEY-2", actor="cashier1@example.com", manager_override=True
				)


class TestReverseTransitionGuard(FrappeTestCase):
	def setUp(self):
		# _transition() calls frappe.utils.now(), which otherwise
		# chains into get_system_settings() -> get_cached_doc("System
		# Settings") -- a real DB/cache path these unit tests do not
		# stub. Fix the clock instead of routing that lookup through
		# the get_doc mocks below.
		now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
		now_patcher.start()
		self.addCleanup(now_patcher.stop)

	def test_start_on_already_ready_kot_fails_closed_and_preserves_state(self):
		"""There is no public function whose target_state is QUEUED, so a
		literal READY/SERVED -> QUEUED call cannot be expressed through this
		module's API by construction. This test instead proves the guard's
		practical effect: attempting a forward-shaped call (start_execution,
		which only ever targets IN_PREPARATION) against a KOT that has
		already moved past IN_PREPARATION (already READY) is rejected and
		the existing state is left untouched -- no write happens.
		"""
		locked_row = frappe._dict(
			{
				"name": "EXEC-1",
				"state": READY,
				"idempotency_key": "KEY-READY-1",
				"started_by": "chef1@example.com",
				"started_at": "2026-08-28 10:00:00",
				"ready_by": "chef1@example.com",
				"ready_at": "2026-08-28 10:05:00",
				"served_by": None,
				"served_at": None,
			}
		)

		with patch(f"{MODULE}.frappe.db.exists", side_effect=_existence_side_effect()), patch(
			f"{MODULE}.frappe.get_all", return_value=[]
		), patch(f"{MODULE}.frappe.db.sql", return_value=[locked_row]), patch(
			f"{MODULE}.frappe.db.get_value", side_effect=_kot_scope_patches()
		), patch(
			f"{MODULE}.frappe.get_doc"
		) as mock_get_doc:
			with self.assertRaises(ExecutionError) as ctx:
				start_execution("KOT-1", idempotency_key="KEY-NEW", actor="chef2@example.com")

		self.assertEqual(ctx.exception.reason_code, "INVALID_EXECUTION_TRANSITION")
		# No document was loaded/saved -- existing state was never touched.
		mock_get_doc.assert_not_called()


class TestConcurrency(FrappeTestCase):
	def setUp(self):
		# _transition() calls frappe.utils.now(), which otherwise
		# chains into get_system_settings() -> get_cached_doc("System
		# Settings") -- a real DB/cache path these unit tests do not
		# stub. Fix the clock instead of routing that lookup through
		# the get_doc mocks below.
		now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
		now_patcher.start()
		self.addCleanup(now_patcher.stop)

	def test_concurrent_start_by_two_chefs_not_executed(self):
		"""Two chefs call start_execution on the same KOT 'simultaneously';
		exactly one must be accepted as the recorded actor and the other
		must see the already-transitioned state as an idempotent/no-op
		result.

		NOT EXECUTED -- requires a live Frappe test site/DB, same as V3-43's
		`test_two_terminal_concurrent_reservation`. This test is written to
		demonstrate the shape of a real concurrency proof (two threads, each
		with its own DB connection/transaction, both calling
		`start_execution` for the same KOT) and is skipped in this
		environment because no bench/DB is available. A mocked
		`frappe.db.sql`/`FOR UPDATE` cannot demonstrate real row-lock
		serialization -- mocks execute sequentially in a single
		thread/process and would trivially "pass" regardless of whether the
		locking strategy actually serializes concurrent transactions at the
		DB level. Do not remove this skip without running against a real
		Frappe test site (`bench run-tests` or equivalent).
		"""
		self.skipTest(
			"NOT EXECUTED: requires a live Frappe test site/DB to prove real "
			"FOR UPDATE row-lock serialization across two threads/connections; "
			"not available in this environment. See docstring for the intended "
			"shape of this test."
		)

		# Intended shape (for the future bench-backed run):
		#
		# import threading
		# results = []
		# def attempt(chef):
		#     try:
		#         results.append(("ok", start_execution(
		#             "KOT-1", idempotency_key=f"KEY-{chef}", actor=chef,
		#         )))
		#     except ExecutionError as exc:
		#         results.append(("rejected", str(exc)))
		#
		# threads = [threading.Thread(target=attempt, args=(chef,))
		#            for chef in ("chef1@example.com", "chef2@example.com")]
		# for t in threads:
		#     t.start()
		# for t in threads:
		#     t.join()
		#
		# accepted = [r for r in results if r[0] == "ok" and not r[1]["idempotent_replay"]]
		# self.assertEqual(len(accepted), 1)
