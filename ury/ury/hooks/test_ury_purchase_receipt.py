# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt

"""Tests for ury.ury.hooks.ury_purchase_receipt.validate_receiving_secondary_measure
(the Receiving Secondary-Measure Variance hook, registered on Purchase
Receipt's `validate` doc_event) and its Item-side counterpart in
ury.ury.hooks.ury_item.validate_receiving_secondary_measure.

See ury_workspaces track yield-purchase-uom-bom-problem/PLAN.md sec 1.2/1.7
for the spec this implementation (and this test list) was written against.
"""

from __future__ import annotations

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import flt

TEST_COMPANY = "_Test Company"


def _get_company():
	return frappe.db.get_value("Company", {}, "name") or TEST_COMPANY


def _get_warehouse(company):
	warehouse = frappe.db.get_value(
		"Warehouse", {"company": company, "is_group": 0}, "name"
	)
	if warehouse:
		return warehouse
	# Fall back to creating a throwaway warehouse under the company.
	abbr = frappe.db.get_value("Company", company, "abbr") or "TC"
	name = f"Test RCV Warehouse - {abbr}"
	if not frappe.db.exists("Warehouse", name):
		frappe.get_doc(
			{
				"doctype": "Warehouse",
				"warehouse_name": "Test RCV Warehouse",
				"company": company,
			}
		).insert(ignore_permissions=True, ignore_mandatory=True)
	return name


def _get_supplier():
	name = "_Test RCV Supplier"
	if frappe.db.exists("Supplier", name):
		return name
	frappe.get_doc(
		{
			"doctype": "Supplier",
			"supplier_name": name,
			"supplier_group": frappe.db.get_value("Supplier Group", {}, "name")
			or "All Supplier Groups",
		}
	).insert(ignore_permissions=True, ignore_mandatory=True)
	return name


_counter = {"n": 0}


def _unique_item_code(prefix):
	_counter["n"] += 1
	return f"{prefix}-{_counter['n']}-{frappe.generate_hash(length=6)}"


def make_item(
	stock_uom="Nos",
	secondary_measure=None,
	std_secondary_per_stock_unit=None,
	tolerance_lower_pct=None,
	tolerance_upper_pct=None,
	item_code=None,
	**overrides,
):
	"""Create a throwaway stock Item, optionally configured for receiving
	secondary-measure tracking."""
	item_code = item_code or _unique_item_code("RCV-ITEM")
	fields = {
		"doctype": "Item",
		"item_code": item_code,
		"item_name": item_code,
		"item_group": "All Item Groups",
		"stock_uom": stock_uom,
		"is_stock_item": 1,
	}
	if secondary_measure:
		fields["custom_rcv_secondary_measure"] = secondary_measure
	if std_secondary_per_stock_unit is not None:
		fields["custom_rcv_std_secondary_per_stock_unit"] = std_secondary_per_stock_unit
	if tolerance_lower_pct is not None:
		fields["custom_rcv_tolerance_lower_pct"] = tolerance_lower_pct
	if tolerance_upper_pct is not None:
		fields["custom_rcv_tolerance_upper_pct"] = tolerance_upper_pct
	fields.update(overrides)
	doc = frappe.get_doc(fields)
	doc.insert(ignore_permissions=True, ignore_mandatory=True)
	return doc


def make_purchase_receipt(
	item_code,
	qty,
	rate=10,
	uom=None,
	conversion_factor=1,
	secondary_qty=None,
	do_submit=True,
	extra_row_fields=None,
	company=None,
	warehouse=None,
	supplier=None,
):
	company = company or _get_company()
	warehouse = warehouse or _get_warehouse(company)
	supplier = supplier or _get_supplier()

	item = frappe.get_doc("Item", item_code)
	row = {
		"item_code": item_code,
		"qty": qty,
		"rate": rate,
		"warehouse": warehouse,
		"uom": uom or item.stock_uom,
		"conversion_factor": conversion_factor,
	}
	if secondary_qty is not None:
		row["custom_rcv_secondary_qty"] = secondary_qty
	if extra_row_fields:
		row.update(extra_row_fields)

	pr = frappe.get_doc(
		{
			"doctype": "Purchase Receipt",
			"company": company,
			"supplier": supplier,
			"set_warehouse": warehouse,
			"items": [row],
		}
	)
	pr.insert(ignore_permissions=True, ignore_mandatory=True)
	if do_submit:
		pr.submit()
	return pr


class TestURYPurchaseReceiptSecondaryMeasureVariance(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")

	def tearDown(self):
		frappe.set_user("Administrator")

	# 1. Weight-tracked item, actual within tolerance -> off_spec = 0.
	def test_weight_tracked_within_tolerance_not_off_spec(self):
		item = make_item(
			stock_uom="Nos",
			secondary_measure="Weight",
			std_secondary_per_stock_unit=1.5,
			tolerance_lower_pct=5,
			tolerance_upper_pct=5,
		)
		pr = make_purchase_receipt(item.item_code, qty=10, secondary_qty=15.3)
		row = pr.items[0]
		self.assertEqual(row.custom_rcv_off_spec, 0)
		self.assertAlmostEqual(flt(row.custom_rcv_expected_secondary_qty), 15.0, places=3)
		self.assertAlmostEqual(
			flt(row.custom_rcv_actual_secondary_per_stock_unit), 1.53, places=3
		)

	# 2. Same item, actual outside tolerance -> off_spec = 1.
	def test_weight_tracked_outside_tolerance_is_off_spec(self):
		item = make_item(
			stock_uom="Nos",
			secondary_measure="Weight",
			std_secondary_per_stock_unit=1.5,
			tolerance_lower_pct=5,
			tolerance_upper_pct=5,
		)
		pr = make_purchase_receipt(item.item_code, qty=10, secondary_qty=20)
		row = pr.items[0]
		self.assertEqual(row.custom_rcv_off_spec, 1)

	# 3. custom_rcv_secondary_qty blank -> no error, computed fields stay 0.
	def test_blank_secondary_qty_is_advisory_only(self):
		item = make_item(
			stock_uom="Nos",
			secondary_measure="Weight",
			std_secondary_per_stock_unit=1.5,
		)
		pr = make_purchase_receipt(item.item_code, qty=10, secondary_qty=None)
		row = pr.items[0]
		self.assertEqual(flt(row.custom_rcv_actual_secondary_per_stock_unit), 0)
		self.assertEqual(flt(row.custom_rcv_variance_pct), 0)
		self.assertEqual(row.custom_rcv_off_spec, 0)
		self.assertEqual(pr.docstatus, 1)

	# 4. Item with custom_rcv_secondary_measure unset -> no fields touched, no exception.
	def test_item_without_secondary_measure_untouched(self):
		item = make_item(stock_uom="Nos")  # simulated "Rice"
		pr = make_purchase_receipt(item.item_code, qty=10, secondary_qty=5)
		row = pr.items[0]
		self.assertEqual(row.custom_rcv_item_secondary_measure, "")
		self.assertEqual(flt(row.custom_rcv_expected_secondary_qty), 0)
		self.assertEqual(row.custom_rcv_off_spec, 0)
		self.assertEqual(pr.docstatus, 1)

	# 5. Standard unset/0 -> no ZeroDivisionError, variance/off_spec stay 0.
	def test_zero_standard_no_zero_division(self):
		item = make_item(
			stock_uom="Nos",
			secondary_measure="Weight",
			std_secondary_per_stock_unit=0,
		)
		pr = make_purchase_receipt(item.item_code, qty=10, secondary_qty=15)
		row = pr.items[0]
		self.assertEqual(flt(row.custom_rcv_variance_pct), 0)
		self.assertEqual(row.custom_rcv_off_spec, 0)

	# 6. Return PR (is_return=1) -> hook must skip entirely.
	def test_return_receipt_skips_hook(self):
		item = make_item(
			stock_uom="Nos",
			secondary_measure="Weight",
			std_secondary_per_stock_unit=1.5,
		)
		original = make_purchase_receipt(item.item_code, qty=10, secondary_qty=15)

		warehouse = original.items[0].warehouse
		return_pr = frappe.get_doc(
			{
				"doctype": "Purchase Receipt",
				"company": original.company,
				"supplier": original.supplier,
				"is_return": 1,
				"return_against": original.name,
				"set_warehouse": warehouse,
				"items": [
					{
						"item_code": item.item_code,
						"qty": -10,
						"rate": 10,
						"warehouse": warehouse,
						"uom": item.stock_uom,
						"conversion_factor": 1,
						"purchase_receipt_item": original.items[0].name,
						"custom_rcv_secondary_qty": 15,
					}
				],
			}
		)
		return_pr.insert(ignore_permissions=True, ignore_mandatory=True)
		return_pr.submit()
		row = return_pr.items[0]
		self.assertEqual(flt(row.custom_rcv_variance_pct), 0)
		self.assertEqual(row.custom_rcv_off_spec, 0)
		self.assertEqual(flt(row.custom_rcv_expected_secondary_qty), 0)

	# 7. Non-stock purchase UOM (conversion_factor != 1) -> computed against stock_qty.
	def test_non_stock_uom_uses_stock_qty(self):
		item = make_item(
			stock_uom="Nos",
			secondary_measure="Weight",
			std_secondary_per_stock_unit=1.5,
		)
		if not frappe.db.exists("UOM", "Box of 10"):
			frappe.get_doc({"doctype": "UOM", "uom_name": "Box of 10"}).insert(
				ignore_permissions=True
			)
		if not frappe.db.exists(
			"UOM Conversion Detail", {"parent": item.item_code, "uom": "Box of 10"}
		):
			item.append(
				"uoms", {"uom": "Box of 10", "conversion_factor": 10}
			)
			item.save(ignore_permissions=True)

		# 2 boxes of 10 -> stock_qty = 20, secondary_qty entered = 33.
		pr = make_purchase_receipt(
			item.item_code,
			qty=2,
			uom="Box of 10",
			conversion_factor=10,
			secondary_qty=33,
		)
		row = pr.items[0]
		self.assertEqual(flt(row.qty), 2)
		self.assertEqual(flt(row.stock_qty), 20)
		self.assertAlmostEqual(flt(row.custom_rcv_expected_secondary_qty), 30.0, places=3)
		self.assertAlmostEqual(
			flt(row.custom_rcv_actual_secondary_per_stock_unit), 1.65, places=3
		)

	# 8. Amended receipt after Item's standard was revised -> snapshot carries original.
	def test_amended_receipt_keeps_original_standard_snapshot(self):
		item = make_item(
			stock_uom="Nos",
			secondary_measure="Weight",
			std_secondary_per_stock_unit=1.5,
		)
		original = make_purchase_receipt(item.item_code, qty=10, secondary_qty=15)
		self.assertAlmostEqual(
			flt(original.items[0].custom_rcv_std_secondary_snapshot), 1.5, places=3
		)

		# Revise the Item's standard after submission.
		item.reload()
		item.custom_rcv_std_secondary_per_stock_unit = 2.0
		item.save(ignore_permissions=True)

		original.reload()
		original.cancel()

		amended = frappe.copy_doc(original)
		amended.amended_from = original.name
		amended.docstatus = 0
		amended.insert(ignore_permissions=True, ignore_mandatory=True)
		amended.submit()

		self.assertAlmostEqual(
			flt(amended.items[0].custom_rcv_std_secondary_snapshot), 1.5, places=3
		)

	# 9. Toggling tracking off / clearing entered value then re-saving draft -> fields reset.
	def test_reset_on_resave_after_clearing(self):
		item = make_item(
			stock_uom="Nos",
			secondary_measure="Weight",
			std_secondary_per_stock_unit=1.5,
		)
		pr = make_purchase_receipt(
			item.item_code, qty=10, secondary_qty=20, do_submit=False
		)
		row = pr.items[0]
		self.assertEqual(row.custom_rcv_off_spec, 1)

		row.custom_rcv_secondary_qty = None
		pr.save(ignore_permissions=True)
		row = pr.items[0]
		self.assertEqual(flt(row.custom_rcv_actual_secondary_per_stock_unit), 0)
		self.assertEqual(flt(row.custom_rcv_variance_pct), 0)
		self.assertEqual(row.custom_rcv_off_spec, 0)

	# 10. Receipt created via frappe.get_doc(...).insert() (API-style) -> hook still fires.
	def test_api_style_insert_fires_hook(self):
		item = make_item(
			stock_uom="Nos",
			secondary_measure="Weight",
			std_secondary_per_stock_unit=1.5,
		)
		company = _get_company()
		warehouse = _get_warehouse(company)
		supplier = _get_supplier()
		pr = frappe.get_doc(
			{
				"doctype": "Purchase Receipt",
				"company": company,
				"supplier": supplier,
				"set_warehouse": warehouse,
				"items": [
					{
						"item_code": item.item_code,
						"qty": 10,
						"rate": 10,
						"warehouse": warehouse,
						"uom": item.stock_uom,
						"conversion_factor": 1,
						"custom_rcv_secondary_qty": 15,
					}
				],
			}
		)
		pr.insert(ignore_permissions=True, ignore_mandatory=True)
		row = pr.items[0]
		self.assertEqual(row.custom_rcv_item_secondary_measure, "Weight")
		self.assertAlmostEqual(flt(row.custom_rcv_expected_secondary_qty), 15.0, places=3)

	# 11. Setting custom_rcv_variance_reason on an already-submitted PR must succeed.
	def test_variance_reason_editable_after_submit(self):
		item = make_item(
			stock_uom="Nos",
			secondary_measure="Weight",
			std_secondary_per_stock_unit=1.5,
		)
		pr = make_purchase_receipt(item.item_code, qty=10, secondary_qty=20)
		self.assertEqual(pr.docstatus, 1)
		pr.items[0].custom_rcv_variance_reason = "Supplier Note"
		pr.save(ignore_permissions=True)
		pr.reload()
		self.assertEqual(pr.items[0].custom_rcv_variance_reason, "Supplier Note")

	# 12. qty = 0 row (fully rejected line) with secondary_qty entered -> no ZeroDivisionError.
	def test_zero_qty_row_no_zero_division(self):
		item = make_item(
			stock_uom="Nos",
			secondary_measure="Weight",
			std_secondary_per_stock_unit=1.5,
		)
		pr = make_purchase_receipt(
			item.item_code,
			qty=0,
			secondary_qty=5,
			do_submit=False,
			extra_row_fields={"rejected_qty": 0},
		)
		row = pr.items[0]
		self.assertEqual(flt(row.custom_rcv_expected_secondary_qty), 0)
		self.assertEqual(flt(row.custom_rcv_actual_secondary_per_stock_unit), 0)

	# 13. Forced exception inside the hook -> caught/logged, PR still submits.
	def test_hook_exception_is_caught_and_logged_and_does_not_block_submit(self):
		item = make_item(
			stock_uom="Nos",
			secondary_measure="Weight",
			std_secondary_per_stock_unit=1.5,
		)
		company = _get_company()
		warehouse = _get_warehouse(company)
		supplier = _get_supplier()
		pr = frappe.get_doc(
			{
				"doctype": "Purchase Receipt",
				"company": company,
				"supplier": supplier,
				"set_warehouse": warehouse,
				"items": [
					{
						"item_code": item.item_code,
						"qty": 10,
						"rate": 10,
						"warehouse": warehouse,
						"uom": item.stock_uom,
						"conversion_factor": 1,
						"custom_rcv_secondary_qty": 15,
					}
				],
			}
		)

		with patch(
			"ury.ury.hooks.ury_purchase_receipt.frappe.db.get_all",
			side_effect=RuntimeError("forced failure"),
		), patch(
			"ury.ury.hooks.ury_purchase_receipt.frappe.log_error"
		) as mock_log_error:
			pr.insert(ignore_permissions=True, ignore_mandatory=True)
			pr.submit()

		self.assertTrue(mock_log_error.called)
		self.assertEqual(pr.docstatus, 1)

	# 14. Weight-primary item (Stock UOM=Kg, secondary=Count) -> generalized math works.
	def test_weight_primary_count_secondary_generalized_math(self):
		item = make_item(
			stock_uom="Kg",
			secondary_measure="Count",
			std_secondary_per_stock_unit=5,  # 5 pieces per kg (veal chops)
			tolerance_lower_pct=5,
			tolerance_upper_pct=5,
		)
		pr = make_purchase_receipt(item.item_code, qty=10, secondary_qty=49)
		row = pr.items[0]
		self.assertAlmostEqual(flt(row.custom_rcv_expected_secondary_qty), 50.0, places=3)
		self.assertAlmostEqual(
			flt(row.custom_rcv_actual_secondary_per_stock_unit), 4.9, places=3
		)
		self.assertEqual(row.custom_rcv_off_spec, 0)

	# 15. Item.custom_rcv_secondary_measure = Weight on an already-Kg-stocked item -> raises.
	def test_item_weight_secondary_on_weight_stock_uom_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			make_item(stock_uom="Kg", secondary_measure="Weight")

	# 16. Asymmetric tolerance flags correctly in the right direction.
	def test_asymmetric_tolerance(self):
		item = make_item(
			stock_uom="Nos",
			secondary_measure="Weight",
			std_secondary_per_stock_unit=1.5,
			tolerance_lower_pct=2,
			tolerance_upper_pct=20,
		)
		# actual_per_stock_unit = 1.4 -> variance = -6.67%. Outside lower (-2%)
		# but well within upper (+20%): must be flagged off-spec.
		pr = make_purchase_receipt(item.item_code, qty=10, secondary_qty=14)
		row = pr.items[0]
		self.assertLess(flt(row.custom_rcv_variance_pct), -2)
		self.assertGreater(flt(row.custom_rcv_variance_pct), -20)
		self.assertEqual(row.custom_rcv_off_spec, 1)

		# actual_per_stock_unit = 1.55 -> variance = +3.33%. Within both bounds
		# under a symmetric 5% read, but here upper is 20% so still in-spec --
		# and it must not be mistakenly compared against the lower bound.
		item2 = make_item(
			stock_uom="Nos",
			secondary_measure="Weight",
			std_secondary_per_stock_unit=1.5,
			tolerance_lower_pct=2,
			tolerance_upper_pct=20,
		)
		pr2 = make_purchase_receipt(item2.item_code, qty=10, secondary_qty=15.5)
		row2 = pr2.items[0]
		self.assertGreater(flt(row2.custom_rcv_variance_pct), 2)
		self.assertLess(flt(row2.custom_rcv_variance_pct), 20)
		self.assertEqual(row2.custom_rcv_off_spec, 0)
