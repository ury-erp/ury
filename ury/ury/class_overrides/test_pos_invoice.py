from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.class_overrides.pos_invoice import (
	CustomPOSInvoice,
	ProductBundleStockValidationError,
	get_bundle_component_warehouse,
	set_packed_item_warehouses,
)

RESOLVER = "ury.ury.doctype.ury_order.ury_order._department_warehouse_for_item"
WAREHOUSES = {
	"FG-LATTE": "Bar - T",
	"FG-BROWNIE": "Pastry - T",
	"FG-TOASTIE": "Hot Kitchen - T",
}


def _resolve(item_code, branch, company):
	return WAREHOUSES.get(item_code)


class TestBundleComponentWarehouse(FrappeTestCase):
	def test_resolves_each_component_to_its_own_warehouse(self):
		with patch(RESOLVER, side_effect=_resolve):
			self.assertEqual(get_bundle_component_warehouse("FG-LATTE", "Hot Kitchen - T", "B", "C"), "Bar - T")
			self.assertEqual(
				get_bundle_component_warehouse("FG-BROWNIE", "Hot Kitchen - T", "B", "C"), "Pastry - T"
			)

	def test_falls_back_to_row_warehouse_when_unresolved(self):
		with patch(RESOLVER, side_effect=_resolve):
			self.assertEqual(
				get_bundle_component_warehouse("UNCONFIGURED", "Hot Kitchen - T", "B", "C"), "Hot Kitchen - T"
			)

	def test_falls_back_without_branch(self):
		with patch(RESOLVER, side_effect=_resolve) as resolver:
			self.assertEqual(get_bundle_component_warehouse("FG-LATTE", "Hot Kitchen - T", None, "C"), "Hot Kitchen - T")
			resolver.assert_not_called()


class TestBundleStockValidation(FrappeTestCase):
	def setUp(self):
		self.invoice = CustomPOSInvoice({"doctype": "POS Invoice", "company": "C"})
		self.row = frappe._dict(item_code="FG-BUNDLE", warehouse="Hot Kitchen - T", stock_qty=2, idx=1)
		self.components = [
			frappe._dict(item_code="FG-LATTE", qty=1),
			frappe._dict(item_code="FG-BROWNIE", qty=1),
			frappe._dict(item_code="FG-TOASTIE", qty=1),
		]

	def test_required_qty_is_keyed_by_component_warehouse(self):
		with patch(RESOLVER, side_effect=_resolve):
			required = self.invoice._get_required_stock_qty(
				[self.row], {"FG-BUNDLE": self.components}, "B"
			)
		self.assertEqual(
			dict(required),
			{
				("FG-LATTE", "Bar - T"): 2,
				("FG-BROWNIE", "Pastry - T"): 2,
				("FG-TOASTIE", "Hot Kitchen - T"): 2,
			},
		)

	def test_non_bundle_row_keeps_row_warehouse(self):
		row = frappe._dict(item_code="FG-PLAIN", warehouse="Stores - T", stock_qty=3)
		required = self.invoice._get_required_stock_qty([row], {}, "B")
		self.assertEqual(dict(required), {("FG-PLAIN", "Stores - T"): 3})

	def test_passes_when_each_component_is_stocked_in_its_own_warehouse(self):
		with patch(RESOLVER, side_effect=_resolve):
			required = self.invoice._get_required_stock_qty([self.row], {"FG-BUNDLE": self.components}, "B")
			available = {key: 10 for key in required}
			self.invoice.validate_bundle_stock(self.row, self.components, required, available, set(required), "B")

	def test_reports_only_the_short_component_with_its_warehouse(self):
		with patch(RESOLVER, side_effect=_resolve):
			required = self.invoice._get_required_stock_qty([self.row], {"FG-BUNDLE": self.components}, "B")
			available = {key: 10 for key in required}
			available[("FG-TOASTIE", "Hot Kitchen - T")] = 0

			with self.assertRaises(ProductBundleStockValidationError) as ctx:
				self.invoice.validate_bundle_stock(
					self.row, self.components, required, available, set(required), "B"
				)

		message = str(ctx.exception)
		self.assertIn("FG-TOASTIE", message)
		self.assertIn("Hot Kitchen - T", message)
		self.assertNotIn("FG-LATTE", message)
		self.assertNotIn("FG-BROWNIE", message)


class TestSetPackedItemWarehouses(FrappeTestCase):
	def _doc(self):
		return frappe._dict(
			branch="B",
			company="C",
			pos_profile=None,
			items=[frappe._dict(name="row1", item_code="FG-BUNDLE", warehouse="Hot Kitchen - T")],
			packed_items=[
				frappe._dict(parent_detail_docname="row1", item_code=code, warehouse="Hot Kitchen - T")
				for code in ("FG-LATTE", "FG-BROWNIE", "FG-TOASTIE", "UNCONFIGURED")
			],
		)

	def test_packed_items_move_to_component_warehouses(self):
		doc = self._doc()
		with patch(RESOLVER, side_effect=_resolve):
			set_packed_item_warehouses(doc)

		self.assertEqual(
			{p.item_code: p.warehouse for p in doc.packed_items},
			{
				"FG-LATTE": "Bar - T",
				"FG-BROWNIE": "Pastry - T",
				"FG-TOASTIE": "Hot Kitchen - T",
				"UNCONFIGURED": "Hot Kitchen - T",
			},
		)

	def test_noop_without_branch_or_packed_items(self):
		doc = self._doc()
		doc.branch = None
		with patch(RESOLVER, side_effect=_resolve) as resolver:
			set_packed_item_warehouses(doc)
			resolver.assert_not_called()

		doc = self._doc()
		doc.packed_items = []
		with patch(RESOLVER, side_effect=_resolve) as resolver:
			set_packed_item_warehouses(doc)
			resolver.assert_not_called()
