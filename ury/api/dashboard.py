import frappe
from frappe.utils import today

@frappe.whitelist()
def get_dashboard_summary(branch=None):
    # Today's Sales & Orders using URY Report Settings for accurate shift hours
    if branch and branch != 'all':
        result = frappe.db.sql(
            """
            SELECT
                COUNT(b.`name`) AS total_invoices,
                ROUND(SUM(b.`grand_total`), 2) AS grand_total
            FROM `tabPOS Invoice` b
            LEFT JOIN `tabURY Report Settings` rs ON (rs.`branch` = %(branch)s)
            WHERE
                b.`branch` = %(branch)s
                AND b.`docstatus` = 1
                AND b.`status` IN ("Consolidated", "Paid")
                AND (
                    ((rs.`hours` IS NULL OR rs.`hours` = 0) AND b.`posting_date` = curdate())
                    OR (rs.`hours` > 0 AND TIMESTAMP(b.`posting_date`, b.`posting_time`) <= TIMESTAMP(DATE_ADD(curdate(), INTERVAL 1 DAY), CONCAT(LPAD(rs.`hours`, 2, '0'), ':00:00')) AND TIMESTAMP(b.`posting_date`, b.`posting_time`) >= TIMESTAMP(curdate(), CONCAT(LPAD(rs.`hours`, 2, '0'), ':00:00')))
                    OR (rs.`branch` IS NULL AND b.`posting_date` = curdate())
                )
            """,
            {"branch": branch},
            as_dict=True,
        )[0]
    else:
        result = frappe.db.sql(
            """
            SELECT
                COUNT(b.`name`) AS total_invoices,
                ROUND(SUM(b.`grand_total`), 2) AS grand_total
            FROM `tabPOS Invoice` b
            LEFT JOIN `tabURY Report Settings` rs ON (rs.`branch` IS NULL)
            WHERE
                b.`docstatus` = 1
                AND b.`status` IN ("Consolidated", "Paid")
                AND (
                    ((rs.`hours` IS NULL OR rs.`hours` = 0) AND b.`posting_date` = curdate())
                    OR (rs.`hours` > 0 AND TIMESTAMP(b.`posting_date`, b.`posting_time`) <= TIMESTAMP(DATE_ADD(curdate(), INTERVAL 1 DAY), CONCAT(LPAD(rs.`hours`, 2, '0'), ':00:00')) AND TIMESTAMP(b.`posting_date`, b.`posting_time`) >= TIMESTAMP(curdate(), CONCAT(LPAD(rs.`hours`, 2, '0'), ':00:00')))
                    OR (rs.`branch` IS NULL AND b.`posting_date` = curdate())
                )
            """,
            {},
            as_dict=True,
        )[0]

    today_sales = result.grand_total or 0
    today_orders = result.total_invoices or 0
    avg_order_value = round(today_sales / today_orders, 2) if today_orders else 0

    # Occupied Tables & Total Tables
    table_filters = {}
    if branch and branch != 'all':
        table_filters["branch"] = branch

    occupied_filters = table_filters.copy()
    occupied_filters["occupied"] = 1

    occupied_tables = frappe.db.count("URY Table", occupied_filters) if frappe.db.exists("DocType", "URY Table") else 0
    total_tables = frappe.db.count("URY Table", table_filters) if frappe.db.exists("DocType", "URY Table") else 0

    # Pending Kitchen Orders
    kot_filters = {"docstatus": 1, "order_status": ("in", ["Ready For Prepare", "Preparing", "Pending"])}
    if branch and branch != 'all':
        kot_filters["branch"] = branch
        
    pending_kitchen_orders = frappe.db.count("URY KOT", kot_filters) if frappe.db.exists("DocType", "URY KOT") else 0

    return {
        "today_sales": today_sales,
        "today_orders": today_orders,
        "occupied_tables": occupied_tables,
        "total_tables": total_tables,
        "avg_order_value": avg_order_value,
        "pending_kitchen_orders": pending_kitchen_orders,
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
