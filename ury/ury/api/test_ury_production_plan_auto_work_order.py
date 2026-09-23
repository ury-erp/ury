# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Tests for ury_production_plan_auto_work_order (Agent 7, Production Plan
Automation).

Following the same mocking convention as ``test_ury_work_order_hooks.py`` and
``test_ury_batch_manufacture_service.py``: no live bench/site DB dependency
beyond what ``FrappeTestCase`` gives us. ``frappe.new_doc``/``frappe.get_doc``/
``frappe.get_all``/``frappe.db.get_value`` are patched at the module boundary
against an in-memory ``_FakeWorkOrderStore`` standing in for the database, so
these tests exercise this module's *own* logic (create-or-reuse keying,
dependency ordering, remaining-quantity computation, the vector-integrity
check) without needing a real Company/Item/BOM fixture set.

``ury_work_order_hooks.apply_ury_warehouse_policy``/``apply_ury_required_items``
are deliberately NOT mocked -- the real functions run against the fake Work
Order doc below, the same way they would run against a real one, so these
tests also catch a real regression in how this module drives that hook
module's public API.
"""

from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_production_plan_auto_work_order import (
	WorkOrderExecutionError,
	_verify_component_vector,
	create_manufacture_entry,
	execute_department_targets,
	find_existing_work_order,
	get_or_create_work_order,
)


MODULE = "ury.ury.api.ury_production_plan_auto_work_order"

DEPARTMENT_WAREHOUSE = "Main Kitchen - WH"


# --- fakes --------------------------------------------------------------------


class _Row:
	"""Mimics a Work Order Item child-table row (attribute access), the same
	stand-in ``test_ury_work_order_hooks.py`` uses."""

	def __init__(self, **data):
		self.__dict__.update(data)

	def get(self, key, default=None):
		return getattr(self, key, default)


class _FakeWorkOrder:
	"""Stand-in for a real Work Order Document -- enough of the
	``.get``/``.set``/``.append``/attribute-access surface for the *real*
	``apply_ury_warehouse_policy``/``apply_ury_required_items`` to run
	against, plus the ``.insert()``/``.save()``/``.submit()`` lifecycle this
	module drives directly."""

	def __init__(self, store):
		self._store = store
		self.name = None
		self.docstatus = 0
		self.produced_qty = 0.0
		self.required_items = []
		self.flags = frappe._dict()

	def get(self, key, default=None):
		return getattr(self, key, default)

	def set(self, key, value):
		setattr(self, key, value)

	def append(self, key, row):
		rows = getattr(self, key, None)
		if rows is None:
			rows = []
			setattr(self, key, rows)
		new_row = _Row(**row)
		rows.append(new_row)
		return new_row

	def insert(self, ignore_permissions=False):
		self._store.register(self)

	def save(self):
		pass  # already registered -- nothing further to persist in this fake

	def submit(self):
		self.docstatus = 1


class _FakeWorkOrderStore:
	"""In-memory stand-in for the "Work Order" table this module reads/writes
	through ``frappe.new_doc``/``frappe.get_doc``/``frappe.get_all``/
	``frappe.db.get_value``."""

	def __init__(self):
		self._by_name = {}
		self._counter = 0

	def new_work_order(self):
		return _FakeWorkOrder(self)

	def register(self, work_order):
		self._counter += 1
		work_order.name = f"WO-{self._counter}"
		self._by_name[work_order.name] = work_order

	def get(self, name):
		return self._by_name[name]

	def seed_submitted(self, **data):
		"""Pre-seed an already-submitted Work Order (simulating an earlier
		execution), returning it."""
		wo = self.new_work_order()
		for key, value in data.items():
			setattr(wo, key, value)
		self.register(wo)
		wo.docstatus = 1
		return wo

	def match(self, filters, order_by=None):
		"""Generic filter matching, driven entirely by whatever keys the
		caller's ``frappe.get_all(filters=...)`` actually passes -- unlike an
		earlier version of this fake, it must NOT assume every query filters
		on every field (``_dependency_already_fully_produced`` deliberately
		queries by ``production_plan``/``production_item``/``docstatus``
		only, never ``bom_no``, since it doesn't know the dependency's BOM)."""
		matches = []
		for wo in self._by_name.values():
			if self._row_matches(wo, filters):
				matches.append(wo)
		if order_by and "desc" in order_by:
			matches = list(reversed(matches))
		return matches

	@staticmethod
	def _row_matches(wo, filters):
		for key, expected in filters.items():
			if key == "docstatus" and isinstance(expected, list):
				op, bound = expected
				if op == "<" and not (wo.docstatus < bound):
					return False
				continue
			if wo.get(key) != expected:
				return False
		return True

	def record_manufacture(self, work_order_name, qty):
		wo = self._by_name[work_order_name]
		wo.produced_qty = float(wo.produced_qty) + float(qty)


class _FakeStockEntry:
	"""Stand-in for what ``frappe.get_doc(stock_entry_dict)`` wraps
	``work_order.make_stock_entry``'s raw dict into."""

	_counter = 0

	def __init__(self, data, store):
		self._data = dict(data)
		self._store = store
		self.name = None
		self.docstatus = 0

	def insert(self, ignore_permissions=False):
		_FakeStockEntry._counter += 1
		self.name = f"MFG-STE-{_FakeStockEntry._counter}"

	def submit(self):
		self.docstatus = 1
		self._store.record_manufacture(self._data["work_order"], self._data["fg_completed_qty"])


def _wire_fake_frappe(store):
	"""Start (and return, for ``addCleanup(patch.stopall)``) patches wiring
	``frappe.new_doc``/``get_doc``/``get_all``/``db.get_value`` against
	``store`` instead of a real database."""

	def _new_doc(doctype):
		assert doctype == "Work Order", doctype
		return store.new_work_order()

	def _get_doc(*args):
		if len(args) == 1 and isinstance(args[0], dict):
			return _FakeStockEntry(args[0], store)
		doctype, name = args
		assert doctype == "Work Order", doctype
		return store.get(name)

	def _get_all(doctype, filters=None, fields=None, order_by=None, limit=None):
		assert doctype == "Work Order", doctype
		fields = fields or ["name"]
		rows = store.match(filters or {}, order_by=order_by)
		if limit:
			rows = rows[:limit]
		return [{field: getattr(wo, field, None) for field in fields} for wo in rows]

	def _get_value(doctype, name, fields):
		assert doctype == "Work Order", doctype
		wo = store.get(name)
		return [getattr(wo, field) for field in fields]

	patch(f"{MODULE}.frappe.new_doc", side_effect=_new_doc).start()
	patch(f"{MODULE}.frappe.get_doc", side_effect=_get_doc).start()
	patch(f"{MODULE}.frappe.get_all", side_effect=_get_all).start()
	patch(f"{MODULE}.frappe.db.get_value", side_effect=_get_value).start()


def _production_plan(
	name="PP-KITCHEN-1",
	company="Company A",
	department_warehouse=DEPARTMENT_WAREHOUSE,
	assembly_items=None,
):
	"""``assembly_items`` is ``[(item_code, bom_no), ...]`` for ``po_items`` --
	needed so Work Orders can set ``production_plan_item`` the way ERPNext does."""
	if assembly_items is None:
		assembly_items = [("BIRYANI-BASE", "BOM-BIRYANI-BASE-001")]
	return frappe._dict(
		{
			"name": name,
			"company": company,
			"custom_ury_department_warehouse": department_warehouse,
			"po_items": [
				_Row(name=f"ppi-{item_code}", item_code=item_code, bom_no=bom_no)
				for item_code, bom_no in assembly_items
			],
		}
	)


def _target(item_code="BIRYANI-BASE", bom_no="BOM-BIRYANI-BASE-001", required_qty=20.0, component_vector=None,
			depends_on=None, sourcing_mode="IN_HOUSE", skip_work_order=False):
	return {
		"item_code": item_code,
		"bom_no": bom_no,
		"required_qty": required_qty,
		"stock_uom": "Kg",
		"department": "Main Kitchen",
		"warehouse": DEPARTMENT_WAREHOUSE,
		"sourcing_mode": sourcing_mode,
		"skip_work_order": skip_work_order,
		"component_vector": component_vector or [{"item_code": "Rice", "required_qty": 4.0, "stock_uom": "Kg"}],
		"depends_on": depends_on or [],
	}


def _make_stock_entry_side_effect():
	"""``erpnext...work_order.make_stock_entry`` returns a plain dict
	(``stock_entry.as_dict()``) -- this mirrors its shape closely enough for
	``_FakeStockEntry``/``record_manufacture`` to use."""

	def _make(work_order_name, purpose, qty=None, **kwargs):
		return {
			"doctype": "Stock Entry",
			"purpose": purpose,
			"work_order": work_order_name,
			"fg_completed_qty": qty,
			"items": [],
		}

	return _make


# --- find_existing_work_order -------------------------------------------------


class TestFindExistingWorkOrder(FrappeTestCase):
	def test_returns_none_when_nothing_matches(self):
		with patch(f"{MODULE}.frappe.get_all", return_value=[]):
			self.assertIsNone(find_existing_work_order("PP-1", "ITEM-1", "BOM-1"))

	def test_returns_the_single_match(self):
		with patch(f"{MODULE}.frappe.get_all", return_value=[{"name": "WO-1", "docstatus": 1}]):
			self.assertEqual(find_existing_work_order("PP-1", "ITEM-1", "BOM-1"), "WO-1")

	def test_queries_by_the_deterministic_key_and_excludes_cancelled(self):
		with patch(f"{MODULE}.frappe.get_all", return_value=[]) as mock_get_all:
			find_existing_work_order("PP-1", "ITEM-1", "BOM-1")
		_, kwargs = mock_get_all.call_args
		self.assertEqual(
			kwargs["filters"],
			{"production_plan": "PP-1", "production_item": "ITEM-1", "bom_no": "BOM-1", "docstatus": ["<", 2]},
		)

	def test_raises_when_more_than_one_match_is_found(self):
		with patch(
			f"{MODULE}.frappe.get_all",
			return_value=[{"name": "WO-1", "docstatus": 0}, {"name": "WO-2", "docstatus": 1}],
		):
			with self.assertRaises(WorkOrderExecutionError):
				find_existing_work_order("PP-1", "ITEM-1", "BOM-1")


# --- _verify_component_vector -------------------------------------------------


class _DocWithRequiredItems:
	def __init__(self, rows, name="WO-1"):
		self.name = name
		self._rows = rows

	def get(self, key, default=None):
		if key == "required_items":
			return self._rows
		return default


class TestVerifyComponentVector(FrappeTestCase):
	def test_passes_when_rows_match_the_vector(self):
		doc = _DocWithRequiredItems([_Row(item_code="Rice", required_qty=4.0)])
		_verify_component_vector(doc, [{"item_code": "Rice", "required_qty": 4.0}])  # does not raise

	def test_passes_within_floating_point_tolerance(self):
		doc = _DocWithRequiredItems([_Row(item_code="Rice", required_qty=4.0000001)])
		_verify_component_vector(doc, [{"item_code": "Rice", "required_qty": 4.0}])  # does not raise

	def test_raises_when_an_item_is_missing_from_the_persisted_rows(self):
		doc = _DocWithRequiredItems([_Row(item_code="Rice", required_qty=4.0)])
		with self.assertRaises(WorkOrderExecutionError):
			_verify_component_vector(
				doc, [{"item_code": "Rice", "required_qty": 4.0}, {"item_code": "Masala", "required_qty": 1.0}]
			)

	def test_raises_when_a_quantity_was_silently_reset(self):
		# The scenario this guards against: ERPNext's own
		# set_required_items(reset_only_qty=True) clobbers a row's
		# required_qty back to a naive single-level BOM value, dropping a
		# nested contribution the compiler had accumulated into it.
		doc = _DocWithRequiredItems([_Row(item_code="Rice", required_qty=2.0)])
		with self.assertRaises(WorkOrderExecutionError):
			_verify_component_vector(doc, [{"item_code": "Rice", "required_qty": 4.0}])


# --- get_or_create_work_order / create ---------------------------------------


class TestGetOrCreateWorkOrder(FrappeTestCase):
	def setUp(self):
		self.store = _FakeWorkOrderStore()
		_wire_fake_frappe(self.store)
		self.addCleanup(patch.stopall)

	def test_creates_a_new_work_order_with_the_compiled_vector_and_warehouse_policy(self):
		production_plan = _production_plan()
		target = _target()

		work_order, created = get_or_create_work_order(production_plan, target)

		self.assertTrue(created)
		self.assertEqual(work_order.production_plan, production_plan.name)
		self.assertEqual(work_order.production_plan_item, "ppi-BIRYANI-BASE")
		self.assertEqual(work_order.production_item, "BIRYANI-BASE")
		self.assertEqual(work_order.bom_no, "BOM-BIRYANI-BASE-001")
		self.assertEqual(work_order.qty, 20.0)
		self.assertEqual(work_order.use_multi_level_bom, 0)
		self.assertEqual(work_order.docstatus, 1)  # submitted

		# D13/D16 warehouse policy.
		self.assertEqual(work_order.skip_transfer, 1)
		self.assertIsNone(work_order.wip_warehouse)
		self.assertEqual(work_order.source_warehouse, DEPARTMENT_WAREHOUSE)
		self.assertEqual(work_order.fg_warehouse, DEPARTMENT_WAREHOUSE)

		# D1 component vector, verbatim.
		self.assertEqual(len(work_order.required_items), 1)
		self.assertEqual(work_order.required_items[0].item_code, "Rice")
		self.assertEqual(work_order.required_items[0].required_qty, 4.0)
		self.assertEqual(work_order.required_items[0].source_warehouse, DEPARTMENT_WAREHOUSE)

	def test_reuses_an_existing_submitted_work_order_without_touching_required_items(self):
		production_plan = _production_plan()
		target = _target()
		existing = self.store.seed_submitted(
			production_plan=production_plan.name,
			production_item=target["item_code"],
			bom_no=target["bom_no"],
			qty=20.0,
		)
		existing.required_items = [_Row(item_code="Consumed Already", required_qty=99, consumed_qty=5)]

		work_order, created = get_or_create_work_order(production_plan, target)

		self.assertFalse(created)
		self.assertIs(work_order, existing)
		self.assertEqual([row.item_code for row in work_order.required_items], ["Consumed Already"])

	def test_finishes_a_stray_draft_left_by_an_interrupted_earlier_attempt(self):
		production_plan = _production_plan()
		target = _target()
		draft = self.store.new_work_order()
		draft.production_plan = production_plan.name
		draft.production_item = target["item_code"]
		draft.bom_no = target["bom_no"]
		draft.qty = target["required_qty"]
		self.store.register(draft)
		self.assertEqual(draft.docstatus, 0)

		work_order, created = get_or_create_work_order(production_plan, target)

		self.assertFalse(created)
		self.assertIs(work_order, draft)
		self.assertEqual(work_order.docstatus, 1)
		self.assertEqual(work_order.required_items[0].item_code, "Rice")

	def test_second_call_for_the_same_target_reuses_rather_than_duplicates(self):
		production_plan = _production_plan()
		target = _target()

		first, first_created = get_or_create_work_order(production_plan, target)
		second, second_created = get_or_create_work_order(production_plan, target)

		self.assertTrue(first_created)
		self.assertFalse(second_created)
		self.assertEqual(first.name, second.name)


# --- create_manufacture_entry -------------------------------------------------


class TestCreateManufactureEntry(FrappeTestCase):
	def setUp(self):
		self.store = _FakeWorkOrderStore()
		_wire_fake_frappe(self.store)
		self.addCleanup(patch.stopall)

	def test_produces_the_remaining_quantity_through_make_stock_entry(self):
		wo = self.store.seed_submitted(qty=20.0, produced_qty=0.0)
		with patch(f"{MODULE}._wo_make_stock_entry", side_effect=_make_stock_entry_side_effect()) as mock_make:
			stock_entry_name = create_manufacture_entry(wo.name)

		mock_make.assert_called_once_with(wo.name, purpose="Manufacture", qty=20.0)
		self.assertIsNotNone(stock_entry_name)
		self.assertEqual(wo.produced_qty, 20.0)

	def test_resumes_from_the_remaining_quantity_on_a_partially_produced_work_order(self):
		wo = self.store.seed_submitted(qty=20.0, produced_qty=12.0)
		with patch(f"{MODULE}._wo_make_stock_entry", side_effect=_make_stock_entry_side_effect()) as mock_make:
			create_manufacture_entry(wo.name)

		mock_make.assert_called_once_with(wo.name, purpose="Manufacture", qty=8.0)
		self.assertEqual(wo.produced_qty, 20.0)

	def test_creates_nothing_when_fully_produced_already(self):
		wo = self.store.seed_submitted(qty=20.0, produced_qty=20.0)
		with patch(f"{MODULE}._wo_make_stock_entry") as mock_make:
			stock_entry_name = create_manufacture_entry(wo.name)

		mock_make.assert_not_called()
		self.assertIsNone(stock_entry_name)


# --- execute_department_targets -----------------------------------------------


def _assembly_items_for(*targets):
	seen = []
	for target in targets:
		key = (target["item_code"], target["bom_no"])
		if key not in seen:
			seen.append(key)
	return seen


def _plan_for(*targets):
	return _production_plan(assembly_items=_assembly_items_for(*targets) or None)


class TestExecuteDepartmentTargets(FrappeTestCase):
	def setUp(self):
		self.store = _FakeWorkOrderStore()
		_wire_fake_frappe(self.store)
		patch(f"{MODULE}._wo_make_stock_entry", side_effect=_make_stock_entry_side_effect()).start()
		self.addCleanup(patch.stopall)

	def test_each_target_gets_one_work_order_and_one_manufacture_entry(self):
		targets = [_target(item_code="RICE-BASE", bom_no="BOM-RICE-BASE", required_qty=10.0)]
		production_plan = _plan_for(*targets)

		results = execute_department_targets(production_plan, targets)

		self.assertEqual(len(results), 1)
		result = results[0]
		self.assertEqual(result["item_code"], "RICE-BASE")
		self.assertIsNotNone(result["work_order"])
		self.assertTrue(result["work_order_created"])
		self.assertIsNotNone(result["manufacture_stock_entry"])
		self.assertEqual(result["produced_qty"], 10.0)
		self.assertEqual(result["remaining_qty"], 0.0)

	def test_skip_work_order_target_gets_no_work_order_but_a_result_entry(self):
		# A MADE_TO_ORDER row's own target (see
		# ury_production_target_compiler's "MADE_TO_ORDER items" section):
		# a real po_items row exists, but this loop never builds a Work
		# Order for it. ury_work_order_hooks is the actual enforcement if
		# something else tries; this is just the well-behaved path.
		target = _target(item_code="CHICKEN-BIRYANI", skip_work_order=True)
		production_plan = _plan_for(target)

		results = execute_department_targets(production_plan, [target])

		self.assertEqual(len(results), 1)
		result = results[0]
		self.assertEqual(result["item_code"], "CHICKEN-BIRYANI")
		self.assertIsNone(result["work_order"])
		self.assertFalse(result["work_order_created"])
		self.assertIsNone(result["manufacture_stock_entry"])
		self.assertEqual(result["skipped"], "made_to_order")
		# Confirms no Work Order was ever attempted, not just that the
		# result looks right -- the fake store would show it if one had
		# been created.
		self.assertEqual(len(self.store._by_name), 0)

	def test_a_real_targets_dependency_on_a_nested_pre_produced_item_is_still_enforced(self):
		# The MTO row's own row is skipped, but a real, nested PRE_PRODUCED
		# dependency underneath it must still be produced first, and in the
		# right order -- skipping the consumer's Work Order does not skip
		# the dependency check.
		dependency = _target(item_code="BIRYANI-BASE", bom_no="BOM-BIRYANI-BASE-001", required_qty=20.0)
		mto_consumer = _target(
			item_code="CHICKEN-BIRYANI", bom_no="BOM-CHICKEN-BIRYANI", required_qty=100.0,
			depends_on=["BIRYANI-BASE"], skip_work_order=True,
		)
		production_plan = _plan_for(dependency, mto_consumer)

		results = execute_department_targets(production_plan, [dependency, mto_consumer])

		self.assertEqual([r["item_code"] for r in results], ["BIRYANI-BASE", "CHICKEN-BIRYANI"])
		self.assertIsNotNone(results[0]["work_order"])  # BIRYANI-BASE: real Work Order
		self.assertIsNone(results[1]["work_order"])  # CHICKEN-BIRYANI: skipped
		self.assertEqual(len(self.store._by_name), 1)

	def test_rejects_an_mto_consumer_submitted_before_its_real_dependency(self):
		dependency = _target(item_code="BIRYANI-BASE", bom_no="BOM-BIRYANI-BASE-001", required_qty=20.0)
		mto_consumer = _target(
			item_code="CHICKEN-BIRYANI", bom_no="BOM-CHICKEN-BIRYANI", required_qty=100.0,
			depends_on=["BIRYANI-BASE"], skip_work_order=True,
		)
		production_plan = _plan_for(dependency, mto_consumer)

		with self.assertRaises(WorkOrderExecutionError):
			execute_department_targets(production_plan, [mto_consumer, dependency])

	def test_dependencies_are_produced_before_their_consumers(self):
		dependency = _target(item_code="PREP-MIX", bom_no="BOM-PREP-MIX", required_qty=5.0)
		consumer = _target(
			item_code="BIRYANI-BASE",
			bom_no="BOM-BIRYANI-BASE-001",
			required_qty=20.0,
			depends_on=["PREP-MIX"],
		)
		production_plan = _plan_for(dependency, consumer)

		results = execute_department_targets(production_plan, [dependency, consumer])

		self.assertEqual([r["item_code"] for r in results], ["PREP-MIX", "BIRYANI-BASE"])
		for result in results:
			self.assertEqual(result["remaining_qty"], 0.0)

	def test_rejects_a_consumer_submitted_before_its_dependency(self):
		dependency = _target(item_code="PREP-MIX", bom_no="BOM-PREP-MIX", required_qty=5.0)
		consumer = _target(
			item_code="BIRYANI-BASE",
			bom_no="BOM-BIRYANI-BASE-001",
			required_qty=20.0,
			depends_on=["PREP-MIX"],
		)
		production_plan = _plan_for(dependency, consumer)

		with self.assertRaises(WorkOrderExecutionError):
			execute_department_targets(production_plan, [consumer, dependency])

	def test_a_dependency_already_fully_produced_by_an_earlier_call_satisfies_the_consumer(self):
		dependency_target = _target(item_code="PREP-MIX", bom_no="BOM-PREP-MIX", required_qty=5.0)
		consumer = _target(
			item_code="BIRYANI-BASE",
			bom_no="BOM-BIRYANI-BASE-001",
			required_qty=20.0,
			depends_on=["PREP-MIX"],
		)
		production_plan = _plan_for(dependency_target, consumer)
		# Simulate an earlier, already-completed call for the dependency alone.
		execute_department_targets(production_plan, [dependency_target])

		results = execute_department_targets(production_plan, [consumer])  # must not raise
		self.assertEqual(results[0]["item_code"], "BIRYANI-BASE")

	def test_rejects_an_external_receipt_target(self):
		production_plan = _production_plan()
		targets = [_target(sourcing_mode="EXTERNAL_RECEIPT")]

		with self.assertRaises(WorkOrderExecutionError):
			execute_department_targets(production_plan, targets)

	def test_repeated_execution_never_manufactures_twice(self):
		targets = [_target(item_code="RICE-BASE", bom_no="BOM-RICE-BASE", required_qty=10.0)]
		production_plan = _plan_for(*targets)

		first = execute_department_targets(production_plan, targets)
		second = execute_department_targets(production_plan, targets)

		self.assertTrue(first[0]["work_order_created"])
		self.assertFalse(second[0]["work_order_created"])
		self.assertIsNotNone(first[0]["manufacture_stock_entry"])
		self.assertIsNone(second[0]["manufacture_stock_entry"])
		self.assertEqual(first[0]["work_order"], second[0]["work_order"])

	def test_partial_production_resumes_from_the_remaining_quantity(self):
		target = _target(item_code="RICE-BASE", bom_no="BOM-RICE-BASE", required_qty=10.0)
		production_plan = _plan_for(target)

		first = execute_department_targets(production_plan, [target])
		work_order_name = first[0]["work_order"]
		# A prior partial manufacture -- e.g. a hand posting, or a previous
		# interrupted run -- left the Work Order at 4 out of 10 produced.
		self.store.get(work_order_name).produced_qty = 4.0

		results = execute_department_targets(production_plan, [target])

		self.assertFalse(results[0]["work_order_created"])
		self.assertEqual(results[0]["remaining_qty"], 0.0)
		self.assertEqual(results[0]["produced_qty"], 10.0)

	def test_no_work_order_is_created_on_production_plan_submit(self):
		# There is no on_submit entry point in this module any more -- Work
		# Orders are created only by calling execute_department_targets.
		self.assertFalse(hasattr(__import__(MODULE, fromlist=["*"]), "maybe_create_and_submit_work_orders"))
