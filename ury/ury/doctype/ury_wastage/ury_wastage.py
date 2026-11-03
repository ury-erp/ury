# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from erpnext.stock.utils import get_incoming_rate
from frappe.utils import flt
from ury.ury.api.ury_stock_check import get_available_stock

class URYWastage(Document):
    def validate(self):
        if not getattr(self, "wastage_source", None):
            self.wastage_source = "Physical Audit"
        self.calculate_item_values()
        self.total_cost = self.get_total_cost()
        self.validate_item_stock()

    def calculate_item_values(self):
        for item in self.items:
            if not flt(getattr(item, "rate", 0)) and getattr(self, "warehouse", None):
                item.rate = get_item_valuation_rate(
                    item.item_code,
                    self.warehouse,
                    getattr(self, "company", None),
                    getattr(self, "posting_date", None),
                    getattr(self, "posting_time", None),
                )
            item.amount = flt(item.qty) * flt(item.rate)

    def on_update(self):
        self.total_cost = self.get_total_cost()

    def on_submit(self):
        if self.status == "Draft":
            self.db_set("status", "Authorized")
        items = self.get_all_items()
        if items:
            stock_entry = self.create_stock_entry(items)
            if stock_entry:
                stock_entry.submit()
                self.db_set("stock_entry", stock_entry.name)
        else:
            frappe.throw(title="Error", msg="Error occurred while fetching items")

    def on_cancel(self):
        self.cancel_stock_entry(getattr(self, "stock_entry", None))
    
    def before_submit(self):
        self.validate_item_stock()
        if getattr(self, "wastage_source", None) != "KOT Cancellation":
            if frappe.db.has_column("POS Profile", "custom_enable_opening_date"):
                enable_opening_date = frappe.get_value("POS Profile", {"branch": self.branch}, "custom_enable_opening_date")
                if enable_opening_date:
                    pos_open = frappe.db.exists("POS Opening Entry", {"branch": self.branch, "status": "Open", "docstatus": 1})
                    opening_date = frappe.get_value("POS Opening Entry", {"branch": self.branch}, "posting_date")
                    
                    wastage_time = None
                    if frappe.db.has_column("POS Profile", "custom_wastage_time"):
                        wastage_time = frappe.db.get_value("POS Profile", {"branch": self.branch}, "custom_wastage_time")

                    if pos_open and wastage_time:
                        self.edit_posting_date = 1
                        self.posting_date = opening_date
                        self.posting_time = wastage_time

    def validate_item_stock(self):
        allow_negative_stock = frappe.db.get_single_value("Stock Settings", "allow_negative_stock")
        if allow_negative_stock:
            return

        if not self.warehouse:
            frappe.throw("Global Warehouse is required to validate stock.")

        wastage_real_time_stock = 0
        if frappe.db.has_column("POS Profile", "custom_wastage_real_time_stock"):
            wastage_real_time_stock = frappe.get_value("POS Profile", {"branch": self.branch}, "custom_wastage_real_time_stock")
            
        if wastage_real_time_stock:
            for item in self.items:
                stock = get_available_stock(item.item_code, self.warehouse, self.branch)
                available_qty = stock.get("available_qty", 0)
                bundle_exist = frappe.db.exists("Product Bundle", {"new_item_code": item.item_code})

                if bundle_exist:
                    bundle_items = frappe.get_all(
                        "Product Bundle Item",
                        fields=["item_code", "qty"],
                        filters={"parent": bundle_exist, "parenttype": "Product Bundle"},
                        order_by="idx",
                    )
                    for bundleItem in bundle_items:
                        item_stock = get_available_stock(bundleItem.item_code, self.warehouse, self.branch)
                        available = item_stock.get("available_qty", 0)
                        required = bundleItem.qty * item.qty
                        if required > available:
                            frappe.throw(
                                title="Insufficient Stock",
                                msg=f"Not enough stock for item <b>{bundleItem.item_code} in warehouse {self.warehouse}</b>. Available: {available}, Required: {required}",
                            )
                else:
                    if item.qty > available_qty:
                        frappe.throw(
                            title="Insufficient Stock",
                            msg=f"Not enough stock for item <b>{item.item_code} in warehouse {self.warehouse}</b>. Available: {available_qty}, Required: {item.qty}",
                        )

    def create_stock_entry(self, items):
        try:
            stock_entry = frappe.new_doc("Stock Entry")
            stock_entry.stock_entry_type = "Material Issue"
            if getattr(self, "stock", None) == "Damaged":
                stock_entry.naming_series = "MAT-DMGD-.FY.-"
            else:
                stock_entry.naming_series = "MAT-WSTG-.FY.-"

            if getattr(self, "edit_posting_date", 0) == 1:
                stock_entry.set_posting_time = 1

            stock_entry.posting_date = self.posting_date or frappe.utils.nowdate()
            stock_entry.posting_time = self.posting_time or frappe.utils.nowtime()

            stock_entry.branch = self.branch
            stock_entry.company = self.company
            stock_entry.from_warehouse = self.warehouse  # Applying Global Warehouse
            stock_entry.from_bom = 0
            
            for item in items:
                stock_entry.append(
                    "items",
                    {
                        "item_code": item["item_code"],
                        "qty": item["qty"],
                        "uom": item.get("uom"),
                        "s_warehouse": self.warehouse,
                        "cost_center": item["cost_center"],
                        "expense_account": item["expense_account"],
                        "basic_rate": item["rate"],
                        "allow_zero_valuation_rate": 1,
                        "set_basic_rate_manually": 1,
                    },
                )
            stock_entry.insert()
            return stock_entry
        except Exception as e:
            frappe.throw(
                title="Error",
                msg=f"Error occurred while creating stock entry : {str(e)}",
            )

    def get_all_items(self):
        try:
            if not self.warehouse:
                frappe.throw("Global Warehouse is required to fetch item valuations.")

            account = frappe.get_value("Company", self.company, "stock_adjustment_account")
            if not account:
                raise Exception(f"Stock Adjustment Account is not set in Company {self.company}")

            cost_center = frappe.db.exists("Cost Center", {"branch": self.branch})
            if not cost_center:
                cost_center = frappe.get_value("Company", self.company, "cost_center")
            if not cost_center:
                cost_center = frappe.db.get_value("Cost Center", {"company": self.company, "is_group": 0}, "name")
                
            if not cost_center:
                raise Exception(f"Cost Center not found for the branch {self.branch} or as a default in Company {self.company}")
            
            wastageItems = []
            for item in self.items:
                bundle_exist = frappe.db.exists("Product Bundle", {"new_item_code": item.item_code})

                if bundle_exist:
                    bundle_items = frappe.get_all(
                        "Product Bundle Item",
                        fields=["item_code", "qty"],
                        filters={"parent": bundle_exist, "parenttype": "Product Bundle"},
                        order_by="idx",
                    )
                    for bundleItem in bundle_items:
                        qty = bundleItem.qty * item.qty
                        item_cost = get_item_valuation_rate(
                            bundleItem.item_code,
                            self.warehouse,
                            self.company,
                            self.posting_date,
                            self.posting_time,
                        )
                        items_json = self.get_item_json(
                            bundleItem.item_code, qty, getattr(item, "uom", ""), cost_center, account, item_cost
                        )
                        wastageItems.append(items_json)

                else:
                    item_cost = flt(getattr(item, "rate", 0)) or get_item_valuation_rate(
                        item.item_code,
                        self.warehouse,
                        self.company,
                        self.posting_date,
                        self.posting_time,
                    )
                    items_json = self.get_item_json(
                        item.item_code, item.qty, getattr(item, "uom", ""), cost_center, account, item_cost
                    )
                    wastageItems.append(items_json)

            return wastageItems
        except Exception as e:
            frappe.throw(title="Error", msg=f"Error occurred while fetching items : {str(e)}")

    def get_total_cost(self):
        return sum(flt(getattr(item, "amount", 0)) for item in self.items)

    def get_item_json(self, item_code, qty, uom, cost_center, account, rate):
        return {
            "item_code": item_code,
            "qty": qty,
            "uom": uom,
            "cost_center": cost_center,
            "expense_account": account,
            "rate": rate
        }

    def cancel_stock_entry(self, name):
        if name:
            stock_entry = frappe.get_doc("Stock Entry", name)
            stock_entry.cancel()

@frappe.whitelist()
def get_item_valuation_rate(item_code, warehouse, company=None, posting_date=None, posting_time=None):
    if not item_code or not warehouse:
        return 0.0

    args = {
        "item_code": item_code,
        "posting_date": posting_date or frappe.utils.nowdate(),
        "posting_time": posting_time or frappe.utils.nowtime(),
        "warehouse": warehouse,
        "company": company,
        "allow_zero_valuation": 1,
    }
    bom_exist = frappe.db.exists("BOM", {"item": item_code, "is_active": 1})
    if bom_exist:
        bom_cost = claculate_bom_cost(bom_exist)
        if bom_cost != 0:
            return flt(bom_cost)
        last_purchase_rate = fetch_last_purchase_rate(item_code)
        if last_purchase_rate:
            return flt(last_purchase_rate)
        return flt(get_incoming_rate(args) or 0.0)

    price = get_incoming_rate(args)
    if price:
        return flt(price)
    return flt(fetch_last_purchase_rate(item_code) or 0.0)

def fetch_last_purchase_rate(item_code):
    return frappe.db.get_value("Item", item_code, "last_purchase_rate")

def claculate_bom_cost(bom):
    cost = frappe.db.get_value("BOM", bom, "total_cost") or 0.0
    quantity = frappe.db.get_value("BOM", bom, "quantity") or 1.0
    return cost / quantity
