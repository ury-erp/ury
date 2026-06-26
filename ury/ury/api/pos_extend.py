import re
import frappe
from frappe import _


def validate_search_input(search_term):
    """Validate and sanitize search input."""
    if not search_term:
        return ""

    if len(search_term) > 100:
        frappe.throw(_("Search term too long (max 100 characters)"))

    if not re.match(r'^[a-zA-Z0-9\s\-_@.]+$', search_term):
        frappe.throw(_("Invalid characters in search term"))

    return search_term


@frappe.whitelist()
def overrided_past_order_list(search_term, status, limit=20):
    """Fetch past orders for the v1 POS, respecting branch permissions."""
    user = frappe.session.user
    search_term = validate_search_input(search_term)
    limit = cint(limit)

    fields = [
        "name",
        "grand_total",
        "currency",
        "customer",
        "posting_time",
        "posting_date",
        "restaurant_table",
        "invoice_printed",
    ]

    filters = {}

    # Non-administrators are restricted to their assigned branch/room
    if user != "Administrator":
        row = frappe.db.sql(
            """SELECT b.branch, a.room
               FROM `tabURY User` a
               JOIN `tabBranch` b ON a.parent = b.name
               WHERE a.user = %s""",
            user,
            as_dict=True,
        )
        if not row:
            frappe.throw(_("User is not associated with any Branch. Please refresh the page."))

        filters["branch"] = row[0].branch
        if row[0].room:
            filters["custom_restaurant_room"] = row[0].room

    if status == "To Bill":
        filters["status"] = "Draft"
        # Only show table orders that haven't been printed yet
        filters["restaurant_table"] = ("is", "set")
        filters["invoice_printed"] = 0
    elif status:
        filters["status"] = status

    # Search by customer name OR invoice name
    if search_term:
        filters["name"] = ("like", f"%{search_term}%")
        # Also try customer search — union with a separate query
        invoices_by_name = frappe.db.get_all(
            "POS Invoice", filters=filters, fields=fields, limit=limit
        )
        customer_filters = dict(filters)
        customer_filters.pop("name", None)
        customer_filters["customer"] = ("like", f"%{search_term}%")
        invoices_by_customer = frappe.db.get_all(
            "POS Invoice", filters=customer_filters, fields=fields, limit=limit
        )
        # Deduplicate by name
        seen = set()
        result = []
        for inv in invoices_by_name + invoices_by_customer:
            if inv.name not in seen:
                seen.add(inv.name)
                result.append(inv)
        return result

    return frappe.db.get_all(
        "POS Invoice", filters=filters, fields=fields, limit=limit
    )