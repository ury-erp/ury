import frappe
from frappe import _

# Statuses counted as realized revenue everywhere in this module. Draft
# (docstatus 0) invoices are excluded from every sum below on purpose — an
# unpaid draft is not a sale yet.
REVENUE_STATUSES = ("Consolidated", "Paid")

# Doctypes the generic "module records" browser (used by the management
# frontend's setup pages) is allowed to list. `get_module_records` used to
# accept any doctype name and query it with `frappe.get_all(..., fields=["*"])`,
# which (a) bypasses permissions entirely (`get_all` always sets
# `ignore_permissions=True`) and (b) returns every column with no limit — for
# a doctype like "User" or anything an attacker names, that's a full,
# unauthenticated-role-check table dump. Restricting to the doctypes the
# frontend actually renders, switching to `get_list` (which does enforce
# permissions), and adding an explicit `has_permission` check closes both
# holes.
ALLOWED_MODULE_DOCTYPES = {
    "URY Menu",
    "URY Menu Course",
    "URY Room",
    "URY Table",
    "URY Production Unit",
    "Branch",
    "Item",
    "Item Group",
    "User",
}

# For doctypes where "every column" would leak more than the frontend needs
# (password/security-related fields on User in particular), name the exact
# columns instead of "*".
MODULE_RECORD_FIELDS = {
    "User": ["name", "full_name", "email", "enabled", "user_image", "mobile_no"],
}


def _branch_filters(doctype, branch):
    filters = {}
    if branch and branch != "all":
        meta = frappe.get_meta(doctype)
        if meta.has_field("branch"):
            filters["branch"] = branch
        elif meta.has_field("custom_branch"):
            filters["custom_branch"] = branch
    return filters


@frappe.whitelist()
def get_dashboard_summary(branch=None):
    if not frappe.has_permission("POS Invoice", "read"):
        frappe.throw(_("Not permitted to view dashboard data"), frappe.PermissionError)

    branch_clause = "AND b.`branch` = %(branch)s" if branch and branch != "all" else ""
    result = frappe.db.sql(
        f"""
        SELECT
            COUNT(b.`name`) AS total_invoices,
            ROUND(SUM(b.`grand_total`), 2) AS grand_total
        FROM `tabPOS Invoice` b
        WHERE
            b.`docstatus` = 1
            AND b.`status` IN %(statuses)s
            AND b.`posting_date` = CURDATE()
            {branch_clause}
        """,
        {"branch": branch, "statuses": REVENUE_STATUSES},
        as_dict=True,
    )[0]

    today_sales = result.grand_total or 0
    today_orders = result.total_invoices or 0
    avg_order_value = round(today_sales / today_orders, 2) if today_orders else 0

    table_filters = {"branch": branch} if branch and branch != "all" else {}
    has_tables = frappe.db.exists("DocType", "URY Table")
    occupied_tables = (
        frappe.db.count("URY Table", {**table_filters, "occupied": 1}) if has_tables else 0
    )
    total_tables = frappe.db.count("URY Table", table_filters) if has_tables else 0

    kot_filters = {"docstatus": 1, "order_status": "Ready For Prepare"}
    if branch and branch != "all":
        kot_filters["branch"] = branch
    pending_kitchen_orders = (
        frappe.db.count("URY KOT", kot_filters) if frappe.db.exists("DocType", "URY KOT") else 0
    )

    if branch and branch != "all":
        active_cashiers = frappe.db.sql(
            """SELECT COUNT(DISTINCT a.`user`) FROM `tabURY User` a WHERE a.`parent` = %s""",
            branch,
        )[0][0] or 0
    else:
        active_cashiers = frappe.db.count("User", {"enabled": 1})

    return {
        "today_sales": today_sales,
        "today_orders": today_orders,
        "occupied_tables": occupied_tables,
        "total_tables": total_tables,
        "avg_order_value": avg_order_value,
        "active_cashiers": active_cashiers,
        "pending_kitchen_orders": pending_kitchen_orders,
        "total_menu_items": frappe.db.count("Item") if frappe.db.exists("DocType", "Item") else 0,
    }


@frappe.whitelist()
def get_dashboard_charts(branch=None):
    if not frappe.has_permission("POS Invoice", "read"):
        frappe.throw(_("Not permitted to view dashboard data"), frappe.PermissionError)

    branch_clause = "AND `branch` = %(branch)s" if branch and branch != "all" else ""
    params = {"branch": branch, "statuses": REVENUE_STATUSES}

    sales_trend = frappe.db.sql(
        f"""
        SELECT `posting_date` AS `date`, ROUND(SUM(`grand_total`), 2) AS sales
        FROM `tabPOS Invoice`
        WHERE `docstatus` = 1 AND `status` IN %(statuses)s
            AND `posting_date` BETWEEN DATE_SUB(CURDATE(), INTERVAL 6 DAY) AND CURDATE()
            {branch_clause}
        GROUP BY `posting_date`
        ORDER BY `posting_date`
        """,
        params,
        as_dict=True,
    )

    hourly_sales = frappe.db.sql(
        f"""
        SELECT HOUR(`posting_time`) AS `hour`, ROUND(SUM(`grand_total`), 2) AS sales
        FROM `tabPOS Invoice`
        WHERE `docstatus` = 1 AND `status` IN %(statuses)s AND `posting_date` = CURDATE()
            {branch_clause}
        GROUP BY HOUR(`posting_time`)
        ORDER BY `hour`
        """,
        params,
        as_dict=True,
    )
    for row in hourly_sales:
        row["hour"] = f"{int(row['hour']):02d}:00"

    payment_methods = frappe.db.sql(
        f"""
        SELECT p.`mode_of_payment` AS method, ROUND(SUM(p.`amount`), 2) AS total
        FROM `tabSales Invoice Payment` p
        INNER JOIN `tabPOS Invoice` b ON b.`name` = p.`parent` AND p.`parenttype` = 'POS Invoice'
        WHERE b.`docstatus` = 1 AND b.`status` IN %(statuses)s AND b.`posting_date` = CURDATE()
            {branch_clause.replace('`branch`', 'b.`branch`')}
        GROUP BY p.`mode_of_payment`
        """,
        params,
        as_dict=True,
    )

    order_types = frappe.db.sql(
        f"""
        SELECT `order_type`, COUNT(`name`) AS count, ROUND(SUM(`grand_total`), 2) AS total
        FROM `tabPOS Invoice`
        WHERE `docstatus` = 1 AND `status` IN %(statuses)s AND `posting_date` = CURDATE()
            {branch_clause}
        GROUP BY `order_type`
        """,
        params,
        as_dict=True,
    )

    top_items = frappe.db.sql(
        f"""
        SELECT i.`item_name` AS item_name, SUM(i.`qty`) AS total_qty, ROUND(SUM(i.`amount`), 2) AS total_amount
        FROM `tabPOS Invoice Item` i
        INNER JOIN `tabPOS Invoice` b ON b.`name` = i.`parent`
        WHERE b.`docstatus` = 1 AND b.`status` IN %(statuses)s AND b.`posting_date` = CURDATE()
            {branch_clause.replace('`branch`', 'b.`branch`')}
        GROUP BY i.`item_code`, i.`item_name`
        ORDER BY total_qty DESC
        LIMIT 5
        """,
        params,
        as_dict=True,
    )

    revenue_by_branch = frappe.db.sql(
        f"""
        SELECT `branch`, ROUND(SUM(`grand_total`), 2) AS total
        FROM `tabPOS Invoice`
        WHERE `docstatus` = 1 AND `status` IN %(statuses)s AND `posting_date` = CURDATE()
            {branch_clause}
        GROUP BY `branch`
        """,
        params,
        as_dict=True,
    )

    sales_by_course = []
    if frappe.db.exists("DocType", "URY Menu Item"):
        sales_by_course = frappe.db.sql(
            f"""
            SELECT COALESCE(mi.`course`, 'Uncategorized') AS course, ROUND(SUM(i.`amount`), 2) AS total
            FROM `tabPOS Invoice Item` i
            INNER JOIN `tabPOS Invoice` b ON b.`name` = i.`parent`
            LEFT JOIN (
                SELECT `item`, MIN(`course`) AS course
                FROM `tabURY Menu Item`
                WHERE `course` IS NOT NULL
                GROUP BY `item`
            ) mi ON mi.`item` = i.`item_code`
            WHERE b.`docstatus` = 1 AND b.`status` IN %(statuses)s AND b.`posting_date` = CURDATE()
                {branch_clause.replace('`branch`', 'b.`branch`')}
            GROUP BY course
            """,
            params,
            as_dict=True,
        )

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
    if not frappe.has_permission("POS Invoice", "read"):
        frappe.throw(_("Not permitted to view transactions"), frappe.PermissionError)

    if not frappe.db.exists("DocType", "POS Invoice"):
        return []

    filters = {"docstatus": ["in", [0, 1]]}
    if branch and branch != "all":
        filters["branch"] = branch

    try:
        invoices = frappe.get_list(
            "POS Invoice",
            filters=filters,
            fields=[
                "name", "customer", "posting_date", "posting_time", "grand_total",
                "status", "order_type", "restaurant_table as restaurant_table",
                "owner as cashier",
            ],
            order_by="creation desc",
            limit_page_length=int(limit),
        )
        for inv in invoices:
            if not inv.get("status"):
                inv["status"] = "Draft" if inv.get("docstatus") == 0 else "Paid"
            if not inv.get("order_type"):
                inv["order_type"] = "Dine In"
        return invoices
    except Exception:
        # An empty list here is indistinguishable from "no transactions today",
        # so a broken query used to read on screen as a quiet, believable zero.
        # A manager acting on that number is worse off than one who knows the
        # panel is broken.
        frappe.log_error(frappe.get_traceback(), "get_recent_transactions failed")
        frappe.throw(
            _("Could not load recent transactions. The error has been logged."),
            title=_("Transactions unavailable"),
        )


@frappe.whitelist()
def get_module_records(doctype, branch=None):
    if doctype not in ALLOWED_MODULE_DOCTYPES:
        frappe.throw(_("Not permitted to list {0}").format(doctype), frappe.PermissionError)
    if not frappe.has_permission(doctype, "read"):
        frappe.throw(_("Not permitted to list {0}").format(doctype), frappe.PermissionError)
    if not frappe.db.exists("DocType", doctype):
        return []

    filters = _branch_filters(doctype, branch)
    fields = MODULE_RECORD_FIELDS.get(doctype, ["*"])

    try:
        records = frappe.get_list(doctype, filters=filters, fields=fields, limit_page_length=0)
        if doctype == "User":
            for r in records:
                r["roles"] = frappe.get_list(
                    "Has Role", filters={"parent": r.name}, fields=["role"], limit_page_length=0
                )
        return records
    except Exception:
        # Same reason as get_recent_transactions: a swallowed failure renders
        # as an empty module — "you have no tables", "you have no users" —
        # which invites someone to create duplicates of records that exist.
        frappe.log_error(frappe.get_traceback(), f"get_module_records failed for {doctype}")
        frappe.throw(
            _("Could not load {0} records. The error has been logged.").format(_(doctype)),
            title=_("Records unavailable"),
        )
