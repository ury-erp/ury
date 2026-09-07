# Copyright (c) 2026, URY and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils.data import flt


class StockCorrection(Document):
	"""Post-facto stock correction against an already-submitted Stock Reconciliation.

	Unlike grillax's approach (a StockController subclass override that
	reimplements ERPNext's stock-ledger/valuation internals), this doctype is
	a thin, standalone wrapper: on submit it posts a normal ERPNext Stock
	Entry (Material Receipt / Material Issue) through the public
	`frappe.get_doc(...).insert()` / `.submit()` API. It never touches Stock
	Reconciliation's own class, hooks, or ledger-writing internals.
	"""

	def validate(self):
		self.validate_reference_stock_reconciliation()
		self.validate_warehouse_belongs_to_branch()
		self.validate_items()
		self.validate_single_direction()

	def validate_reference_stock_reconciliation(self):
		if not self.reference_stock_reconciliation:
			return

		docstatus = frappe.db.get_value(
			"Stock Reconciliation", self.reference_stock_reconciliation, "docstatus"
		)
		if docstatus is None:
			frappe.throw(
				_("Referenced Stock Reconciliation {0} does not exist").format(
					frappe.bold(self.reference_stock_reconciliation)
				)
			)
		if docstatus != 1:
			frappe.throw(
				_(
					"Referenced Stock Reconciliation {0} must be submitted before it can be"
					" corrected"
				).format(frappe.bold(self.reference_stock_reconciliation))
			)

	def validate_warehouse_belongs_to_branch(self):
		if not (self.branch and self.warehouse):
			return

		branch_warehouse = frappe.db.get_value(
			"POS Profile", {"branch": self.branch}, "warehouse"
		)
		if branch_warehouse and branch_warehouse != self.warehouse:
			frappe.throw(
				_("Warehouse {0} does not belong to Branch {1}").format(
					frappe.bold(self.warehouse), frappe.bold(self.branch)
				)
			)

	def validate_items(self):
		if not self.items:
			frappe.throw(_("Please add at least one correction item"))

		for row in self.items:
			if not flt(row.qty):
				frappe.throw(
					_("Row {0}: Correction Qty is required and cannot be zero").format(row.idx)
				)

	def validate_single_direction(self):
		has_positive = any(flt(row.qty) > 0 for row in self.items)
		has_negative = any(flt(row.qty) < 0 for row in self.items)

		if has_positive and has_negative:
			frappe.throw(
				_(
					"A Stock Correction cannot mix overage (positive) and shortage"
					" (negative) rows, because this doctype links to only a single"
					" Stock Entry and cancelling it would otherwise leave one of the"
					" two generated Stock Entries permanently un-reversed. Please"
					" split this into two separate Stock Correction documents: one"
					" with only positive-qty rows and one with only negative-qty rows."
				)
			)

	def on_submit(self):
		self.create_and_submit_stock_entry()

	def on_cancel(self):
		self.cancel_stock_entry()

	def create_and_submit_stock_entry(self):
		receipt_items = [row for row in self.items if flt(row.qty) > 0]
		issue_items = [row for row in self.items if flt(row.qty) < 0]

		# A single Stock Correction can carry both overages and shortages;
		# ERPNext's Stock Entry purpose is one-directional, so split into a
		# Material Receipt entry and/or a Material Issue entry as needed and
		# keep only the last created entry's name for simplicity of the
		# single `stock_entry` link, unless there is just one.
		stock_entry_names = []

		if receipt_items:
			stock_entry_names.append(
				self._make_stock_entry("Material Receipt", receipt_items)
			)
		if issue_items:
			stock_entry_names.append(
				self._make_stock_entry("Material Issue", issue_items)
			)

		if stock_entry_names:
			self.db_set("stock_entry", stock_entry_names[-1], update_modified=False)
			if len(stock_entry_names) > 1:
				frappe.msgprint(
					_("Multiple Stock Entries were created for this correction: {0}").format(
						", ".join(frappe.bold(name) for name in stock_entry_names)
					)
				)

	def _make_stock_entry(self, purpose, rows):
		warehouse = self.warehouse or frappe.db.get_value(
			"POS Profile", {"branch": self.branch}, "warehouse"
		)
		if not warehouse:
			frappe.throw(
				_("Unable to resolve a Warehouse for Branch {0}").format(
					frappe.bold(self.branch)
				)
			)

		company = None
		if self.reference_stock_reconciliation:
			company = frappe.db.get_value(
				"Stock Reconciliation", self.reference_stock_reconciliation, "company"
			)
		if not company and self.branch:
			company = frappe.db.get_value("Branch", self.branch, "company")
		if not company:
			frappe.throw(
				_(
					"Unable to resolve a Company for this Stock Correction from either"
					" the referenced Stock Reconciliation or Branch {0}"
				).format(frappe.bold(self.branch))
			)

		stock_entry = frappe.get_doc(
			{
				"doctype": "Stock Entry",
				"stock_entry_type": purpose,
				"purpose": purpose,
				"branch": self.branch,
				"company": company,
				"posting_date": self.posting_date,
				"posting_time": self.posting_time,
				"set_posting_time": 1 if self.posting_time else 0,
			}
		)

		for row in rows:
			item_row = {
				"item_code": row.item_code,
				"qty": abs(flt(row.qty)),
				"uom": row.uom,
			}
			if purpose == "Material Receipt":
				item_row["t_warehouse"] = row.warehouse or warehouse
			else:
				item_row["s_warehouse"] = row.warehouse or warehouse

			stock_entry.append("items", item_row)

		stock_entry.insert()
		stock_entry.submit()
		return stock_entry.name

	def cancel_stock_entry(self):
		if not self.stock_entry:
			return

		docstatus = frappe.db.get_value("Stock Entry", self.stock_entry, "docstatus")
		if docstatus == 1:
			frappe.get_doc("Stock Entry", self.stock_entry).cancel()
