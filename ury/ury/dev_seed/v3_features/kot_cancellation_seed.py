"""Idempotent demo-data seed for KOT cancellation execution records.

Finds existing ``URY KOT`` records and creates ``URY KOT Execution`` rows in
cancelled states so cancellation dashboards/reports have data to display.

Usage:

    bench execute ury.ury.dev_seed.v3_features.kot_cancellation_seed.seed
"""

import frappe
from frappe.utils import now_datetime


CANCELLED_STATES = [
    "CANCELLED_BEFORE_START",
    "CANCELLED_AFTER_START",
    "CANCELLED_AFTER_READY",
]


def _get_branch_and_company():
    branch_name = frappe.db.get_value("Branch", {}, "name")
    company_name = frappe.db.get_value("Company", {}, "name")
    return branch_name, company_name


def _get_company_for_branch(branch_name):
    return frappe.db.get_value("Branch", branch_name, "company") if branch_name else None


def _get_candidate_kots(limit=6):
    return frappe.get_all(
        "URY KOT",
        filters={"docstatus": ["<", 2]},
        fields=["name", "branch", "production"],
        limit=limit,
        order_by="creation desc",
    )


def _ensure_execution_row(kot, state, branch_name, company_name):
    existing = frappe.db.get_value(
        "URY KOT Execution",
        {"kot": kot["name"], "state": state},
        "name",
    )
    if existing:
        return None

    kot_branch = kot.get("branch") or branch_name
    kot_company = _get_company_for_branch(kot_branch) or company_name

    doc = frappe.get_doc(
        {
            "doctype": "URY KOT Execution",
            "kot": kot["name"],
            "state": state,
            "idempotency_key": f"demo-{kot['name']}-{state}",
            "branch": kot_branch,
            "company": kot_company,
            "production_unit": kot.get("production"),
            "cancelled_by": frappe.session.user,
            "cancelled_at": now_datetime(),
        }
    )
    doc.insert(ignore_permissions=True)
    print(f"  + Created URY KOT Execution ({state}): {doc.name} for KOT {kot['name']}")
    return doc.name


def seed():
    """Seed cancelled KOT execution records."""
    branch_name, company_name = _get_branch_and_company()
    if not branch_name or not company_name:
        print("  kot_cancellation_seed.seed: no Branch/Company found — skipping.")
        return {"skipped": True}

    kots = _get_candidate_kots()
    if not kots:
        print("  kot_cancellation_seed.seed: no URY KOT records found — skipping.")
        return {"skipped": True}

    created = []
    for i, kot in enumerate(kots):
        state = CANCELLED_STATES[i % len(CANCELLED_STATES)]
        name = _ensure_execution_row(kot, state, branch_name, company_name)
        if name:
            created.append(name)

    return {"created": created}
