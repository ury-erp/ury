"""Idempotent demo-data seed for stock issue/authorization/movement flows.

Creates a minimal chain of ``URY Sales Plan`` -> ``URY Issue Authorization`` ->
``URY Stock Movement`` (transfer/receipt/return) so the stock issue dashboard
and reports have real records to display.

This module deliberately bypasses the whitelisted authorization/movement
services because those require a complete plan/approval chain and manager
roles; for demo data we directly insert read-only tracking records, matching
the precedent already used in ``ury.ury.dev_seed.more_seed`` for wastage.

Usage:

    bench execute ury.ury.dev_seed.v3_features.stock_issue_seed.seed
"""

import json

import frappe
from frappe.utils import add_days, now, nowdate


DEMO_COMPONENTS = [
    ("Chicken", "Kg"),
    ("Paneer", "Kg"),
    ("Rice", "Kg"),
]

DEMO_PLAN_SERVICE_PERIOD = "Dinner"
DEMO_PLAN_DAYS = [0, 1, 3]


def _get_branch_and_company():
    branch_name = frappe.db.get_value("Branch", {}, "name")
    company_name = frappe.db.get_value("Company", {}, "name")
    return branch_name, company_name


def _get_department():
    return frappe.db.get_value("URY Production Department", {}, "name")


def _ensure_component_items():
    """Create lightweight stock Items to use as BOM/components if they do not exist."""
    created = []
    for item_name, uom in DEMO_COMPONENTS:
        if frappe.db.exists("Item", item_name):
            continue
        doc = frappe.get_doc(
            {
                "doctype": "Item",
                "item_code": item_name,
                "item_name": item_name,
                "item_group": "Raw Material",
                "stock_uom": uom,
                "is_stock_item": 1,
                "is_sales_item": 0,
            }
        )
        doc.insert(ignore_permissions=True)
        created.append(doc.name)
        print(f"  + Created component Item: {doc.name}")
    return created


def _ensure_item_group():
    if frappe.db.exists("Item Group", "Raw Material"):
        return
    parent = frappe.db.get_value("Item Group", {"is_group": 1}, "name") or "All Item Groups"
    frappe.get_doc(
        {"doctype": "Item Group", "item_group_name": "Raw Material", "parent_item_group": parent, "is_group": 0}
    ).insert(ignore_permissions=True)
    print("  + Created Item Group: Raw Material")


def _ensure_uom(uom):
    if not frappe.db.exists("UOM", uom):
        frappe.get_doc({"doctype": "UOM", "uom_name": uom, "must_be_whole_number": 0}).insert(
            ignore_permissions=True
        )
        print(f"  + Created UOM: {uom}")


def _build_demand_vector(component_items, department):
    return [
        {
            "component_item": item,
            "department": department,
            "production_unit": None,
            "required_qty": 50.0,
            "stock_uom": uom,
            "control_mode": "SOFT",
        }
        for item, uom in component_items
    ]


def _ensure_demo_sales_plan(branch_name, company_name, department, plan_date, demand_vector):
    existing = frappe.db.get_value(
        "URY Sales Plan",
        {
            "branch": branch_name,
            "company": company_name,
            "plan_date": plan_date,
            "service_period": DEMO_PLAN_SERVICE_PERIOD,
        },
        "name",
    )
    if existing:
        doc = frappe.get_doc("URY Sales Plan", existing)
        if doc.approval_snapshot and "demand_vector" in (doc.approval_snapshot or ""):
            return existing
        # Backfill demand_vector into existing snapshot.
        snapshot = json.loads(doc.approval_snapshot) if doc.approval_snapshot else {}
        snapshot["demand_vector"] = demand_vector
        doc.approval_snapshot = json.dumps(snapshot, sort_keys=True, default=str)
        doc.save(ignore_permissions=True)
        print(f"  ~ Backfilled demand_vector on URY Sales Plan: {existing}")
        return existing

    snapshot = {
        "branch": branch_name,
        "company": company_name,
        "plan_date": str(plan_date),
        "service_period": DEMO_PLAN_SERVICE_PERIOD,
        "items": [],
        "demand_vector": demand_vector,
        "insight_snapshot": {},
    }
    encoded = json.dumps(snapshot, sort_keys=True, default=str)

    doc = frappe.get_doc(
        {
            "doctype": "URY Sales Plan",
            "status": "Approved",
            "branch": branch_name,
            "company": company_name,
            "plan_date": plan_date,
            "service_period": DEMO_PLAN_SERVICE_PERIOD,
            "approval_snapshot": encoded,
        }
    )
    doc.insert(ignore_permissions=True)
    print(f"  + Created URY Sales Plan: {doc.name}")
    return doc.name


def _ensure_issue_authorization(plan_name, branch_name, company_name, department, component_item, stock_uom):
    existing = frappe.db.get_value(
        "URY Issue Authorization",
        {
            "plan": plan_name,
            "branch": branch_name,
            "company": company_name,
            "department": department,
            "component_item": component_item,
        },
        "name",
    )
    if existing:
        return existing

    doc = frappe.get_doc(
        {
            "doctype": "URY Issue Authorization",
            "plan": plan_name,
            "plan_approval_hash": frappe.db.get_value("URY Sales Plan", plan_name, "approval_snapshot_hash") or "demo",
            "branch": branch_name,
            "company": company_name,
            "department": department,
            "component_item": component_item,
            "stock_uom": stock_uom,
            "control_mode": "SOFT",
            "status": "Authorized",
            "required_qty": 50.0,
            "prior_authorized_qty": 0,
            "prior_returned_qty": 0,
            "prior_wasted_qty": 0,
            "remaining_before_qty": 50.0,
            "authorized_qty": 25.0,
            "remaining_after_qty": 25.0,
            "actor": frappe.session.user,
            "audit_log": json.dumps(
                [
                    {
                        "actor": frappe.session.user,
                        "timestamp": str(now()),
                        "event": "demo_seed",
                        "authorized_qty": 25.0,
                    }
                ],
                default=str,
            ),
        }
    )
    doc.insert(ignore_permissions=True)
    print(f"  + Created URY Issue Authorization: {doc.name}")
    return doc.name


def _ensure_stock_movement(auth_name, movement_type, qty, branch_name, company_name, department, component_item, stock_uom):
    existing = frappe.db.get_value(
        "URY Stock Movement",
        {
            "issue_authorization": auth_name,
            "movement_type": movement_type,
        },
        "name",
    )
    if existing:
        return existing

    from_location = "Central Store" if movement_type in ("Transfer",) else department
    to_location = department if movement_type in ("Transfer",) else "Central Store"

    doc = frappe.get_doc(
        {
            "doctype": "URY Stock Movement",
            "issue_authorization": auth_name,
            "movement_type": movement_type,
            "branch": branch_name,
            "company": company_name,
            "department": department,
            "component_item": component_item,
            "stock_uom": stock_uom,
            "qty": qty,
            "from_location": from_location,
            "to_location": to_location,
            "posting_datetime": now(),
            "actor": frappe.session.user,
        }
    )
    doc.insert(ignore_permissions=True)
    print(f"  + Created URY Stock Movement ({movement_type}): {doc.name}")
    return doc.name


def seed():
    """Seed component items, sales plans, issue authorizations, and movements."""
    branch_name, company_name = _get_branch_and_company()
    if not branch_name or not company_name:
        print("  stock_issue_seed.seed: no Branch/Company found — skipping.")
        return {"skipped": True}

    department = _get_department()
    if not department:
        print("  stock_issue_seed.seed: no URY Production Department found — skipping.")
        return {"skipped": True}

    _ensure_item_group()
    for _, uom in DEMO_COMPONENTS:
        _ensure_uom(uom)
    _ensure_component_items()

    created_plans = []
    created_auths = []
    created_movements = []

    for offset in DEMO_PLAN_DAYS:
        plan_date = add_days(nowdate(), -offset)
        demand_vector = _build_demand_vector(DEMO_COMPONENTS, department)
        plan_name = _ensure_demo_sales_plan(
            branch_name, company_name, department, plan_date, demand_vector
        )
        created_plans.append(plan_name)

        for item_name, uom in DEMO_COMPONENTS:
            auth_name = _ensure_issue_authorization(
                plan_name, branch_name, company_name, department, item_name, uom
            )
            created_auths.append(auth_name)

            # One transfer + one receipt + one return per component.
            for movement_type, qty in (("Transfer", 25.0), ("Receipt", 20.0), ("Return", 5.0)):
                movement_name = _ensure_stock_movement(
                    auth_name,
                    movement_type,
                    qty,
                    branch_name,
                    company_name,
                    department,
                    item_name,
                    uom,
                )
                created_movements.append(movement_name)

    return {
        "plans": created_plans,
        "authorizations": created_auths,
        "movements": created_movements,
    }
