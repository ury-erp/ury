"""Idempotent demo-data seed for URY Commission settings.

Creates the ``URY Commission Settings`` singleton and a few sample
``URY Commission Rule`` rows so commission reports/pages have data to render.

Usage:

    bench execute ury.ury.dev_seed.v3_features.commission_seed.seed
"""

import frappe


DEMO_RULES = [
    {
        "designation": "Captain",
        "rate_type": "Flat",
        "rate": 2.5,
    },
    {
        "designation": "Cashier",
        "rate_type": "Tiered",
        "tier_mode": "Marginal",
        "tiers": [
            {"from_amount": 0, "rate": 1.0},
            {"from_amount": 50000, "rate": 1.5},
            {"from_amount": 100000, "rate": 2.0},
        ],
    },
]


def _get_branch():
    return frappe.db.get_value("Branch", {}, "name")


def _ensure_designation(name):
    if not frappe.db.exists("Designation", name):
        frappe.get_doc({"doctype": "Designation", "designation_name": name}).insert(
            ignore_permissions=True
        )
        print(f"  + Created Designation: {name}")


def _ensure_commission_settings():
    if not frappe.db.exists("URY Commission Settings", "URY Commission Settings"):
        doc = frappe.get_doc(
            {
                "doctype": "URY Commission Settings",
                "enabled": 1,
                "commission_base": "Net Sales",
                "include_returns": 1,
                "attribution_mode": "Opener",
                "default_rate": 1.0,
                "tier_period": "Monthly",
                "rules": [],
            }
        )
        doc.insert(ignore_permissions=True)
        print("  + Created URY Commission Settings.")
        return doc

    return frappe.get_doc("URY Commission Settings", "URY Commission Settings")


def _seed_rules(settings_doc, branch_name):
    existing_designations = {
        row.designation for row in settings_doc.rules if row.designation
    }
    added = []

    for rule in DEMO_RULES:
        _ensure_designation(rule["designation"])
        if rule["designation"] in existing_designations:
            continue

        settings_doc.append(
            "rules",
            {
                "branch": branch_name,
                "designation": rule["designation"],
                "rate_type": rule["rate_type"],
                "rate": rule.get("rate", 0),
                "tier_mode": rule.get("tier_mode", "Marginal"),
                "tiers": [
                    {"from_amount": tier["from_amount"], "rate": tier["rate"]}
                    for tier in rule.get("tiers", [])
                ],
                "disabled": 0,
            },
        )
        added.append(rule["designation"])

    if added:
        settings_doc.save(ignore_permissions=True)
        print(f"  + Added commission rules for: {', '.join(added)}")

    return added


def seed():
    """Seed commission settings and sample rules."""
    branch_name = _get_branch()
    settings_doc = _ensure_commission_settings()
    added = _seed_rules(settings_doc, branch_name)
    return {"settings": settings_doc.name, "rules_added": added}
