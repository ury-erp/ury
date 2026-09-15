# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt

"""Shared, read-only helper for resolving POS Profile write-off defaults.

ERPNext's core `POS Profile` doctype marks `write_off_account` and
`write_off_cost_center` as mandatory (`reqd: 1`). The setup wizard
(`ury.ury.api.minimal.business_setup`) and dev-seed (`ury.ury.dev_seed.profiles`)
already resolve safe fallbacks for these two fields inline. This module
extracts that exact fallback cascade into a single whitelisted, read-only
helper so the Dashboard "Add POS Profile" flow (which previously had no
fallback logic at all) can call it via `frappe.call` and get the same
behaviour, without duplicating or drifting from the existing logic.

This module does not read from or modify `business_setup.py` /
`dev_seed/profiles.py`, and is not called by either of them (per the
narrower scope of Track Item 13) -- it is new, additive, and read-only.
"""

import frappe


def _resolve_write_off_account(company_doc, expense_account):
    """Company.write_off_account -> Account(account_type='Write Off') -> expense_account."""
    return (
        getattr(company_doc, "write_off_account", None)
        or frappe.db.get_value(
            "Account",
            {"company": company_doc.name, "account_type": "Write Off", "is_group": 0},
            "name",
        )
        or expense_account
    )


def _resolve_write_off_cost_center(company_doc, cost_center):
    """Company.cost_center -> Cost Center lookup (mirrors defaultCostCenter pattern)."""
    return (
        getattr(company_doc, "cost_center", None)
        or cost_center
        or frappe.db.get_value(
            "Cost Center",
            {"company": company_doc.name, "is_group": 0},
            "name",
        )
    )


@frappe.whitelist()
def resolve_write_off_defaults(company):
    """Resolve `write_off_account` / `write_off_cost_center` defaults for `company`.

    Read-only: performs no writes. Mirrors the fallback cascade already
    proven in `business_setup.py`'s `_run_configure_data`:

        write_off_account = Company.write_off_account
            or Account(account_type="Write Off", company=company)
            or expense_account
        write_off_cost_center = Company.cost_center
            or Cost Center lookup (mirrors existing defaultCostCenter pattern)

    Returns a dict:
        {
            "write_off_account": str | None,
            "write_off_cost_center": str | None,
        }
    Either value may be None if genuinely nothing could be resolved (e.g. a
    fresh Company with no Expense/COGS account and no Write Off account) --
    callers must handle that case with their own user-facing guidance rather
    than blindly submitting the mandatory field empty.
    """
    if not company:
        frappe.throw(frappe._("Company is required to resolve POS Profile defaults."))

    if not frappe.db.exists("Company", company):
        frappe.throw(frappe._("Company {0} does not exist.").format(company))

    # Whitelisted and read-only, but it still returns real Account / Cost
    # Center names for a company -- gate it on ordinary Company read access
    # rather than exposing the chart of accounts to any logged-in user.
    frappe.has_permission("Company", "read", doc=company, throw=True)

    company_doc = frappe.get_doc("Company", company)

    expense_account = getattr(company_doc, "default_expense_account", None) or frappe.db.get_value(
        "Account",
        {"company": company, "account_type": "Expense Account", "is_group": 0},
        "name",
    )
    cost_center = getattr(company_doc, "cost_center", None) or frappe.db.get_value(
        "Cost Center", {"company": company, "is_group": 0}, "name"
    )

    write_off_account = _resolve_write_off_account(company_doc, expense_account)
    write_off_cost_center = _resolve_write_off_cost_center(company_doc, cost_center)

    return {
        "write_off_account": write_off_account,
        "write_off_cost_center": write_off_cost_center,
    }
