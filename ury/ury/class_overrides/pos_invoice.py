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



class CustomPOSInvoice(POSInvoice):
	def validate_stock_availablility(self):
		if self.is_return:
			return

		if self.docstatus.is_draft() and not frappe.db.get_value(
			"POS Profile", self.pos_profile, "validate_stock_on_save"
		):
			return

		branch = self.branch or frappe.db.get_value("POS Profile", self.pos_profile, "branch")

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
