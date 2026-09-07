# Copyright (c) 2026, Tridz Technologies Pvt. Ltd and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import flt, getdate, nowdate, add_days


def execute(filters=None):
    filters = filters or {}
    columns = get_columns()
    data = get_data(filters)
    return columns, data


def get_columns():
    return [
        {
            "label": _("Date"),
            "fieldname": "date",
            "fieldtype": "Date",
            "width": 140,
        },
        {
            "label": _("Branch"),
            "fieldname": "branch",
            "fieldtype": "Link",
            "options": "Branch",
            "width": 160,
        },
        {
            "label": _("Total Table Orders"),
            "fieldname": "total_orders",
            "fieldtype": "Int",
            "width": 140,
        },
        {
            "label": _("Average Table Time (Minutes)"),
            "fieldname": "avg_table_time_minutes",
            "fieldtype": "Float",
            "precision": 2,
            "width": 220,
        },
    ]


def get_data(filters):
    conditions = ["inv.docstatus = 1", "inv.restaurant_table IS NOT NULL", "inv.restaurant_table != ''"]
    values = {}

    if filters.get("branch"):
        conditions.append("inv.branch = %(branch)s")
        values["branch"] = filters["branch"]

    if filters.get("from_date"):
        conditions.append("inv.posting_date >= %(from_date)s")
        values["from_date"] = filters["from_date"]

    if filters.get("to_date"):
        conditions.append("inv.posting_date <= %(to_date)s")
        values["to_date"] = filters["to_date"]

    where_clause = " AND ".join(conditions)

    # Calculate duration in seconds using total_spend_time or TIMESTAMPDIFF between arrived_time/creation and modified
    query = f"""
        SELECT
            inv.posting_date AS `date`,
            inv.branch AS `branch`,
            COUNT(inv.name) AS `total_orders`,
            AVG(
                CASE
                    WHEN inv.total_spend_time IS NOT NULL AND inv.total_spend_time != '' AND inv.total_spend_time != '00:00:00'
                        THEN TIME_TO_SEC(inv.total_spend_time) / 60.0
                    WHEN inv.arrived_time IS NOT NULL
                        THEN TIMESTAMPDIFF(SECOND, inv.arrived_time, inv.modified) / 60.0
                    ELSE TIMESTAMPDIFF(SECOND, inv.creation, inv.modified) / 60.0
                END
            ) AS `avg_table_time_minutes`
        FROM
            `tabPOS Invoice` inv
        WHERE
            {where_clause}
        GROUP BY
            inv.posting_date, inv.branch
        ORDER BY
            inv.posting_date DESC
    """

    results = frappe.db.sql(query, values, as_dict=True)

    data = []
    total_orders_sum = 0
    total_minutes_weighted = 0.0

    for row in results:
        avg_mins = round(flt(row.avg_table_time_minutes), 2)
        orders = int(row.total_orders or 0)
        total_orders_sum += orders
        total_minutes_weighted += avg_mins * orders

        data.append({
            "date": row.date,
            "branch": row.branch,
            "total_orders": orders,
            "avg_table_time_minutes": avg_mins,
        })

    if data and total_orders_sum > 0:
        overall_avg = round(total_minutes_weighted / total_orders_sum, 2)
        data.append({
            "date": None,
            "branch": _("Overall Average"),
            "total_orders": total_orders_sum,
            "avg_table_time_minutes": overall_avg,
        })

    return data


def get_average_table_time(branch=None, from_date=None, to_date=None):
    """
    Public helper to get average table time in minutes for a branch and date range.
    Returns float (minutes) or None if no records exist.
    """
    conditions = ["docstatus = 1", "restaurant_table IS NOT NULL", "restaurant_table != ''"]
    values = {}

    if branch:
        conditions.append("branch = %(branch)s")
        values["branch"] = branch

    if from_date:
        conditions.append("posting_date >= %(from_date)s")
        values["from_date"] = from_date

    if to_date:
        conditions.append("posting_date <= %(to_date)s")
        values["to_date"] = to_date

    where_clause = " AND ".join(conditions)

    query = f"""
        SELECT
            AVG(
                CASE
                    WHEN total_spend_time IS NOT NULL AND total_spend_time != '' AND total_spend_time != '00:00:00'
                        THEN TIME_TO_SEC(total_spend_time) / 60.0
                    WHEN arrived_time IS NOT NULL
                        THEN TIMESTAMPDIFF(SECOND, arrived_time, modified) / 60.0
                    ELSE TIMESTAMPDIFF(SECOND, creation, modified) / 60.0
                END
            ) AS `avg_table_time`
        FROM
            `tabPOS Invoice`
        WHERE
            {where_clause}
    """

    res = frappe.db.sql(query, values, as_dict=True)
    if res and res[0].avg_table_time is not None:
        return round(flt(res[0].avg_table_time), 2)
    return None


def get_branch_last_day_avg_time(branch):
    """
    Returns average table time in minutes for the latest available day / yesterday.
    """
    today = nowdate()
    yesterday = add_days(today, -1)
    # Check yesterday first
    avg_yesterday = get_average_table_time(branch=branch, from_date=yesterday, to_date=yesterday)
    if avg_yesterday is not None and avg_yesterday > 0:
        return avg_yesterday

    # Check today
    avg_today = get_average_table_time(branch=branch, from_date=today, to_date=today)
    if avg_today is not None and avg_today > 0:
        return avg_today

    # Fallback to most recent single day with data
    query = """
        SELECT posting_date
        FROM `tabPOS Invoice`
        WHERE branch = %s AND docstatus = 1 AND restaurant_table IS NOT NULL AND restaurant_table != ''
        ORDER BY posting_date DESC
        LIMIT 1
    """
    latest_date_res = frappe.db.sql(query, (branch,), as_dict=True)
    if latest_date_res:
        latest_date = latest_date_res[0].posting_date
        return get_average_table_time(branch=branch, from_date=latest_date, to_date=latest_date) or 0.0

    return 0.0


def get_branch_last_week_avg_time(branch):
    """
    Returns average table time in minutes across the past 7 days.
    """
    today = nowdate()
    seven_days_ago = add_days(today, -7)
    avg = get_average_table_time(branch=branch, from_date=seven_days_ago, to_date=today)
    return avg or 0.0


def get_branch_reservation_duration(branch, default_duration=90):
    """
    Centralized authority to determine the expected reservation duration (in minutes) for a branch.
    Selection logic:
    1. Try Last Day Average Table Time.
    2. If not available/0, try Last Week Average Table Time.
    3. If not available/0, fall back to default_duration (default: 90 minutes).
    """
    if not branch:
        return default_duration

    last_day_avg = get_branch_last_day_avg_time(branch)
    if last_day_avg and last_day_avg >= 15: # minimum sensible table time
        return int(round(last_day_avg))

    last_week_avg = get_branch_last_week_avg_time(branch)
    if last_week_avg and last_week_avg >= 15:
        return int(round(last_week_avg))

    return default_duration
