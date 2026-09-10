import frappe


def apply_yield_back_calculation(doc, method):
    """
    Back-calculate BOM Item qty from custom_yield_qty and custom_yield_percent.

    When yield tracking is enabled on a component item (custom_yield_tracked=1),
    the recipe author provides custom_yield_qty (the usable output quantity needed),
    and qty is automatically computed as: qty = custom_yield_qty / (custom_yield_percent / 100).
    This accounts for material loss in production.

    For items without yield tracking, qty is left as manually entered by the user.
    """
    for row in doc.items:
        # Skip rows without yield_qty configured
        if not row.custom_yield_qty:
            continue

        # Fetch the item document to check if yield tracking is enabled
        item = frappe.get_doc("Item", row.item_code)

        # Skip if yield tracking is not enabled for this item
        if not item.custom_yield_tracked:
            continue

        # Skip if yield percent is not set or is zero (guard against division issues)
        if not row.custom_yield_percent or row.custom_yield_percent == 0:
            continue

        # Back-calculate qty from yield_qty and yield_percent
        # Formula: qty = custom_yield_qty / (custom_yield_percent / 100)
        row.qty = row.custom_yield_qty / (row.custom_yield_percent / 100)
