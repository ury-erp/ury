# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Tests for ury_work_order_hooks (Agent 6, Production Plan Automation).

No live bench/site DB dependency is exercised beyond what FrappeTestCase
already gives us -- every Work Order / Production Plan involved is a plain
in-memory stand-in (``frappe._dict`` + a couple of small helper classes),
following the same mocking pattern as ``test_ury_manufacture_enforcement.py``
and ``test_ury_batch_manufacture_service.py``. ``frappe.db.get_value`` and
``frappe.get_doc`` are patched at the module boundary rather than hitting a
real Production Plan.
"""

from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_work_order_hooks import (
	apply_ury_required_items,
	apply_ury_warehouse_policy,
	get_linked_production_plan,
	is_ury_work_order,
	required_items_rewrite_allowed,
	validate,
)


MODULE = "ury.ury.api.ury_work_order_hooks"

DEPARTMENT_WAREHOUSE = "Main Kitchen - WH"


class _Row:
	"""Mimics a Work Order Item child-table row: attribute access, like a
	real Frappe child doc."""

	def __init__(self, **data):
		self.__dict__.update(data)

	def get(self, key, default=None):
		return getattr(self, key, default)


class _WorkOrderDoc:
	"""Stand-in for a Work Order document -- ``.get``/``.set``/``.append``,
	matching the subset of the Frappe ``Document`` API this module relies
	on (deliberately not a real ``frappe.get_doc`` since none of these
	tests touch the database)."""

	def __init__(self, **data):
		self._data = dict(data)
		self._data.setdefault("required_items", [])
		self.flags = frappe._dict()

	def get(self, key, default=None):
		return self._data.get(key, default)

	def set(self, key, value):
		self._data[key] = value

	def append(self, key, row):
		self._data.setdefault(key, []).append(_Row(**row))

	def __getattr__(self, key):
		# Mirror real Document attribute access, e.g. `doc.docstatus`.
		try:
			return self._data[key]
		except KeyError:
			raise AttributeError(key)


def _work_order(production_plan=None, docstatus=0, required_items=None, **extra):
	return _WorkOrderDoc(
		production_plan=production_plan,
		docstatus=docstatus,
		required_items=required_items or [],
		**extra,
	)


def _production_plan(sales_plan="SP-1", department_warehouse=DEPARTMENT_WAREHOUSE):
	return frappe._dict(
		{
			"custom_ury_sales_plan": sales_plan,
			"custom_ury_department_warehouse": department_warehouse,
		}
	)


class TestIsUryWorkOrder(FrappeTestCase):
	def test_false_when_no_production_plan_linked(self):
		doc = _work_order(production_plan=None)
		self.assertFalse(is_ury_work_order(doc))

	def test_false_when_production_plan_has_no_ury_sales_plan(self):
		doc = _work_order(production_plan="PP-1")
		with patch(f"{MODULE}.frappe.db.get_value", return_value=None) as mock_get_value:
			self.assertFalse(is_ury_work_order(doc))
		mock_get_value.assert_called_once_with("Production Plan", "PP-1", "custom_ury_sales_plan")

	def test_true_when_production_plan_has_ury_sales_plan(self):
		doc = _work_order(production_plan="PP-1")
		with patch(f"{MODULE}.frappe.db.get_value", return_value="SP-1"):
			self.assertTrue(is_ury_work_order(doc))

	def test_production_plan_item_alone_is_not_sufficient(self):
		# The old (replaced) policy keyed off `production_plan_item` alone.
		# A Work Order carrying it but no `production_plan` link at all must
		# not be treated as URY's.
		doc = _work_order(production_plan=None, production_plan_item="PPI-1")
		self.assertFalse(is_ury_work_order(doc))


class TestGetLinkedProductionPlan(FrappeTestCase):
	def test_returns_none_without_a_production_plan_link(self):
		doc = _work_order(production_plan=None)
		self.assertIsNone(get_linked_production_plan(doc))

	def test_fetches_the_linked_production_plan_doc(self):
		doc = _work_order(production_plan="PP-1")
		plan = _production_plan()
		with patch(f"{MODULE}.frappe.get_doc", return_value=plan) as mock_get_doc:
			self.assertIs(get_linked_production_plan(doc), plan)
		mock_get_doc.assert_called_once_with("Production Plan", "PP-1")


class TestApplyUryWarehousePolicy(FrappeTestCase):
	def test_sets_skip_transfer_and_clears_wip_warehouse(self):
		doc = _work_order(wip_warehouse="Some WIP - WH")
		apply_ury_warehouse_policy(doc, _production_plan())
		self.assertEqual(doc.get("skip_transfer"), 1)
		self.assertIsNone(doc.get("wip_warehouse"))

	def test_sets_source_and_fg_warehouse_to_department_warehouse(self):
		doc = _work_order()
		apply_ury_warehouse_policy(doc, _production_plan(department_warehouse=DEPARTMENT_WAREHOUSE))
		self.assertEqual(doc.get("source_warehouse"), DEPARTMENT_WAREHOUSE)
		self.assertEqual(doc.get("fg_warehouse"), DEPARTMENT_WAREHOUSE)

	def test_forces_every_existing_required_item_row_source_warehouse(self):
		rows = [
			_Row(item_code="Rice", source_warehouse="Store - WH"),
			_Row(item_code="Masala", source_warehouse=None),
		]
		doc = _work_order(required_items=rows)
		apply_ury_warehouse_policy(doc, _production_plan())
		for row in doc.get("required_items"):
			self.assertEqual(row.source_warehouse, DEPARTMENT_WAREHOUSE)

	def test_idempotent_on_repeated_calls(self):
		doc = _work_order(required_items=[_Row(item_code="Rice", source_warehouse="Store - WH")])
		plan = _production_plan()
		apply_ury_warehouse_policy(doc, plan)
		apply_ury_warehouse_policy(doc, plan)
		self.assertEqual(doc.get("skip_transfer"), 1)
		self.assertIsNone(doc.get("wip_warehouse"))
		self.assertEqual(doc.get("source_warehouse"), DEPARTMENT_WAREHOUSE)
		self.assertEqual(doc.get("fg_warehouse"), DEPARTMENT_WAREHOUSE)
		self.assertEqual(doc.get("required_items")[0].source_warehouse, DEPARTMENT_WAREHOUSE)


class TestApplyUryRequiredItems(FrappeTestCase):
	def test_replaces_rows_wholesale_from_the_component_vector(self):
		doc = _work_order(
			source_warehouse=DEPARTMENT_WAREHOUSE,
			required_items=[_Row(item_code="Stale Item", required_qty=99)],
		)
		component_vector = [
			{"item_code": "Rice", "required_qty": 4.0, "stock_uom": "Kg"},
			{"item_code": "Masala", "required_qty": 0.8, "stock_uom": "Kg"},
		]
		apply_ury_required_items(doc, component_vector)

		rows = doc.get("required_items")
		self.assertEqual(len(rows), 2)
		self.assertEqual(
			[(r.item_code, r.required_qty, r.stock_uom) for r in rows],
			[("Rice", 4.0, "Kg"), ("Masala", 0.8, "Kg")],
		)
		self.assertNotIn("Stale Item", [r.item_code for r in rows])

	def test_every_new_row_gets_the_work_orders_source_warehouse(self):
		doc = _work_order(source_warehouse=DEPARTMENT_WAREHOUSE)
		apply_ury_required_items(
			doc, [{"item_code": "Rice", "required_qty": 4.0, "stock_uom": "Kg"}]
		)
		self.assertEqual(doc.get("required_items")[0].source_warehouse, DEPARTMENT_WAREHOUSE)

	def test_empty_component_vector_clears_required_items(self):
		doc = _work_order(
			source_warehouse=DEPARTMENT_WAREHOUSE,
			required_items=[_Row(item_code="Rice", required_qty=4.0)],
		)
		apply_ury_required_items(doc, [])
		self.assertEqual(doc.get("required_items"), [])


class TestRequiredItemsRewriteAllowed(FrappeTestCase):
	def test_allowed_for_a_clean_draft(self):
		doc = _work_order(docstatus=0, required_items=[_Row(item_code="Rice", transferred_qty=0, consumed_qty=0)])
		self.assertTrue(required_items_rewrite_allowed(doc))

	def test_allowed_for_a_draft_with_no_required_items_at_all(self):
		doc = _work_order(docstatus=0, required_items=[])
		self.assertTrue(required_items_rewrite_allowed(doc))

	def test_disallowed_when_submitted(self):
		doc = _work_order(docstatus=1, required_items=[_Row(item_code="Rice", transferred_qty=0, consumed_qty=0)])
		self.assertFalse(required_items_rewrite_allowed(doc))

	def test_disallowed_when_cancelled(self):
		doc = _work_order(docstatus=2, required_items=[])
		self.assertFalse(required_items_rewrite_allowed(doc))

	def test_disallowed_when_any_row_has_transferred_qty(self):
		doc = _work_order(
			docstatus=0,
			required_items=[
				_Row(item_code="Rice", transferred_qty=0, consumed_qty=0),
				_Row(item_code="Masala", transferred_qty=2.5, consumed_qty=0),
			],
		)
		self.assertFalse(required_items_rewrite_allowed(doc))

	def test_disallowed_when_any_row_has_consumed_qty(self):
		doc = _work_order(
			docstatus=0,
			required_items=[_Row(item_code="Rice", transferred_qty=0, consumed_qty=1.0)],
		)
		self.assertFalse(required_items_rewrite_allowed(doc))


class TestValidateHook(FrappeTestCase):
	def test_noop_for_a_non_ury_work_order_with_no_production_plan(self):
		doc = _work_order(production_plan=None, wip_warehouse="Some WIP - WH")
		validate(doc)
		self.assertEqual(doc.get("wip_warehouse"), "Some WIP - WH")
		self.assertIsNone(doc.get("skip_transfer"))

	def test_noop_for_a_production_plan_without_a_ury_sales_plan(self):
		doc = _work_order(production_plan="PP-1", wip_warehouse="Some WIP - WH")
		plain_plan = frappe._dict({"custom_ury_sales_plan": None, "custom_ury_department_warehouse": None})
		with patch(f"{MODULE}.frappe.get_doc", return_value=plain_plan):
			validate(doc)
		self.assertEqual(doc.get("wip_warehouse"), "Some WIP - WH")
		self.assertIsNone(doc.get("skip_transfer"))

	def test_reasserts_warehouse_policy_for_a_ury_work_order(self):
		doc = _work_order(production_plan="PP-1", wip_warehouse="Some WIP - WH")
		with patch(f"{MODULE}.frappe.get_doc", return_value=_production_plan()):
			validate(doc)
		self.assertEqual(doc.get("skip_transfer"), 1)
		self.assertIsNone(doc.get("wip_warehouse"))
		self.assertEqual(doc.get("source_warehouse"), DEPARTMENT_WAREHOUSE)
		self.assertEqual(doc.get("fg_warehouse"), DEPARTMENT_WAREHOUSE)

	def test_reasserts_warehouse_policy_even_when_submitted(self):
		# D16: the warehouse policy itself is unconditional/idempotent.
		doc = _work_order(production_plan="PP-1", docstatus=1, wip_warehouse="Some WIP - WH")
		with patch(f"{MODULE}.frappe.get_doc", return_value=_production_plan()):
			validate(doc)
		self.assertEqual(doc.get("skip_transfer"), 1)
		self.assertIsNone(doc.get("wip_warehouse"))

	def test_does_not_touch_required_items_when_no_vector_is_supplied(self):
		rows = [_Row(item_code="Whatever ERPNext Exploded", required_qty=1)]
		doc = _work_order(production_plan="PP-1", docstatus=0, required_items=rows)
		with patch(f"{MODULE}.frappe.get_doc", return_value=_production_plan()):
			validate(doc)
		self.assertIs(doc.get("required_items"), rows)

	def test_rewrites_required_items_from_the_flagged_vector_on_a_clean_draft(self):
		doc = _work_order(
			production_plan="PP-1",
			docstatus=0,
			required_items=[_Row(item_code="Stale", required_qty=1, transferred_qty=0, consumed_qty=0)],
		)
		doc.flags.ury_component_vector = [
			{"item_code": "Rice", "required_qty": 4.0, "stock_uom": "Kg"},
		]
		with patch(f"{MODULE}.frappe.get_doc", return_value=_production_plan()):
			validate(doc)
		rows = doc.get("required_items")
		self.assertEqual(len(rows), 1)
		self.assertEqual(rows[0].item_code, "Rice")
		self.assertEqual(rows[0].source_warehouse, DEPARTMENT_WAREHOUSE)

	def test_never_rewrites_required_items_on_a_submitted_work_order(self):
		# Acceptance criterion: a submitted Work Order is never rewritten,
		# even if a caller supplied a component vector.
		original_rows = [_Row(item_code="Stale", required_qty=1, transferred_qty=0, consumed_qty=0)]
		doc = _work_order(production_plan="PP-1", docstatus=1, required_items=original_rows)
		doc.flags.ury_component_vector = [{"item_code": "Rice", "required_qty": 4.0, "stock_uom": "Kg"}]
		with patch(f"{MODULE}.frappe.get_doc", return_value=_production_plan()):
			validate(doc)
		self.assertIs(doc.get("required_items"), original_rows)

	def test_never_rewrites_required_items_with_transferred_qty(self):
		# Acceptance criterion: a Work Order with any transferred quantity
		# is never rewritten, even if a caller supplied a component vector.
		original_rows = [_Row(item_code="Rice", required_qty=4, transferred_qty=2.5, consumed_qty=0)]
		doc = _work_order(production_plan="PP-1", docstatus=0, required_items=original_rows)
		doc.flags.ury_component_vector = [{"item_code": "Masala", "required_qty": 1.0, "stock_uom": "Kg"}]
		with patch(f"{MODULE}.frappe.get_doc", return_value=_production_plan()):
			validate(doc)
		self.assertIs(doc.get("required_items"), original_rows)

	def test_never_rewrites_required_items_with_consumed_qty(self):
		original_rows = [_Row(item_code="Rice", required_qty=4, transferred_qty=0, consumed_qty=1.5)]
		doc = _work_order(production_plan="PP-1", docstatus=0, required_items=original_rows)
		doc.flags.ury_component_vector = [{"item_code": "Masala", "required_qty": 1.0, "stock_uom": "Kg"}]
		with patch(f"{MODULE}.frappe.get_doc", return_value=_production_plan()):
			validate(doc)
		self.assertIs(doc.get("required_items"), original_rows)


class TestDoesNotRegressExistingCallers(FrappeTestCase):
	"""`ury_mto_work_order_service` and `ury_batch_manufacture_service` both
	build Work Orders with `wip_warehouse = fg_warehouse = source`, and
	neither of them sets `production_plan` at all (verified by reading both
	modules directly). They must fall through the `is_ury_work_order`/
	`validate` no-op branch untouched."""

	def test_mto_style_work_order_is_not_ury(self):
		# ury_mto_work_order_service.create_work_orders_for_kot builds Work
		# Orders with wip_warehouse=fg_warehouse=context warehouse and no
		# production_plan link at all.
		doc = _work_order(production_plan=None, wip_warehouse="Kitchen - WH", fg_warehouse="Kitchen - WH")
		self.assertFalse(is_ury_work_order(doc))

	def test_batch_manufacture_style_work_order_is_not_ury(self):
		# ury_batch_manufacture_service._create_and_submit_work_order builds
		# Work Orders with wip_warehouse=fg_warehouse=source_warehouse,
		# skip_transfer=1, and no production_plan link at all.
		doc = _work_order(
			production_plan=None,
			wip_warehouse="Source - WH",
			fg_warehouse="Target - WH",
			skip_transfer=1,
		)
		self.assertFalse(is_ury_work_order(doc))

	def test_validate_hook_does_not_touch_an_mto_or_batch_style_work_order(self):
		doc = _work_order(
			production_plan=None,
			wip_warehouse="Source - WH",
			fg_warehouse="Target - WH",
			skip_transfer=1,
			required_items=[_Row(item_code="Rice", source_warehouse="Source - WH")],
		)
		with patch(f"{MODULE}.frappe.get_doc") as mock_get_doc:
			validate(doc)
		mock_get_doc.assert_not_called()
		self.assertEqual(doc.get("wip_warehouse"), "Source - WH")
		self.assertEqual(doc.get("fg_warehouse"), "Target - WH")
		self.assertEqual(doc.get("required_items")[0].source_warehouse, "Source - WH")
