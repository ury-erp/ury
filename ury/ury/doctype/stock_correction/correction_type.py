"""
Item classification helpers for Stock Correction Type.

Processed: item has an active URY Item Production Configuration for the given
branch with sourcing_mode = "IN_HOUSE" or a BOM set.
Raw: all other stock items.
"""

import frappe


def get_item_codes_for_type(correction_type: str, branch: str) -> "set[str] | None":
    """Return the set of item codes matching *correction_type* for *branch*.

    Returns:
        - ``None``      → no filtering needed (empty type, or Raw with no UIPC
                          records for the branch — every stock item qualifies).
        - ``set()``     → type is set but zero items match (Processed with no
                          UIPC, or similar edge case).
        - ``{...}``     → the exact set of item codes to keep.
    """
    if correction_type not in ("Raw", "Processed"):
        return None  # treat as "no filter"

    UIPC = frappe.qb.DocType("URY Item Production Configuration")

    processed_rows = (
        frappe.qb.from_(UIPC)
        .select(UIPC.item)
        .where(UIPC.active == 1)
        .where(UIPC.branch == branch)
        .where(
            (UIPC.sourcing_mode == "IN_HOUSE") | (UIPC.bom.isnotnull() & (UIPC.bom != ""))
        )
        .run(as_dict=True)
    )
    processed_items = {row.item for row in processed_rows}

    if correction_type == "Processed":
        return processed_items  # may be empty set

    # Raw
    if not processed_items:
        # No UIPC for this branch — all items are raw, no filtering needed
        return None

    Item = frappe.qb.DocType("Item")
    raw_rows = (
        frappe.qb.from_(Item)
        .select(Item.name)
        .where(Item.is_stock_item == 1)
        .where(Item.has_variants == 0)
        .where(Item.disabled == 0)
        .where(Item.name.notin(list(processed_items)))
        .run(as_dict=True)
    )
    return {row.name for row in raw_rows}
