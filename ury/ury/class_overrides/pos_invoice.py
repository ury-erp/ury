from collections import defaultdict

import frappe
from erpnext.accounts.doctype.pos_invoice.pos_invoice import (
	POSInvoice,
	get_stock_availability,
)

from frappe import _
from frappe.utils import flt

try:
	from erpnext.accounts.doctype.pos_invoice.pos_invoice import ProductBundleStockValidationError
except ImportError:
	class ProductBundleStockValidationError(frappe.ValidationError):
		pass

# ERPNext v16+ refactored stock validation into batched queries
try:
	from erpnext.accounts.doctype.pos_invoice.pos_invoice import (
		get_active_bundle_items,
		get_available_stock_qty,
		get_required_stock_qty,
		get_stock_item_details,
		is_stock_check_needed,
	)
	HAS_BATCHED_STOCK_CHECK = True
except ImportError:
	HAS_BATCHED_STOCK_CHECK = False

try:
	from erpnext.accounts.doctype.pos_invoice.pos_invoice import (
		get_product_bundle_stock_availability,
	)
except ImportError:
	def get_product_bundle_stock_availability(item_code, warehouse, item_qty):
		try:
			from erpnext.stock.stock_ledger import is_negative_stock_allowed
			from erpnext.accounts.doctype.pos_invoice.pos_invoice import (
				get_bin_qty,
				get_pos_reserved_qty,
			)

			is_stock_item = True
			bundle = frappe.get_doc("Product Bundle", item_code)
			availabilities = []
			for bundle_item in bundle.items:
				if frappe.get_value("Item", bundle_item.item_code, "is_stock_item"):
					bin_qty = get_bin_qty(bundle_item.item_code, warehouse)
					reserved_qty = get_pos_reserved_qty(bundle_item.item_code, warehouse)
					available = bin_qty - reserved_qty
					availabilities.append(
						{
							"item_code": bundle_item.item_code,
							"required": bundle_item.qty * item_qty,
							"available": available,
						}
					)

			return availabilities, is_stock_item, is_negative_stock_allowed(item_code=item_code)
		except Exception:
			return get_stock_availability(item_code, warehouse)


def get_bundle_component_warehouse(component_item, fallback_warehouse, branch, company):
	"""Warehouse a Product Bundle component is stocked in.

	Components can belong to different departments, so each one resolves through
	its own production configuration (same pair the reservation service uses).
	Falls back to the bundle row's warehouse when none resolves.
	"""
	if branch:
		from ury.ury.doctype.ury_order.ury_order import _department_warehouse_for_item

		warehouse = _department_warehouse_for_item(component_item, branch, company)
		if warehouse:
			return warehouse
	return fallback_warehouse


def set_packed_item_warehouses(doc):
	"""Point each packed item at its component's own department warehouse.

	ERPNext's packing list copies the bundle row's warehouse onto every packed
	item, so a bundle with components from several departments would issue them
	all from one warehouse when the consolidated Sales Invoice posts stock.
	"""
	branch = doc.get("branch")
	if not branch and doc.get("pos_profile"):
		branch = frappe.db.get_value("POS Profile", doc.pos_profile, "branch")
	if not branch or not doc.get("packed_items"):
		return

	rows = {d.name: d for d in doc.get("items")}
	for packed in doc.get("packed_items"):
		row = rows.get(packed.parent_detail_docname)
		if not row:
			continue
		warehouse = get_bundle_component_warehouse(packed.item_code, row.warehouse, branch, doc.company)
		if warehouse and warehouse != packed.warehouse:
			packed.warehouse = warehouse
			bin_data = frappe.db.get_value(
				"Bin",
				{"item_code": packed.item_code, "warehouse": warehouse},
				["actual_qty", "projected_qty"],
				as_dict=True,
			)
			packed.actual_qty = flt(bin_data.actual_qty) if bin_data else 0
			packed.projected_qty = flt(bin_data.projected_qty) if bin_data else 0


class CustomPOSInvoice(POSInvoice):
	def validate_stock_availablility(self):
		if self.is_return or frappe.get_cached_doc("Stock Settings").allow_negative_stock:
			return

		if self.docstatus.is_draft() and not frappe.db.get_value(
			"POS Profile", self.pos_profile, "validate_stock_on_save"
		):
			return

		branch = self.branch or frappe.db.get_value("POS Profile", self.pos_profile, "branch")

		if HAS_BATCHED_STOCK_CHECK:
			rows = [
				d
				for d in self.get("items")
				if d.item_code
				and not d.serial_and_batch_bundle
				and not (branch and self._is_always_available(d.item_code, branch))
			]
			if not rows:
				return

			bundle_items = get_active_bundle_items({d.item_code for d in rows})
			required_qty = self._get_required_stock_qty(rows, bundle_items, branch)
			available_qty, reserved_stock_keys = get_available_stock_qty(required_qty)
			items = get_stock_item_details({item_code for item_code, warehouse in required_qty})
			keys_to_check = {
				key
				for key in required_qty
				if is_stock_check_needed(items.get(key[0]), key in reserved_stock_keys)
			}

			for d in rows:
				if d.item_code in bundle_items:
					self.validate_bundle_stock(
						d, bundle_items[d.item_code], required_qty, available_qty, keys_to_check, branch
					)
				elif (d.item_code, d.warehouse) in keys_to_check:
					self.validate_item_stock(d, required_qty, available_qty)
			return

		# Fallback stock validation for older ERPNext versions
		for d in self.get("items"):
			if d.serial_and_batch_bundle:
				continue

			if branch and self._is_always_available(d.item_code, branch):
				continue

			if frappe.db.exists("Product Bundle", d.item_code):
				(
					availability,
					is_stock_item,
					is_negative_stock_allowed,
				) = get_product_bundle_stock_availability(d.item_code, d.warehouse, d.stock_qty)

			else:
				availability, is_stock_item, is_negative_stock_allowed = get_stock_availability(
					d.item_code, d.warehouse
				)

			if is_negative_stock_allowed:
				continue

			if isinstance(availability, list):
				error_msgs = []
				for item in availability:
					if flt(item["available"]) < flt(item["required"]):
						error_msgs.append(
							_("<li>Packed Item {0}: Required {1}, Available {2}</li>").format(
								frappe.bold(item["item_code"]),
								frappe.bold(flt(item["required"], 2)),
								frappe.bold(flt(item["available"], 2)),
							)
						)

				if error_msgs:
					frappe.throw(
						_(
							"<b>Row #{0}:</b> Bundle {1} in warehouse {2} has insufficient packed items:<br><div style='margin-top: 15px;'><ul style='line-height: 0.8;'>{3}</ul></div>"
						).format(
							d.idx,
							frappe.bold(d.item_code),
							frappe.bold(d.warehouse),
							"<br>".join(error_msgs),
						),
						title=_("Insufficient Stock for Product Bundle Items"),
						exc=ProductBundleStockValidationError,
					)

			else:
				item_code, warehouse = frappe.bold(d.item_code), frappe.bold(d.warehouse)
				if is_stock_item and flt(availability) <= 0:
					frappe.throw(
						_("Row #{0}: Item {1} has no stock in warehouse {2}.").format(
							d.idx, item_code, warehouse
						),
						title=_("Item Out of Stock"),
					)
				elif flt(availability) < flt(d.stock_qty):
					frappe.throw(
						_(
							"Row #{0}: Item {1} in warehouse {2}: Available {3}, Needed {4}."
						).format(
							d.idx,
							item_code,
							warehouse,
							frappe.bold(flt(availability)),
							frappe.bold(d.stock_qty),
						),
						title=_("Insufficient Stock"),
					)

	def _component_warehouse(self, component_item, row, branch):
		"""Warehouse a bundle component is stocked in.

		Bundle components may belong to different departments, so each is
		resolved through its own production configuration (the same pair the
		reservation service uses). Falls back to the bundle row's warehouse.
		"""
		return get_bundle_component_warehouse(component_item, row.warehouse, branch, self.company)

	def _get_required_stock_qty(self, rows, bundle_items, branch):
		required_qty = defaultdict(float)
		for row in rows:
			components = bundle_items.get(row.item_code)
			if not components:
				required_qty[(row.item_code, row.warehouse)] += flt(row.stock_qty)
				continue
			for component in components:
				warehouse = self._component_warehouse(component.item_code, row, branch)
				required_qty[(component.item_code, warehouse)] += flt(component.qty) * flt(row.stock_qty)
		return required_qty

	def validate_bundle_stock(self, row, components, required_qty, available_qty, keys_to_check, branch=None):
		error_msgs = []
		for component in components:
			warehouse = self._component_warehouse(component.item_code, row, branch)
			key = (component.item_code, warehouse)
			if key in keys_to_check and available_qty[key] < required_qty[key]:
				error_msgs.append(
					_("<li>Packed Item {0}: Required {1}, Available {2} in {3}</li>").format(
						frappe.bold(component.item_code),
						frappe.bold(flt(required_qty[key], 2)),
						frappe.bold(flt(available_qty[key], 2)),
						frappe.bold(warehouse),
					)
				)

		if error_msgs:
			frappe.throw(
				_(
					"<b>Row #{0}:</b> Bundle {1} has insufficient packed items:<br><div style='margin-top: 15px;'><ul style='line-height: 0.8;'>{2}</ul></div>"
				).format(row.idx, frappe.bold(row.item_code), "<br>".join(error_msgs)),
				title=_("Insufficient Stock for Product Bundle Items"),
				exc=ProductBundleStockValidationError,
			)

	@staticmethod
	def _is_always_available(item_code, branch):
		return frappe.db.exists(
			"URY Item Production Configuration",
			{
				"item": item_code,
				"branch": branch,
				"availability_mode": "Always Available",
				"active": 1,
			},
		)

