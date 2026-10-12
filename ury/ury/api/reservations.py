# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt
#
# Table reservations.
#
# The list of bookings is the easy half. The half that decides whether a
# restaurant actually uses this is `get_table_reservation_status`: a cashier
# about to seat a walk-in needs to know that table 7 is booked in twenty
# minutes, on the table map, without going to look for it. A booking system
# nobody sees at the moment of seating is a notepad with extra steps.

import frappe
from frappe import _
from frappe.utils import add_to_date, get_datetime, now_datetime

from ury.ury_pos.api import getBranch
from ury.ury.doctype.ury_table_reservation.ury_table_reservation import BLOCKING_STATUSES

# How far ahead a booking starts mattering to someone seating a guest now.
#
# Long enough that a walk-in cannot be sat down and served, short enough that
# the map is not permanently orange. A sitting is roughly 90 minutes; 45 is
# the point where seating someone new means the booked guest waits.
UPCOMING_WINDOW_MINUTES = 45


def _resolve_branch(branch=None):
    """Branch from the session, never from the caller.

    A reservation carries a guest's name and phone number. Letting one
    branch read another's bookings turns a seating tool into a contact list.
    """
    if frappe.session.user == "Administrator" and branch:
        return branch
    return getBranch()


@frappe.whitelist()
def get_reservations(from_date=None, to_date=None, status=None, branch=None):
    """Bookings for a branch, oldest first within the window."""
    filters = {"branch": _resolve_branch(branch)}

    if status:
        filters["status"] = status
    if from_date and to_date:
        filters["reserved_from"] = ["between", [from_date, to_date]]
    elif from_date:
        filters["reserved_from"] = [">=", from_date]
    elif to_date:
        filters["reserved_from"] = ["<=", to_date]

    return frappe.get_all(
        "URY Table Reservation",
        filters=filters,
        fields=[
            "name", "guest_name", "mobile_number", "customer", "branch",
            "restaurant_room", "table", "no_of_pax", "reserved_from",
            "reserved_to", "status", "seated_invoice", "notes",
        ],
        order_by="reserved_from asc",
        limit_page_length=0,
    )


@frappe.whitelist()
def get_table_reservation_status(branch=None):
    """Which tables are spoken for right now or shortly.

    Keyed by table so the POS table map can colour a card without a lookup
    per table. Only tables with a booking appear — the map treats a missing
    key as free, which is the common case and should cost nothing.
    """
    branch = _resolve_branch(branch)
    now = now_datetime()
    horizon = add_to_date(now, minutes=UPCOMING_WINDOW_MINUTES)

    rows = frappe.get_all(
        "URY Table Reservation",
        filters={
            "branch": branch,
            "status": ["in", BLOCKING_STATUSES],
            "table": ["is", "set"],
            "reserved_to": [">", now],
            "reserved_from": ["<", horizon],
        },
        fields=["name", "table", "guest_name", "no_of_pax", "reserved_from", "status"],
        order_by="reserved_from asc",
    )

    by_table = {}
    for row in rows:
        # First booking wins: it is the one arriving soonest, and the one a
        # cashier deciding right now needs to know about.
        if row.table in by_table:
            continue
        by_table[row.table] = {
            "reservation": row.name,
            "guest_name": row.guest_name,
            "no_of_pax": row.no_of_pax,
            "reserved_from": str(row.reserved_from),
            "status": row.status,
            "in_progress": get_datetime(row.reserved_from) <= now,
        }

    return by_table


@frappe.whitelist()
def create_reservation(
    guest_name,
    reserved_from,
    no_of_pax,
    mobile_number=None,
    table=None,
    restaurant_room=None,
    reserved_to=None,
    notes=None,
    customer=None,
    branch=None,
):
    """Take a booking. Clash detection lives in the doctype's validate."""
    doc = frappe.get_doc({
        "doctype": "URY Table Reservation",
        "guest_name": guest_name,
        "mobile_number": mobile_number,
        "customer": customer,
        "branch": _resolve_branch(branch),
        "restaurant_room": restaurant_room,
        "table": table,
        "no_of_pax": frappe.utils.cint(no_of_pax),
        "reserved_from": reserved_from,
        "reserved_to": reserved_to,
        "notes": notes,
        "status": "Confirmed",
    })
    doc.insert()
    return doc.as_dict()


@frappe.whitelist()
def set_reservation_status(reservation, status, table=None, invoice=None):
    """Move a booking along: seated, completed, a no-show, cancelled.

    Assigning the table here rather than at booking time is the normal path
    for a restaurant that takes "a table for four at eight" and decides which
    one on the night.
    """
    allowed = {"Requested", "Confirmed", "Seated", "Completed", "No Show", "Cancelled"}
    if status not in allowed:
        frappe.throw(_("Invalid reservation status {0}").format(status), frappe.ValidationError)

    doc = frappe.get_doc("URY Table Reservation", reservation)

    if doc.branch != _resolve_branch():
        frappe.throw(
            _("This reservation belongs to another branch."), frappe.PermissionError
        )

    if table:
        doc.table = table
    if invoice:
        doc.seated_invoice = invoice

    doc.status = status
    doc.save()

    return {"name": doc.name, "status": doc.status, "table": doc.table}


@frappe.whitelist()
def get_available_tables(reserved_from, reserved_to=None, no_of_pax=None, branch=None):
    """Tables free for a proposed window.

    Answers the question a host is actually asking — "what can I give them at
    eight" — instead of making them try tables one at a time until the clash
    check stops complaining.
    """
    branch = _resolve_branch(branch)
    reserved_to = reserved_to or add_to_date(get_datetime(reserved_from), minutes=90)

    filters = {"branch": branch, "is_take_away": 0}
    tables = frappe.get_all(
        "URY Table", filters=filters, fields=["name", "no_of_seats", "restaurant_room"],
        order_by="no_of_seats asc, name asc",
    )

    taken = {
        row.table
        for row in frappe.get_all(
            "URY Table Reservation",
            filters={
                "branch": branch,
                "status": ["in", BLOCKING_STATUSES],
                "table": ["is", "set"],
            },
            or_filters=[],
            fields=["table", "reserved_from", "reserved_to"],
        )
        if get_datetime(reserved_from) < get_datetime(row.reserved_to)
        and get_datetime(reserved_to) > get_datetime(row.reserved_from)
    }

    pax = frappe.utils.cint(no_of_pax)
    return [
        {**table, "fits": not pax or (table.no_of_seats or 0) >= pax}
        for table in tables
        if table.name not in taken
    ]
