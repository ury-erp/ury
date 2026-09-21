"""Idempotent demo-data seed for a PRE_PRODUCED item, its BOM, its
`URY Item Production Configuration`, and one batch-manufactured stock lot.

Written while live-verifying the G-01/G-02/G-06/G-08/G-09 fixes in
tracks/sa-testing-issues-14sep/PHASE_0_1_LIVE_VERIFICATION.md: this bench's
seed data had exactly one `URY Item Production Configuration` row (`GRCN`,
MADE_TO_ORDER) and no PRE_PRODUCED item at all, so Scenario B (the G-02
double-deduction regression check -- the actual core bug this whole track
exists to fix) could not be exercised without first constructing one.

This seed exists so that gap is reproducible and committed, not something
that only ever lived in one throwaway disposable bench's database.

Creates:
  - Item `TEST-RAW-A`: a plain stock-item raw material.
  - Item `TEST-FG-PP`: the pre-produced finished good, sellable, stock-tracked.
  - BOM `BOM-TEST-FG-PP-001`: 2x TEST-RAW-A -> 1x TEST-FG-PP, submitted/active/default.
  - Warehouse `Direct Retail - U` (company URY), if it does not already
    exist. D13 (the Department Warehouse is the PRE_PRODUCED stock
    authority) means this warehouse is no longer where PRE_PRODUCED
    finished goods land -- it is kept only as a populated
    `direct_retail_warehouse` value on the configuration below, matching
    what a DIRECT_RETAIL configuration would set, and is never read for
    this PRE_PRODUCED item's stock.
  - `URY Item Production Configuration` for TEST-FG-PP: PRE_PRODUCED /
    IN_HOUSE, department/production_unit = Kitchen, direct_retail_warehouse
    = the warehouse above (unused for PRE_PRODUCED stock, see D13).
  - The Kitchen department's `department_warehouse` (`Kitchen - U`) if not
    already set -- this is the actual PRE_PRODUCED finished-goods warehouse
    after D13.
  - A Material Receipt of TEST-RAW-A into Kitchen - U (enough for one batch)
    and then a real `start_batch` call (see
    `ury.ury.api.ury_batch_manufacture_service.start_batch`) that posts a
    genuine submitted Manufacture Stock Entry receiving TEST-FG-PP into
    the Kitchen department warehouse -- exactly the "existing
    batch-manufactured stock" Scenario B's instructions call for.
  - Adds TEST-FG-PP to the "Default Menu" URY Menu (see
    `ury.ury.dev_seed.add_menu_item` for the equivalent GRCN wiring) so it
    is orderable through the POS frontend.

Every step is idempotent (checked via `frappe.db.exists` /
`frappe.db.get_value` before creating), so re-running this on a bench that
already has some or all of this data is a no-op for what exists and only
fills in what is missing.

Usage:

    bench execute ury.ury.dev_seed.v3_features.pre_produced_item_seed.seed
"""

import frappe
from frappe.utils import flt

COMPANY = "URY"
BRANCH = "URY Branch"
RAW_ITEM = "TEST-RAW-A"
FG_ITEM = "TEST-FG-PP"
BOM_NAME_HINT = "BOM-TEST-FG-PP-001"
DIRECT_RETAIL_WAREHOUSE = "Direct Retail - U"
SOURCE_WAREHOUSE = "Kitchen - U"
DEPARTMENT = "Kitchen"
# D13: the Department Warehouse is the PRE_PRODUCED stock authority, not
# direct_retail_warehouse. Reuse the same warehouse as SOURCE_WAREHOUSE for
# this seed's single-department demo item -- raw materials in and finished
# goods out share one department warehouse here, same as a real Kitchen
# department with skip_transfer production would.
DEPARTMENT_WAREHOUSE = SOURCE_WAREHOUSE
CONFIG_NAME = f"UIPC-{FG_ITEM}-{BRANCH}"
MENU_NAME = "Default Menu"
BATCH_QTY = 10
RAW_QTY_PER_BATCH_UNIT = 2


def _ensure_raw_item():
    if frappe.db.exists("Item", RAW_ITEM):
        return
    frappe.get_doc(
        {
            "doctype": "Item",
            "item_code": RAW_ITEM,
            "item_name": "Test Raw Material A",
            "item_group": "All Item Groups",
            "stock_uom": "Nos",
            "is_stock_item": 1,
        }
    ).insert(ignore_permissions=True)
    print(f"  + Created raw material item {RAW_ITEM}.")


def _ensure_fg_item():
    if frappe.db.exists("Item", FG_ITEM):
        return
    # Model the finished good's item group/UOM on an existing pre-produced-shaped
    # menu item if one exists, else fall back to sane defaults.
    reference_item_group = "All Item Groups"
    reference_uom = "Nos"
    if frappe.db.exists("Item", "STPUD"):
        stpud = frappe.get_doc("Item", "STPUD")
        reference_item_group = stpud.item_group
        reference_uom = stpud.stock_uom

    frappe.get_doc(
        {
            "doctype": "Item",
            "item_code": FG_ITEM,
            "item_name": "Test Pre-Produced FG",
            "item_group": reference_item_group,
            "stock_uom": reference_uom,
            "is_stock_item": 1,
            "is_sales_item": 1,
        }
    ).insert(ignore_permissions=True)
    print(f"  + Created pre-produced finished-good item {FG_ITEM}.")


def _ensure_bom():
    if frappe.db.exists("BOM", {"item": FG_ITEM}):
        return frappe.db.get_value("BOM", {"item": FG_ITEM}, "name")
    bom = frappe.get_doc(
        {
            "doctype": "BOM",
            "item": FG_ITEM,
            "quantity": 1,
            "company": COMPANY,
            "is_active": 1,
            "is_default": 1,
            "with_operations": 0,
            "items": [
                {"item_code": RAW_ITEM, "qty": RAW_QTY_PER_BATCH_UNIT, "uom": "Nos"},
            ],
        }
    )
    bom.insert(ignore_permissions=True)
    bom.submit()
    print(f"  + Created + submitted BOM {bom.name} for {FG_ITEM}.")
    return bom.name


def _ensure_direct_retail_warehouse():
    if frappe.db.exists("Warehouse", DIRECT_RETAIL_WAREHOUSE):
        return
    frappe.get_doc(
        {
            "doctype": "Warehouse",
            "warehouse_name": "Direct Retail",
            "company": COMPANY,
        }
    ).insert(ignore_permissions=True)
    print(f"  + Created warehouse {DIRECT_RETAIL_WAREHOUSE}.")


def _ensure_department_warehouse():
    """Set the Kitchen department's `department_warehouse` (D13's
    PRE_PRODUCED stock authority) if it exists and does not already have
    one set. Non-fatal (just prints and returns) if the `Kitchen`
    department itself does not exist on this bench -- creating production
    departments is not this seed's job."""
    if not frappe.db.exists("URY Production Department", DEPARTMENT):
        print(f"  ! Production Department {DEPARTMENT} does not exist -- skipping department warehouse wiring.")
        return
    existing = frappe.db.get_value("URY Production Department", DEPARTMENT, "department_warehouse")
    if existing:
        return
    frappe.db.set_value("URY Production Department", DEPARTMENT, "department_warehouse", DEPARTMENT_WAREHOUSE)
    print(f"  + Set {DEPARTMENT}.department_warehouse = {DEPARTMENT_WAREHOUSE}.")


def _ensure_production_configuration():
    if frappe.db.exists("URY Item Production Configuration", CONFIG_NAME):
        return
    frappe.get_doc(
        {
            "doctype": "URY Item Production Configuration",
            "item": FG_ITEM,
            "branch": BRANCH,
            "active": 1,
            "production_policy": "PRE_PRODUCED",
            "sourcing_mode": "IN_HOUSE",
            "department": "Kitchen",
            "production_unit": "Kitchen",
            "direct_retail_warehouse": DIRECT_RETAIL_WAREHOUSE,
            "controlled_by_sales_plan": 0,
        }
    ).insert(ignore_permissions=True)
    print(f"  + Created URY Item Production Configuration {CONFIG_NAME} (PRE_PRODUCED/IN_HOUSE).")


def _ensure_raw_stock():
    existing = flt(frappe.db.get_value("Bin", {"item_code": RAW_ITEM, "warehouse": SOURCE_WAREHOUSE}, "actual_qty"))
    needed = flt(BATCH_QTY) * flt(RAW_QTY_PER_BATCH_UNIT)
    if existing >= needed:
        return
    se = frappe.get_doc(
        {
            "doctype": "Stock Entry",
            "stock_entry_type": "Material Receipt",
            "company": COMPANY,
            "items": [
                {"item_code": RAW_ITEM, "qty": needed * 5, "t_warehouse": SOURCE_WAREHOUSE, "basic_rate": 1},
            ],
        }
    )
    se.insert(ignore_permissions=True)
    se.submit()
    print(f"  + Receipted {needed * 5} {RAW_ITEM} into {SOURCE_WAREHOUSE} via {se.name}.")


def _ensure_batch_manufactured():
    # D13: `start_batch` receives finished goods into the department
    # warehouse, not `direct_retail_warehouse` -- check stock (and report
    # below) against wherever it actually lands.
    target_warehouse = frappe.db.get_value("URY Production Department", DEPARTMENT, "department_warehouse") or DEPARTMENT_WAREHOUSE
    existing_fg = flt(frappe.db.get_value("Bin", {"item_code": FG_ITEM, "warehouse": target_warehouse}, "actual_qty"))
    if existing_fg > 0:
        return
    from ury.ury.api.ury_batch_manufacture_service import start_batch

    result = start_batch(
        production_configuration=CONFIG_NAME,
        qty=BATCH_QTY,
        idempotency_key="SEED-PRE-PRODUCED-BATCH-1",
        actor="Administrator",
    )
    print(f"  + start_batch posted {result.get('stock_entry')}: {BATCH_QTY} {FG_ITEM} into {result.get('target_warehouse')}.")


def _ensure_on_menu():
    if not frappe.db.exists("URY Menu", MENU_NAME):
        print(f"  ! {MENU_NAME} does not exist -- skipping menu wiring (not fatal).")
        return
    menu = frappe.get_doc("URY Menu", MENU_NAME)
    already_present = any(row.item == FG_ITEM for row in menu.get("items") or [])
    if already_present:
        return
    menu.append(
        "items",
        {
            "item": FG_ITEM,
            "item_name": "Test Pre-Produced FG",
            "rate": 150,
            "course": None,
            "disabled": 0,
        },
    )
    menu.save(ignore_permissions=True)
    print(f"  + Added {FG_ITEM} to {MENU_NAME}.")


def seed():
    """Create everything needed to live-verify a PRE_PRODUCED item end to end.

    Idempotent: safe to run repeatedly. Requires Administrator (or an
    equivalent role authorized for Item/BOM/Warehouse/Stock Entry/URY Item
    Production Configuration creation and `start_batch`).
    """
    frappe.set_user("Administrator")
    _ensure_raw_item()
    _ensure_fg_item()
    _ensure_bom()
    _ensure_direct_retail_warehouse()
    _ensure_department_warehouse()
    _ensure_production_configuration()
    _ensure_raw_stock()
    _ensure_batch_manufactured()
    _ensure_on_menu()
    frappe.db.commit()
    print("PRE_PRODUCED_SEED_OK")
