"""Idempotent demo-data seed for URY Cost Variance Snapshot.

Creates a handful of ``URY Cost Variance Snapshot`` records for sellable menu
items so cost-variance reports have data to render.

Usage:

    bench execute ury.ury.dev_seed.v3_features.cost_variance_seed.seed
"""

import frappe
from frappe.utils import now_datetime


VARIANCE_REASONS = [
    "BOM revision drift",
    "Portion size variance",
    "Vendor price change",
    "Wastage not recorded",
]


def _get_company():
    return frappe.db.get_value("Company", {}, "name")


def _get_menu_items(limit=8):
    return frappe.get_all(
        "Item",
        filters={"disabled": 0, "is_sales_item": 1},
        fields=["item_code", "stock_uom"],
        limit=limit,
    )


def _seed_snapshot(item, company_name, index):
    # Idempotency key: one snapshot per item/company per day.
    today = frappe.utils.today()
    existing = frappe.db.get_value(
        "URY Cost Variance Snapshot",
        {"item_code": item.item_code, "company": company_name, "computed_at": ["like", f"{today}%"]},
        "name",
    )
    if existing:
        return None

    qty = 10 + (index % 5) * 5
    theoretical_cost = 50 + (index % 7) * 10
    posted_cost = theoretical_cost
    counted_qty = qty - (index % 3)  # small variance
    counted_cost = counted_qty * (theoretical_cost / qty)

    doc = frappe.get_doc(
        {
            "doctype": "URY Cost Variance Snapshot",
            "item_code": item.item_code,
            "qty": qty,
            "company": company_name,
            "computed_at": now_datetime(),
            "theoretical_cost": theoretical_cost,
            "posted_cost": posted_cost,
            "counted_qty": counted_qty,
            "counted_cost": counted_cost,
            "variance_vs_theoretical": counted_cost - theoretical_cost,
            "variance_vs_counted": 0.0,
            "reason": VARIANCE_REASONS[index % len(VARIANCE_REASONS)],
        }
    )
    doc.insert(ignore_permissions=True)
    print(f"  + Created URY Cost Variance Snapshot: {doc.name} ({item.item_code})")
    return doc.name


def seed():
    """Seed cost variance snapshots for sellable items."""
    company_name = _get_company()
    if not company_name:
        print("  cost_variance_seed.seed: no Company found — skipping.")
        return {"skipped": True}

    items = _get_menu_items()
    if not items:
        print("  cost_variance_seed.seed: no sellable Items found — skipping.")
        return {"skipped": True}

    created = []
    for i, item in enumerate(items):
        name = _seed_snapshot(item, company_name, i)
        if name:
            created.append(name)

    return {"created": created}
