import hashlib

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
        # Check if yield tracking is enabled for this item using a cheap single-field lookup.
        # frappe.get_cached_value is preferred for Item master data (matches codebase pattern).
        is_yield_tracked = frappe.get_cached_value("Item", row.item_code, "custom_yield_tracked")

        # Skip if yield tracking is not enabled for this item
        if not is_yield_tracked:
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

    set_bom_revision(doc)


def set_bom_revision(doc):
    """Compute and set `custom_bom_revision`, a marker that changes whenever
    this BOM's (yield-adjusted) raw-material quantities change.

    Design choice (see Track-Item C1 brief): a hash of the exploded
    item/qty vector is used, NOT the doc's `modified` timestamp. A
    `modified`-based revision is simpler, but it is bumped by ANY save of
    the BOM -- including edits with no bearing on yield (description
    tweaks, operations changes, etc.) -- so a Sales Plan row would be
    flagged "stale" on every unrelated BOM save, drowning out the real
    signal. Hashing (item_code, qty, uom) for every row is only marginally more
    expensive than the back-calculation loop already run above (it reuses
    `doc.items`, no extra DB reads) and only changes when a component,
    its quantity, or its unit of measure actually changes -- including the qty
    changes driven by `apply_yield_back_calculation` above when an Item's
    `custom_yield_percent` standard changes and this (draft) BOM is
    resaved. That is exactly the staleness signal
    `ury_sales_plan.py::flag_stale_bom_revisions` needs to compare against.

    Called from the same `before_validate` hook as the back-calculation
    above so the revision always reflects the just-recomputed quantities.
    """
    vector = sorted(
        (row.item_code, round(row.qty or 0, 6), row.uom)
        for row in (doc.items or [])
        if row.item_code
    )
    payload = repr(vector).encode("utf-8")
    doc.custom_bom_revision = hashlib.md5(payload).hexdigest()[:16]
