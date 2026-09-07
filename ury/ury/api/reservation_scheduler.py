# Copyright (c) 2026, Tridz Technologies Pvt. Ltd and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import (
    now_datetime,
    get_datetime,
    cint,
    get_system_timezone,
    convert_utc_to_timezone,
)
from datetime import datetime, timedelta
import pytz
from ury.ury.api.table_reservation import get_branch_reservation_settings


def process_reservation_no_shows():
    """
    Scheduled background task and inline API processor that automatically marks
    Confirmed reservations as 'No Show' when current time exceeds reservation_time + grace_period.
    Supports branch-specific custom_grace_period, exact expiration time (>=), and
    handles timezone discrepancies between client/browser local input and system timezone.
    """
    now = now_datetime()
    sys_tz = get_system_timezone()
    utc_now = datetime.now(pytz.UTC)
    sys_dt = convert_utc_to_timezone(utc_now, sys_tz).replace(tzinfo=None) if sys_tz else now

    # Get all Confirmed reservations
    confirmed_reservations = frappe.db.get_all(
        "URY Table Reservation",
        filters={"status": "Confirmed"},
        fields=["name", "branch", "reserved_at", "reserved_table", "creation"],
    )

    if not confirmed_reservations:
        return

    branch_settings_cache = {}
    updated_count = 0

    for res in confirmed_reservations:
        b = res.branch
        if not b and res.reserved_table:
            b = frappe.db.get_value("URY Table", res.reserved_table, "branch")

        if b not in branch_settings_cache:
            branch_settings_cache[b] = get_branch_reservation_settings(b)

        grace_mins = cint(branch_settings_cache[b].get("grace_period", 0))
        res_time = get_datetime(res.reserved_at)
        no_show_threshold = res_time + timedelta(minutes=grace_mins)

        is_overdue = False
        # 1. Standard check in system timezone (exact expiration time handled by >=)
        if now >= no_show_threshold:
            is_overdue = True
        elif sys_tz:
            # 2. Timezone-aware check for client/browser local input (e.g. Asia/Kolkata vs Asia/Dubai)
            client_tzs = ["Asia/Kolkata"]
            user_tz = frappe.db.get_value("User", frappe.session.user, "time_zone") if (frappe.session and frappe.session.user) else None
            if user_tz and user_tz not in client_tzs:
                client_tzs.append(user_tz)

            for alt_tz in client_tzs:
                if alt_tz == sys_tz:
                    continue
                try:
                    alt_dt = convert_utc_to_timezone(utc_now, alt_tz).replace(tzinfo=None)
                    tz_offset = alt_dt - sys_dt
                    if (now + tz_offset) >= no_show_threshold:
                        if res.get("creation"):
                            creation_sys = get_datetime(res.creation)
                            creation_client = creation_sys + tz_offset
                            scheduled_delay = (res_time - creation_client).total_seconds()
                            deadline_seconds = max(0, scheduled_delay) + (grace_mins * 60)
                            elapsed_seconds = (now - creation_sys).total_seconds()
                            if elapsed_seconds >= deadline_seconds:
                                is_overdue = True
                                break
                        else:
                            is_overdue = True
                            break
                except Exception:
                    pass

        if is_overdue:
            try:
                doc = frappe.get_doc("URY Table Reservation", res.name)
                # Double check status hasn't changed concurrently
                if doc.status == "Confirmed":
                    doc.status = "No Show"
                    try:
                        doc.save(ignore_permissions=True)
                    except Exception:
                        doc.db_set("status", "No Show")
                    updated_count += 1
            except Exception as e:
                frappe.log_error(
                    f"Failed to mark reservation {res.name} as No Show: {str(e)}",
                    "Reservation No-Show Error"
                )

    if updated_count > 0:
        frappe.db.commit()
