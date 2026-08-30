import frappe
from frappe.utils import today

@frappe.whitelist()
def get_dashboard_summary(branch=None):
    filters = {}
    if branch and branch != 'all':
        pass

    return {
        "today_sales": 0,
        "today_orders": 0,
        "occupied_tables": 0,
        "total_tables": frappe.db.count("URY Table") if frappe.db.exists("DocType", "URY Table") else 0,
        "avg_order_value": 0,
        "active_cashiers": frappe.db.count("User", {"enabled": 1}),
        "pending_kitchen_orders": 0,
        "total_menu_items": frappe.db.count("Item") if frappe.db.exists("DocType", "Item") else 0,
    }

@frappe.whitelist()
def get_dashboard_charts(branch=None):
    return {
        "sales_trend": [],
        "hourly_sales": [],
        "payment_methods": [],
        "order_types": [],
        "top_items": [],
        "revenue_by_branch": [],
        "sales_by_course": [],
    }

@frappe.whitelist()
def get_recent_transactions(branch=None, limit=10):
    filters = {"docstatus": ["in", [0, 1]]}
    if branch and branch != 'all':
        pass # Add branch filter if applicable for POS Invoice, usually 'custom_branch' or 'branch'
    
    if frappe.db.exists("DocType", "POS Invoice"):
        try:
            invoices = frappe.get_all("POS Invoice", 
                filters=filters,
                fields=["name", "customer", "posting_date", "posting_time", "grand_total", "status", "order_type", "restaurant_table as restaurant_table", "owner as cashier"],
                order_by="creation desc",
                limit=int(limit)
            )
            for inv in invoices:
                if not inv.get("status"):
                    inv["status"] = "Draft" if inv.get("docstatus") == 0 else "Paid"
                if not inv.get("order_type"):
                    inv["order_type"] = "Dine In"
            return invoices
        except Exception as e:
            frappe.log_error(f"Error in get_recent_transactions: {str(e)}")
            return []
    return []

@frappe.whitelist()
def get_module_records(doctype, branch=None):
    if not frappe.db.exists("DocType", doctype):
        return []
    
    filters = {}
    if branch and branch != 'all':
        meta = frappe.get_meta(doctype)
        if meta.has_field("branch"):
            filters["branch"] = branch
        elif meta.has_field("custom_branch"):
            filters["custom_branch"] = branch
            
    try:
        return frappe.get_all(doctype, filters=filters, fields=["*"])
    except Exception:
        return []
