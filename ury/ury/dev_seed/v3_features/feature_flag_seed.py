"""Idempotent demo-data seed for URY Feature Flags.

Ensures the single ``URY Feature Flags`` record exists. Demo data leaves the
kill-switch ``pos_stock_authority_v2`` OFF, matching the doctype's warning
that this flag must never be enabled by code.

Usage:

    bench execute ury.ury.dev_seed.v3_features.feature_flag_seed.seed
"""

import frappe


def seed():
    """Create the URY Feature Flags singleton if it does not exist."""
    if frappe.db.exists("URY Feature Flags", "URY Feature Flags"):
        print("  URY Feature Flags already exists — skipping.")
        return {"skipped": True}

    doc = frappe.get_doc(
        {
            "doctype": "URY Feature Flags",
            "pos_stock_authority_v2": 0,
        }
    )
    doc.insert(ignore_permissions=True)
    print("  + Created URY Feature Flags (pos_stock_authority_v2=OFF).")
    return {"created": doc.name}
