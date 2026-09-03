# Copyright (c) 2026, Tridz Technologies Pvt. Ltd and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import (
    get_datetime,
    now_datetime,
    add_to_date,
    flt,
    cint,
    get_time,
)
from datetime import timedelta
from ury.ury.report.average_table_time.average_table_time import (
    get_branch_last_day_avg_time,
    get_branch_last_week_avg_time,
    get_branch_reservation_duration,
)


@frappe.whitelist()
def get_branch_reservation_settings(branch):
    """
    Returns reservation configuration and metrics for the specified branch.
    """
    if not branch:
        return {
            "enable_reservation": 0,
            "buffer_time": 30,
            "grace_period": 15,
            "avg_table_time_last_day": 0.0,
            "avg_table_time_last_week": 0.0,
            "calculated_duration": 90,
        }

    try:
        branch_doc = frappe.db.get_value(
            "Branch",
            branch,
            [
                "custom_enable_reservation",
                "custom_buffer_time",
                "custom_grace_period",
            ],
            as_dict=True,
        ) or {}

        enable_reservation = cint(branch_doc.get("custom_enable_reservation") or 0)
        buffer_time = cint(branch_doc.get("custom_buffer_time") or 30)
        if buffer_time <= 0:
            buffer_time = 30

        grace_period = cint(branch_doc.get("custom_grace_period") or 15)
        if grace_period <= 0:
            grace_period = 15

        last_day_avg = get_branch_last_day_avg_time(branch)
        last_week_avg = get_branch_last_week_avg_time(branch)
        calc_duration = get_branch_reservation_duration(branch)

        return {
            "enable_reservation": enable_reservation,
            "buffer_time": buffer_time,
            "grace_period": grace_period,
            "avg_table_time_last_day": round(flt(last_day_avg), 2),
            "avg_table_time_last_week": round(flt(last_week_avg), 2),
            "calculated_duration": cint(calc_duration),
        }
    except Exception as e:
        frappe.log_error(f"Error in get_branch_reservation_settings: {str(e)}", "Reservation Settings Error")
        return {
            "enable_reservation": 0,
            "buffer_time": 30,
            "grace_period": 15,
            "avg_table_time_last_day": 0.0,
            "avg_table_time_last_week": 0.0,
            "calculated_duration": 90,
        }


def validate_reservation_conflicts(table, branch, reserved_at, exclude_name=None):
    """
    Centralized validation engine to ensure that no overlapping reservations exist on the table.
    Considers:
      - Start Time: T_start
      - Expected Duration: D (from Average Table Time calculation)
      - Buffer Time: B (from Branch settings)
      - Lock window: [T_start - B, T_start + D]
    """
    if not table or not reserved_at:
        return

    if isinstance(reserved_at, str):
        if "T" in reserved_at:
            reserved_at = reserved_at.replace("T", " ")
        new_start = get_datetime(reserved_at)
    else:
        new_start = reserved_at

    if not branch:
        branch = frappe.db.get_value("URY Table", table, "branch")

    settings = get_branch_reservation_settings(branch)
    buffer_mins = cint(settings.get("buffer_time", 30))
    duration_mins = cint(settings.get("calculated_duration", 90))

    new_end = new_start + timedelta(minutes=duration_mins)
    new_protect_start = new_start - timedelta(minutes=buffer_mins)

    query = """
        SELECT name, reserved_at, branch
        FROM `tabURY Table Reservation`
        WHERE reserved_table = %s
          AND status IN ('Confirmed', 'Active')
    """
    params = [table]

    if exclude_name:
        query += " AND name != %s"
        params.append(exclude_name)

    existing_reservations = frappe.db.sql(query, tuple(params), as_dict=True)

    for ex in existing_reservations:
        ex_start = get_datetime(ex.reserved_at)
        ex_branch = ex.branch or branch
        ex_settings = get_branch_reservation_settings(ex_branch)
        ex_buffer = cint(ex_settings.get("buffer_time", 30))
        ex_duration = cint(ex_settings.get("calculated_duration", 90))

        ex_end = ex_start + timedelta(minutes=ex_duration)
        ex_protect_start = ex_start - timedelta(minutes=ex_buffer)

        # Conflict occurs if the active dining window of one overlaps with the protection window of the other
        if (ex_end > new_protect_start and ex_start < new_end) or (new_end > ex_protect_start and new_start < ex_end):
            if new_start == ex_start:
                frappe.throw(_("This table is already reserved for the selected time."))
            else:
                frappe.throw(
                    _("This table is not available for the selected reservation time due to an existing reservation window ({0} - {1}).").format(
                        ex_start.strftime("%I:%M %p"), ex_end.strftime("%I:%M %p")
                    )
                )


@frappe.whitelist()
def check_table_reservation(table):
    """
    Fetches the current active/protecting reservation or upcoming reservation for a table.
    """
    if not table:
        return None

    try:
        branch = frappe.db.get_value("URY Table", table, "branch")
        settings = get_branch_reservation_settings(branch)
        buffer_mins = cint(settings.get("buffer_time", 30))
        grace_mins = cint(settings.get("grace_period", 15))
        duration_mins = cint(settings.get("calculated_duration", 90))

        now = now_datetime()

        # Find all Confirmed reservations for this table
        reservations = frappe.db.get_all(
            "URY Table Reservation",
            filters={
                "reserved_table": table,
                "status": ["in", ["Confirmed", "Active"]],
            },
            fields=[
                "name",
                "branch",
                "reserved_table",
                "customer",
                "customer_name",
                "customer_phone",
                "no_of_pax",
                "reserved_at",
                "comments",
                "status",
            ],
            order_by="reserved_at asc",
        )

        if not reservations:
            return None

        # Priority 1: Check if any reservation is currently in its active lock window:
        # [reserved_at - buffer_time, reserved_at + grace_period]
        for res in reservations:
            res_time = get_datetime(res.reserved_at)
            lock_start = res_time - timedelta(minutes=buffer_mins)
            grace_end = res_time + timedelta(minutes=grace_mins)

            if lock_start <= now <= grace_end:
                res["is_lock_window_active"] = True
                res["buffer_minutes"] = buffer_mins
                res["grace_minutes"] = grace_mins
                res["duration_minutes"] = duration_mins
                return res

        # Priority 2: Return next upcoming reservation for informational display
        for res in reservations:
            res_time = get_datetime(res.reserved_at)
            if res_time > now:
                res["is_lock_window_active"] = False
                res["buffer_minutes"] = buffer_mins
                res["grace_minutes"] = grace_mins
                res["duration_minutes"] = duration_mins
                return res

        # Otherwise return the first confirmed
        res = reservations[0]
        res["is_lock_window_active"] = False
        res["buffer_minutes"] = buffer_mins
        res["grace_minutes"] = grace_mins
        res["duration_minutes"] = duration_mins
        return res
    except Exception as e:
        frappe.log_error(f"Error in check_table_reservation: {str(e)}", "Reservation Error")
        return None


@frappe.whitelist()
def create_table_reservation(
    table,
    customer,
    reserved_at,
    customer_name=None,
    customer_phone=None,
    no_of_pax=1,
    notes=None,
    branch=None,
):
    """
    Creates a new table reservation with status 'Confirmed' after validating conflicts.
    """
    if isinstance(reserved_at, str) and "T" in reserved_at:
        reserved_at = reserved_at.replace("T", " ")

    if not branch:
        branch = frappe.db.get_value("URY Table", table, "branch")

    if not customer_name and customer:
        customer_name = frappe.db.get_value("Customer", customer, "customer_name") or customer

    if not customer_phone and customer:
        customer_phone = frappe.db.get_value("Customer", customer, "mobile_number") or ""

    doc = frappe.get_doc({
        "doctype": "URY Table Reservation",
        "branch": branch,
        "reserved_table": table,
        "customer": customer,
        "customer_name": customer_name,
        "customer_phone": customer_phone,
        "no_of_pax": cint(no_of_pax) or 1,
        "reserved_at": reserved_at,
        "comments": notes,
        "status": "Confirmed",
    })

    doc.insert(ignore_permissions=True, ignore_links=True)
    frappe.db.commit()
    return doc.name


@frappe.whitelist()
def update_table_reservation(
    reservation_name,
    table=None,
    customer=None,
    customer_name=None,
    customer_phone=None,
    no_of_pax=None,
    reserved_at=None,
    notes=None,
    branch=None,
):
    """
    Edits an existing reservation. If table or reserved_at changes, re-validates conflicts.
    """
    if not reservation_name:
        frappe.throw(_("Reservation ID is required."))

    doc = frappe.get_doc("URY Table Reservation", reservation_name)

    if doc.status not in ("Requested", "Confirmed", "Active"):
        frappe.throw(_("Cannot edit reservation in {0} status.").format(doc.status))

    if table:
        doc.reserved_table = table
        if not branch:
            doc.branch = frappe.db.get_value("URY Table", table, "branch")
    if branch:
        doc.branch = branch
    if customer:
        doc.customer = customer
    if customer_name:
        doc.customer_name = customer_name
    if customer_phone:
        doc.customer_phone = customer_phone
    if no_of_pax:
        doc.no_of_pax = cint(no_of_pax)
    if reserved_at:
        if isinstance(reserved_at, str) and "T" in reserved_at:
            reserved_at = reserved_at.replace("T", " ")
        doc.reserved_at = reserved_at
    if notes is not None:
        doc.comments = notes

    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return True


@frappe.whitelist()
def update_reservation_status(reservation_name, status, pos_invoice=None):
    """
    Updates the status of a reservation (Completed, Cancelled, No Show) and optionally links POS Invoice.
    """
    if not reservation_name:
        frappe.throw(_("Reservation ID is required."))

    doc = frappe.get_doc("URY Table Reservation", reservation_name)
    doc.status = status
    if pos_invoice:
        doc.pos_invoice = pos_invoice

    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return True


@frappe.whitelist()
def get_active_reservations(branch=None):
    """
    Returns all Confirmed reservations for a branch, enriched with lock window status.
    """
    try:
        filters = {"status": ["in", ["Confirmed", "Active"]]}
        if branch:
            filters["branch"] = branch

        reservations = frappe.db.get_all(
            "URY Table Reservation",
            filters=filters,
            fields=[
                "name",
                "branch",
                "reserved_table",
                "customer",
                "customer_name",
                "customer_phone",
                "no_of_pax",
                "reserved_at",
                "comments",
                "status",
            ],
            order_by="reserved_at asc",
        )

        now = now_datetime()
        branch_settings_cache = {}

        result = []
        for res in reservations:
            b = res.branch
            if b not in branch_settings_cache:
                branch_settings_cache[b] = get_branch_reservation_settings(b)

            b_settings = branch_settings_cache[b]
            buf = cint(b_settings.get("buffer_time", 30))
            grace = cint(b_settings.get("grace_period", 15))
            duration = cint(b_settings.get("calculated_duration", 90))

            res_time = get_datetime(res.reserved_at)
            lock_start = res_time - timedelta(minutes=buf)
            grace_end = res_time + timedelta(minutes=grace)

            res["is_lock_window_active"] = (lock_start <= now <= grace_end)
            res["buffer_minutes"] = buf
            res["grace_minutes"] = grace
            res["duration_minutes"] = duration
            res["lock_start_time"] = lock_start.strftime("%Y-%m-%d %H:%M:%S")

            result.append(res)

        return result
    except Exception as e:
        frappe.log_error(f"Error in get_active_reservations: {str(e)}", "Reservation Error")
        return []