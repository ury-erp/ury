"""
URY Dashboard API
Provides aggregated data for the advanced dashboard with charts.
"""

import frappe
from frappe.utils import getdate, add_days, add_months, get_first_day, get_last_day, nowdate, flt


@frappe.whitelist()
def get_dashboard_summary(period="today"):
    """Get dashboard summary KPIs for the given period.
    period: today, yesterday, this_week, last_week, this_month, last_month
    """
    from_date, to_date = _get_period_dates(period)
    branch = _get_user_branch()

    filters = {
        "posting_date": ["between", [from_date, to_date]],
        "docstatus": 1,
    }
    if branch:
        filters["branch"] = branch

    # Total revenue
    invoices = frappe.get_all(
        "POS Invoice",
        filters=filters,
        fields=["sum(grand_total) as total_revenue", "count(*) as total_orders",
                "sum(net_total) as net_total", "sum(total_taxes_and_charges) as total_tax"]
    )
    result = invoices[0] if invoices else {}

    # Average order value
    total_orders = flt(result.get("total_orders", 0))
    total_revenue = flt(result.get("total_revenue", 0))
    avg_order = total_revenue / total_orders if total_orders > 0 else 0

    # Unique customers
    customers = frappe.get_all(
        "POS Invoice",
        filters=filters,
        fields=["count(distinct customer) as unique_customers"]
    )
    unique_customers = customers[0].unique_customers if customers else 0

    # Top selling items
    top_items = _get_top_selling_items(from_date, to_date, branch, limit=5)

    # Order type breakdown
    order_type_data = _get_order_type_breakdown(from_date, to_date, branch)

    # Hourly breakdown (for today)
    hourly_data = _get_hourly_breakdown(from_date, to_date, branch)

    return {
        "period": period,
        "from_date": str(from_date),
        "to_date": str(to_date),
        "total_revenue": flt(total_revenue, 2),
        "total_orders": int(total_orders),
        "net_total": flt(result.get("net_total", 0), 2),
        "total_tax": flt(result.get("total_taxes_and_charges", 0), 2),
        "average_order_value": flt(avg_order, 2),
        "unique_customers": int(unique_customers),
        "top_selling_items": top_items,
        "order_type_breakdown": order_type_data,
        "hourly_breakdown": hourly_data,
    }


@frappe.whitelist()
def get_revenue_chart(period="this_month", granularity="daily"):
    """Get revenue data for charts.
    granularity: hourly, daily, weekly, monthly
    """
    from_date, to_date = _get_period_dates(period)
    branch = _get_user_branch()

    if granularity == "hourly":
        data = _get_hourly_breakdown(from_date, to_date, branch)
    elif granularity == "daily":
        data = _get_daily_revenue(from_date, to_date, branch)
    elif granularity == "weekly":
        data = _get_weekly_revenue(from_date, to_date, branch)
    else:
        data = _get_monthly_revenue(from_date, to_date, branch)

    return {
        "period": period,
        "granularity": granularity,
        "from_date": str(from_date),
        "to_date": str(to_date),
        "data": data,
    }


@frappe.whitelist()
def get_orders_chart(period="this_month"):
    """Get orders count data for charts."""
    from_date, to_date = _get_period_dates(period)
    branch = _get_user_branch()

    data = _get_daily_orders(from_date, to_date, branch)

    return {
        "period": period,
        "from_date": str(from_date),
        "to_date": str(to_date),
        "data": data,
    }


@frappe.whitelist()
def get_category_sales_chart(period="this_month"):
    """Get sales breakdown by menu course/category."""
    from_date, to_date = _get_period_dates(period)
    branch = _get_user_branch()

    filters = {
        "posting_date": ["between", [from_date, to_date]],
        "docstatus": 1,
    }
    if branch:
        filters["branch"] = branch

    invoice_names = frappe.get_all("POS Invoice", filters=filters, pluck="name")
    if not invoice_names:
        return {"data": []}

    # Get item-wise sales with course info
    items = frappe.db.sql("""
        SELECT 
            COALESCE(mi.course, 'Uncategorized') as category,
            SUM(ii.qty) as total_qty,
            SUM(ii.amount) as total_amount
        FROM `tabPOS Invoice Item` ii
        JOIN `tabPOS Invoice` pi ON ii.parent = pi.name
        LEFT JOIN `tabURY Menu Item` mi ON mi.item = ii.item_code AND mi.parenttype = 'URY Menu'
        WHERE pi.name IN %s
        AND pi.docstatus = 1
        GROUP BY category
        ORDER BY total_amount DESC
    """, (tuple(invoice_names),), as_dict=True)

    return {"data": items}


@frappe.whitelist()
def get_payment_method_chart(period="this_month"):
    """Get payment method distribution."""
    from_date, to_date = _get_period_dates(period)
    branch = _get_user_branch()

    filters = {
        "posting_date": ["between", [from_date, to_date]],
        "docstatus": 1,
    }
    if branch:
        filters["branch"] = branch

    payments = frappe.db.sql("""
        SELECT 
            mop.mode_of_payment as payment_method,
            SUM(pe.paid_amount) as total_amount,
            COUNT(DISTINCT pe.name) as count
        FROM `tabPayment Entry` pe
        JOIN `tabPayment Entry Reference` per ON per.parent = pe.name
        JOIN `tabMode of Payment Account` mop ON mop.parent = pe.mode_of_payment
        WHERE per.reference_doctype = 'POS Invoice'
        AND pe.posting_date BETWEEN %s AND %s
        AND pe.docstatus = 1
        GROUP BY mop.mode_of_payment
        ORDER BY total_amount DESC
    """, (from_date, to_date), as_dict=True)

    return {"data": payments}


@frappe.whitelist()
def get_table_occupancy():
    """Get current table occupancy data."""
    branch = _get_user_branch()

    tables = frappe.get_all(
        "URY Table",
        filters={"branch": branch} if branch else {},
        fields=["name", "no_of_seats", "occupied", "restaurant_room", "is_take_away"]
    )

    total = len(tables)
    occupied = len([t for t in tables if t.occupied])
    available = total - occupied

    rooms = {}
    for table in tables:
        room = table.restaurant_room or "Unassigned"
        if room not in rooms:
            rooms[room] = {"total": 0, "occupied": 0, "available": 0}
        rooms[room]["total"] += 1
        if table.occupied:
            rooms[room]["occupied"] += 1
        else:
            rooms[room]["available"] += 1

    return {
        "total_tables": total,
        "occupied_tables": occupied,
        "available_tables": available,
        "occupancy_rate": flt(occupied / total * 100, 1) if total > 0 else 0,
        "rooms": rooms,
    }


@frappe.whitelist()
def get_live_metrics():
    """Get real-time metrics for live dashboard updates."""
    today = getdate()
    branch = _get_user_branch()

    filters = {
        "posting_date": today,
        "docstatus": 1,
    }
    if branch:
        filters["branch"] = branch

    # Today's summary
    today_data = frappe.get_all(
        "POS Invoice",
        filters=filters,
        fields=["sum(grand_total) as revenue", "count(*) as orders"]
    )
    today_revenue = flt(today_data[0].revenue) if today_data else 0
    today_orders = int(today_data[0].orders) if today_data else 0

    # Active KOTs
    active_kots = frappe.get_all(
        "URY KOT",
        filters={"order_status": "Ready For Prepare", "date": today},
        fields=["count(*) as count"]
    )
    pending_kots = int(active_kots[0].count) if active_kots else 0

    # Recent orders (last 10)
    recent_orders = frappe.get_all(
        "POS Invoice",
        filters={**filters, "docstatus": ["!=", 2]},
        fields=["name", "customer", "grand_total", "posting_time", "order_type"],
        order_by="creation desc",
        limit_page_length=10
    )

    return {
        "today_revenue": flt(today_revenue, 2),
        "today_orders": today_orders,
        "pending_kots": pending_kots,
        "recent_orders": recent_orders,
        "timestamp": frappe.utils.now(),
    }


# ---- Helper functions ----

def _get_period_dates(period):
    """Get from_date and to_date for the given period string."""
    today = getdate()

    if period == "today":
        return today, today
    elif period == "yesterday":
        yesterday = add_days(today, -1)
        return yesterday, yesterday
    elif period == "this_week":
        # Week starts on Monday
        weekday = today.weekday()
        start = add_days(today, -weekday)
        return start, today
    elif period == "last_week":
        weekday = today.weekday()
        end = add_days(today, -weekday - 1)
        start = add_days(end, -6)
        return start, end
    elif period == "this_month":
        return get_first_day(today), today
    elif period == "last_month":
        last_month = add_months(today, -1)
        return get_first_day(last_month), get_last_day(last_month)
    elif period == "last_7_days":
        return add_days(today, -6), today
    elif period == "last_30_days":
        return add_days(today, -29), today
    elif period == "last_90_days":
        return add_days(today, -89), today
    else:
        return today, today


def _get_user_branch():
    """Get the branch for the current user."""
    user = frappe.session.user
    branch = frappe.db.get_value("URY User", {"user": user}, "parent")
    return branch


def _get_top_selling_items(from_date, to_date, branch=None, limit=10):
    """Get top selling items by quantity."""
    filters = {
        "posting_date": ["between", [from_date, to_date]],
        "docstatus": 1,
    }
    if branch:
        filters["branch"] = branch

    invoice_names = frappe.get_all("POS Invoice", filters=filters, pluck="name")
    if not invoice_names:
        return []

    items = frappe.db.sql("""
        SELECT 
            ii.item_name,
            ii.item_code,
            SUM(ii.qty) as total_qty,
            SUM(ii.amount) as total_amount
        FROM `tabPOS Invoice Item` ii
        JOIN `tabPOS Invoice` pi ON ii.parent = pi.name
        WHERE pi.name IN %s
        AND pi.docstatus = 1
        GROUP BY ii.item_code, ii.item_name
        ORDER BY total_qty DESC
        LIMIT %s
    """, (tuple(invoice_names), limit), as_dict=True)

    return items


def _get_order_type_breakdown(from_date, to_date, branch=None):
    """Get order count by order type."""
    filters = {
        "posting_date": ["between", [from_date, to_date]],
        "docstatus": 1,
    }
    if branch:
        filters["branch"] = branch

    data = frappe.get_all(
        "POS Invoice",
        filters=filters,
        fields=["order_type", "count(*) as count", "sum(grand_total) as revenue"],
        group_by="order_type"
    )
    return data


def _get_hourly_breakdown(from_date, to_date, branch=None):
    """Get hourly revenue/order breakdown."""
    filters = {
        "posting_date": ["between", [from_date, to_date]],
        "docstatus": 1,
    }
    if branch:
        filters["branch"] = branch

    data = frappe.db.sql("""
        SELECT 
            HOUR(posting_time) as hour,
            COUNT(*) as order_count,
            SUM(grand_total) as revenue
        FROM `tabPOS Invoice`
        WHERE posting_date BETWEEN %s AND %s
        AND docstatus = 1
        {branch_filter}
        GROUP BY HOUR(posting_time)
        ORDER BY hour
    """.format(
        branch_filter=f"AND branch = '{branch}'" if branch else ""
    ), (from_date, to_date), as_dict=True)

    return data


def _get_daily_revenue(from_date, to_date, branch=None):
    """Get daily revenue data."""
    branch_filter = f"AND branch = '{branch}'" if branch else ""

    data = frappe.db.sql("""
        SELECT 
            posting_date as date,
            COUNT(*) as order_count,
            SUM(grand_total) as revenue,
            SUM(net_total) as net_revenue,
            SUM(total_taxes_and_charges) as tax
        FROM `tabPOS Invoice`
        WHERE posting_date BETWEEN %s AND %s
        AND docstatus = 1
        {branch_filter}
        GROUP BY posting_date
        ORDER BY posting_date
    """.format(branch_filter=branch_filter), (from_date, to_date), as_dict=True)

    return data


def _get_weekly_revenue(from_date, to_date, branch=None):
    """Get weekly revenue data."""
    branch_filter = f"AND branch = '{branch}'" if branch else ""

    data = frappe.db.sql("""
        SELECT 
            YEARWEEK(posting_date, 1) as week,
            MIN(posting_date) as week_start,
            MAX(posting_date) as week_end,
            COUNT(*) as order_count,
            SUM(grand_total) as revenue
        FROM `tabPOS Invoice`
        WHERE posting_date BETWEEN %s AND %s
        AND docstatus = 1
        {branch_filter}
        GROUP BY YEARWEEK(posting_date, 1)
        ORDER BY week
    """.format(branch_filter=branch_filter), (from_date, to_date), as_dict=True)

    return data


def _get_monthly_revenue(from_date, to_date, branch=None):
    """Get monthly revenue data."""
    branch_filter = f"AND branch = '{branch}'" if branch else ""

    data = frappe.db.sql("""
        SELECT 
            DATE_FORMAT(posting_date, '%%Y-%%m') as month,
            COUNT(*) as order_count,
            SUM(grand_total) as revenue
        FROM `tabPOS Invoice`
        WHERE posting_date BETWEEN %s AND %s
        AND docstatus = 1
        {branch_filter}
        GROUP BY month
        ORDER BY month
    """.format(branch_filter=branch_filter), (from_date, to_date), as_dict=True)

    return data


def _get_daily_orders(from_date, to_date, branch=None):
    """Get daily order counts with status breakdown."""
    branch_filter = f"AND branch = '{branch}'" if branch else ""

    data = frappe.db.sql("""
        SELECT 
            posting_date as date,
            COUNT(*) as total_orders,
            SUM(CASE WHEN docstatus = 0 THEN 1 ELSE 0 END) as draft_orders,
            SUM(CASE WHEN docstatus = 1 THEN 1 ELSE 0 END) as paid_orders,
            SUM(CASE WHEN docstatus = 2 THEN 1 ELSE 0 END) as cancelled_orders
        FROM `tabPOS Invoice`
        WHERE posting_date BETWEEN %s AND %s
        {branch_filter}
        GROUP BY posting_date
        ORDER BY posting_date
    """.format(branch_filter=branch_filter), (from_date, to_date), as_dict=True)

    return data
