# Copyright (c) 2026, URY and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils.data import flt
from frappe import _
from erpnext.stock.utils import get_incoming_rate
from datetime import datetime


class BulkProduction(Document):
	def validate(self):
		self.validate_item()
		total_cost = self.get_total_cost()
		self.total_cost = total_cost

	def validate_item(self):
		items_with_issues = {}
		seen_items = set()

		for item in self.get("bulk_production_items"):
			if flt(item.qty) and flt(item.qty) < 0:
				items_with_issues.setdefault(item.idx, []).append(
					_("Qty must be a positive number for item {}").format(
						frappe.bold(item.item_name)
					)
				)
			if not flt(item.qty):
				items_with_issues.setdefault(item.idx, []).append(
					_("Qty is mandatory for item {}").format(
						frappe.bold(item.item_name)
					)
				)

			bom_status = frappe.get_value("BOM", item.bom, "is_active")
			if not bom_status:
				items_with_issues.setdefault(item.idx, []).append(
					_("BOM {} for item {} is not active").format(
						frappe.bold(item.bom), frappe.bold(item.item_name)
					)
				)

			if item.item_name in seen_items:
				items_with_issues.setdefault(item.idx, []).append(
					_("Item '{}' already in the list").format(
						frappe.bold(item.item_name)
					)
				)
			else:
				seen_items.add(item.item_name)

		error_list = []
		if items_with_issues:
			for idx, messages in items_with_issues.items():
				for msg in messages:
					error_list.append(_("Row {}: {}").format(idx, msg))

			frappe.throw(error_list, title=_("Validation Error"), as_list=True)

	def on_submit(self):
		self.enqueue_save_stockentry()

	def on_cancel(self):
		self.cancel_stock_entry_queue()

	@frappe.whitelist()
	def retry(self):
		self.enqueue_save_stockentry()

	def enqueue_save_stockentry(self):
		boms = self.bulk_production_items
		if len(boms) >= 10:
			self.status = "Queued"
			frappe.db.set_value("Bulk Production", self.name, "status", "Queued", update_modified=False)
			frappe.enqueue(self.save_stockentry, queue='long', job_name=f'save_stockentry_{self.name}')
		else:
			self.save_stockentry()

	def cancel_stock_entry_queue(self):
		boms = self.production_items
		if len(boms) >= 10:
			frappe.enqueue(self.cancel_stock_entry, queue="long", job_name=f'cancel_stockentry_{self.name}')
		else:
			self.cancel_stock_entry()

	def save_stockentry(self):
		try:
			for bulk_item in self.bulk_production_items:
				stock_entry = self.create_stock_entry(
					bulk_item.bom, bulk_item.qty, bulk_item.tt_cost
				)
				item_code = frappe.db.get_value("BOM", bulk_item.bom, "item")
				item_name = frappe.db.get_value("Item", item_code, "item_name")
				self.append(
					"production_items",
					{
						"bom": bulk_item.bom,
						"item_name": item_name,
						"stock_entry": stock_entry,
					},
				)
			self.status = "Submitted"
			self.error = ""
			self.save()
		except Exception as e:
			frappe.db.rollback()
			self.status = "Failed"
			frappe.db.set_value("Bulk Production", self.name, "status", "Failed", update_modified=False)
			error_msg = f"Error occurred while creating stock entry: {str(e)}"
			frappe.log_error(message=error_msg, title=f"Bulk Production Error ({self.name})")
			frappe.db.set_value("Bulk Production", self.name, "error", error_msg, update_modified=False)
			frappe.db.commit()

	def cancel_stock_entry(self):
		try:
			stock_entries = self.production_items
			for entry in stock_entries:
				stock_entry_name = entry.get('stock_entry')
				if stock_entry_name:
					docstatus = frappe.db.get_value("Stock Entry", stock_entry_name, "docstatus")
					if docstatus == 1:
						frappe.db.set_value("Stock Entry", stock_entry_name, "docstatus", 2)
		except Exception as e:
			frappe.log_error(
				message=f"Error occurred while cancelling stock entry({self.name}): {str(e)}",
				title="Bulk Production Cancel Error"
			)

	def create_stock_entry(self, bom, qty, tt_cost):
		try:
			time = datetime.strptime(self.creation, "%Y-%m-%d %H:%M:%S.%f")

			def calculate_individual_price(item_code):
				args = {
					"item_code": item_code,
					"posting_date": self.posting_date,
					"posting_time": time.time(),
					"warehouse": self.warehouse,
					"company": self.company,
					"allow_zero_valuation": 1,
				}
				price = get_incoming_rate(args)
				return price if price != 0 else fetch_last_purchase_rate(item_code)

			stock_entry = frappe.new_doc("Stock Entry")
			stock_entry.update(
				{
					"stock_entry_type": "Manufacture",
					"branch": self.branch,
					"company": self.company,
					"posting_date": self.posting_date,
					"bom_no": bom,
					"fg_completed_qty": qty,
					"from_warehouse": self.warehouse,
					"to_warehouse": self.warehouse,
				}
			)

			bom_qty = frappe.db.get_value("BOM", bom, "quantity")
			bom_items = frappe.get_all(
				"BOM Item",
				fields=["item_code", "qty"],
				filters={"parent": bom, "parenttype": "BOM"},
				order_by="idx",
			)

			for bom_item in bom_items:
				bom_item_qty = (qty / bom_qty) * bom_item["qty"]
				item_cost = calculate_individual_price(bom_item["item_code"])

				stock_entry.append(
					"items",
					{
						"item_code": bom_item["item_code"],
						"qty": bom_item_qty,
						"basic_rate": item_cost,
						"set_basic_rate_manually": 1,
						"allow_zero_valuation_rate": 1 if item_cost == 0.0 else 0,
						"s_warehouse": self.warehouse,
					},
				)

			item_code = frappe.db.get_value("BOM", bom, "item")
			bom_cost = get_bom_cost(bom)

			stock_entry.append(
				"items",
				{
					"item_code": item_code,
					"qty": qty,
					"basic_rate": bom_cost,
					"basic_amount": tt_cost,
					"set_basic_rate_manually": 1,
					"is_finished_item": 1,
					"allow_zero_valuation_rate": 1 if bom_cost == 0.0 else 0,
					"t_warehouse": self.warehouse,
				},
			)

			stock_entry.insert()
			for item in stock_entry.items:
				if item.basic_rate == 0.0:
					item.allow_zero_valuation_rate = 1
			stock_entry.submit()
			return stock_entry.name
		except Exception as e:
			frappe.db.rollback()
			self.status = "Failed"
			frappe.db.set_value("Bulk Production", self.name, "status", "Failed", update_modified=False)
			error_msg = f"Error occurred while creating stock entry: {str(e)}"
			frappe.log_error(message=error_msg, title=f"Bulk Production Error ({self.name})")
			frappe.db.set_value("Bulk Production", self.name, "error", error_msg, update_modified=False)
			frappe.db.commit()

			# Retry logic for lock contention
			boms = self.production_items
			if "lock" in str(e).lower():
				if len(boms) >= 10:
					self.status = "Queued"
					frappe.db.set_value("Bulk Production", self.name, "status", "Queued", update_modified=False)
					frappe.enqueue(self.save_stockentry, queue='long', job_name=f'save_stockentry_{self.name}')
				else:
					self.save_stockentry()
			raise

	def get_total_cost(self):
		total_cost = 0
		for item in self.bulk_production_items:
			if item.cost == 0 or item.cost == None:
				cost = frappe.db.get_value("BOM", item.bom, "total_cost")
				quantity = frappe.db.get_value("BOM", item.bom, "quantity")
				bom_cost = cost / quantity
				item.cost = bom_cost
				item.tt_cost = item.qty * item.cost
			total_cost += item.tt_cost
		return total_cost


def fetch_last_purchase_rate(item_code):
	return frappe.db.get_value("Item", item_code, "last_purchase_rate")


@frappe.whitelist()
def get_bom_cost(bom):
	cost = frappe.db.get_value("BOM", bom, "total_cost")
	quantity = frappe.db.get_value("BOM", bom, "quantity")
	bom_cost = cost / quantity
	return bom_cost
