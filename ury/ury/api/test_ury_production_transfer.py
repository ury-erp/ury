# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Unit tests for the department Transfer Material Request and the
Store-to-Department stock transfer executor.

Same mocking style as ``test_ury_production_plan_material_request.py``:
``FrappeTestCase`` for the test-runner site context, with every frappe call
(``get_doc``, ``db.sql``, document ``insert``/``submit``/``save``) patched
rather than requiring real Sales Plan / Production Plan / Material Request /
Bin fixtures.
"""

from unittest.mock import patch

from frappe.tests.utils import FrappeTestCase

from ury.ury.api import ury_production_transfer as xfer_module
from ury.ury.api.ury_production_transfer import (
	execute_store_to_department_transfer,
	generate_transfer_material_request_for_production_plan,
)

MOD = "ury.ury.api.ury_production_transfer"


def _department(department, warehouse, targets=None, external_receipt_targets=None):
	return {
		"department": department,
		"warehouse": warehouse,
		"targets": targets or [],
		"external_receipt_targets": external_receipt_targets or [],
	}


def _target(item_code, component_vector, stock_uom="Kg"):
	return {"item_code": item_code, "stock_uom": stock_uom, "component_vector": component_vector}


def _component(item_code, required_qty, stock_uom="Kg"):
	return {"item_code": item_code, "required_qty": required_qty, "stock_uom": stock_uom}


def _bin_fake(bin_qty_by_key):
	def _fake_get_value(doctype, filters, fieldname=None):
		if doctype == "Bin":
			return bin_qty_by_key.get((filters.get("item_code"), filters.get("warehouse")), 0.0)
		raise AssertionError(f"Unexpected frappe.db.get_value call: {doctype} {filters}")

	return _fake_get_value


class _FakeChildRow:
	_counter = 0

	def __init__(self, fields):
		self.fields = fields
		_FakeChildRow._counter += 1
		self.name = f"mri-row-{_FakeChildRow._counter:04d}"


class _FakeProductionPlanDoc:
	def __init__(self, name, sales_plan="SP-0001", department="Main Kitchen",
				 department_warehouse="Main Kitchen - WH", docstatus=1):
		self.name = name
		self.docstatus = docstatus
		self.flags = type("Flags", (), {})()
		self._fields = {
			"custom_ury_sales_plan": sales_plan,
			"custom_ury_department": department,
			"custom_ury_department_warehouse": department_warehouse,
		}
		self.mr_items = []
		self.saved = False

	def get(self, field):
		return self._fields.get(field)

	def append(self, tablefield, fields):
		assert tablefield == "mr_items"
		row = _FakeChildRow(fields)
		self.mr_items.append(row)
		return row

	def save(self, ignore_permissions=False):
		self.saved = True


class _FakeMaterialRequestDoc:
	_created = []

	def __init__(self, fields):
		self.fields = fields
		self.name = f"MAT-MR-{len(_FakeMaterialRequestDoc._created) + 1:04d}"
		self.inserted = False
		self.submitted = False
		_FakeMaterialRequestDoc._created.append(self)

	def insert(self, ignore_permissions=False):
		self.inserted = True

	def submit(self):
		self.submitted = True


class _FakeSalesPlanDoc:
	def __init__(self, name, branch="Branch A", company="URY Co", approval_snapshot="{}"):
		self.name = name
		self._fields = {"branch": branch, "company": company, "approval_snapshot": approval_snapshot}

	def get(self, field):
		return self._fields.get(field)


class _FakeStockEntryDoc:
	_created = []
	_sequence = 0

	def __init__(self, items):
		self.items = items
		_FakeStockEntryDoc._sequence += 1
		self.name = f"MAT-STE-{_FakeStockEntryDoc._sequence:04d}"
		self.inserted = False
		self.submitted = False

	def get(self, field):
		return self.items if field == "items" else None

	def insert(self, ignore_permissions=False):
		self.inserted = True
		# Only a doc that is actually inserted counts as "created" -- the
		# mapper itself has no side effect, matching the real
		# erpnext_make_stock_entry contract this fake stands in for.
		_FakeStockEntryDoc._created.append(self)

	def submit(self):
		self.submitted = True


class TestGenerateTransferMaterialRequest(FrappeTestCase):
	"""Module 1 -- Transfer MR creation, one per department plan."""

	def setUp(self):
		_FakeMaterialRequestDoc._created = []
		self.plan_doc = _FakeProductionPlanDoc("MFG-PP-0001")

	def _run(self, departments, outstanding_by_item=None, store_warehouse="Store WH - U", bin_qty=None):
		outstanding_by_item = outstanding_by_item or {}
		bin_qty = bin_qty or {}

		def fake_get_doc(doctype, name=None):
			if doctype == "URY Sales Plan":
				return _FakeSalesPlanDoc(name)
			if doctype == "Production Plan":
				return self.plan_doc
			raise AssertionError(f"Unexpected frappe.get_doc(doctype) call: {doctype}")

		def fake_get_doc_dispatch(*args):
			if len(args) == 1 and isinstance(args[0], dict):
				return _FakeMaterialRequestDoc(args[0])
			return fake_get_doc(*args)

		with patch(f"{MOD}.frappe.has_permission", return_value=True), \
				patch(f"{MOD}.frappe.get_doc", side_effect=fake_get_doc_dispatch), \
				patch(f"{MOD}.compile_production_targets", return_value=(departments, [])), \
				patch(f"{MOD}.get_store_warehouse", return_value=store_warehouse), \
				patch("ury.ury.api.ury_production_readiness.get_store_warehouse", return_value=store_warehouse), \
				patch(f"{MOD}._existing_transfer_qty_by_item", return_value=outstanding_by_item), \
				patch("ury.ury.api.ury_production_readiness.frappe.db.get_value", side_effect=_bin_fake(bin_qty)):
			return generate_transfer_material_request_for_production_plan("MFG-PP-0001")

	def test_quantity_is_department_shortage_not_store_shortage(self):
		departments = {
			"Main Kitchen": _department(
				"Main Kitchen", "Main Kitchen - WH",
				targets=[_target("BIRYANI-BASE", [_component("RICE", 20.0)])],
			)
		}
		bin_qty = {("RICE", "Main Kitchen - WH"): 5.0, ("RICE", "Store WH - U"): 100.0}
		result = self._run(departments, bin_qty=bin_qty)

		# 20 required - 5 department stock = 15 department_shortage, regardless
		# of Store having plenty (store_shortage would be 0 here).
		self.assertEqual(len(result["rows"]), 1)
		self.assertEqual(result["rows"][0]["qty"], 15.0)
		self.assertIsNotNone(result["material_request"])

		mr_doc = _FakeMaterialRequestDoc._created[0]
		self.assertEqual(mr_doc.fields["material_request_type"], "Material Transfer")
		self.assertTrue(mr_doc.submitted)
		self.assertTrue(mr_doc.inserted)
		item = mr_doc.fields["items"][0]
		self.assertEqual(item["warehouse"], "Main Kitchen - WH")
		self.assertEqual(item["from_warehouse"], "Store WH - U")
		self.assertEqual(item["production_plan"], "MFG-PP-0001")
		self.assertTrue(item["material_request_plan_item"])

	def test_repeated_call_creates_no_duplicates(self):
		departments = {
			"Main Kitchen": _department(
				"Main Kitchen", "Main Kitchen - WH",
				targets=[_target("X", [_component("RICE", 10.0)])],
			)
		}
		result = self._run(departments, outstanding_by_item={"RICE": 10.0})
		self.assertEqual(result["rows"], [])
		self.assertIsNone(result["material_request"])
		self.assertEqual(_FakeMaterialRequestDoc._created, [])

	def test_raised_requirement_creates_supplementary_request(self):
		departments = {
			"Main Kitchen": _department(
				"Main Kitchen", "Main Kitchen - WH",
				targets=[_target("X", [_component("RICE", 30.0)])],
			)
		}
		result = self._run(departments, outstanding_by_item={"RICE": 10.0})
		self.assertEqual(len(result["rows"]), 1)
		self.assertEqual(result["rows"][0]["qty"], 20.0)
		self.assertEqual(len(_FakeMaterialRequestDoc._created), 1)

	def test_mr_items_warehouse_is_department_not_store(self):
		departments = {
			"Main Kitchen": _department(
				"Main Kitchen", "Main Kitchen - WH",
				targets=[_target("X", [_component("RICE", 10.0)])],
			)
		}
		self._run(departments)
		self.assertTrue(self.plan_doc.mr_items)
		for row in self.plan_doc.mr_items:
			self.assertEqual(row.fields["warehouse"], "Main Kitchen - WH")
			self.assertNotEqual(row.fields["warehouse"], "Store WH - U")

	def test_missing_store_warehouse_blocks_creation(self):
		departments = {
			"Main Kitchen": _department(
				"Main Kitchen", "Main Kitchen - WH",
				targets=[_target("X", [_component("RICE", 10.0)])],
			)
		}
		result = self._run(departments, store_warehouse=None)
		self.assertIsNone(result["material_request"])
		self.assertTrue(any(b["type"] == "store_warehouse_not_configured" for b in result["blockers"]))
		self.assertEqual(_FakeMaterialRequestDoc._created, [])


class TestExistingTransferQtyByItem(FrappeTestCase):
	def test_empty_plan_list_short_circuits_without_a_query(self):
		with patch(f"{MOD}.frappe.db.sql") as mock_sql:
			self.assertEqual(xfer_module._existing_transfer_qty_by_item([]), {})
			mock_sql.assert_not_called()

	def test_restricted_to_transfer_type_and_submitted_only(self):
		with patch(f"{MOD}.frappe.db.sql", return_value=[{"item_code": "RICE", "qty": 12.0}]) as mock_sql:
			result = xfer_module._existing_transfer_qty_by_item(["MFG-PP-0001"])
		self.assertEqual(result, {"RICE": 12.0})
		sql_text = mock_sql.call_args[0][0]
		self.assertIn("material_request_type", sql_text)
		self.assertIn("docstatus = 1", sql_text)
		params = mock_sql.call_args[0][1]
		self.assertEqual(params["material_request_type"], "Material Transfer")


class TestLockStoreBins(FrappeTestCase):
	"""D9 -- deterministic ascending lock order, no Bin row created."""

	def test_locks_are_sorted_ascending_by_item_code(self):
		observed_order = []
		with patch(f"{MOD}.frappe.db.sql") as mock_sql:
			locked = xfer_module._lock_store_bins(
				"Store WH - U", ["RICE", "ATTA", "SUGAR"], on_lock=observed_order.append
			)
		self.assertEqual(observed_order, [
			("ATTA", "Store WH - U"), ("RICE", "Store WH - U"), ("SUGAR", "Store WH - U"),
		])
		self.assertEqual(locked, observed_order)
		self.assertEqual(mock_sql.call_count, 3)
		for call in mock_sql.call_args_list:
			self.assertIn("for update", call[0][0])

	def test_duplicate_item_codes_locked_once(self):
		with patch(f"{MOD}.frappe.db.sql") as mock_sql:
			locked = xfer_module._lock_store_bins("Store WH - U", ["RICE", "RICE"])
		self.assertEqual(locked, [("RICE", "Store WH - U")])
		self.assertEqual(mock_sql.call_count, 1)

	def test_never_creates_a_bin_row_it_only_selects(self):
		with patch(f"{MOD}.frappe.db.sql") as mock_sql:
			xfer_module._lock_store_bins("Store WH - U", ["RICE"])
		sql_text = mock_sql.call_args[0][0].lower()
		self.assertIn("select", sql_text)
		self.assertNotIn("insert", sql_text)
		self.assertNotIn("into `tabbin`", sql_text)


class TestExecuteStoreToDepartmentTransfer(FrappeTestCase):
	def setUp(self):
		_FakeStockEntryDoc._created = []
		self.lock_calls = []

	def _run(self, departments, bin_qty, linked_mrs=("MAT-MR-0001",), mapped_items_by_mr=None,
			  plan_kwargs=None, store_warehouse="Store WH - U"):
		mapped_items_by_mr = mapped_items_by_mr if mapped_items_by_mr is not None else {
			mr: [{"item_code": "RICE", "qty": 1.0}] for mr in linked_mrs
		}
		plan_doc = _FakeProductionPlanDoc("MFG-PP-0001", **(plan_kwargs or {}))

		def fake_get_doc(doctype, name=None):
			if doctype == "URY Sales Plan":
				return _FakeSalesPlanDoc(name)
			if doctype == "Production Plan":
				return plan_doc
			raise AssertionError(f"Unexpected frappe.get_doc(doctype) call: {doctype}")

		def fake_make_stock_entry(material_request):
			return _FakeStockEntryDoc(mapped_items_by_mr.get(material_request, []))

		def fake_lock(store_wh, item_codes, on_lock=None):
			locked = []
			for item_code in sorted(set(item_codes)):
				key = (item_code, store_wh)
				self.lock_calls.append(key)
				locked.append(key)
			return locked

		with patch(f"{MOD}.frappe.has_permission", return_value=True), \
				patch(f"{MOD}.frappe.get_doc", side_effect=fake_get_doc), \
				patch(f"{MOD}.compile_production_targets", return_value=(departments, [])), \
				patch(f"{MOD}.get_store_warehouse", return_value=store_warehouse), \
				patch("ury.ury.api.ury_production_readiness.get_store_warehouse", return_value=store_warehouse), \
				patch(f"{MOD}._linked_transfer_material_requests", return_value=list(linked_mrs)), \
				patch(f"{MOD}.erpnext_make_stock_entry", side_effect=fake_make_stock_entry), \
				patch(f"{MOD}._lock_store_bins", side_effect=fake_lock), \
				patch("ury.ury.api.ury_production_readiness.frappe.db.get_value", side_effect=_bin_fake(bin_qty)):
			return execute_store_to_department_transfer("MFG-PP-0001"), plan_doc

	def test_store_shortage_blocks_transfer_before_any_mutation(self):
		departments = {
			"Main Kitchen": _department(
				"Main Kitchen", "Main Kitchen - WH",
				targets=[_target("X", [_component("RICE", 20.0)])],
			)
		}
		# Department has none, Store has less than the 20 needed.
		bin_qty = {("RICE", "Main Kitchen - WH"): 0.0, ("RICE", "Store WH - U"): 5.0}
		result, _plan = self._run(departments, bin_qty)

		self.assertEqual(result["stock_entries"], [])
		self.assertTrue(any(b["type"] == "store_shortage" for b in result["blockers"]))
		self.assertEqual(result["locked_bins"], [])
		self.assertEqual(self.lock_calls, [])
		self.assertEqual(_FakeStockEntryDoc._created, [])

	def test_sufficient_store_stock_executes_and_locks_in_order(self):
		departments = {
			"Main Kitchen": _department(
				"Main Kitchen", "Main Kitchen - WH",
				targets=[
					_target("X", [_component("RICE", 10.0), _component("ATTA", 5.0)]),
				],
			)
		}
		bin_qty = {
			("RICE", "Main Kitchen - WH"): 0.0, ("ATTA", "Main Kitchen - WH"): 0.0,
			("RICE", "Store WH - U"): 50.0, ("ATTA", "Store WH - U"): 50.0,
		}
		result, _plan = self._run(
			departments, bin_qty,
			mapped_items_by_mr={"MAT-MR-0001": [{"item_code": "RICE", "qty": 10.0}, {"item_code": "ATTA", "qty": 5.0}]},
		)

		self.assertEqual(self.lock_calls, [("ATTA", "Store WH - U"), ("RICE", "Store WH - U")])
		self.assertEqual(result["locked_bins"], self.lock_calls)
		self.assertEqual(len(result["stock_entries"]), 1)
		self.assertEqual(_FakeStockEntryDoc._created[0].inserted, True)
		self.assertEqual(_FakeStockEntryDoc._created[0].submitted, True)

	def test_no_linked_transfer_request_is_reported_not_silently_skipped(self):
		departments = {
			"Main Kitchen": _department(
				"Main Kitchen", "Main Kitchen - WH",
				targets=[_target("X", [_component("RICE", 10.0)])],
			)
		}
		bin_qty = {("RICE", "Main Kitchen - WH"): 0.0, ("RICE", "Store WH - U"): 100.0}
		result, _plan = self._run(departments, bin_qty, linked_mrs=())

		self.assertEqual(result["stock_entries"], [])
		self.assertTrue(any(b["type"] == "transfer_material_request_missing" for b in result["blockers"]))
		# Locks were still taken -- the missing-MR blocker is discovered only
		# after revalidation succeeds, at the last possible step.
		self.assertTrue(result["locked_bins"])

	def test_fully_transferred_mr_creates_no_stock_entry(self):
		"""The mapper returning no items means "nothing left to transfer" --
		reused/skipped, not an error, and not a duplicate transfer."""
		departments = {
			"Main Kitchen": _department(
				"Main Kitchen", "Main Kitchen - WH",
				targets=[_target("X", [_component("RICE", 10.0)])],
			)
		}
		bin_qty = {("RICE", "Main Kitchen - WH"): 0.0, ("RICE", "Store WH - U"): 100.0}
		result, _plan = self._run(departments, bin_qty, mapped_items_by_mr={"MAT-MR-0001": []})

		self.assertEqual(result["stock_entries"], [])
		self.assertEqual(_FakeStockEntryDoc._created, [])
		self.assertEqual(result["blockers"], [])

	def test_missing_store_warehouse_blocks_before_any_lock(self):
		departments = {
			"Main Kitchen": _department(
				"Main Kitchen", "Main Kitchen - WH",
				targets=[_target("X", [_component("RICE", 10.0)])],
			)
		}
		result, _plan = self._run(departments, bin_qty={}, store_warehouse=None)
		self.assertEqual(result["stock_entries"], [])
		self.assertTrue(any(b["type"] == "store_warehouse_not_configured" for b in result["blockers"]))
		self.assertEqual(self.lock_calls, [])

	def test_department_stock_already_sufficient_needs_no_lock(self):
		departments = {
			"Main Kitchen": _department(
				"Main Kitchen", "Main Kitchen - WH",
				targets=[_target("X", [_component("RICE", 10.0)])],
			)
		}
		bin_qty = {("RICE", "Main Kitchen - WH"): 10.0, ("RICE", "Store WH - U"): 0.0}
		result, _plan = self._run(departments, bin_qty, linked_mrs=())

		self.assertEqual(result["stock_entries"], [])
		self.assertEqual(result["blockers"], [])
		self.assertEqual(self.lock_calls, [])

	def test_non_submitted_production_plan_is_rejected(self):
		departments = {
			"Main Kitchen": _department("Main Kitchen", "Main Kitchen - WH", targets=[]),
		}
		with self.assertRaises(Exception):
			self._run(departments, bin_qty={}, plan_kwargs={"docstatus": 0})


class TestRevalidationUnderLock(FrappeTestCase):
	"""D17 -- a picture that changes between preflight and the locked
	revalidation aborts, having created nothing."""

	def test_store_stock_consumed_between_preflight_and_lock_aborts_with_nothing_created(self):
		departments = {
			"Main Kitchen": _department(
				"Main Kitchen", "Main Kitchen - WH",
				targets=[_target("X", [_component("RICE", 10.0)])],
			)
		}
		plan_doc = _FakeProductionPlanDoc("MFG-PP-0001")

		def fake_get_doc(doctype, name=None):
			if doctype == "URY Sales Plan":
				return _FakeSalesPlanDoc(name)
			if doctype == "Production Plan":
				return plan_doc
			raise AssertionError(f"Unexpected frappe.get_doc(doctype) call: {doctype}")

		# First readiness call (preflight) sees enough Store stock; the
		# second (post-lock revalidation) sees a concurrent department has
		# already consumed it -- exactly the D17 race. compute_readiness
		# makes exactly two Bin reads (department, then store) per call for
		# this single-item scenario, so the first generation covers reads
		# 0-1 and the second covers everything from read 2 onward.
		bin_sequence = [
			{"RICE": {"Main Kitchen - WH": 0.0, "Store WH - U": 10.0}},
			{"RICE": {"Main Kitchen - WH": 0.0, "Store WH - U": 0.0}},
		]
		call_tracker = {"n": 0}

		def sequenced_get_value(doctype, filters, fieldname=None):
			generation = 0 if call_tracker["n"] < 2 else 1
			call_tracker["n"] += 1
			item_code = filters.get("item_code")
			warehouse = filters.get("warehouse")
			return bin_sequence[generation].get(item_code, {}).get(warehouse, 0.0)

		def fake_lock(store_wh, item_codes, on_lock=None):
			return [(code, store_wh) for code in sorted(set(item_codes))]

		with patch(f"{MOD}.frappe.has_permission", return_value=True), \
				patch(f"{MOD}.frappe.get_doc", side_effect=fake_get_doc), \
				patch(f"{MOD}.compile_production_targets", return_value=(departments, [])), \
				patch(f"{MOD}.get_store_warehouse", return_value="Store WH - U"), \
				patch("ury.ury.api.ury_production_readiness.get_store_warehouse", return_value="Store WH - U"), \
				patch(f"{MOD}._lock_store_bins", side_effect=fake_lock), \
				patch(f"{MOD}._linked_transfer_material_requests") as mock_linked, \
				patch(f"{MOD}.erpnext_make_stock_entry") as mock_make_stock_entry, \
				patch("ury.ury.api.ury_production_readiness.frappe.db.get_value", side_effect=sequenced_get_value):
			result = execute_store_to_department_transfer("MFG-PP-0001")

		self.assertEqual(result["stock_entries"], [])
		self.assertTrue(any(b["type"] == "store_shortage" for b in result["blockers"]))
		# The revalidation abort happens after locking but strictly before
		# any Material Request lookup or Stock Entry creation.
		mock_linked.assert_not_called()
		mock_make_stock_entry.assert_not_called()


if __name__ == "__main__":
	import unittest

	unittest.main()
