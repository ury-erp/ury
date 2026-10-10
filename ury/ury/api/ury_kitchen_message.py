# Copyright (c) 2026, Smart Choice and contributors
# For license information, please see license.txt

"""
Real-time messages from the floor to the kitchen display.

Two kinds, and the difference is deliberate:

* **Informational** — appears in the message rail on the display, stays until
  it expires or someone dismisses it. The kitchen keeps working.
* **Requires acknowledgement** — takes over the display until a cook confirms
  they have read it. Used for things the line cannot miss: an allergy, a recall
  on an item, a VIP table. Who acknowledged it and when is recorded, so a
  manager can prove the message landed.

Everything is pushed over `frappe.publish_realtime` on a per-branch channel and
filtered by station on arrival.
"""

import frappe
from frappe.utils import add_to_date, now_datetime


CHANNEL = "ury_kitchen_message_{branch}"


def _live_filter(branch, production=None):
    filters = {"branch": branch, "status": "Active"}
    if production:
        # A message with no production is addressed to the whole branch, so a
        # station must see both those and the ones aimed at it specifically.
        filters["production"] = ["in", [production, "", None]]
    return filters


@frappe.whitelist()
def send_message(
    message,
    branch,
    production=None,
    requires_acknowledgement=0,
    priority="Normal",
    expires_in_minutes=None,
):
    """Create and broadcast a message. Returns the display payload."""
    message = (message or "").strip()
    if not message:
        frappe.throw(frappe._("Message cannot be empty"))

    if not frappe.db.exists("Branch", branch):
        frappe.throw(frappe._("Unknown branch {0}").format(branch))

    doc = frappe.new_doc("URY Kitchen Message")
    doc.update({
        "message": message,
        "branch": branch,
        "production": production or None,
        "requires_acknowledgement": int(requires_acknowledgement or 0),
        "priority": priority or "Normal",
    })

    if expires_in_minutes:
        doc.expires_at = add_to_date(now_datetime(), minutes=int(expires_in_minutes))

    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return doc.as_display_dict()


@frappe.whitelist()
def get_active_messages(branch, production=None):
    """
    Messages a freshly-loaded display should show.

    Expired ones are retired here rather than by a scheduled job: the display
    polls this on connect and reconnect, which is exactly when the list needs
    to be correct, and it avoids a background job for something this cheap.
    """
    names = frappe.get_all(
        "URY Kitchen Message",
        filters=_live_filter(branch, production),
        pluck="name",
        order_by="creation desc",
        limit=50,
    )

    live = []
    for name in names:
        doc = frappe.get_doc("URY Kitchen Message", name)
        if doc.expires_at and now_datetime() > doc.expires_at:
            doc.db_set("status", "Expired", update_modified=False)
            continue
        live.append(doc.as_display_dict())

    return live


@frappe.whitelist()
def acknowledge(name, station=None):
    """
    Record that this station has read a mandatory message.

    Idempotent per user: a second tap from the same screen does not add a
    duplicate row, so the audit trail stays honest if a cook double-taps.
    """
    doc = frappe.get_doc("URY Kitchen Message", name)
    user = frappe.session.user

    already = any(row.user == user for row in (doc.acknowledgements or []))
    if not already:
        doc.append("acknowledgements", {
            "user": user,
            "user_name": frappe.db.get_value("User", user, "full_name"),
            "station": station or doc.production,
            "acknowledged_at": now_datetime(),
        })

    # One acknowledgement clears it: the kitchen is one team, and requiring
    # every station to confirm would leave the board blocked whenever a
    # station is closed for the shift.
    doc.status = "Acknowledged"
    doc.save(ignore_permissions=True)
    frappe.db.commit()

    doc.broadcast(event="acknowledged")
    return doc.as_display_dict()


@frappe.whitelist()
def dismiss(name):
    """Clear an informational message from the displays."""
    doc = frappe.get_doc("URY Kitchen Message", name)
    if doc.requires_acknowledgement:
        frappe.throw(frappe._("This message must be acknowledged, not dismissed."))

    doc.db_set("status", "Cancelled", update_modified=False)
    frappe.db.commit()
    doc.broadcast(event="dismissed")
    return {"name": doc.name, "status": doc.status}


@frappe.whitelist()
def get_stations(branch):
    """Production units a message can be addressed to, for the sender's UI."""
    return frappe.get_all(
        "URY Production Unit",
        filters={"branch": branch, "disable": 0},
        fields=["name", "name as label"],
        order_by="name",
    )
