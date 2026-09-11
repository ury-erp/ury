import frappe
from frappe import _


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
        # Fetch the item document to check if yield tracking is enabled
        item = frappe.get_doc("Item", row.item_code)

        # Skip if yield tracking is not enabled for this item
        if not item.custom_yield_tracked:
            continue

        # At this point, the item is yield-tracked, so it must have required fields set
        if not row.custom_yield_qty:
            frappe.throw(_("Yield-tracked item {0} requires custom_yield_qty to be set on BOM row {1}").format(
                row.item_code, row.idx))

        # Check if yield percent is set and non-zero
        if not row.custom_yield_percent or row.custom_yield_percent == 0:
            frappe.throw(_("Yield percent for item {0} is missing or zero on BOM row {1}. Check the Item's custom_yield_percent setting.").format(
                row.item_code, row.idx))

        # Back-calculate qty from yield_qty and yield_percent
        # Formula: qty = custom_yield_qty / (custom_yield_percent / 100)
        row.qty = row.custom_yield_qty / (row.custom_yield_percent / 100)
