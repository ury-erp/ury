# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt
#
# Staff-facing side of "URY Service Request".
#
# The customer-facing half lives in ury/ury/api/self_ordering.py: when a
# diner taps "Request Bill" on the self-ordering page a URY Service Request
# row is created. Until now nothing carried that row to the cashier — it sat
# in the database and the customer kept waiting. This module is the other
# half: it broadcasts each request on a per-branch realtime channel that the
# POS terminal listens on, lists the still-open requests (so a terminal that
# was closed, reloaded or opened late is not blind to them), and lets the
# cashier acknowledge/resolve one.
#
# Branch is always resolved from the logged-in user's session via getBranch()
# and never accepted as a parameter, matching get_kot_errors().

import json

import frappe
from frappe import _
from frappe.utils import now_datetime

from ury.ury_pos.api import getBranch

# Channel is per-branch so a terminal only ever hears about its own tables.
SERVICE_REQUEST_CHANNEL_PREFIX = "ury_service_request"


def service_request_channel(branch):
    return "{}_{}".format(SERVICE_REQUEST_CHANNEL_PREFIX, branch)


def _request_payload(doc, branch, repeat=False):
    return {
        "name": doc.name,
        "request_type": doc.request_type,
        "table": doc.table,
        "invoice": doc.invoice,
        "session": doc.session,
        "status": doc.status,
        "branch": branch,
        "requested_at": str(doc.requested_at or ""),
        "repeat": bool(repeat),
    }


def notify_service_request(request, repeat=False):
    """Broadcast a service request to the POS terminals of its branch.

    `request` may be a name or a document. Never let a broken socket/realtime
    layer fail the customer's request: the row is already committed and the
    POS also polls open requests, so a failed publish degrades to a delayed
    alert rather than a customer-visible error.
    """
    try:
        doc = request if hasattr(request, "doctype") else frappe.get_doc("URY Service Request", request)
        branch = frappe.db.get_value("URY Table", doc.table, "branch")
        if not branch:
            return
        frappe.publish_realtime(
            service_request_channel(branch),
            _request_payload(doc, branch, repeat=repeat),
        )
    except Exception:
        try:
            frappe.log_error(frappe.get_traceback(), "Service request notification failed")
        except Exception:
            # No site/db context (unit tests, background edge cases): losing
            # the log entry must still not fail the customer's request.
            pass


def resolve_requests_for_invoice(invoice):
    """Close any open request tied to an invoice that has just been settled.

    Without this the bell keeps a table lit after the very thing the customer
    asked for has happened, and the cashier learns to ignore it. Failures are
    swallowed for the same reason as in notify_service_request(): this runs
    inside the submit path of a real payment.
    """
    try:
        names = frappe.get_all(
            "URY Service Request",
            filters={"invoice": invoice, "status": ["!=", "Resolved"]},
            pluck="name",
        )
        if not names:
            return

        for name in names:
            doc = frappe.get_doc("URY Service Request", name)
            doc.status = "Resolved"
            doc.resolved_at = now_datetime()
            doc.resolved_by = frappe.session.user
            doc.save(ignore_permissions=True)

            branch = frappe.db.get_value("URY Table", doc.table, "branch")
            if branch:
                frappe.publish_realtime(service_request_channel(branch), _request_payload(doc, branch))
    except Exception:
        try:
            frappe.log_error(frappe.get_traceback(), "Service request auto-resolve failed")
        except Exception:
            pass


@frappe.whitelist()
def get_open_service_requests():
    """Every unresolved service request for the current user's branch.

    The POS calls this on mount and after a reconnect: realtime only delivers
    what happened while the terminal was listening, and a request the cashier
    never saw is the exact failure this feature exists to prevent.
    """
    branch = getBranch()

    tables = frappe.get_all("URY Table", filters={"branch": branch}, pluck="name")
    if not tables:
        return []

    requests = frappe.get_all(
        "URY Service Request",
        filters={"table": ["in", tables], "status": ["!=", "Resolved"]},
        fields=["name", "request_type", "table", "invoice", "session", "status", "requested_at"],
        order_by="requested_at asc",
    )

    for row in requests:
        row["branch"] = branch
        row["requested_at"] = str(row["requested_at"] or "")

    return requests


@frappe.whitelist()
def acknowledge_service_requests(names):
    """Mark requests as seen when the cashier actually opens the alert list.

    Reading the alert is the moment the customer can be told "your bill is
    on its way" — so it is a real state change, not just a UI detail. Sent
    as one call rather than one per row so opening a busy list is a single
    round trip.
    """
    if isinstance(names, str):
        names = json.loads(names)

    acknowledged = []
    for name in names or []:
        try:
            # Only a genuinely new request changes state. Without this, every
            # reopening of the panel would re-save and re-broadcast rows that
            # were already seen.
            if frappe.db.get_value("URY Service Request", name, "status") != "Open":
                continue
            acknowledged.append(resolve_service_request(name, "Acknowledged"))
        except frappe.PermissionError:
            # A row from another branch: skip it rather than failing the
            # whole list the cashier just opened.
            continue

    return acknowledged


@frappe.whitelist()
def resolve_service_request(name, status="Resolved"):
    """Acknowledge or close a service request from the POS.

    Only the two staff-side transitions are accepted; "Open" is the
    customer's to set, not the cashier's.
    """
    if status not in ("Acknowledged", "Resolved"):
        frappe.throw(_("Invalid service request status {0}").format(status), frappe.ValidationError)

    doc = frappe.get_doc("URY Service Request", name)

    branch = frappe.db.get_value("URY Table", doc.table, "branch")
    if branch != getBranch():
        frappe.throw(
            _("You do not have permission to update service requests for table {0}.").format(doc.table),
            frappe.PermissionError,
        )

    doc.status = status
    if status == "Resolved":
        doc.resolved_at = now_datetime()
        doc.resolved_by = frappe.session.user
    doc.save()

    # Tell every other terminal on the branch, so the same request does not
    # keep blinking on the screen next to the one that just handled it.
    frappe.publish_realtime(service_request_channel(branch), _request_payload(doc, branch))

    return {"name": doc.name, "status": doc.status}
