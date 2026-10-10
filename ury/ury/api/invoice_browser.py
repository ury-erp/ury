"""The dashboard's bills: a filterable list and a full view of one bill.

The home page used to show the last ten invoices with no way to look further
back, narrow the list, or open one. These endpoints back a paged, filtered
list and an invoice page with its lines, payments, kitchen tickets, activity
and a reprint for the bill someone forgot to print.
"""

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate

from ury.ury.api.invoice_activity import log_activity

PAGE_SIZES = (20, 50, 100)

# Filter value -> (docstatus, status) conditions. "Open" is a draft order still
# on a table; the rest are ERPNext's own POS Invoice statuses.
STATUS_FILTERS = {
    "Draft": {"docstatus": 0},
    "Paid": {"docstatus": 1, "status": "Paid"},
    "Consolidated": {"docstatus": 1, "status": "Consolidated"},
    "Unpaid": {"docstatus": 1, "status": ["in", ["Unpaid", "Partly Paid", "Overdue"]]},
    "Return": {"docstatus": 1, "status": ["in", ["Return", "Credit Note Issued"]]},
    "Cancelled": {"docstatus": 2},
}

LIST_FIELDS = [
    "name", "customer", "customer_name", "posting_date", "posting_time", "grand_total",
    "rounded_total", "status", "docstatus", "order_type", "restaurant_table", "branch",
    "invoice_printed", "owner", "custom_ury_order_number",
]


@frappe.whitelist()
def get_transactions(branch=None, from_date=None, to_date=None, status=None, order_type=None,
                     search=None, page=1, page_size=20):
    frappe.has_permission("POS Invoice", "read", throw=True)

    page = max(cint(page), 1)
    page_size = cint(page_size) if cint(page_size) in PAGE_SIZES else PAGE_SIZES[0]

    filters = [["POS Invoice", "docstatus", "in", [0, 1, 2]]]
    if branch and branch != "all":
        filters.append(["POS Invoice", "branch", "=", branch])
    if from_date:
        filters.append(["POS Invoice", "posting_date", ">=", getdate(from_date)])
    if to_date:
        filters.append(["POS Invoice", "posting_date", "<=", getdate(to_date)])
    if status and status in STATUS_FILTERS:
        for field, value in STATUS_FILTERS[status].items():
            op, val = (value[0], value[1]) if isinstance(value, list) else ("=", value)
            filters.append(["POS Invoice", field, op, val])
    elif not status:
        # Cancelled bills are noise in the everyday list; they have a filter.
        filters.append(["POS Invoice", "docstatus", "!=", 2])
    if order_type:
        filters.append(["POS Invoice", "order_type", "=", order_type])

    or_filters = None
    term = (search or "").strip()
    if term:
        like = f"%{term}%"
        or_filters = [
            ["POS Invoice", "name", "like", like],
            ["POS Invoice", "customer_name", "like", like],
            ["POS Invoice", "restaurant_table", "like", like],
            ["POS Invoice", "custom_ury_order_number", "like", like],
        ]

    totals = frappe.get_list(
        "POS Invoice",
        filters=filters,
        or_filters=or_filters,
        fields=["count(name) as count", "sum(grand_total) as amount"],
    )[0]
    rows = frappe.get_list(
        "POS Invoice",
        filters=filters,
        or_filters=or_filters,
        fields=LIST_FIELDS,
        order_by="posting_date desc, posting_time desc, creation desc",
        start=(page - 1) * page_size,
        page_length=page_size,
    )
    for row in rows:
        if row.docstatus == 2:
            row.status = "Cancelled"
        elif row.docstatus == 0:
            row.status = "Draft"

    return {
        "rows": rows,
        "total": cint(totals.count),
        "amount": flt(totals.amount),
        "page": page,
        "page_size": page_size,
    }


@frappe.whitelist()
def get_invoice_detail(invoice):
    doc = frappe.get_doc("POS Invoice", invoice)
    doc.check_permission("read")

    status = "Cancelled" if doc.docstatus == 2 else "Draft" if doc.docstatus == 0 else doc.status
    profile = frappe.db.get_value(
        "POS Profile", doc.pos_profile, ["print_format", "qz_print"], as_dict=True
    ) or frappe._dict()

    return {
        "name": doc.name,
        "status": status,
        "docstatus": doc.docstatus,
        "order_number": doc.get("custom_ury_order_number"),
        "order_type": doc.get("order_type"),
        "restaurant_table": doc.get("restaurant_table"),
        "merged_tables": doc.get("custom_merged_tables"),
        "branch": doc.get("branch"),
        "pos_profile": doc.pos_profile,
        "customer": doc.customer,
        "customer_name": doc.customer_name,
        "mobile_number": doc.get("mobile_number"),
        "no_of_pax": doc.get("no_of_pax"),
        "waiter": _user_name(doc.get("waiter")),
        "cashier": _user_name(doc.get("cashier")),
        "created_by": _user_name(doc.owner),
        "posting_date": doc.posting_date,
        "posting_time": doc.posting_time,
        "creation": doc.creation,
        "comments": doc.get("custom_comments"),
        "cancel_reason": doc.get("cancel_reason"),
        "currency": doc.currency,
        "invoice_printed": cint(doc.get("invoice_printed")),
        "items": [
            {
                "item_code": row.item_code,
                "item_name": row.item_name,
                "qty": row.qty,
                "rate": row.rate,
                "amount": row.amount,
                "discount_amount": row.get("discount_amount"),
                "comment": row.get("comment") or row.get("custom_comments"),
            }
            for row in doc.items
        ],
        "taxes": [
            {"description": row.description, "rate": row.rate, "amount": row.tax_amount}
            for row in doc.taxes
            if flt(row.tax_amount)
        ],
        "payments": [
            {"mode_of_payment": row.mode_of_payment, "amount": row.amount}
            for row in doc.payments
            if flt(row.amount)
        ],
        "totals": {
            "net_total": doc.net_total,
            "total": doc.total,
            "discount_amount": doc.discount_amount,
            "additional_discount_percentage": doc.additional_discount_percentage,
            "total_taxes": doc.total_taxes_and_charges,
            "grand_total": doc.grand_total,
            "rounding_adjustment": doc.rounding_adjustment,
            "rounded_total": doc.rounded_total,
            "paid_amount": doc.paid_amount,
            "change_amount": doc.change_amount,
        },
        "kots": frappe.get_all(
            "URY KOT",
            filters={"invoice": doc.name},
            fields=["name", "production", "type", "order_status", "creation", "order_no"],
            order_by="creation asc",
        ),
        "activity": _activity(doc),
        "print": {
            "qz": bool(cint(profile.get("qz_print")) and frappe.db.get_value("POS Profile", doc.pos_profile, "custom_qz_bill_printer")),
            "format": profile.get("print_format") or "POS Invoice",
            "network_printers": _bill_printers(doc),
            "can_print": doc.docstatus != 2 and doc.has_permission("print"),
        },
    }


@frappe.whitelist()
def print_invoice(invoice, channel="browser"):
    """Record a reprint from the dashboard, and send it to the branch printer if asked.

    The browser channel only records it: the page opens Frappe's print view,
    which prints on whatever printer that computer has. The printer channel
    sends the bill to the network bill printer of its room or POS Profile.
    """
    doc = frappe.get_doc("POS Invoice", invoice)
    if not doc.has_permission("print"):
        frappe.throw(_("Not permitted to print this invoice"), frappe.PermissionError)
    if doc.docstatus == 2:
        frappe.throw(_("A cancelled bill cannot be printed"))

    if channel == "qz":
        from ury.ury.api.qz_printing import queue_bill
        queue_bill(doc.name)
        # Logged and marked printed by the station when the print succeeds.
        return {"queued": True}

    if channel == "printer":
        if not _bill_printers(doc):
            frappe.throw(_("No bill printer is set up for this branch"))
        from ury.ury.api.ury_print import select_network_printer
        select_network_printer(doc.pos_profile, doc.name)

    already = cint(doc.get("invoice_printed"))
    if not already:
        frappe.db.set_value("POS Invoice", doc.name, "invoice_printed", 1, update_modified=False)
    where = _("on the branch printer") if channel == "printer" else _("from the dashboard")
    log_activity(doc.name, (_("Bill reprinted {0}") if already else _("Bill printed {0}")).format(where))
    return {"printed": True}


def _bill_printers(doc):
    room = frappe.db.get_value("URY Table", doc.restaurant_table, "restaurant_room") if doc.get("restaurant_table") else None
    parents = [("URY Room", room)] if room else []
    parents.append(("POS Profile", doc.pos_profile))
    for parenttype, parent in parents:
        printers = frappe.get_all(
            "URY Printer Settings",
            filters={"parent": parent, "parenttype": parenttype, "bill": 1},
            pluck="printer",
        )
        if printers:
            return printers
    return []


def _user_name(user):
    return frappe.utils.get_fullname(user) if user else None


def _activity(doc):
    """The bill's timeline: created, every logged operation, submitted/cancelled."""
    events = [{
        "kind": "created",
        "text": _("Order created"),
        "by": _user_name(doc.owner),
        "at": doc.creation,
    }]
    for c in frappe.get_all(
        "Comment",
        filters={
            "reference_doctype": "POS Invoice",
            "reference_name": doc.name,
            "comment_type": ["in", ["Info", "Comment", "Edit"]],
        },
        fields=["comment_type", "content", "owner", "comment_by", "creation"],
        order_by="creation asc",
    ):
        events.append({
            "kind": "note" if c.comment_type == "Comment" else "activity",
            "text": frappe.utils.strip_html(c.content or ""),
            "by": c.comment_by or _user_name(c.owner),
            "at": c.creation,
        })
    if doc.docstatus == 2:
        events.append({"kind": "cancelled", "text": _("Bill cancelled"), "by": _user_name(doc.modified_by), "at": doc.modified})
    events.sort(key=lambda e: e["at"])
    return events
