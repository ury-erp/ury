
import frappe
from frappe import _
from frappe.utils import flt, get_datetime
from datetime import datetime, timedelta
from frappe.model.document import Document
import json
import requests
from datetime import datetime
from ury.ury_pos.api import getBranch
from frappe.utils import  get_datetime,now


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
        opening_entry.custom_sub_pos_close = self.name
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
    data = frappe.db.sql(
        """
        select
            name, timestamp(posting_date, posting_time) as "timestamp"
        from
            `tabPOS Invoice`
        where
            cashier = %s and docstatus = 1 and pos_profile = %s and ifnull(consolidated_invoice,'') = '' and status != "Consolidated"
        """,
        (user, pos_profile),
        as_dict=1,
    )

    data = list(
        filter(
            lambda d: get_datetime(start)
            <= get_datetime(d.timestamp)
            <= get_datetime(end),
            data,
        )
    )
    # need to get taxes and payments so can't avoid get_doc
    data = [frappe.get_doc("POS Invoice", d.name).as_dict() for d in data]

    return data