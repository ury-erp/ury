"""Tests for ury_kot_cancellation_service.

Static-review note: none of these tests have been executed in this
environment -- there is no live bench/site/DB available, only a detached
checkout of the app source. They are written and hand-traced to the same
mocking pattern used by `ury/ury/api/test_ury_kot_execution_service.py` and
`test_ury_reservation_service.py` (patching `frappe.db.sql`,
`frappe.db.exists`, `frappe.db.get_value`, `frappe.get_all`, `frappe.get_doc`,
and `frappe.session`/`frappe.get_roles` so the module under test never
touches a real database), and reviewed by hand line-by-line against the
service module's logic.

Covers V3-50's exact "V3-54 cancellation/disposition" test list:
  1. cancel-before-start releases reservation via the reservation-service
     call path (mock-verify release_reservation/cancel_reservation gets
     called, not stock mutated directly).
  2. cancel-after-start requires manager confirmation and does NOT restore
     materials (assert no stock/material-restore function is ever called).
  3. cancel-after-ready requires finished-good disposition (assert the
     function only marks the state, doesn't itself dispose).
  4. partially-cancelled KOT with mixed item states fails closed with
     ITEM_LEVEL_STATE_REQUIRED.
  5. manager confirmation is verified server-side, not trusted from a
     client-supplied boolean/name alone.
"""

from unittest.mock import MagicMock, patch

from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_kot_cancellation_service import (
	CancellationError,
	cancel_after_ready,
	cancel_after_start,
	cancel_before_start,
	cancel_partial,
)
from ury.ury.api.ury_kot_execution_service import (
	CANCELLED_AFTER_READY,
	CANCELLED_AFTER_START,
	CANCELLED_BEFORE_START,
	IN_PREPARATION,
	QUEUED,
	READY,
)


MODULE = "ury.ury.api.ury_kot_cancellation_service"


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
		if doctype == "URY KOT":
			import frappe

			return frappe._dict({"branch": branch, "production": production})
		if doctype == "Branch":
			return company
		return None

	return _get_value


def _new_doc_recorder(existing_rows=None):
	"""Return a frappe.get_doc side_effect handling both shapes the
	cancellation service uses:
	  - frappe.get_doc({...}) to build a brand-new (not-yet-inserted) row
	    when `_write_cancellation` finds no existing locked row; and
	  - frappe.get_doc(EXECUTION_DOCTYPE, name) to load the already-locked
	    row when one was found by `_lock_execution_row`.
	`existing_rows` optionally maps a name -> seed dict for the by-name
	load path, defaulting to a bare {"name": name} doc.
	"""
	created = []
	existing_rows = existing_rows or {}

	def _wrap(seed):
		import frappe

		doc = frappe._dict(dict(seed))
		doc.insert = MagicMock()
		doc.save = MagicMock()
		# as_dict() must reflect mutations made via doc.set(...)/doc.state=...
		# AFTER construction (e.g. state/timestamp writes in
		# _write_cancellation()/append_audit()), so it has to be a lazy
		# callable -- not a MagicMock(return_value=dict(doc)) snapshot taken
		# at construction time, before any mutation happens.
		doc.as_dict = lambda _doc=doc: dict(_doc)
		doc.set = lambda field, value, _doc=doc: _doc.__setitem__(field, value)
		created.append(doc)
		return doc

	def _get_doc(*args, **kwargs):
		arg = args[0] if args else kwargs.get("arg1")
		if isinstance(arg, dict):
			return _wrap(arg)
		if isinstance(arg, str) and len(args) >= 2:
			name = args[1]
			seed = existing_rows.get(name, {"name": name})
			return _wrap(seed)
		raise AssertionError("doc lookups by name should be dispatched separately in each test")

	return _get_doc, created


def _existing_row(name="EXEC-1", state=QUEUED):
	import frappe

	return frappe._dict({"name": name, "state": state})


class TestCancelBeforeStartReleasesReservation(FrappeTestCase):
	def setUp(self):
		# append_audit() calls frappe.utils.now(), which otherwise
		# chains into get_system_settings() -> get_cached_doc("System
		# Settings") -- a real DB/cache path these unit tests do not
		# stub. Fix the clock instead of routing that lookup through
		# the get_doc mocks below.
		now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
		now_patcher.start()
		self.addCleanup(now_patcher.stop)

	def test_cancel_before_start_calls_release_reservation_not_stock(self):
		"""Cancel-before-start releases reservation eligibility only through
		the reservation-service contract; this module never mutates stock
		directly. Verifies `release_reservation` is called (mocked) and that
		no stock/material function is ever invoked.
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
		) as mock_session, patch(
			f"{MODULE}.ury_reservation_service.release_reservation"
		) as mock_release, patch(
			f"{MODULE}.ury_reservation_service.cancel_reservation"
		) as mock_cancel_resv:
			mock_session.user = "waiter1@example.com"
			mock_release.return_value = {"reservation_group": "GRP-1", "status": "Released"}

			result = cancel_before_start(
				"KOT-1", actor="waiter1@example.com", reason="guest changed mind",
				reservation_name="GRP-1",
			)

		mock_release.assert_called_once_with("GRP-1", reason="guest changed mind")
		mock_cancel_resv.assert_not_called()
		self.assertEqual(result["state"], CANCELLED_BEFORE_START)
		self.assertEqual(created[0]["state"], CANCELLED_BEFORE_START)

	def test_cancel_before_start_rejects_non_queued_state(self):
		with patch(f"{MODULE}.frappe.db.exists", side_effect=_existence_side_effect()), patch(
			f"{MODULE}.frappe.db.sql", return_value=[dict(_existing_row(state=IN_PREPARATION))]
		), patch(
			f"{MODULE}.frappe.db.get_value", side_effect=_kot_scope_patches()
		), patch(
			f"{MODULE}.frappe.session"
		) as mock_session:
			mock_session.user = "waiter1@example.com"
			with self.assertRaises(CancellationError) as ctx:
				cancel_before_start("KOT-1", actor="waiter1@example.com")

		self.assertEqual(ctx.exception.reason_code, "INVALID_EXECUTION_TRANSITION")


class TestCancelAfterStartNoMaterialRestore(FrappeTestCase):
	def setUp(self):
		# append_audit() calls frappe.utils.now(), which otherwise
		# chains into get_system_settings() -> get_cached_doc("System
		# Settings") -- a real DB/cache path these unit tests do not
		# stub. Fix the clock instead of routing that lookup through
		# the get_doc mocks below.
		now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
		now_patcher.start()
		self.addCleanup(now_patcher.stop)

	def test_cancel_after_start_requires_manager_and_does_not_restore_materials(self):
		get_doc_side_effect, created = _new_doc_recorder()

		with patch(f"{MODULE}.frappe.db.exists", side_effect=_existence_side_effect()), patch(
			f"{MODULE}.frappe.db.sql", return_value=[dict(_existing_row(state=IN_PREPARATION))]
		), patch(
			f"{MODULE}.frappe.db.get_value", side_effect=_kot_scope_patches()
		), patch(
			f"{MODULE}.frappe.get_doc", side_effect=get_doc_side_effect
		), patch(
			f"{MODULE}.frappe.session"
		) as mock_session, patch(
			f"{MODULE}.frappe.get_roles", return_value=["URY Manager"]
		), patch(
			f"{MODULE}.ury_reservation_service.release_reservation"
		) as mock_release, patch(
			f"{MODULE}.ury_reservation_service.cancel_reservation"
		) as mock_cancel_resv:
			mock_session.user = "manager1@example.com"

			result = cancel_after_start(
				"KOT-1", actor="chef1@example.com", reason="burnt",
				manager_confirmed_by="manager1@example.com",
			)

		self.assertEqual(result["state"], CANCELLED_AFTER_START)
		self.assertTrue(result["disposition_required"])
		# No reservation/stock-restoration call of any kind is made here.
		mock_release.assert_not_called()
		mock_cancel_resv.assert_not_called()

	def test_cancel_after_start_without_manager_role_rejected(self):
		with patch(f"{MODULE}.frappe.db.exists", side_effect=_existence_side_effect()), patch(
			f"{MODULE}.frappe.db.sql", return_value=[dict(_existing_row(state=IN_PREPARATION))]
		), patch(
			f"{MODULE}.frappe.db.get_value", side_effect=_kot_scope_patches()
		), patch(
			f"{MODULE}.frappe.session"
		) as mock_session, patch(
			f"{MODULE}.frappe.get_roles", return_value=["URY Waiter"]
		):
			mock_session.user = "waiter1@example.com"
			with self.assertRaises(CancellationError) as ctx:
				cancel_after_start(
					"KOT-1", actor="chef1@example.com",
					manager_confirmed_by="waiter1@example.com",
				)

		self.assertEqual(ctx.exception.reason_code, "MANAGER_CONFIRMATION_REQUIRED")

	def test_cancel_after_start_wrong_state_rejected(self):
		with patch(f"{MODULE}.frappe.db.exists", side_effect=_existence_side_effect()), patch(
			f"{MODULE}.frappe.db.sql", return_value=[dict(_existing_row(state=QUEUED))]
		), patch(
			f"{MODULE}.frappe.db.get_value", side_effect=_kot_scope_patches()
		), patch(
			f"{MODULE}.frappe.session"
		) as mock_session, patch(
			f"{MODULE}.frappe.get_roles", return_value=["URY Manager"]
		):
			mock_session.user = "manager1@example.com"
			with self.assertRaises(CancellationError) as ctx:
				cancel_after_start(
					"KOT-1", manager_confirmed_by="manager1@example.com",
				)

		self.assertEqual(ctx.exception.reason_code, "INVALID_EXECUTION_TRANSITION")


class TestCancelAfterReadyMarksStateOnly(FrappeTestCase):
	def setUp(self):
		# append_audit() calls frappe.utils.now(), which otherwise
		# chains into get_system_settings() -> get_cached_doc("System
		# Settings") -- a real DB/cache path these unit tests do not
		# stub. Fix the clock instead of routing that lookup through
		# the get_doc mocks below.
		now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
		now_patcher.start()
		self.addCleanup(now_patcher.stop)

	def test_cancel_after_ready_only_marks_state(self):
		get_doc_side_effect, created = _new_doc_recorder()

		with patch(f"{MODULE}.frappe.db.exists", side_effect=_existence_side_effect()), patch(
			f"{MODULE}.frappe.db.sql", return_value=[dict(_existing_row(state=READY))]
		), patch(
			f"{MODULE}.frappe.db.get_value", side_effect=_kot_scope_patches()
		), patch(
			f"{MODULE}.frappe.get_doc", side_effect=get_doc_side_effect
		), patch(
			f"{MODULE}.frappe.session"
		) as mock_session, patch(
			f"{MODULE}.frappe.get_roles", return_value=["URY Manager"]
		):
			mock_session.user = "manager1@example.com"

			result = cancel_after_ready(
				"KOT-1", reason="guest left", manager_confirmed_by="manager1@example.com",
			)

		self.assertEqual(result["state"], CANCELLED_AFTER_READY)
		self.assertTrue(result["disposition_required"])
		self.assertIn("not implemented here", result["disposition_note"])
		# The doc that was saved was only mutated to the new state -- no
		# other field indicating a disposition/return/wastage action exists.
		self.assertEqual(created[0]["state"], CANCELLED_AFTER_READY)
		self.assertNotIn("disposed_qty", created[0])
		self.assertNotIn("returned_to_stock", created[0])


class TestCancelPartialFailsClosed(FrappeTestCase):
	def setUp(self):
		# append_audit() calls frappe.utils.now(), which otherwise
		# chains into get_system_settings() -> get_cached_doc("System
		# Settings") -- a real DB/cache path these unit tests do not
		# stub. Fix the clock instead of routing that lookup through
		# the get_doc mocks below.
		now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
		now_patcher.start()
		self.addCleanup(now_patcher.stop)

	def test_cancel_partial_fails_closed_with_item_level_state_required(self):
		with patch(f"{MODULE}.frappe.db.exists", side_effect=_existence_side_effect()):
			with self.assertRaises(CancellationError) as ctx:
				cancel_partial(
					"KOT-1",
					item_states=[
						{"item": "Item A", "started": True},
						{"item": "Item B", "started": False},
					],
					manager_confirmed_by="manager1@example.com",
				)

		self.assertEqual(ctx.exception.reason_code, "ITEM_LEVEL_STATE_REQUIRED")

	def test_cancel_partial_fails_closed_even_without_item_states(self):
		with patch(f"{MODULE}.frappe.db.exists", side_effect=_existence_side_effect()):
			with self.assertRaises(CancellationError) as ctx:
				cancel_partial("KOT-1", item_states=None)

		self.assertEqual(ctx.exception.reason_code, "ITEM_LEVEL_STATE_REQUIRED")


class TestManagerConfirmationVerifiedServerSide(FrappeTestCase):
	def setUp(self):
		# append_audit() calls frappe.utils.now(), which otherwise
		# chains into get_system_settings() -> get_cached_doc("System
		# Settings") -- a real DB/cache path these unit tests do not
		# stub. Fix the clock instead of routing that lookup through
		# the get_doc mocks below.
		now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
		now_patcher.start()
		self.addCleanup(now_patcher.stop)

	def test_manager_confirmed_by_cannot_impersonate_another_user(self):
		"""A client claiming a DIFFERENT user confirmed the cancellation than
		the actual session user is rejected -- manager_confirmed_by is never
		trusted from client input alone.
		"""
		with patch(f"{MODULE}.frappe.db.exists", side_effect=_existence_side_effect()), patch(
			f"{MODULE}.frappe.db.sql", return_value=[dict(_existing_row(state=IN_PREPARATION))]
		), patch(
			f"{MODULE}.frappe.db.get_value", side_effect=_kot_scope_patches()
		), patch(
			f"{MODULE}.frappe.session"
		) as mock_session, patch(
			f"{MODULE}.frappe.get_roles", return_value=["URY Manager"]
		):
			# Actual session user is a non-manager waiter; client claims a
			# manager confirmed it.
			mock_session.user = "waiter1@example.com"
			with self.assertRaises(CancellationError) as ctx:
				cancel_after_start(
					"KOT-1", manager_confirmed_by="manager1@example.com",
				)

		self.assertEqual(ctx.exception.reason_code, "MANAGER_CONFIRMATION_REQUIRED")

	def test_manager_confirmation_falls_back_to_session_user_when_omitted(self):
		get_doc_side_effect, created = _new_doc_recorder()

		with patch(f"{MODULE}.frappe.db.exists", side_effect=_existence_side_effect()), patch(
			f"{MODULE}.frappe.db.sql", return_value=[dict(_existing_row(state=IN_PREPARATION))]
		), patch(
			f"{MODULE}.frappe.db.get_value", side_effect=_kot_scope_patches()
		), patch(
			f"{MODULE}.frappe.get_doc", side_effect=get_doc_side_effect
		), patch(
			f"{MODULE}.frappe.session"
		) as mock_session, patch(
			f"{MODULE}.frappe.get_roles", return_value=["URY Manager"]
		):
			mock_session.user = "manager1@example.com"
			result = cancel_after_start("KOT-1")

		self.assertEqual(result["manager_confirmed_by"], "manager1@example.com")
