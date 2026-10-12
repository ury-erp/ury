# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt
#
# What got thrown away, why, and what it cost.
#
# The accounting half of this is ERPNext's: a submitted log writes a Stock
# Entry of purpose "Material Issue", which is the standard way stock leaves a
# warehouse without being sold, and which posts the value to the expense
# account the Stock Entry Type carries. Nothing here maintains a parallel
# stock or GL position.
#
# What this doctype adds is the part ERPNext has no opinion about: the
# reason. A Material Issue tells a manager that 40,000 dinars of chicken left
# the building. "Overproduction" versus "Spoilage" versus "Preparation Error"
# tells them whether to talk to the chef, the buyer, or the fridge — and that
# is the only thing about a waste number that can change next week's number.

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt

# Waste of an item nobody tracks in stock is still waste worth recording:
# most restaurants stock-track ingredients and not prepared dishes, and a
# system that refuses the dish is a system that under-reports the loss.
WASTE_STOCK_ENTRY_TYPE = "Material Issue"


class URYWasteLog(Document):
	def validate(self):
		self.recorded_by = self.recorded_by or frappe.session.user
		self.value_items()

	def value_items(self):
		"""Price each line at what the stock is currently worth.

		Stored on the row rather than looked up when reporting, so a price
		change next month cannot rewrite what last month's waste cost. A
		waste report that moves every time an ingredient price moves is one
		nobody can act on.
		"""
		total = 0.0
		for row in self.items:
			if not row.valuation_rate:
				row.valuation_rate = _item_value(row.item_code, self.branch)
			row.amount = flt(row.qty) * flt(row.valuation_rate)
			total += row.amount
		self.total_value = total

	def on_submit(self):
		self.create_stock_entry()

	def create_stock_entry(self):
		"""Take the stock-tracked lines out of stock.

		Only those lines: a prepared dish that is not a stock item has no
		quantity to remove, and asking ERPNext to issue one fails the whole
		submission over a row that was never going to move stock.
		"""
		stock_rows = [row for row in self.items if _is_stock_item(row.item_code)]
		if not stock_rows:
			return

		warehouse = _default_warehouse(self.branch)
		if not warehouse:
			frappe.msgprint(
				_("No warehouse is set for branch {0}, so stock was not adjusted. The waste is still recorded.").format(self.branch),
				indicator="orange",
				alert=True,
			)
			return

		try:
			entry = frappe.get_doc({
				"doctype": "Stock Entry",
				"stock_entry_type": WASTE_STOCK_ENTRY_TYPE,
				"purpose": WASTE_STOCK_ENTRY_TYPE,
				"posting_date": self.posting_date,
				"company": frappe.db.get_value("Branch", self.branch, "company")
				or frappe.defaults.get_defaults().get("company"),
				"items": [
					{
						"item_code": row.item_code,
						"qty": row.qty,
						"s_warehouse": warehouse,
						"basic_rate": row.valuation_rate,
					}
					for row in stock_rows
				],
				"remarks": _("URY waste: {0}").format(self.reason),
			})
			entry.insert(ignore_permissions=True)
			entry.submit()
			self.db_set("stock_entry", entry.name)
		except Exception:
			# The record of the loss is the point. Losing it because the
			# stock ledger refused the movement — a closed period, a negative
			# balance — would hide the very number a manager needs.
			frappe.log_error(frappe.get_traceback(), "Waste log could not post a Stock Entry")
			frappe.msgprint(
				_("The waste is recorded, but stock could not be adjusted. See the error log."),
				indicator="orange",
				alert=True,
			)

	def on_cancel(self):
		if self.stock_entry and frappe.db.exists("Stock Entry", self.stock_entry):
			entry = frappe.get_doc("Stock Entry", self.stock_entry)
			if entry.docstatus == 1:
				entry.cancel()


def _is_stock_item(item_code):
	return bool(frappe.db.get_value("Item", item_code, "is_stock_item"))


def _item_value(item_code, branch):
	"""What one unit is worth, best available.

	Valuation rate first — that is what the stock is actually carried at.
	Falling back to the last purchase price and then the standard rate keeps
	a number on the row for items that have never moved through stock, which
	is most prepared dishes.
	"""
	warehouse = _default_warehouse(branch)
	if warehouse:
		rate = frappe.db.get_value(
			"Bin", {"item_code": item_code, "warehouse": warehouse}, "valuation_rate"
		)
		if rate:
			return flt(rate)

	item = frappe.db.get_value(
		"Item", item_code, ["valuation_rate", "last_purchase_rate", "standard_rate"], as_dict=True
	) or frappe._dict()
	return flt(item.valuation_rate or item.last_purchase_rate or item.standard_rate)


def _default_warehouse(branch):
	profile = frappe.db.get_value("POS Profile", {"branch": branch, "disabled": 0}, "warehouse")
	return profile or frappe.db.get_value("Branch", branch, "custom_warehouse")
