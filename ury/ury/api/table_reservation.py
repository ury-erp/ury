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
from datetime import datetime, timedelta, time
from ury.ury.report.average_table_time.average_table_time import (
    get_branch_last_day_avg_time,
    get_branch_last_week_avg_time,
    get_branch_reservation_duration,
)


def parse_to_datetime(val, default_now=None):
    """
    Safely converts any datetime, date, time, timedelta, or string input into a valid datetime object.
    If input is a time or timedelta (seconds since midnight from MySQL Time field), combines it with default_now date.
    """
    if not default_now:
        default_now = now_datetime()

    if not val:
        return default_now

    if isinstance(val, datetime):
        return val

    if isinstance(val, timedelta):
        t_time = (datetime.min + val).time()
        return datetime.combine(default_now.date(), t_time)

    if isinstance(val, time):
        return datetime.combine(default_now.date(), val)

    if isinstance(val, str):
        val_str = val.replace("T", " ").strip()
        if " " in val_str:
            return get_datetime(val_str)
        else:
            t_obj = get_time(val_str)
            return datetime.combine(default_now.date(), t_obj)

    return get_datetime(val)


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
      - Protection window overlap
    """
    if not table or not reserved_at:
        return

    current_now = now_datetime()
    new_start = parse_to_datetime(reserved_at, current_now)

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
          AND status IN ('Confirmed', 'Active', 'Requested')
    """
    params = [table]

    if exclude_name:
        query += " AND name != %s"
        params.append(exclude_name)

    existing_reservations = frappe.db.sql(query, tuple(params), as_dict=True)

    for ex in existing_reservations:
        ex_start = parse_to_datetime(ex.reserved_at, current_now)
        ex_branch = ex.branch or branch
        ex_settings = get_branch_reservation_settings(ex_branch)
        ex_buffer = cint(ex_settings.get("buffer_time", 30))
        ex_duration = cint(ex_settings.get("calculated_duration", 90))

        ex_end = ex_start + timedelta(minutes=ex_duration)
        ex_protect_start = ex_start - timedelta(minutes=ex_buffer)

        # Conflict occurs if the active dining window of one overlaps with the protection window of the other
        if (ex_end > new_protect_start and ex_start < new_end) or (new_end > ex_protect_start and new_start < ex_end):
            frappe.throw(
                _("Table {0} already has a reservation during the selected time. Please select a different reservation time.").format(table)
            )


def validate_reservation_rules(table, branch, reserved_at, no_of_pax=1, exclude_name=None):
    """
    Comprehensive validation order:
    1. Mandatory table check
    2. Capacity check (no_of_pax <= table.no_of_seats)
    3. Past datetime check (reserved_at >= now_datetime())
    4. Occupancy check & expected release calculation
    5. Overlapping reservation window conflicts check
    """
    if not table:
        frappe.throw(_("Please select a table."))

    table_data = frappe.db.get_value(
        "URY Table",
        table,
        ["name", "no_of_seats", "occupied", "latest_invoice_time", "branch", "restaurant_room"],
        as_dict=True,
    )
    if not table_data:
        frappe.throw(_("Table {0} does not exist.").format(table))

    if not branch:
        branch = table_data.branch
        if not branch and table_data.restaurant_room:
            branch = frappe.db.get_value("URY Room", table_data.restaurant_room, "branch")

    # 1. Capacity Validation
    table_seats = cint(table_data.get("no_of_seats") or 0)
    pax = cint(no_of_pax or 1)
    if table_seats > 0 and pax > table_seats:
        frappe.throw(_("Number of persons cannot exceed the table capacity of {0}.").format(table_seats))

    # 2. Past Datetime Validation
    if not reserved_at:
        frappe.throw(_("Please select a reservation time."))

    current_now = now_datetime()
    res_start = parse_to_datetime(reserved_at, current_now)

    # Allow 1-minute grace margin for frontend-backend network latency
    if res_start < (current_now - timedelta(minutes=1)):
        frappe.throw(_("Reservation date and time cannot be in the past."))

    # 3. Buffer-Time & Table Occupancy Validation
    # Case A: Table is free (occupied == 0) -> proceed
    # Case B: Table is occupied (occupied == 1) -> check expected finish time
    if cint(table_data.get("occupied") or 0) == 1:
        active_inv_creation = frappe.db.get_value(
            "POS Invoice",
            {"restaurant_table": table, "docstatus": 0},
            "creation",
        )
        occupied_start_raw = active_inv_creation or table_data.get("latest_invoice_time") or current_now
        occupied_start_dt = parse_to_datetime(occupied_start_raw, current_now)

        expected_duration = get_branch_reservation_duration(branch)
        expected_finish = occupied_start_dt + timedelta(minutes=expected_duration)

        if expected_finish > res_start:
            formatted_time = expected_finish.strftime("%I:%M %p").lstrip("0")
            frappe.throw(
                _("Table {0} is currently occupied and is expected to be available after {1}. Please select a later reservation time.").format(
                    table, formatted_time
                )
            )

    # 4. Reservation Window Conflict Validation
    validate_reservation_conflicts(
        table=table,
        branch=branch,
        reserved_at=res_start,
        exclude_name=exclude_name,
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


def get_current_pos_opening_entry(branch):
    """
    Returns the active POS Opening Entry document for a branch if currently open.
    """
    if not branch:
        return None
    openings = frappe.db.get_all(
        "POS Opening Entry",
        filters={
            "branch": branch,
            "status": "Open",
            "docstatus": 1,
        },
        fields=["name", "period_start_date", "creation"],
        order_by="creation desc",
        limit=1,
    )
    if openings:
        return openings[0]
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
    Associates the reservation with the active POS session if one exists.
    """
    if isinstance(reserved_at, str) and "T" in reserved_at:
        reserved_at = reserved_at.replace("T", " ")

    if not branch:
        branch = frappe.db.get_value("URY Table", table, "branch")

    if not customer_name and customer:
        customer_name = frappe.db.get_value("Customer", customer, "customer_name") or customer

    if not customer_phone and customer:
        customer_phone = frappe.db.get_value("Customer", customer, "mobile_number") or ""

    active_opening = get_current_pos_opening_entry(branch)

    doc_dict = {
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
    }
    if active_opening:
        doc_dict["pos_opening_entry"] = active_opening.name

    doc = frappe.get_doc(doc_dict)
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
    Updates the status of a reservation (Completed, Cancelled, No Show) with validation.
    """
    if not reservation_name:
        frappe.throw(_("Reservation ID is required."))

    doc = frappe.get_doc("URY Table Reservation", reservation_name)

    # Validate status transitions
    if status == "Completed":
        if doc.status in ("Cancelled", "No Show"):
            frappe.throw(_("Cannot mark a {0} reservation as Completed.").format(doc.status))

    if status == "Cancelled":
        if doc.status == "Completed":
            frappe.throw(_("Cannot cancel a reservation that is already Completed."))

    doc.status = status
    if pos_invoice:
        doc.pos_invoice = pos_invoice

    if status == "Completed" and doc.reserved_table:
        frappe.db.set_value(
            "URY Table",
            doc.reserved_table,
            {
                "occupied": 1,
                "latest_invoice_time": now_datetime(),
            },
        )

    doc.save(ignore_permissions=True)
    frappe.db.commit()
    return True


@frappe.whitelist()
def get_active_reservations(branch=None):
    """
    Returns reservations for the current active POS session for a branch.
    Auto-processes past-due Confirmed reservations to 'No Show' server-side.
    """
    try:
        from ury.ury.api.reservation_scheduler import process_reservation_no_shows
        process_reservation_no_shows()

        if not branch:
            return []

        active_opening = get_current_pos_opening_entry(branch)
        session_clause = ""
        params = [branch]

        if active_opening:
            session_name = active_opening.name
            session_start = parse_to_datetime(
                active_opening.get("period_start_date") or active_opening.get("creation"),
                now_datetime()
            )
            session_clause = """
                AND (
                    pos_opening_entry = %s
                    OR (
                        (pos_opening_entry IS NULL OR pos_opening_entry = '')
                        AND reserved_at >= %s
                    )
                )
            """
            params.extend([session_name, session_start])

        query = f"""
            SELECT
                name, branch, reserved_table, customer, customer_name,
                customer_phone, no_of_pax, reserved_at, comments, status, pos_opening_entry
            FROM `tabURY Table Reservation`
            WHERE branch = %s
              {session_clause}
            ORDER BY reserved_at ASC
        """

        reservations = frappe.db.sql(query, tuple(params), as_dict=True)

        now = now_datetime()
        branch_settings_cache = {}

        result = []
        for res in reservations:
            b = res.branch or branch
            if b not in branch_settings_cache:
                branch_settings_cache[b] = get_branch_reservation_settings(b)

            b_settings = branch_settings_cache[b]
            buf = cint(b_settings.get("buffer_time", 30))
            grace = cint(b_settings.get("grace_period", 15))
            duration = cint(b_settings.get("calculated_duration", 90))

            res_time = get_datetime(res.reserved_at)
            lock_start = res_time - timedelta(minutes=buf)
            grace_end = res_time + timedelta(minutes=grace)

            is_active_status = res.get("status") in ("Confirmed", "Active")
            res["is_lock_window_active"] = is_active_status and (lock_start <= now <= grace_end)
            res["buffer_minutes"] = buf
            res["grace_minutes"] = grace
            res["duration_minutes"] = duration
            res["lock_start_time"] = lock_start.strftime("%Y-%m-%d %H:%M:%S")

            result.append(res)

        return result
    except Exception as e:
        frappe.log_error(f"Error in get_active_reservations: {str(e)}", "Reservation Error")
        return []