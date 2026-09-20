# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt
#
# Reading the audit trail.
#
# Writing is in ury/ury/doctype/ury_audit_log/ury_audit_log.py and happens
# only inside the server. This module is the other half: what a manager is
# allowed to see, scoped to their own branch.

import frappe
from frappe import _

from ury.ury_pos.api import getBranch

SUPERVISOR_ROLES = {"URY Manager", "System Manager", "URY Admin"}

MAX_PAGE_LENGTH = 200


def _is_supervisor():
    user = frappe.session.user
    return user == "Administrator" or bool(set(frappe.get_roles(user)) & SUPERVISOR_ROLES)


@frappe.whitelist()
def get_audit_log(event=None, from_date=None, to_date=None, limit=50, start=0):
    """Audit entries for the caller's branch.

    Branch comes from the session, never from a parameter. An audit trail
    that lets one branch's manager read another's is a new leak, not a
    control — and the people most interested in reading it are exactly the
    people it exists to watch.
    """
    if not _is_supervisor():
        frappe.throw(_("Not permitted to view the audit log"), frappe.PermissionError)

    filters = {}

    if frappe.session.user != "Administrator":
        # A supervisor with no branch mapping sees nothing rather than
        # everything: failing open here would defeat the whole doctype.
        filters["branch"] = getBranch()

    if event:
        filters["event"] = event
    if from_date and to_date:
        filters["occurred_at"] = ["between", [from_date, to_date]]
    elif from_date:
        filters["occurred_at"] = [">=", from_date]
    elif to_date:
        filters["occurred_at"] = ["<=", to_date]

    limit = min(frappe.utils.cint(limit) or 50, MAX_PAGE_LENGTH)

    return frappe.get_all(
        "URY Audit Log",
        filters=filters,
        fields=[
            "name", "event", "reference_doctype", "reference_name", "branch",
            "pos_profile", "amount", "performed_by", "occurred_at",
            "old_value", "new_value", "reason", "details",
        ],
        order_by="occurred_at desc",
        limit_page_length=limit,
        limit_start=frappe.utils.cint(start),
    )


@frappe.whitelist()
def get_audit_summary(from_date=None, to_date=None):
    """Counts and totals per event, for the top of the screen.

    A manager opens this asking "how much did we give away today", which is a
    number, not a list of rows to add up by eye.
    """
    if not _is_supervisor():
        frappe.throw(_("Not permitted to view the audit log"), frappe.PermissionError)

    conditions = []
    values = {}

    if frappe.session.user != "Administrator":
        conditions.append("branch = %(branch)s")
        values["branch"] = getBranch()
    if from_date:
        conditions.append("occurred_at >= %(from_date)s")
        values["from_date"] = from_date
    if to_date:
        conditions.append("occurred_at <= %(to_date)s")
        values["to_date"] = to_date

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    return frappe.db.sql(
        f"""
        SELECT event, COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total
        FROM `tabURY Audit Log`
        {where}
        GROUP BY event
        ORDER BY total DESC
        """,
        values,
        as_dict=True,
    )
