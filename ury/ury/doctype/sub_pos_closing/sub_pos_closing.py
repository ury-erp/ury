
import frappe
from frappe import _
from frappe.utils import flt, get_datetime, now
from datetime import datetime, timedelta
from frappe.model.document import Document
import json
from ury.ury_pos.api import getBranch


class SubPOSClosing(Document):
    def validate(self):
        owner = None
        branch = frappe.db.get_value("POS Profile", self.pos_profile, "branch")

        draft_invoices = frappe.get_all(
            "POS Invoice",
            fields=["name"],
            filters={"branch": branch, "status": "Draft", "docstatus": "0","cashier":self.user},
        )
        if draft_invoices:
            frappe.throw("Submit/Delete Draft Invoices")

        date_time = now()
        if isinstance(date_time, str):
            formatted_date_time = date_time.split('.')[0]
        else:
            formatted_date_time = date_time.strftime('%Y-%m-%d %H:%M:%S')
        self.period_end_date = date_time

        time_part = formatted_date_time.split(' ')[1]
        self.posting_time = time_part
        
        invoices = frappe.get_all(
            "POS Invoice",
            filters={
                "docstatus": 1,
                "status":"Paid",
                "posting_date": ["between", [self.period_start_date, self.period_end_date]],
                "cashier":self.user
            },
            fields=["name", "posting_date", "customer", "grand_total", "base_grand_total"]
        )
        
        self.set("pos_transactions", [])
        
        for invoice in invoices:
            self.append("pos_transactions", {
                "pos_invoice": invoice.name,
                "posting_date": invoice.posting_date,
                "customer": invoice.customer,
                "grand_total": invoice.grand_total,
                "base_grand_total": invoice.base_grand_total
            })

        multiple_cashier = frappe.db.get_value("POS Profile", self.pos_profile, "custom_enable_multiple_cashier")
        if multiple_cashier:
            get_cashier = frappe.get_doc("POS Profile", self.pos_profile)
            for user_details in get_cashier.applicable_for_users:
                if user_details.custom_main_cashier:
                    owner = user_details.user
            if frappe.session.user == owner:
                frappe.throw("The Main Cashier cannot close a Sub POS Closing entry.")
        else:
            pass
    
    def on_submit(self):
        opening_entry = frappe.get_doc("POS Opening Entry", self.pos_opening_entry)
        opening_entry.custom_sub_pos_close = self.name
        opening_entry.status = "Closed"
        opening_entry.save()
    
    def on_cancel(self):
        opening_entry = frappe.get_doc("POS Opening Entry", self.pos_opening_entry)
        opening_entry.custom_sub_pos_close = None
        opening_entry.status = "Open"
        opening_entry.save()


@frappe.whitelist()
def get_pos_profile():
    branch = getBranch()
    pos_profile = frappe.db.get_value("POS Profile", {"branch": branch}, "name")
    return pos_profile


@frappe.whitelist()
@frappe.validate_and_sanitize_search_inputs
def get_cashiers(doctype, txt, searchfield, start, page_len, filters):
    cashiers_list = frappe.get_all(
        "POS Profile User", filters=filters, fields=["user"], as_list=1
    )
    return [c for c in cashiers_list]


@frappe.whitelist()
def get_pos_invoices(start, end, pos_profile, user):
    # Filter by date range in SQL instead of Python (M9)
    data = frappe.db.sql(
        """
        select
            name, timestamp(posting_date, posting_time) as "timestamp"
        from
            `tabPOS Invoice`
        where
            cashier = %s and docstatus = 1 and pos_profile = %s
            and ifnull(consolidated_invoice,'') = ''
            and status != "Consolidated"
            and timestamp(posting_date, posting_time) >= %s
            and timestamp(posting_date, posting_time) <= %s
        """,
        (user, pos_profile, start, end),
        as_dict=1,
    )
    if not data:
        return []

    invoice_names = [d.name for d in data]

    # Batch-fetch child tables to avoid N+1 get_doc calls
    items = frappe.db.get_all(
        "POS Invoice Item",
        filters={"parent": ("in", invoice_names)},
        fields=["parent", "name", "item_code", "item_name", "qty", "rate",
                "amount", "base_rate", "base_amount", "cost_center", "comment",
                "discount_percentage", "discount_amount", "price_list_rate",
                "net_rate", "net_amount", "item_group", "warehouse",
                "stock_uom", "uom", "conversion_factor", "weight_uom",
                "weight_per_unit", "total_weight", "is_free_item",
                "custom_course"],
    )
    taxes = frappe.db.get_all(
        "POS Invoice Taxes and Charges",
        filters={"parent": ("in", invoice_names)},
        fields=["parent", "name", "charge_type", "account_head", "description",
                "rate", "tax_amount", "total", "base_total", "cost_center",
                "included_in_print_rate", "included_in_paid_amount",
                "doctype"],
    )
    payments = frappe.db.get_all(
        "POS Invoice Payment",
        filters={"parent": ("in", invoice_names)},
        fields=["parent", "name", "mode_of_payment", "amount",
                "base_amount", "type", "account", "reference_no",
                "reference_date", "default"],
    )

    items_by_parent = {}
    for row in items:
        items_by_parent.setdefault(row.parent, []).append(row)
    taxes_by_parent = {}
    for row in taxes:
        taxes_by_parent.setdefault(row.parent, []).append(row)
    payments_by_parent = {}
    for row in payments:
        payments_by_parent.setdefault(row.parent, []).append(row)

    # Batch-fetch all parent invoice fields in one query
    parent_fields = ["name", "customer", "grand_total", "rounded_total", "net_total",
                     "posting_date", "posting_time", "branch", "company", "currency",
                     "restaurant_table", "pos_profile", "status", "docstatus",
                     "order_type", "selling_price_list", "is_pos", "update_stock",
                     "cashier", "waiter", "no_of_pax", "invoice_printed",
                     "additional_discount_percentage", "discount_amount",
                     "total_taxes_and_charges", "total_qty"]
    data = frappe.get_all(
        "POS Invoice",
        filters={"name": ("in", invoice_names)},
        fields=parent_fields,
    )

    for d in data:
        d["items"] = items_by_parent.get(d.name, [])
        d["taxes"] = taxes_by_parent.get(d.name, [])
        d["payments"] = payments_by_parent.get(d.name, [])

    return data