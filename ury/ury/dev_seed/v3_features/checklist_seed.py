"""Idempotent demo-data seed for POS opening/closing checklists.

Creates a small set of ``URY Checklist Item`` rows on the demo POS Profile's
``custom_checklist_items`` child table and a few ``URY POS Checklist Log``
documents linked to that POS Profile.

``URY Checklist Item`` is a child doctype used inside the POS Profile, so it
is seeded by patching the profile rather than inserting standalone documents.

Usage:

    bench execute ury.ury.dev_seed.v3_features.checklist_seed.seed
"""

import frappe
from frappe.utils import now_datetime, today


CHECKLIST_ITEMS = [
    {"item_label": "Count cash in drawer", "applies_to": "Opening", "is_mandatory": 1},
    {"item_label": "Verify printer paper", "applies_to": "Opening", "is_mandatory": 1},
    {"item_label": "Check table reservations", "applies_to": "Opening", "is_mandatory": 0},
    {"item_label": "Reconcile cash", "applies_to": "Closing", "is_mandatory": 1},
    {"item_label": "Print Z-report", "applies_to": "Closing", "is_mandatory": 1},
    {"item_label": "Switch off KDS screens", "applies_to": "Closing", "is_mandatory": 0},
]


def _get_branch_and_pos_profile():
    branch_name = frappe.db.get_value("Branch", {}, "name")
    pos_profile = None
    if branch_name:
        pos_profile = frappe.db.get_value(
            "POS Profile", {"branch": branch_name, "disabled": 0}, "name"
        )
    if not pos_profile:
        pos_profile = frappe.db.get_value("POS Profile", {}, "name")
    return branch_name, pos_profile


def _ensure_checklist_items_on_profile(pos_profile_name):
    """Add demo checklist items to the POS Profile's custom_checklist_items
    child table if they are not already present."""
    pos_doc = frappe.get_doc("POS Profile", pos_profile_name)
    existing_labels = {row.item_label for row in pos_doc.get("custom_checklist_items", [])}

    added = []
    for item in CHECKLIST_ITEMS:
        if item["item_label"] in existing_labels:
            continue
        pos_doc.append(
            "custom_checklist_items",
            {
                "doctype": "URY Checklist Item",
                "item_label": item["item_label"],
                "applies_to": item["applies_to"],
                "is_mandatory": item["is_mandatory"],
            },
        )
        added.append(item["item_label"])

    if added:
        pos_doc.save(ignore_permissions=True)
        print(f"  + Added {len(added)} checklist item(s) to POS Profile {pos_profile_name}")
    return added


def _seed_checklist_log(checklist_type, branch_name, pos_profile_name):
    if not branch_name or not pos_profile_name:
        return None

    # Idempotency: one log per (profile, type, date).
    name = frappe.db.get_value(
        "URY POS Checklist Log",
        {"pos_profile": pos_profile_name, "checklist_type": checklist_type, "shift_date": today()},
        "name",
    )
    if name:
        return None

    pos_doc = frappe.get_doc("POS Profile", pos_profile_name)
    items = []
    for row in pos_doc.get("custom_checklist_items", []):
        if row.applies_to not in (checklist_type, "Both"):
            continue
        items.append(
            {
                "doctype": "URY Checklist Log Item",
                "item_label": row.item_label,
                "is_mandatory": row.is_mandatory,
                "is_checked": 1 if checklist_type == "Opening" else 0,
                "remarks": "Demo seed" if checklist_type == "Opening" else "",
            }
        )

    if not items:
        return None

    doc = frappe.get_doc(
        {
            "doctype": "URY POS Checklist Log",
            "pos_profile": pos_profile_name,
            "branch": branch_name,
            "checklist_type": checklist_type,
            "shift_date": today(),
            "status": "Complete" if checklist_type == "Opening" else "In Progress",
            "completed_by": frappe.session.user,
            "completed_at": now_datetime() if checklist_type == "Opening" else None,
            "items": items,
        }
    )
    doc.insert(ignore_permissions=True)
    print(f"  + Created URY POS Checklist Log: {doc.name}")
    return doc.name


def seed():
    """Seed checklist items on the POS Profile and demo opening/closing logs."""
    branch_name, pos_profile = _get_branch_and_pos_profile()

    if not pos_profile:
        print("  No POS Profile found — skipping checklist seed.")
        return {"skipped": True}

    added_items = _ensure_checklist_items_on_profile(pos_profile)

    logs = []
    for checklist_type in ("Opening", "Closing"):
        name = _seed_checklist_log(checklist_type, branch_name, pos_profile)
        if name:
            logs.append(name)

    return {"added_items": added_items, "logs": logs}
