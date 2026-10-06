import frappe
from frappe import _, bold, json, msgprint
from frappe.query_builder.functions import CombineDatetime, Sum
from frappe.utils import add_to_date, cint, cstr, flt
from erpnext.controllers.stock_controller import StockController
from datetime import datetime, timedelta

from erpnext.stock.utils import get_incoming_rate, get_stock_balance

class OpeningEntryAccountError(frappe.ValidationError):
	pass


class EmptyStockReconciliationItemsError(frappe.ValidationError):
	pass


class StockCorrection(StockController):
	pass
	
	def __init__(self, *args, **kwargs):
		super().__init__(*args, **kwargs)
		self.head_row = ["Item Code", "Warehouse", "Quantity", "Valuation Rate"]

	def validate(self):
		if self.edit_posting_date == 0:
			self.validate_posting_time()
		self.validate_data()
		self.set_total_qty_and_amount()
		# self.remove_items_with_no_change()



	def before_save(self):	
		self.set_rate_for_outgoing_items(self)
		for item in self.items:
			response = get_stock_balance_for(
				item_code=item.item_code,
				warehouse=item.warehouse,
				posting_date=self.posting_date,
				posting_time=self.posting_time,
				with_valuation_rate=True,
				row=self.as_dict()  # Pass the doc as a dictionary
			)

			# Set the values in the document similar to the JS code
			if response:
				item.current_qty = flt(response.get("qty"))
				item.quantity_difference = flt(item.qty) - flt(item.current_qty)


	def before_submit(self):
		# self.remove_items_with_no_change()
		self.set_rate_for_outgoing_items(self)
		for item in self.items:
			response = get_stock_balance_for(
				item_code=item.item_code,
				warehouse=item.warehouse,
				posting_date=self.posting_date,
				posting_time=self.posting_time,
				with_valuation_rate=True,
				row=self.as_dict()  # Pass the doc as a dictionary
			)

			# Set the values in the document similar to the JS code
			if response:
					item.current_qty = flt(response.get("qty"))
					item.quantity_difference = flt(item.qty) - flt(item.current_qty)

			
	def submit(self):
		if len(self.items) > 100:
			msgprint(
				_(
					"The task has been enqueued as a background job. In case there is any issue on processing in background, the system will add a comment about the error on this Stock Correction and revert to the Draft stage"
				)
			)
			self.queue_action("submit", timeout=4600)
		else:
			
		
			self._submit()
			if self.status not in ["Queued", "Submitted"]:
				self.enqueue_create_stock_entries()

	def cancel(self):
		if len(self.items) > 100:
			msgprint(
				_(
					"The task has been enqueued as a background job. In case there is any issue on processing in background, the system will add a comment about the error on this Stock Correction and revert to the Submitted stage"
				)
			)
			self.queue_action("cancel", timeout=2000)
		else:
			self._cancel()
			self.cancel_stock_entry()
	def cancel_stock_entry(self):
		try:
			stock_entries = self.correction_stock_entries
			for entry in stock_entries:
				stock_entry_name = entry.get('stock_entry')
				if stock_entry_name:
					stock_entry_doc = frappe.get_doc("Stock Entry", stock_entry_name)
				if stock_entry_doc.docstatus == 1:
					stock_entry_doc.cancel()
		except Exception as e:
			frappe.log_error(message=f"Error occurred while cancelling stock entry({self.name}): {str(e)}", title="Stock Correction Cancel Error")
	def enqueue_create_stock_entries(self):
		items = self.items
		if len(items) >= 10 :
			self.status="Queued"
			frappe.db.set_value("Stock Correction", self.name, "status", "Queued",update_modified=False)
			frappe.enqueue(self.create_stock_entries, queue='long', job_name='create_stock_entries')
		else:
			self.create_stock_entries()

	def set_rate_for_outgoing_items(self, reset_outgoing_rate=True, raise_error_if_no_rate=True):
		for d in self.get("items"):
			if d.warehouse:
				if reset_outgoing_rate:
					args = self.get_args_for_incoming_rate(d)
					rate = get_incoming_rate(args, raise_error_if_no_rate)
					
					if rate >= 0:
						print(d.edit_valuation_rate)
						if d.edit_valuation_rate == 1:
							d.valuation_rate = flt(d.valuation_rate)
						else:
							d.valuation_rate = flt(rate)
						print(d.valuation_rate,"d.valuation_rate......................")
						d.current_valuation_rate = rate
						d.current_amount = flt((d.current_valuation_rate)) * flt(d.current_qty)
						d.amount = (flt(d.qty) * flt(d.valuation_rate) )
						d.amount_difference = flt(d.amount) - flt(d.current_amount)
				
	def get_args_for_incoming_rate(self, item):
		return frappe._dict(
			{
				"item_code": item.item_code,
				"warehouse": item.warehouse,
				"posting_date": self.posting_date,
				"posting_time": self.posting_time,
				"qty": item.qty,
				"voucher_type": self.doctype,
				"voucher_no": self.name,
				"company": self.company,
				"allow_zero_valuation": 1,
				"voucher_detail_no": item.name
			}
		)

	def create_stock_entries(self):
		"""Create stock entries based on quantity difference and calculate total difference amount."""
		try:
			stock = frappe.get_doc("Stock Correction",self.name)
			stock.correction_stock_entries = []
			for item in self.items:
				# Get current stock quantity and rate
				current_data = get_stock_balance_for(
					item.item_code, item.warehouse, self.posting_date, self.posting_time
				)

				qty_precision = item.precision("qty")
				current_qty = flt(current_data.get("qty") or 0, qty_precision)

				# current_qty = current_data.get("qty")
				current_rate = current_data.get("rate")

				# Determine stock entry type based on qty difference
					
				if item.qty > current_qty:
					entry_type = "Material Receipt"
					
					qty_difference = item.qty - current_qty
				elif item.qty < current_qty:
					entry_type = "Material Issue"
					
					qty_difference = current_qty - item.qty
				else:
					continue  # No entry needed if no change in quantity

			
				# Create and submit Stock Entry document
		
				stock_entry = frappe.new_doc("Stock Entry")
				stock_entry.stock_entry_type = entry_type
				stock_entry.naming_series = "MAT-STK-CRCTN-.FY.-"
				stock_entry.company = self.company
				stock_entry.branch = self.branch
				if self.edit_posting_date == 1:
					stock_entry.set_posting_time = 1
				stock_entry.posting_date = self.posting_date
				stock_entry.posting_time = self.posting_time
				stock_entry.flags.is_correction_of_correction = True
				stock_entry.cost_center=self.cost_center
				valuation_rate = "{:.2f}".format(item.valuation_rate)
				
				item_rate = 0
				bom_exist = frappe.db.exists("BOM", {"item": item.item_code, "is_active": 1})
				if bom_exist:
					bom_total_cost = frappe.db.get_value("BOM",bom_exist,"total_cost")
					bom_qty = frappe.db.get_value("BOM",bom_exist,"quantity")
					item_rate = bom_total_cost / bom_qty

				else:
					item_rate =  frappe.db.get_value("Item",item.item_code,"last_purchase_rate")
				basic_rate = (
					valuation_rate if entry_type != "Material Receipt"
					else (valuation_rate if valuation_rate else item_rate)
				)
				basic_amount = float(basic_rate) * int(qty_difference)
				stock_entry.append("items", {
					"item_code": item.item_code,
					"t_warehouse" if entry_type == "Material Receipt" else "s_warehouse": item.warehouse,
					"qty": qty_difference,
					"basic_rate": basic_rate,
					"set_basic_rate_manually": 1,
					"basic_amount": basic_amount
				})

				stock_entry.insert()
				stock_entry.submit()
				# frappe.msgprint(_("Stock Entry created for Item: {0} with type {1}.").format(item.item_code, entry_type))

				stock.append(
					"correction_stock_entries",
					{
						"item_code": item.item_code,
						"stock_entry": stock_entry.name,
					},
				)
			stock.status="Submitted"
			stock.error=""
			stock.submit()
			stock.reload()
		except Exception as e:
			frappe.db.rollback()
			# frappe.log_error(f"Error creating stock entry for item {item.item_code}: {str(e)}")
			self.status = "Failed"
			frappe.db.set_value("Stock Correction", self.name, "status", "Failed",update_modified=False)
			frappe.db.set_value("Stock Correction", self.name, "error",f"Error occurred while creating stock entry for item {item.item_code}: {str(e)}",update_modified=False)
			frappe.db.commit()
			# self.error = f"Error creating stock entry for item {item.item_code}: {str(e)}"
			items = self.items
			if "lock" or "Lock" in str(e):
				if len(items) >= 10 :
					self.status = "Queued"
					frappe.db.set_value("Stock Correction", self.name, "status", "Queued",update_modified=False)
					frappe.enqueue(self.create_stock_entries, queue='long', job_name='save_stockentry')
				else:
					self.create_stock_entries()
			

	def remove_items_with_no_change(self):
		"""Remove items if qty or rate is not changed"""
		self.difference_amount = 0.0

		def _changed(item):
			inventory_dimensions_dict = {}

			item_dict = get_stock_balance_for(
				item.item_code,
				item.warehouse,
				self.posting_date,
				self.posting_time,
				row=item,
			)

			if (
				(item.qty is None or item.qty == item_dict.get("qty"))
				and (item.valuation_rate is None or item.valuation_rate == item_dict.get("rate"))
			):
				return False
			else:
				# set default as current rates
				if item.qty is None:
					item.qty = item_dict.get("qty")

				if item.valuation_rate is None:
					item.valuation_rate = item_dict.get("rate")

				item.current_qty = item_dict.get("qty")
				item.current_valuation_rate = item_dict.get("rate")
				self.calculate_difference_amount(item, item_dict)
				return True
		items = list(filter(lambda d: _changed(d), self.items))
		self.items = items

	def calculate_difference_amount(self, item, item_dict):
		qty_precision = item.precision("qty")
		val_precision = item.precision("valuation_rate")
		new_qty = flt(item.qty, qty_precision)
		new_valuation_rate = flt(item.valuation_rate or item_dict.get("rate"), val_precision)

		current_qty = flt(item_dict.get("qty"), qty_precision)
		current_valuation_rate = flt(item_dict.get("rate"), val_precision)

		self.difference_amount += (new_qty * new_valuation_rate) - (current_qty * current_valuation_rate)

	def validate_data(self):
		def _get_msg(row_num, msg):
			return _("Row # {0}:").format(row_num + 1) + " " + msg

		self.validation_messages = []
		item_warehouse_combinations = []

		default_currency = frappe.db.get_default("currency")

		for row_num, row in enumerate(self.items):
			# find duplicates
			key = [row.item_code, row.warehouse]

			if key in item_warehouse_combinations:
				self.validation_messages.append(
					_get_msg(row_num, _("Same item and warehouse combination already entered."))
				)
			else:
				item_warehouse_combinations.append(key)

			self.validate_item(row.item_code, row)

			# validate warehouse
			if not frappe.db.get_value("Warehouse", row.warehouse):
				self.validation_messages.append(_get_msg(row_num, _("Warehouse not found in the system")))

			# if both not specified
			if row.qty in ["", None] and row.valuation_rate in ["", None]:
				self.validation_messages.append(
					_get_msg(row_num, _("Please specify either Quantity or Valuation Rate or both"))
				)

			# do not allow negative quantity
			if flt(row.qty) < 0:
				self.validation_messages.append(_get_msg(row_num, _("Negative Quantity is not allowed")))

			# do not allow negative valuation
			if flt(row.valuation_rate) < 0:
				self.validation_messages.append(
					_get_msg(row_num, _("Negative Valuation Rate is not allowed"))
				)

			if row.qty and row.valuation_rate in ["", None]:
				row.valuation_rate = get_stock_balance(
					row.item_code,
					row.warehouse,
					self.posting_date,
					self.posting_time,
					with_valuation_rate=True,
				)[1]
				if not row.valuation_rate:
					# try if there is a buying price list in default currency
					buying_rate = frappe.db.get_value(
						"Item Price",
						{"item_code": row.item_code, "buying": 1, "currency": default_currency},
						"price_list_rate",
					)
					if buying_rate:
						row.valuation_rate = buying_rate

					else:
						# get valuation rate from Item
						row.valuation_rate = frappe.get_value("Item", row.item_code, "valuation_rate")

		# throw all validation messages
		if self.validation_messages:
			for msg in self.validation_messages:
				msgprint(msg)

			raise frappe.ValidationError(self.validation_messages)

	def validate_item(self, item_code, row):
		from erpnext.stock.doctype.item.item import (
			validate_cancelled_item,
			validate_end_of_life,
			validate_is_stock_item,
		)

		# using try except to catch all validation msgs and display together

		try:
			item = frappe.get_doc("Item", item_code)

			# end of life and stock item
			validate_end_of_life(item_code, item.end_of_life, item.disabled)
			validate_is_stock_item(item_code, item.is_stock_item)

			# docstatus should be < 2
			validate_cancelled_item(item_code, item.docstatus)

		except Exception as e:
			self.validation_messages.append(_("Row #") + " " + ("%d: " % (row.idx)) + cstr(e))

	
	def set_total_qty_and_amount(self):
		for d in self.get("items"):
			d.amount = flt(d.qty, d.precision("qty")) * flt(d.valuation_rate, d.precision("valuation_rate"))
			d.current_amount = flt(d.current_qty, d.precision("current_qty")) * flt(
				d.current_valuation_rate, d.precision("current_valuation_rate")
			)

			d.quantity_difference = flt(d.qty) - flt(d.current_qty)
			d.amount_difference = flt(d.amount) - flt(d.current_amount)

	def get_items_for(self, warehouse):
		self.items = []
		for item in get_items(warehouse, self.posting_date, self.posting_time, self.company):
			self.append("items", item)

	
	def has_negative_stock_allowed(self):
		allow_negative_stock = cint(frappe.db.get_single_value("Stock Settings", "allow_negative_stock"))
		if allow_negative_stock:
			return True

		if any(
			((d.serial_and_batch_bundle or d.batch_no) and flt(d.qty) == flt(d.current_qty))
			for d in self.items
		):
			allow_negative_stock = True

		return allow_negative_stock


@frappe.whitelist()
def get_items(warehouse, posting_date, posting_time, company, item_code=None, ignore_empty_stock=False):
	ignore_empty_stock = cint(ignore_empty_stock)
	items = []
	if item_code and warehouse:
		items = get_item_and_warehouses(item_code, warehouse)

	if not item_code:
		items = get_items_for_stock_reco(warehouse, company)

	res = []
	
	for d in items:
		stock_bal = get_stock_balance(
			d.item_code,
			d.warehouse,
			posting_date,
			posting_time,
			with_valuation_rate=True,
			with_serial_no=cint(d.has_serial_no),
		)
		qty, valuation_rate, serial_no = (
			stock_bal[0],
			stock_bal[1],
			stock_bal[2] if cint(d.has_serial_no) else "",
		)

		if ignore_empty_stock and not stock_bal[0]:
			continue

		args = get_item_data(d, qty, valuation_rate, serial_no)

		res.append(args)

	return res


def get_item_and_warehouses(item_code, warehouse):
	from frappe.utils.nestedset import get_descendants_of

	items = []
	if frappe.get_cached_value("Warehouse", warehouse, "is_group"):
		childrens = get_descendants_of("Warehouse", warehouse, ignore_permissions=True, order_by="lft")
		for ch_warehouse in childrens:
			items.append(frappe._dict({"item_code": item_code, "warehouse": ch_warehouse}))
	else:
		items = [frappe._dict({"item_code": item_code, "warehouse": warehouse})]

	return items


def get_items_for_stock_reco(warehouse, company):
	lft, rgt = frappe.db.get_value("Warehouse", warehouse, ["lft", "rgt"])
	items = frappe.db.sql(
		f"""
		select
			i.name as item_code, i.item_name, bin.warehouse as warehouse, i.has_serial_no, i.has_batch_no
		from
			`tabBin` bin, `tabItem` i
		where
			i.name = bin.item_code
			and IFNULL(i.disabled, 0) = 0
			and i.is_stock_item = 1
			and i.has_variants = 0
			and exists(
				select name from `tabWarehouse` where lft >= {lft} and rgt <= {rgt} and name = bin.warehouse and is_group = 0
			)
	""",
		as_dict=1,
	)

	items += frappe.db.sql(
		"""
		select
			i.name as item_code, i.item_name, id.default_warehouse as warehouse, i.has_serial_no, i.has_batch_no
		from
			`tabItem` i, `tabItem Default` id
		where
			i.name = id.parent
			and exists(
				select name from `tabWarehouse` where lft >= %s and rgt <= %s and name=id.default_warehouse and is_group = 0
			)
			and i.is_stock_item = 1
			and i.has_variants = 0
			and IFNULL(i.disabled, 0) = 0
			and id.company = %s
		group by i.name
	""",
		(lft, rgt, company),
		as_dict=1,
	)

	# remove duplicates
	# check if item-warehouse key extracted from each entry exists in set iw_keys
	# and update iw_keys
	iw_keys = set()
	items = [
		item
		for item in items
		if [
			(item.item_code, item.warehouse) not in iw_keys,
			iw_keys.add((item.item_code, item.warehouse)),
		][0]
	]

	return items


def get_item_data(row, qty, valuation_rate):
	return {
		"item_code": row.item_code,
		"warehouse": row.warehouse,
		"qty": qty,
		"item_name": row.item_name,
		"valuation_rate": valuation_rate,
		"current_qty": qty,
		"current_valuation_rate": valuation_rate
	}

@frappe.whitelist()
def get_stock_balance_for(
	item_code: str,
	warehouse: str,
	posting_date,
	posting_time,
	with_valuation_rate: bool = True,
	row=None,
):
	frappe.has_permission("Stock Correction", "write", throw=True)

	item_dict = frappe.get_cached_value("Item", item_code, ["has_serial_no", "has_batch_no"], as_dict=1)

	if isinstance(row, str):
		row = json.loads(row)

	if isinstance(row, dict):
		row = frappe._dict(row)

	if not item_dict:
		# In cases of data upload to Items table
		msg = _("Item {} does not exist.").format(item_code)
		frappe.throw(msg, title=_("Missing"))

	data = get_stock_balance(
		item_code,
		warehouse,
		posting_date,
		posting_time,
		with_valuation_rate=with_valuation_rate,
	)

	qty, rate = data


	return {
		"qty": qty,
		"rate": rate,
	}

@frappe.whitelist()
def cancel_selected_stock_entries(doc_name, entries):
    """
    Cancel selected stock entries and update the Stock Correction document
    
    Args:
        doc_name (str): Name of the Stock Correction document
        entries (list): List of selected entries to cancel
    """
    if isinstance(entries, str):
        import json
        entries = json.loads(entries)
    
    stock_correction_doc = frappe.get_doc("Stock Correction", doc_name)
    for entry in entries:
        stock_entry_name = entry.get("stock_entry")
        item_name = entry.get("item_name")
        try:
            stock_correction_items = frappe.db.get_all(
                "Correction Stock Entries",
                filters={
                    "parent": stock_correction_doc.name,
                    "stock_entry": stock_entry_name
                },
                fields=["name"]
            )
            
            for item in stock_correction_items:
                frappe.db.delete("Correction Stock Entries", item.name)
            
            if stock_entry_name:
                stock_entry_doc = frappe.get_doc("Stock Entry", stock_entry_name)
                if stock_entry_doc.docstatus == 2:
                    continue
            
                if stock_entry_doc.docstatus == 1:
                    stock_entry_doc.cancel()
                
                    new_cancelled_entry = frappe.new_doc("Cancelled Stock Correction Entry")
                    new_cancelled_entry.update({
                        "parent": stock_correction_doc.name,
                        "parenttype": "Stock Correction",
                        "parentfield": "cancelled_stock_correction_entry",
                        "item_code": item_name,
                        "stock_entry": stock_entry_name
                    })
                    new_cancelled_entry.insert(ignore_permissions=True)
                                
            frappe.db.commit()
            
        except Exception as e:
            frappe.db.rollback()
            frappe.log_error(
                message=f"Error cancelling stock entry {stock_entry_name}: {str(e)}", 
                title="Stock entry Cancellation Error"
            )
            frappe.throw(f"Error cancelling {stock_entry_name}: {str(e)}")
    
    stock_correction_doc = frappe.get_doc("Stock Correction", doc_name)
    stock_correction_doc.save()
    
    return True