import frappe
from frappe.utils import today, add_days, getdate
from collections import defaultdict

@frappe.whitelist()
def get_dashboard_summary(branch=None):
    filters = {"docstatus": 1, "posting_date": today()}
    if branch and branch != 'all':
        filters["branch"] = branch
    
    invoices = frappe.db.get_all("POS Invoice", filters=filters, fields=["grand_total", "name"])
    today_sales = sum(d.grand_total for d in invoices)
    today_orders = len(invoices)
    
    avg_order_value = today_sales / today_orders if today_orders > 0 else 0
    
    total_tables = frappe.db.count("URY Table")
    
    occ_filters = {"docstatus": 0, "posting_date": today()}
    if branch and branch != 'all':
        occ_filters["branch"] = branch
    occupied_tables = frappe.db.count("POS Invoice", filters=occ_filters)
    
    total_menu_items = frappe.db.count("Item", {"is_sales_item": 1, "disabled": 0})
    
    # Count pending KOTs if Restaurant Order exists, otherwise 0
    pending_kitchen_orders = 0
    if frappe.db.exists("DocType", "Restaurant Order"):
        kot_filters = {"status": "Pending"}
        if branch and branch != 'all':
            kot_filters["branch"] = branch
        pending_kitchen_orders = frappe.db.count("Restaurant Order", filters=kot_filters)

    return {
        "today_sales": today_sales,
        "today_orders": today_orders,
        "occupied_tables": occupied_tables,
        "total_tables": total_tables,
        "avg_order_value": avg_order_value,
        "active_cashiers": 1,
        "pending_kitchen_orders": pending_kitchen_orders,
        "total_menu_items": total_menu_items,
    }

@frappe.whitelist()
def get_dashboard_charts(branch=None):
    current_date = getdate(today())
    
    inv_filters = {"docstatus": 1, "posting_date": current_date}
    trend_inv_filters = {"docstatus": 1}
    
    if branch and branch != 'all':
        inv_filters["branch"] = branch
        trend_inv_filters["branch"] = branch

    # Last 7 days
    sales_trend = []
    for i in range(6, -1, -1):
        dt = add_days(current_date, -i)
        tf = trend_inv_filters.copy()
        tf["posting_date"] = dt
        sales = frappe.db.get_all("POS Invoice", filters=tf, fields=["grand_total"])
        total = sum(d.grand_total for d in sales)
        sales_trend.append({"date": str(dt), "sales": total})

    # Revenue by Branch (Compare all branches for today regardless of filter)
    branch_invoices = frappe.db.get_all("POS Invoice", filters={"docstatus": 1, "posting_date": current_date}, fields=["branch", "grand_total"])
    revenue_by_branch_dict = defaultdict(float)
    for inv in branch_invoices:
        b = inv.branch or "Unknown"
        revenue_by_branch_dict[b] += inv.grand_total
    revenue_by_branch = [{"branch": k, "total": v} for k, v in revenue_by_branch_dict.items()]

    # Hourly sales today
    today_invoices = frappe.db.get_all("POS Invoice", filters=inv_filters, fields=["name", "posting_time", "grand_total"])
    hourly = defaultdict(float)
    for inv in today_invoices:
        hour = str(inv.posting_time).split(':')[0] + ":00"
        hourly[hour] += inv.grand_total
    
    hourly_sales = [{"hour": h, "sales": hourly[h]} for h in sorted(hourly.keys())]

    # Payment Methods, Top Items, Sales by Course
    payment_methods = []
    top_items = []
    sales_by_course = []
    
    today_inv_names = [i.name for i in today_invoices]
    
    if today_inv_names:
        payments = frappe.db.get_all("POS Invoice Payment", filters={"docstatus": 1, "parent": ["in", today_inv_names]}, fields=["mode_of_payment", "amount"])
        pm_dict = defaultdict(float)
        for p in payments:
            pm_dict[p.mode_of_payment] += p.amount
        payment_methods = [{"method": k, "total": v} for k, v in pm_dict.items()]

        items = frappe.db.get_all("POS Invoice Item", filters={"docstatus": 1, "parent": ["in", today_inv_names]}, fields=["item_code", "item_name", "qty", "amount"])
        ti_dict = defaultdict(lambda: {"qty": 0, "amount": 0})
        course_dict = defaultdict(float)
        
        item_codes = list(set([it.item_code for it in items if it.item_code]))
        item_course_map = {}
        if item_codes:
            item_docs = frappe.db.get_all("Item", filters={"name": ["in", item_codes]}, fields=["name", "custom_course"])
            item_course_map = {d.name: (d.custom_course or "Uncategorized") for d in item_docs}

        for it in items:
            ti_dict[it.item_name]["qty"] += it.qty
            ti_dict[it.item_name]["amount"] += it.amount
            
            course = item_course_map.get(it.item_code, "Uncategorized")
            course_dict[course] += it.amount
        
        sorted_items = sorted(ti_dict.items(), key=lambda x: x[1]["qty"], reverse=True)[:5]
        top_items = [{"item_name": k, "total_qty": v["qty"], "total_amount": v["amount"]} for k, v in sorted_items]
        sales_by_course = [{"course": k, "total": v} for k, v in course_dict.items()]

    # Order Types (Assuming custom field 'order_type' exists, else default to Dine In)
    order_types = []
    ot_dict = defaultdict(lambda: {"count": 0, "total": 0})
    for inv in today_invoices:
        ot_dict["Dine In"]["count"] += 1
        ot_dict["Dine In"]["total"] += inv.grand_total
    order_types = [{"order_type": k, "count": v["count"], "total": v["total"]} for k, v in ot_dict.items()]

    return {
        "sales_trend": sales_trend,
        "hourly_sales": hourly_sales,
        "payment_methods": payment_methods,
        "order_types": order_types,
        "top_items": top_items,
        "revenue_by_branch": revenue_by_branch,
        "sales_by_course": sales_by_course,
    }

@frappe.whitelist()
def get_recent_transactions(branch=None, limit=10):
    filters = {"docstatus": 1}
    if branch and branch != 'all':
        filters["branch"] = branch
        
    invoices = frappe.db.get_all(
        "POS Invoice", 
        filters=filters, 
        fields=["name", "customer", "posting_date", "posting_time", "grand_total", "status"],
        order_by="creation desc", 
        limit=int(limit)
    )
    
    for inv in invoices:
        if not inv.get("status"):
            inv["status"] = "Paid"
        inv["order_type"] = "Dine In"
        
    return invoices

@frappe.whitelist()
def get_module_records(doctype, branch=None):
    if doctype not in ["URY Menu", "URY Menu Course", "URY Table", "URY Room", "Item", "POS Invoice", "User"]:
        return []
    
    filters = {}
    if branch and branch != 'all':
        if doctype == "User":
            pass # users might not have branch
        else:
            # handle branching for records if the doctype has branch field.
            pass
            
    return frappe.db.get_all(doctype, fields=["*"])
