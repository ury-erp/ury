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


from datetime import timedelta
from frappe.utils import flt, getdate, nowdate, add_days, get_datetime


def get_completed_pos_sessions(branch, limit=None):
    """
    Returns completed POS business sessions for a branch, ordered by most recently completed first.
    A POS business session is considered completed only when its corresponding POS Closing Entry
    exists with docstatus = 1 (Submitted/Completed).
    Identified from its POS Opening Entry -> corresponding POS Closing Entry relationship.
    """
    if not branch:
        return []

    query = """
        SELECT
            cls.name AS closing_entry,
            cls.pos_opening_entry,
            cls.period_start_date,
            cls.period_end_date,
            cls.posting_date,
            cls.posting_time,
            COALESCE(opn.branch, prof.branch) AS branch
        FROM
            `tabPOS Closing Entry` cls
        INNER JOIN
            `tabPOS Opening Entry` opn ON opn.name = cls.pos_opening_entry
        LEFT JOIN
            `tabPOS Profile` prof ON prof.name = cls.pos_profile
        WHERE
            cls.docstatus = 1
            AND (opn.branch = %(branch)s OR prof.branch = %(branch)s)
        ORDER BY
            cls.period_end_date DESC, cls.modified DESC
    """
    if limit:
        query += f" LIMIT {int(limit)}"

    return frappe.db.sql(query, {"branch": branch}, as_dict=True)


def get_average_table_time_for_sessions(sessions, branch=None):
    """
    Calculates average table time in minutes using the existing table-time calculation
    for the given completed POS business sessions.
    Only includes docstatus=1 table invoices that belong to these completed sessions.
    """
    if not sessions:
        return None

    closing_names = [s.closing_entry for s in sessions if s.get("closing_entry")]
    if not closing_names:
        return None

    time_conditions = []
    params = {"closing_names": tuple(closing_names)}
    if branch:
        params["branch"] = branch

    for idx, s in enumerate(sessions):
        if s.get("period_start_date") and s.get("period_end_date"):
            start_k = f"start_{idx}"
            end_k = f"end_{idx}"
            params[start_k] = s.period_start_date
            params[end_k] = s.period_end_date
            time_conditions.append(
                f"(TIMESTAMP(inv.posting_date, inv.posting_time) >= %({start_k})s AND TIMESTAMP(inv.posting_date, inv.posting_time) <= %({end_k})s)"
            )

    time_clause = ""
    if time_conditions and branch:
        time_clause = f"OR (inv.branch = %(branch)s AND ({' OR '.join(time_conditions)}))"

    query = f"""
        SELECT
            AVG(
                CASE
                    WHEN inv.total_spend_time IS NOT NULL AND inv.total_spend_time != '' AND inv.total_spend_time != '00:00:00'
                        THEN TIME_TO_SEC(inv.total_spend_time) / 60.0
                    WHEN inv.arrived_time IS NOT NULL
                        THEN TIMESTAMPDIFF(SECOND, inv.arrived_time, inv.modified) / 60.0
                    ELSE TIMESTAMPDIFF(SECOND, inv.creation, inv.modified) / 60.0
                END
            ) AS `avg_table_time`
        FROM
            `tabPOS Invoice` inv
        WHERE
            inv.docstatus = 1
            AND inv.restaurant_table IS NOT NULL
            AND inv.restaurant_table != ''
            AND (
                inv.name IN (
                    SELECT ref.pos_invoice
                    FROM `tabPOS Invoice Reference` ref
                    WHERE ref.parent IN %(closing_names)s
                )
                {time_clause}
            )
    """

    res = frappe.db.sql(query, params, as_dict=True)
    if res and res[0].avg_table_time is not None:
        return round(flt(res[0].avg_table_time), 2)
    return None


def _safe_update_branch_field(branch, fieldname, value):
    if not branch or not fieldname:
        return
    try:
        frappe.db.set_value("Branch", branch, fieldname, value, update_modified=False)
    except Exception as e:
        frappe.log_error(f"Error updating Branch {branch} field {fieldname}: {str(e)}", "Branch Avg Table Time Update")


def _safe_update_branch_fields(branch, values_dict):
    if not branch or not values_dict:
        return
    try:
        frappe.db.set_value("Branch", branch, values_dict, update_modified=False)
    except Exception as e:
        frappe.log_error(f"Error updating Branch {branch} fields: {str(e)}", "Branch Avg Table Time Update")


def get_branch_last_day_avg_time(branch, update_branch=True):
    """
    Returns average table time in minutes for the most recently completed POS business session.
    A POS business session is identified by its POS Opening Entry -> POS Closing Entry relationship.
    Only completed sessions (POS Closing Entry docstatus=1) are considered.
    Does NOT use the currently open/incomplete POS session.
    Updates Branch.custom_avg_table_time_last_day with the calculated average.
    """
    if not branch:
        return 0.0

    completed_sessions = get_completed_pos_sessions(branch, limit=1)
    if not completed_sessions:
        if update_branch:
            _safe_update_branch_field(branch, "custom_avg_table_time_last_day", 0.0)
        return 0.0

    latest_session = completed_sessions[0]
    avg_time = get_average_table_time_for_sessions([latest_session], branch=branch)
    val = round(flt(avg_time or 0.0), 2)

    if update_branch:
        _safe_update_branch_field(branch, "custom_avg_table_time_last_day", val)

    return val


def get_branch_last_week_avg_time(branch, update_branch=True):
    """
    Returns average table time in minutes based on completed POS business sessions ending
    at the most recently completed POS business session (not calendar days).
    Does NOT use the currently open/incomplete POS session.
    Updates Branch.custom_avg_table_time_last_week with the calculated average.
    """
    if not branch:
        return 0.0

    completed_sessions = get_completed_pos_sessions(branch)
    if not completed_sessions:
        if update_branch:
            _safe_update_branch_field(branch, "custom_avg_table_time_last_week", 0.0)
        return 0.0

    latest_session = completed_sessions[0]
    latest_end = get_datetime(latest_session.period_end_date)
    week_start = latest_end - timedelta(days=7)

    # Completed sessions ending at the most recently completed session and starting within the 7-day period
    week_sessions = [
        s for s in completed_sessions
        if get_datetime(s.period_end_date) <= latest_end and get_datetime(s.period_start_date) >= week_start
    ]

    # Fallback to up to 7 most recent completed sessions if none fall in strict 7-day window
    if not week_sessions:
        week_sessions = completed_sessions[:7]

    avg_time = get_average_table_time_for_sessions(week_sessions, branch=branch)
    val = round(flt(avg_time or 0.0), 2)

    if update_branch:
        _safe_update_branch_field(branch, "custom_avg_table_time_last_week", val)

    return val


def update_branch_avg_table_times(branch):
    """
    Calculates and updates both custom_avg_table_time_last_day and
    custom_avg_table_time_last_week on Branch based on completed POS business sessions.
    """
    if not branch:
        return 0.0, 0.0

    last_day_val = get_branch_last_day_avg_time(branch, update_branch=False)
    last_week_val = get_branch_last_week_avg_time(branch, update_branch=False)

    _safe_update_branch_fields(branch, {
        "custom_avg_table_time_last_day": last_day_val,
        "custom_avg_table_time_last_week": last_week_val,
    })

    return last_day_val, last_week_val


def get_branch_reservation_duration(branch, default_duration=90):
    """
    Centralized authority to determine the expected reservation duration (in minutes) for a branch.
    Selection logic:
    1. Try Last Day Average Table Time (Branch.custom_avg_table_time_last_day).
    2. If not available/0, try Last Week Average Table Time (Branch.custom_avg_table_time_last_week).
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
