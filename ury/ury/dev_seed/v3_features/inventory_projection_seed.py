"""Demo-data sanity check for inventory projection APIs.

Inventory projection is a read-only layer over ERPNext ``Bin``; there is no
persistent projection doctype to seed. This module calls the public projection
functions for a sample item/warehouse and logs the results so a demo run
confirms the APIs are wired and return sensible values.

Usage:

    bench execute ury.ury.dev_seed.v3_features.inventory_projection_seed.seed
"""

import frappe

from ury.ury.api.ury_inventory_projection import get_allocatable_qty


def _get_company_and_warehouse():
    company_name = frappe.db.get_value("Company", {}, "name")
    warehouse = None
    if company_name:
        warehouse = frappe.db.get_value(
            "Warehouse", {"company": company_name, "is_group": 0}, "name"
        )
    return company_name, warehouse


def _get_sample_item():
    return frappe.db.get_value("Item", {"is_stock_item": 1}, "name")


def seed():
    """Call inventory projection APIs for a sample item/warehouse."""
    company_name, warehouse = _get_company_and_warehouse()
    item_code = _get_sample_item()

    if not company_name or not warehouse or not item_code:
        print("  inventory_projection_seed.seed: missing Company/Warehouse/stock Item — skipping.")
        return {"skipped": True}

    result = get_allocatable_qty(item_code, warehouse, company_name)
    print(
        f"  Inventory projection sample: {item_code} @ {warehouse} -> "
        f"actual={result.get('bin_actual_qty')}, projected={result.get('bin_projected_qty')}, "
        f"allocatable={result.get('allocatable_qty')}"
    )
    return {"sample": result}
