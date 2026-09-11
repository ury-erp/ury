"""
One-time backfill for two Track-Item C1/A2 gaps found in the Opus hardening
review of `ury.hooks.ury_bom`:

M1. `apply_yield_back_calculation()` now `frappe.throw()`s on any BOM Item
    row whose component Item is `custom_yield_tracked=1` but the row itself
    has no `custom_yield_qty` set (or the Item's `custom_yield_percent` is
    missing/zero). This validation is correct going forward, but it also
    hard-fails the *next* save of any PRE-EXISTING BOM that happens to be in
    that state -- including indirect saves triggered by cost updates,
    amends, or Production Plan runs, not just an admin editing the BOM.
    This patch backfills `custom_yield_qty` on those rows using the inverse
    of the back-calculation formula, so the row becomes internally
    consistent with its current (already-correct) `qty` instead of blowing
    up on the next save.

M2. `set_bom_revision()` only ever runs from the `before_validate` hook, so
    `custom_bom_revision` is NULL on every BOM that hasn't been resaved
    since the field was introduced. That leaves the entire C1
    staleness-detection feature (`ury.api.ury_sales_plan.flag_stale_bom_revisions`)
    silently inert until every BOM happens to get resaved for unrelated
    reasons. This patch stamps a real revision on every existing BOM by
    calling `ury.hooks.ury_bom.set_bom_revision()` directly against each
    BOM's loaded `items` -- NOT a locally re-implemented copy of that hash.
    A first draft of this patch inlined the hash formula, and within the
    same swarm run a separate fix (Track-Item D1) changed that formula
    (added `uom` to the vector) -- proving inline duplication drifts out of
    sync immediately, even inside one PR. Importing the real function makes
    that class of bug structurally impossible.

Both backfills are done via `frappe.db.set_value(..., update_modified=False)`
in a loop -- not `doc.save()` -- specifically to avoid re-triggering
`apply_yield_back_calculation()` (which is exactly the validation this patch
is working around the fallout of) and to avoid the overhead of a full
document save for what is expected to be, at most, a few hundred BOMs.
"""

import frappe

from ury.ury.hooks.ury_bom import set_bom_revision


def execute():
    if not frappe.db.exists("DocType", "BOM"):
        return
    if not frappe.db.exists("DocType", "BOM Item"):
        return

    yield_qty_backfilled = 0
    revisions_stamped = 0
    skipped_missing_yield_percent = []

    bom_names = frappe.get_all("BOM", pluck="name")

    for bom_name in bom_names:
        bom_items = frappe.get_all(
            "BOM Item",
            filters={"parent": bom_name, "parenttype": "BOM"},
            fields=["name", "item_code", "qty", "custom_yield_qty"],
            order_by="idx asc",
        )

        for bom_item in bom_items:
            if not bom_item.item_code:
                continue

            if bom_item.custom_yield_qty:
                continue

            item_yield_tracked, item_yield_percent = frappe.db.get_value(
                "Item",
                bom_item.item_code,
                ["custom_yield_tracked", "custom_yield_percent"],
            ) or (0, None)

            if not item_yield_tracked:
                continue

            if not item_yield_percent:
                skipped_missing_yield_percent.append(
                    {
                        "bom": bom_name,
                        "bom_item": bom_item.name,
                        "item_code": bom_item.item_code,
                    }
                )
                continue

            # Inverse of apply_yield_back_calculation()'s
            # `qty = custom_yield_qty / (custom_yield_percent / 100)`:
            #   custom_yield_qty = qty * (custom_yield_percent / 100)
            computed_yield_qty = (bom_item.qty or 0) * (item_yield_percent / 100)

            frappe.db.set_value(
                "BOM Item",
                bom_item.name,
                "custom_yield_qty",
                computed_yield_qty,
                update_modified=False,
            )
            yield_qty_backfilled += 1

        # Recompute custom_bom_revision via the real set_bom_revision() --
        # not a re-implemented copy of its hash -- so this patch can never
        # drift out of sync with whatever vector that function hashes on
        # (see module docstring: it already changed once, mid-run, when
        # Track-Item D1 added `uom` to the vector). A lightweight object
        # carrying just `.items` (re-fetched fresh, so a row backfilled
        # above is reflected) is enough -- set_bom_revision() only reads
        # `doc.items`, it doesn't call `.save()` or touch anything else.
        revision_rows = frappe.get_all(
            "BOM Item",
            filters={"parent": bom_name, "parenttype": "BOM"},
            fields=["item_code", "qty", "uom"],
        )
        bom_stub = frappe._dict(items=revision_rows)
        set_bom_revision(bom_stub)

        frappe.db.set_value(
            "BOM",
            bom_name,
            "custom_bom_revision",
            bom_stub.custom_bom_revision,
            update_modified=False,
        )
        revisions_stamped += 1

        frappe.db.commit()

    print(
        "backfill_bom_yield_qty_and_revision: "
        f"{yield_qty_backfilled} BOM Item row(s) backfilled with custom_yield_qty, "
        f"{revisions_stamped} BOM(s) stamped with custom_bom_revision, "
        f"{len(skipped_missing_yield_percent)} row(s) skipped (Item missing custom_yield_percent)."
    )
    if skipped_missing_yield_percent:
        print(
            "backfill_bom_yield_qty_and_revision: rows needing manual attention "
            "(yield-tracked Item with no custom_yield_percent set):"
        )
        for row in skipped_missing_yield_percent:
            print(
                f"  BOM={row['bom']} BOM Item={row['bom_item']} Item={row['item_code']}"
            )
