# Copyright (c) 2026, Tridz Technologies Pvt. Ltd and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import now_datetime, get_datetime, cint
from datetime import timedelta
from ury.ury.api.table_reservation import get_branch_reservation_settings


def process_reservation_no_shows():
    """
    Scheduled background task that automatically marks Confirmed reservations as 'No Show'
    when current time exceeds reservation_time + grace_period.
    """
    now = now_datetime()

    # Get all Confirmed reservations
    confirmed_reservations = frappe.db.get_all(
        "URY Table Reservation",
        filters={"status": "Confirmed"},
        fields=["name", "branch", "reserved_at", "reserved_table"],
    )

    if not confirmed_reservations:
        return

    branch_settings_cache = {}
    updated_count = 0

    for res in confirmed_reservations:
        b = res.branch
        if b not in branch_settings_cache:
            branch_settings_cache[b] = get_branch_reservation_settings(b)

        grace_mins = cint(branch_settings_cache[b].get("grace_period", 15))
        res_time = get_datetime(res.reserved_at)
        no_show_threshold = res_time + timedelta(minutes=grace_mins)

        if now > no_show_threshold:
            try:
                doc = frappe.get_doc("URY Table Reservation", res.name)
                # Double check status hasn't changed concurrently
                if doc.status == "Confirmed":
                    doc.status = "No Show"
                    doc.save(ignore_permissions=True)
                    updated_count += 1
            except Exception as e:
                frappe.log_error(f"Failed to mark reservation {res.name} as No Show: {str(e)}", "Reservation No-Show Error")

    if updated_count > 0:
        frappe.db.commit()
