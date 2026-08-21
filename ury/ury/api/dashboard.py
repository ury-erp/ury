"""Admin dashboard endpoints.

This is the module `frontend/src/services/dashboard.ts` calls. It previously
held a stub returning hardcoded zeros for the summary and charts, while the
working implementation sat unreferenced in `ury/api/dashboard.py`; that
module has been removed and its queries consolidated here.

Every endpoint calls require_manager() first. These return branch-wide
revenue and record listings, and frappe.db.get_all/count bypass permissions
by design, so the role check is the only boundary in front of them.
"""

from collections import defaultdict

import frappe
from frappe.utils import add_days, cint, getdate, today

from ury.ury.report_api.utils import require_manager

# get_module_records backs the dashboard's record browser. It is restricted to
# the doctypes the frontend actually asks for: previously it accepted *any*
# doctype name and returned every field of every row through a
# permission-bypassing get_all, which let any authenticated user read
# arbitrary tables (User, tokens, ERPNext financials).
ALLOWED_MODULE_DOCTYPES = frozenset(
    {
        "Branch",
        "Item",
        "Item Group",
        "POS Invoice",
        "URY Menu",
        "URY Menu Course",
        "URY Production Unit",
        "URY Room",
        "URY Table",
        "User",
    }
)
MODULE_RECORD_LIMIT = 500


def _with_branch(base, branch, doctype="POS Invoice"):
    """Apply the branch filter unless the caller asked for every branch, using
    whichever branch field the doctype actually has."""
    filters = dict(base)
    if not branch or branch == "all":
        return filters

    meta = frappe.get_meta(doctype)
    if meta.has_field("branch"):
        filters["branch"] = branch
    elif meta.has_field("custom_branch"):
        filters["custom_branch"] = branch
    return filters


@frappe.whitelist()
def get_dashboard_summary(branch=None):
    require_manager()

    invoices = frappe.db.get_all(
        "POS Invoice",
        filters=_with_branch({"docstatus": 1, "posting_date": today()}, branch),
        fields=["grand_total", "name"],
    )
    today_sales = sum(d.grand_total for d in invoices)
    today_orders = len(invoices)

    occupied_tables = frappe.db.count(
        "POS Invoice",
        filters=_with_branch({"docstatus": 0, "posting_date": today()}, branch),
    )

    pending_kitchen_orders = 0
    if frappe.db.exists("DocType", "Restaurant Order"):
        pending_kitchen_orders = frappe.db.count(
            "Restaurant Order",
            filters=_with_branch({"status": "Pending"}, branch, "Restaurant Order"),
        )

    return {
        "today_sales": today_sales,
        "today_orders": today_orders,
        "occupied_tables": occupied_tables,
        "total_tables": frappe.db.count("URY Table"),
        "avg_order_value": today_sales / today_orders if today_orders else 0,
        "active_cashiers": 0,
        "pending_kitchen_orders": pending_kitchen_orders,
        "total_menu_items": frappe.db.count("Item", {"is_sales_item": 1, "disabled": 0}),
    }


@frappe.whitelist()
def get_dashboard_charts(branch=None):
    require_manager()

    current_date = getdate(today())
    inv_filters = _with_branch({"docstatus": 1, "posting_date": current_date}, branch)

    # Seven days of totals in one grouped query rather than one query per day.
    trend_rows = frappe.db.get_all(
        "POS Invoice",
        filters=_with_branch(
            {"docstatus": 1, "posting_date": ["between", [add_days(current_date, -6), current_date]]},
            branch,
        ),
        fields=["posting_date", "sum(grand_total) as sales"],
        group_by="posting_date",
    )
    totals_by_date = {str(getdate(r.posting_date)): r.sales or 0 for r in trend_rows}
    sales_trend = []
    for i in range(6, -1, -1):
        day = str(add_days(current_date, -i))
        sales_trend.append({"date": day, "sales": totals_by_date.get(day, 0)})

    # Revenue by branch always compares every branch, regardless of the filter.
    revenue_by_branch = [
        {"branch": b.branch or "Unknown", "total": b.total or 0}
        for b in frappe.db.get_all(
            "POS Invoice",
            filters={"docstatus": 1, "posting_date": current_date},
            fields=["branch", "sum(grand_total) as total"],
            group_by="branch",
        )
    ]

    today_invoices = frappe.db.get_all(
        "POS Invoice", filters=inv_filters, fields=["name", "posting_time", "grand_total"]
    )

    hourly = defaultdict(float)
    for inv in today_invoices:
        hourly[str(inv.posting_time).split(":")[0] + ":00"] += inv.grand_total
    hourly_sales = [{"hour": h, "sales": hourly[h]} for h in sorted(hourly)]

    payment_methods = []
    top_items = []
    sales_by_course = []
    today_inv_names = [i.name for i in today_invoices]

    if today_inv_names:
        payment_methods = [
            {"method": p.mode_of_payment, "total": p.amount or 0}
            for p in frappe.db.get_all(
                "POS Invoice Payment",
                filters={"docstatus": 1, "parent": ["in", today_inv_names]},
                fields=["mode_of_payment", "sum(amount) as amount"],
                group_by="mode_of_payment",
            )
        ]

        items = frappe.db.get_all(
            "POS Invoice Item",
            filters={"docstatus": 1, "parent": ["in", today_inv_names]},
            fields=["item_code", "item_name", "qty", "amount"],
        )

        item_course_map = {}
        item_codes = list({it.item_code for it in items if it.item_code})
        if item_codes:
            item_course_map = {
                d.name: (d.custom_course or "Uncategorized")
                for d in frappe.db.get_all(
                    "Item", filters={"name": ["in", item_codes]}, fields=["name", "custom_course"]
                )
            }

        ti_dict = defaultdict(lambda: {"qty": 0, "amount": 0})
        course_dict = defaultdict(float)
        for it in items:
            ti_dict[it.item_name]["qty"] += it.qty
            ti_dict[it.item_name]["amount"] += it.amount
            course_dict[item_course_map.get(it.item_code, "Uncategorized")] += it.amount

        top_items = [
            {"item_name": k, "total_qty": v["qty"], "total_amount": v["amount"]}
            for k, v in sorted(ti_dict.items(), key=lambda x: x[1]["qty"], reverse=True)[:5]
        ]
        sales_by_course = [{"course": k, "total": v} for k, v in course_dict.items()]

    order_types = []
    if today_invoices:
        order_types = [
            {
                "order_type": "Dine In",
                "count": len(today_invoices),
                "total": sum(i.grand_total for i in today_invoices),
            }
        ]

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
    require_manager()

    invoices = frappe.db.get_all(
        "POS Invoice",
        filters=_with_branch({"docstatus": ["in", [0, 1]]}, branch),
        fields=[
            "name",
            "customer",
            "posting_date",
            "posting_time",
            "grand_total",
            "docstatus",
            "status",
            "order_type",
            "restaurant_table",
            "owner as cashier",
        ],
        order_by="creation desc",
        limit=cint(limit) or 10,
    )

    for inv in invoices:
        if not inv.get("status"):
            inv["status"] = "Draft" if inv.get("docstatus") == 0 else "Paid"
        if not inv.get("order_type"):
            inv["order_type"] = "Dine In"

    return invoices


@frappe.whitelist()
def get_module_records(doctype, branch=None):
    require_manager()

    if doctype not in ALLOWED_MODULE_DOCTYPES:
        frappe.throw(
            frappe._("{0} is not available on the dashboard.").format(doctype),
            frappe.PermissionError,
        )

    # get_list, not get_all, so the caller's own read permissions still apply
    # on top of the manager check; and always bounded.
    return frappe.get_list(
        doctype,
        filters=_with_branch({}, branch, doctype),
        fields=["*"],
        limit_page_length=MODULE_RECORD_LIMIT,
    )
