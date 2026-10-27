# Copyright (c) 2026, Tridz Technologies Pvt. Ltd and Contributors
# See license.txt

"""Unit tests for URY Wastage — two-flow coverage.

Flows under test
----------------
Flow A — Mosaic / KOT cancellation disposition
    * resolve_cancellation_disposition(..., disposition="waste") creates a
      Draft URY Wastage with wastage_source="KOT Cancellation" and NO issue_authorization.
    * The record must NOT have edit_posting_date set — posting time = wall clock.
    * approve_wastage() on a Mosaic doc (issue_authorization=None) must succeed
      (current bug: crashes at frappe.get_doc(ISSUE_AUTH_DOCTYPE, None)).

Flow B — End-of-Day (Desk) entry
    * validate() tags wastage_source="Physical Audit" when not set.
    * before_submit() reads custom_wastage_time from POS Profile and sets
      self.posting_date / self.posting_time (NOT the buggy self.date / self.time).
    * on_submit() sets status="Authorized" via db_set for Draft docs.
    * create_stock_entry() passes posting_date / posting_time correctly.
    * total_cost and total_price are computed and stored on the document.

All tests use mocking (no live DB / bench) following the same pattern as
test_ury_wastage.py in the api/ directory.
"""

import frappe
import unittest
from unittest.mock import MagicMock, patch

import os

EXTRA_TEST_RECORD_DEPENDENCIES = []
IGNORE_TEST_RECORD_DEPENDENCIES = []


def _find_site_and_sites_path():
	cur = os.path.dirname(os.path.abspath(__file__))
	for _ in range(8):
		candidate = os.path.join(cur, "sites")
		if os.path.isdir(candidate):
			for entry in sorted(os.listdir(candidate)):
				if os.path.isfile(os.path.join(candidate, entry, "site_config.json")):
					return entry, candidate
		parent = os.path.dirname(cur)
		if parent == cur:
			break
		cur = parent
	return None, None


def setUpModule():
	if not getattr(frappe.local, "site", None):
		site, sites_path = _find_site_and_sites_path()
		if site and sites_path:
			frappe.init(site, sites_path=sites_path)
			try:
				frappe.connect()
			except Exception:
				pass
		else:
			frappe.local.site = "test"
			frappe.local.conf = frappe._dict()
			frappe.local.flags = frappe._dict(in_test=True)
			frappe.local.session = frappe._dict(user="Administrator")
	if not getattr(frappe.local, "db", None):
		frappe.local.db = MagicMock()
	if not getattr(frappe.local, "cache", None):
		frappe.local.cache = MagicMock()

# ---------------------------------------------------------------------------
# Module path constants
# ---------------------------------------------------------------------------
CONTROLLER_MODULE = "ury.ury.doctype.ury_wastage.ury_wastage"
API_MODULE = "ury.ury.api.ury_wastage"
CANCELLATION_MODULE = "ury.ury.api.ury_kot_cancellation_service"


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

class MockWastageDoc(frappe._dict):
	@property
	def items(self):
		return self.get("items")

	@items.setter
	def items(self, val):
		self["items"] = val


def _make_wastage_doc(**overrides):
	"""Return a frappe._dict that mimics a saved URY Wastage document."""
	data = {
		"name": "WSTG-00001",
		"doctype": "URY Wastage",
		"branch": "Branch A",
		"company": "Company A",
		"department": "DEPT-1",
		"production_unit": "UNIT-1",
		"warehouse": "WH-1",
		"status": "Draft",
		"wastage_source": None,
		"issue_authorization": None,
		"plan": None,
		"edit_posting_date": 0,
		"posting_date": "2026-10-23",
		"posting_time": "10:00:00",
		"reason_category": "Spoilage",
		"reason_notes": "test",
		"captured_by": "chef@example.com",
		"captured_on": "2026-10-23 10:00:00",
		"approved_by": None,
		"approved_on": None,
		"approval_permission_basis": None,
		"audit_log": None,
		"stock_entry": None,
		"total_cost": None,
		"items": [
			frappe._dict({
				"item_code": "ITEM-A",
				"item_name": "Item A",
				"qty": 2.0,
				"uom": "Nos",
				"rate": 50.0,
				"amount": 100.0,
			})
		],
	}
	data.update(overrides)
	doc = MockWastageDoc(data)
	doc.flags = frappe._dict()
	doc.db_set = MagicMock()
	doc.save = MagicMock()
	doc.submit = MagicMock(side_effect=lambda: setattr(doc, "docstatus", 1) or doc)
	doc.insert = MagicMock()
	doc.get = lambda k, default=None: data.get(k, default)
	return doc


def _make_controller(**overrides):
	"""Return a mock patched as a URYWastage controller instance."""
	from ury.ury.doctype.ury_wastage.ury_wastage import URYWastage

	doc = object.__new__(URYWastage)
	raw = _make_wastage_doc(**overrides)
	doc.__dict__.update(raw)
	doc.db_set = MagicMock()
	doc.save = MagicMock()
	doc.submit = MagicMock(side_effect=lambda: setattr(doc, "docstatus", 1) or doc)
	doc.insert = MagicMock()
	doc.flags = frappe._dict()
	return doc


# ---------------------------------------------------------------------------
# Flow A — Mosaic / KOT cancellation disposition
# ---------------------------------------------------------------------------

class TestMosaicFlow(unittest.TestCase):
	"""Tests for wastage created by resolve_cancellation_disposition (Mosaic)."""

	def setUp(self):
		patcher = patch(f"{CANCELLATION_MODULE}.frappe.utils.now",
						return_value="2026-10-23 10:00:00")
		patcher.start()
		self.addCleanup(patcher.stop)

	def _make_kot_doc(self, item="ITEM-A", qty=5, cancelled_qty="2"):
		doc = frappe._dict({
			"name": "KOT-1",
			"branch": "Branch A",
			"production_unit": "UNIT-1",
			"kot_items": [frappe._dict({
				"name": "ROW-1",
				"item": item,
				"quantity": qty,
				"cancelled_qty": cancelled_qty,
				"disposition": "Pending",
			})],
			"save": MagicMock(),
		})
		doc.get = lambda f: doc[f] if f in doc else None
		return doc

	def _resolve_waste(self, qty=2, reason="Spoilage"):
		from ury.ury.api.ury_kot_cancellation_service import resolve_cancellation_disposition

		created = []

		def _get_doc(*args, **kwargs):
			arg = args[0] if args else {}
			if isinstance(arg, dict):
				d = frappe._dict(dict(arg))
				d.insert = MagicMock()
				d.save = MagicMock()
				if d.get("doctype") == "URY Wastage":
					created.append(d)
				return d
			if arg == "URY KOT":
				return self._make_kot_doc()
			raise AssertionError(f"Unexpected frappe.get_doc call: {args}")

		def _db_get_value(doctype, *args, **kwargs):
			if doctype == "URY Production Unit":
				return frappe._dict({"department": "DEPT-1", "warehouse": "WH-1"})
			if doctype == "URY KOT":
				return frappe._dict({"branch": "Branch A", "production_unit": "UNIT-1"})
			if doctype == "Branch":
				return "Company A"
			return None

		with patch(f"{CANCELLATION_MODULE}.frappe.get_doc", side_effect=_get_doc), \
			 patch(f"{CANCELLATION_MODULE}.frappe.db.get_value", side_effect=_db_get_value), \
			 patch(f"{CANCELLATION_MODULE}.frappe.db.exists",
				   side_effect=lambda dt, n=None: dt in ("DocType", "URY KOT")), \
			 patch(f"{CANCELLATION_MODULE}.frappe.session",
				   frappe._dict(user="chef@example.com")):
			resolve_cancellation_disposition(
				kot="KOT-1",
				item_row_name="ROW-1",
				disposition="waste",
				qty=qty,
				actor="chef@example.com",
				reason=reason,
			)

		return created

	# -- Creation correctness -----------------------------------------------

	def test_mosaic_doc_created_without_issue_authorization(self):
		"""resolve_cancellation_disposition('waste') must create a URY Wastage
		doc with NO issue_authorization — mandatory for the approve fix."""
		created = self._resolve_waste()
		self.assertEqual(len(created), 1)
		self.assertIsNone(created[0].get("issue_authorization"),
						  "Mosaic wastage must NOT have issue_authorization")

	def test_mosaic_doc_status_is_draft(self):
		created = self._resolve_waste()
		self.assertEqual(created[0].get("status"), "Draft")

	def test_mosaic_doc_wastage_source_is_mosaic(self):
		"""The wastage doc must carry wastage_source='KOT Cancellation'."""
		created = self._resolve_waste()
		self.assertEqual(created[0].get("wastage_source"), "KOT Cancellation",
						  "wastage_source must be 'KOT Cancellation' for KOT cancellation flow")

	def test_mosaic_doc_edit_posting_date_not_set(self):
		"""Mosaic wastage must NOT set edit_posting_date — posting time must
		reflect the actual wall-clock time, not custom_wastage_time."""
		created = self._resolve_waste()
		self.assertFalse(bool(created[0].get("edit_posting_date")),
						  "Mosaic wastage must not set edit_posting_date")

	def test_mosaic_doc_branch_and_company_populated(self):
		created = self._resolve_waste()
		self.assertEqual(created[0].get("branch"), "Branch A")
		self.assertEqual(created[0].get("company"), "Company A")

	def test_mosaic_doc_captured_by_actor(self):
		created = self._resolve_waste()
		self.assertEqual(created[0].get("captured_by"), "chef@example.com")

	# -- Approval via /ury/wastage page ------------------------------------

	def test_approve_wastage_mosaic_doc_without_issue_authorization_succeeds(self):
		"""approve_wastage() on a Mosaic doc (issue_authorization=None) must succeed.

		Current bug: _resolve_wastage calls frappe.get_doc(ISSUE_AUTH_DOCTYPE, None)
		which throws because the name is None. After the fix, when
		issue_authorization is blank the held-qty check is skipped and
		valuation is computed from item.rate instead.
		"""
		from ury.ury.api.ury_wastage import approve_wastage

		draft = MockWastageDoc({
			"name": "WSTG-M1",
			"status": "Draft",
			"issue_authorization": None,
			"wastage_source": "KOT Cancellation",
			"branch": "Branch A",
			"company": "Company A",
			"department": "DEPT-1",
			"items": [frappe._dict({"item_code": "ITEM-A", "qty": 2.0, "rate": 50.0, "amount": 0})],
			"audit_log": None,
			"approved_by": None,
			"approved_on": None,
			"approval_permission_basis": None,
		})
		draft.get = lambda k, d=None: dict(draft).get(k, d)
		draft.save = MagicMock()
		draft.submit = MagicMock(side_effect=lambda: setattr(draft, "docstatus", 1) or draft)

		with patch(f"{API_MODULE}.frappe.get_roles", return_value=["Stock Manager"]), \
			 patch(f"{API_MODULE}.frappe.has_permission", return_value=True), \
			 patch(f"{API_MODULE}.frappe.get_doc", return_value=draft), \
			 patch(f"{API_MODULE}.frappe.utils.now", return_value="2026-10-23 10:00:00"):
			result = approve_wastage("WSTG-M1", actor="mgr@example.com")

		self.assertEqual(result.status, "Authorized")
		draft.submit.assert_called_once()
		self.assertEqual(result.docstatus, 1)

	def test_approve_wastage_mosaic_computes_valuation_from_item_rate(self):
		"""When issue_authorization is None, valuation = qty * item.rate."""
		from ury.ury.api.ury_wastage import approve_wastage

		draft = MockWastageDoc({
			"name": "WSTG-M2",
			"status": "Draft",
			"issue_authorization": None,
			"items": [frappe._dict({"item_code": "ITEM-A", "qty": 3.0, "rate": 20.0, "amount": 0})],
			"audit_log": None,
			"branch": "Branch A",
			"company": "Company A",
			"department": "DEPT-1",
			"wastage_source": "KOT Cancellation",
			"approved_by": None,
			"approved_on": None,
			"approval_permission_basis": None,
		})
		draft.get = lambda k, d=None: dict(draft).get(k, d)
		draft.save = MagicMock()
		draft.submit = MagicMock(side_effect=lambda: setattr(draft, "docstatus", 1) or draft)

		with patch(f"{API_MODULE}.frappe.get_roles", return_value=["Stock Manager"]), \
			 patch(f"{API_MODULE}.frappe.has_permission", return_value=True), \
			 patch(f"{API_MODULE}.frappe.get_doc", return_value=draft), \
			 patch(f"{API_MODULE}.frappe.utils.now", return_value="2026-10-23 10:00:00"):
			result = approve_wastage("WSTG-M2", actor="mgr@example.com")

		self.assertEqual(result.items[0].amount, 60.0,
						  "valuation must be qty(3) * rate(20) = 60")

	def test_reject_wastage_mosaic_doc_without_issue_authorization_succeeds(self):
		"""reject_wastage() on a Mosaic doc must succeed — rejection never
		calls held_quantity() so no issue_authorization needed."""
		from ury.ury.api.ury_wastage import reject_wastage

		draft = MockWastageDoc({
			"name": "WSTG-M3",
			"status": "Draft",
			"issue_authorization": None,
			"items": [frappe._dict({"item_code": "ITEM-A", "qty": 1.0, "rate": 10.0, "amount": 10.0})],
			"audit_log": None,
			"branch": "Branch A",
			"company": "Company A",
			"department": "DEPT-1",
			"approved_by": None,
			"approved_on": None,
			"approval_permission_basis": None,
		})
		draft.get = lambda k, d=None: dict(draft).get(k, d)
		draft.save = MagicMock()
		draft.submit = MagicMock(side_effect=lambda: setattr(draft, "docstatus", 1) or draft)

		with patch(f"{API_MODULE}.frappe.get_roles", return_value=["Stock Manager"]), \
			 patch(f"{API_MODULE}.frappe.has_permission", return_value=True), \
			 patch(f"{API_MODULE}.frappe.get_doc", return_value=draft), \
			 patch(f"{API_MODULE}.frappe.utils.now", return_value="2026-10-23 10:00:00"):
			result = reject_wastage("WSTG-M3", actor="mgr@example.com")

		self.assertEqual(result.status, "Rejected")
		draft.save.assert_called_once()
		draft.submit.assert_not_called()

	def test_approve_already_authorized_fails_closed(self):
		from ury.ury.api.ury_wastage import approve_wastage

		doc = frappe._dict({
			"name": "WSTG-M4", "status": "Authorized",
			"issue_authorization": None, "items": [], "audit_log": None,
		})
		doc.get = lambda k, d=None: dict(doc).get(k, d)

		with patch(f"{API_MODULE}.frappe.get_roles", return_value=["Stock Manager"]), \
			 patch(f"{API_MODULE}.frappe.has_permission", return_value=True), \
			 patch(f"{API_MODULE}.frappe.get_doc", return_value=doc):
			with self.assertRaises(frappe.ValidationError):
				approve_wastage("WSTG-M4", actor="mgr@example.com")

	def test_production_manager_cannot_approve(self):
		from ury.ury.api.ury_wastage import approve_wastage
		with patch(f"{API_MODULE}.frappe.get_roles", return_value=["Production Manager"]):
			with self.assertRaises(frappe.PermissionError):
				approve_wastage("WSTG-M1", actor="prod-mgr@example.com")


# ---------------------------------------------------------------------------
# Flow B — End-of-Day (Desk) entry
# ---------------------------------------------------------------------------

class TestEndOfDayFlow(unittest.TestCase):
	"""Tests for wastage created manually from Frappe Desk (End-of-Day flow)."""

	def setUp(self):
		patcher = patch(f"{CONTROLLER_MODULE}.frappe.utils.now",
						return_value="2026-10-23 22:30:00")
		patcher.start()
		self.addCleanup(patcher.stop)

	# -- validate() --------------------------------------------------------

	def test_validate_tags_end_of_day_source_when_blank(self):
		"""validate() must set wastage_source='Physical Audit' when it is None."""
		from ury.ury.doctype.ury_wastage.ury_wastage import URYWastage
		doc = _make_controller(wastage_source=None)
		with patch.object(URYWastage, "validate_item_stock", return_value=None):
			doc.validate()
		self.assertEqual(doc.wastage_source, "Physical Audit")

	def test_validate_does_not_overwrite_mosaic_source(self):
		"""validate() must not overwrite wastage_source='KOT Cancellation' set by
		resolve_cancellation_disposition before insert."""
		from ury.ury.doctype.ury_wastage.ury_wastage import URYWastage
		doc = _make_controller(wastage_source="KOT Cancellation")
		with patch.object(URYWastage, "validate_item_stock", return_value=None):
			doc.validate()
		self.assertEqual(doc.wastage_source, "KOT Cancellation",
						  "validate() must not clobber a pre-set wastage_source")

	# -- before_submit(): posting_date / posting_time field name fix --------

	def test_before_submit_writes_to_posting_date_not_ghost_date(self):
		"""before_submit() must write custom_wastage_time to self.posting_date,
		NOT the non-existent ghost field self.date (the original bug)."""
		from ury.ury.doctype.ury_wastage.ury_wastage import URYWastage
		doc = _make_controller(posting_date="2026-10-23", posting_time="10:00:00",
							   edit_posting_date=0)

		with patch(f"{CONTROLLER_MODULE}.frappe.db.has_column", return_value=True), \
			 patch(f"{CONTROLLER_MODULE}.frappe.get_value", side_effect=[1, "2026-10-23"]), \
			 patch(f"{CONTROLLER_MODULE}.frappe.db.exists", return_value="POE-1"), \
			 patch(f"{CONTROLLER_MODULE}.frappe.db.get_value", return_value="23:00:00"), \
			 patch.object(URYWastage, "validate_item_stock", return_value=None):
			doc.before_submit()

		self.assertEqual(doc.posting_date, "2026-10-23")
		self.assertEqual(doc.posting_time, "23:00:00",
						  "before_submit must write custom_wastage_time to self.posting_time")
		self.assertEqual(doc.edit_posting_date, 1)
		# Ghost fields must not exist
		self.assertIsNone(getattr(doc, "date", None),
						  "self.date is a ghost field — must not be written")
		self.assertIsNone(getattr(doc, "time", None),
						  "self.time is a ghost field — must not be written")

	def test_before_submit_skips_override_when_no_wastage_time_configured(self):
		"""If custom_wastage_time is None, posting_date/posting_time must stay unchanged."""
		from ury.ury.doctype.ury_wastage.ury_wastage import URYWastage
		doc = _make_controller(posting_date="2026-10-23", posting_time="10:00:00")

		with patch(f"{CONTROLLER_MODULE}.frappe.db.has_column", return_value=True), \
			 patch(f"{CONTROLLER_MODULE}.frappe.get_value", side_effect=[1, "2026-10-23"]), \
			 patch(f"{CONTROLLER_MODULE}.frappe.db.exists", return_value="POE-1"), \
			 patch(f"{CONTROLLER_MODULE}.frappe.db.get_value", return_value=None), \
			 patch.object(URYWastage, "validate_item_stock", return_value=None):
			doc.before_submit()

		self.assertEqual(doc.posting_time, "10:00:00",
						  "posting_time must be unchanged when wastage_time is not configured")
		self.assertEqual(doc.edit_posting_date, 0)

	def test_before_submit_skips_override_when_pos_not_open(self):
		"""If no open POS Opening Entry, the wastage_time override must be skipped."""
		from ury.ury.doctype.ury_wastage.ury_wastage import URYWastage
		doc = _make_controller(posting_date="2026-10-23", posting_time="10:00:00")

		with patch(f"{CONTROLLER_MODULE}.frappe.db.has_column", return_value=True), \
			 patch(f"{CONTROLLER_MODULE}.frappe.get_value", return_value=1), \
			 patch(f"{CONTROLLER_MODULE}.frappe.db.exists", return_value=None), \
			 patch(f"{CONTROLLER_MODULE}.frappe.db.get_value", return_value="23:00:00"), \
			 patch.object(URYWastage, "validate_item_stock", return_value=None):
			doc.before_submit()

		self.assertEqual(doc.posting_time, "10:00:00",
						  "posting_time must not change when POS Opening Entry is absent")

	# -- on_submit(): status + stock entry ---------------------------------

	def test_on_submit_db_sets_status_authorized_for_draft(self):
		"""on_submit() must db_set status='Authorized' when current status is Draft."""
		from ury.ury.doctype.ury_wastage.ury_wastage import URYWastage
		doc = _make_controller(status="Draft", wastage_source="Physical Audit")
		mock_se = MagicMock()
		mock_se.name = "MAT-WSTG-00001"

		with patch.object(URYWastage, "get_all_items",
						  return_value=[{"item_code": "ITEM-A", "qty": 1, "uom": "Nos",
										 "cost_center": "CC-1", "expense_account": "ACC-1",
										 "rate": 50}]), \
			 patch.object(URYWastage, "create_stock_entry", return_value=mock_se):
			doc.on_submit()

		doc.db_set.assert_any_call("status", "Authorized")

	def test_on_submit_skips_authorize_when_already_authorized(self):
		"""on_submit() must NOT db_set status if status is already Authorized."""
		from ury.ury.doctype.ury_wastage.ury_wastage import URYWastage
		doc = _make_controller(status="Authorized")
		mock_se = MagicMock()
		mock_se.name = "MAT-WSTG-00002"

		with patch.object(URYWastage, "get_all_items",
						  return_value=[{"item_code": "ITEM-A", "qty": 1, "uom": "Nos",
										 "cost_center": "CC-1", "expense_account": "ACC-1",
										 "rate": 50}]), \
			 patch.object(URYWastage, "create_stock_entry", return_value=mock_se):
			doc.on_submit()

		for c in doc.db_set.call_args_list:
			if c[0][0] == "status" and c[0][1] == "Authorized":
				self.fail("on_submit must not db_set status='Authorized' when already set")

	def test_stock_entry_receives_posting_date_not_ghost_date(self):
		"""create_stock_entry() must forward posting_date/posting_time to the
		Stock Entry, not the ghost self.date/self.time."""
		from ury.ury.doctype.ury_wastage.ury_wastage import URYWastage
		doc = _make_controller(posting_date="2026-10-23", posting_time="23:00:00",
							   edit_posting_date=1)
		captured = {}

		def fake_new_doc(doctype):
			se = frappe._dict({"doctype": doctype, "items": []})
			se.append = lambda f, d: se["items"].append(frappe._dict(d))
			se.insert = MagicMock()
			captured["se"] = se
			return se

		with patch(f"{CONTROLLER_MODULE}.frappe.new_doc", side_effect=fake_new_doc), \
			 patch(f"{CONTROLLER_MODULE}.frappe.get_value", return_value="STOCK-ADJ-ACC"), \
			 patch(f"{CONTROLLER_MODULE}.frappe.db.exists", return_value="CC-1"):
			doc.create_stock_entry([{
				"item_code": "ITEM-A", "qty": 2, "uom": "Nos",
				"cost_center": "CC-1", "expense_account": "STOCK-ADJ-ACC", "rate": 50,
			}])

		se = captured["se"]
		self.assertEqual(se.posting_date, "2026-10-23",
						  "Stock Entry must receive posting_date from self.posting_date")
		self.assertEqual(se.posting_time, "23:00:00",
						  "Stock Entry must receive posting_time from self.posting_time")
		self.assertEqual(se.set_posting_time, 1)

	def test_stock_entry_falls_back_to_nowdate_when_posting_date_empty(self):
		"""If posting_date is None, create_stock_entry must use nowdate(),
		not the ghost self.date."""
		from ury.ury.doctype.ury_wastage.ury_wastage import URYWastage
		doc = _make_controller(posting_date=None, posting_time=None, edit_posting_date=0)
		captured = {}

		def fake_new_doc(doctype):
			se = frappe._dict({"doctype": doctype, "items": []})
			se.append = lambda f, d: se["items"].append(frappe._dict(d))
			se.insert = MagicMock()
			captured["se"] = se
			return se

		with patch(f"{CONTROLLER_MODULE}.frappe.new_doc", side_effect=fake_new_doc), \
			 patch(f"{CONTROLLER_MODULE}.frappe.get_value", return_value="ACC"), \
			 patch(f"{CONTROLLER_MODULE}.frappe.db.exists", return_value="CC-1"), \
			 patch(f"{CONTROLLER_MODULE}.frappe.utils.nowdate",
				   return_value="2026-10-23") as mock_nowdate, \
			 patch(f"{CONTROLLER_MODULE}.frappe.utils.nowtime",
				   return_value="10:00:00") as mock_nowtime:
			doc.create_stock_entry([{
				"item_code": "ITEM-A", "qty": 1, "uom": "Nos",
				"cost_center": "CC-1", "expense_account": "ACC", "rate": 10,
			}])

		self.assertEqual(captured["se"].posting_date, "2026-10-23")
		self.assertEqual(captured["se"].posting_time, "10:00:00")
		mock_nowdate.assert_called()
		mock_nowtime.assert_called()

	# -- total_cost / total_price ------------------------------------------

	def test_on_update_computes_total_cost_from_item_amounts(self):
		"""on_update() must set total_cost = sum(item.amount)."""
		from ury.ury.doctype.ury_wastage.ury_wastage import URYWastage
		items = [
			frappe._dict({"amount": 100.0, "rate": 50.0, "qty": 2.0}),
			frappe._dict({"amount": 75.0, "rate": 25.0, "qty": 3.0}),
		]
		doc = _make_controller(items=items, total_cost=None)
		doc.on_update()
		self.assertEqual(doc.total_cost, 175.0,
						  "total_cost must equal sum of item.amount")

	def test_validate_calculates_item_amount(self):
		"""validate() must calculate each item.amount = item.qty * item.rate."""
		from ury.ury.doctype.ury_wastage.ury_wastage import URYWastage
		items = [
			frappe._dict({"item_code": "ITEM-A", "qty": 3.0, "rate": 25.0, "amount": 0}),
			frappe._dict({"item_code": "ITEM-B", "qty": 2.0, "rate": 10.0, "amount": 0}),
		]
		doc = _make_controller(items=items, warehouse=None)
		with patch.object(URYWastage, "validate_item_stock", return_value=None):
			doc.validate()
		self.assertEqual(items[0].amount, 75.0)
		self.assertEqual(items[1].amount, 20.0)
		self.assertEqual(doc.total_cost, 95.0)

	def test_get_item_valuation_rate(self):
		"""get_item_valuation_rate must return incoming rate from ERPNext."""
		from ury.ury.doctype.ury_wastage.ury_wastage import get_item_valuation_rate
		with patch(f"{CONTROLLER_MODULE}.frappe.db.exists", return_value=None), \
			 patch(f"{CONTROLLER_MODULE}.get_incoming_rate", return_value=45.5):
			rate = get_item_valuation_rate("ITEM-X", "WH-1", "Company A")
			self.assertEqual(rate, 45.5)

	def test_on_update_handles_zero_amount_items(self):
		"""on_update() must not crash on items with amount=0."""
		from ury.ury.doctype.ury_wastage.ury_wastage import URYWastage
		items = [frappe._dict({"amount": 0, "rate": 0, "qty": 1.0})]
		doc = _make_controller(items=items, total_cost=None)
		doc.on_update()  # must not raise
		self.assertEqual(doc.total_cost, 0.0)

	# -- approve from Desk -------------------------------------------------

	def test_stock_manager_can_approve_end_of_day_doc_without_issue_auth(self):
		"""End-of-Day docs created from Desk have no issue_authorization by
		default; approve_wastage() must succeed for them too."""
		from ury.ury.api.ury_wastage import approve_wastage

		draft = MockWastageDoc({
			"name": "WSTG-E1",
			"status": "Draft",
			"issue_authorization": None,
			"wastage_source": "Physical Audit",
			"branch": "Branch A",
			"company": "Company A",
			"department": "DEPT-1",
			"items": [frappe._dict({"item_code": "ITEM-A", "qty": 2.0, "rate": 30.0, "amount": 0})],
			"audit_log": None,
			"approved_by": None,
			"approved_on": None,
			"approval_permission_basis": None,
		})
		draft.get = lambda k, d=None: dict(draft).get(k, d)
		draft.save = MagicMock()
		draft.submit = MagicMock(side_effect=lambda: setattr(draft, "docstatus", 1) or draft)

		with patch(f"{API_MODULE}.frappe.get_roles", return_value=["Stock Manager"]), \
			 patch(f"{API_MODULE}.frappe.has_permission", return_value=True), \
			 patch(f"{API_MODULE}.frappe.get_doc", return_value=draft), \
			 patch(f"{API_MODULE}.frappe.utils.now", return_value="2026-10-23 10:00:00"):
			result = approve_wastage("WSTG-E1", actor="mgr@example.com")

		self.assertEqual(result.status, "Authorized")


# ---------------------------------------------------------------------------
# Cross-flow role guards
# ---------------------------------------------------------------------------

class TestWastageRoleGuards(unittest.TestCase):
	"""Role guards that apply to both flows."""

	def setUp(self):
		patcher = patch(f"{API_MODULE}.frappe.utils.now",
						return_value="2026-10-23 10:00:00")
		patcher.start()
		self.addCleanup(patcher.stop)

	def _draft_no_auth(self, wastage_source="KOT Cancellation"):
		doc = MockWastageDoc({
			"name": "WSTG-G1",
			"status": "Draft",
			"issue_authorization": None,
			"wastage_source": wastage_source,
			"branch": "Branch A",
			"company": "Company A",
			"department": "DEPT-1",
			"items": [frappe._dict({"item_code": "ITEM-A", "qty": 1.0, "rate": 10.0, "amount": 0})],
			"audit_log": None,
			"approved_by": None,
			"approved_on": None,
			"approval_permission_basis": None,
		})
		doc.get = lambda k, d=None: dict(doc).get(k, d)
		doc.save = MagicMock()
		doc.submit = MagicMock(side_effect=lambda: setattr(doc, "docstatus", 1) or doc)
		return doc

	def test_production_manager_cannot_approve(self):
		from ury.ury.api.ury_wastage import approve_wastage
		with patch(f"{API_MODULE}.frappe.get_roles", return_value=["Production Manager"]):
			with self.assertRaises(frappe.PermissionError):
				approve_wastage("WSTG-G1", actor="prod-mgr@example.com")

	def test_production_manager_cannot_reject(self):
		from ury.ury.api.ury_wastage import reject_wastage
		with patch(f"{API_MODULE}.frappe.get_roles", return_value=["Production Manager"]):
			with self.assertRaises(frappe.PermissionError):
				reject_wastage("WSTG-G1", actor="prod-mgr@example.com")

	def test_stock_manager_can_approve_mosaic(self):
		from ury.ury.api.ury_wastage import approve_wastage
		draft = self._draft_no_auth("KOT Cancellation")
		with patch(f"{API_MODULE}.frappe.get_roles", return_value=["Stock Manager"]), \
			 patch(f"{API_MODULE}.frappe.has_permission", return_value=True), \
			 patch(f"{API_MODULE}.frappe.get_doc", return_value=draft):
			result = approve_wastage("WSTG-G1", actor="mgr@example.com")
		self.assertEqual(result.status, "Authorized")

	def test_system_manager_can_approve(self):
		from ury.ury.api.ury_wastage import approve_wastage
		draft = self._draft_no_auth("Physical Audit")
		with patch(f"{API_MODULE}.frappe.get_roles", return_value=["System Manager"]), \
			 patch(f"{API_MODULE}.frappe.has_permission", return_value=True), \
			 patch(f"{API_MODULE}.frappe.get_doc", return_value=draft):
			result = approve_wastage("WSTG-G1", actor="sysadmin@example.com")
		self.assertEqual(result.status, "Authorized")

	def test_rejected_doc_cannot_be_approved(self):
		from ury.ury.api.ury_wastage import approve_wastage
		doc = self._draft_no_auth()
		doc["status"] = "Rejected"
		doc.get = lambda k, d=None: dict(doc).get(k, d)
		with patch(f"{API_MODULE}.frappe.get_roles", return_value=["Stock Manager"]), \
			 patch(f"{API_MODULE}.frappe.has_permission", return_value=True), \
			 patch(f"{API_MODULE}.frappe.get_doc", return_value=doc):
			with self.assertRaises(frappe.ValidationError):
				approve_wastage("WSTG-G1", actor="mgr@example.com")


# ---------------------------------------------------------------------------
# Integration test stub (requires live site — bench run-tests)
# ---------------------------------------------------------------------------

class IntegrationTestURYWastage(unittest.TestCase):
	"""
	Integration tests for URYWastage.
	Use this class for testing interactions between multiple live components.
	These require a running site and are NOT run in unit-test mode.
	"""
	EXTRA_TEST_RECORD_DEPENDENCIES = []
	IGNORE_TEST_RECORD_DEPENDENCIES = []
	pass
