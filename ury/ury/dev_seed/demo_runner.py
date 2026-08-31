"""Unified, idempotent demo-data runner for URY v3.

Seeds a complete demo dataset against the **existing** Company and Branch on
a site (it never creates a new company). All underlying seed modules are
independently idempotent, so the runner can be re-run safely.

Usage:

    # Use the first Company/Branch found on the site
    bench --site <site> execute ury.ury.dev_seed.demo_runner.seed_all

    # Pin a specific Company/Branch
    bench --site <site> execute ury.ury.dev_seed.demo_runner.seed_all \
        --kwargs '{"company_name": "My Restaurant", "branch_name": "My Restaurant"}'

The runner wires the existing permanent seed modules in dependency order and
adds new-feature seeders that are not yet covered by the older modules.
"""

import frappe

from ury.ury.dev_seed import (
    catalog,
    daily_pnl_seed,
    historical_sales,
    kot_error_log_seed,
    kot_seed,
    more_seed,
    operations,
    profiles,
    purchasing_seed,
)
from ury.ury.dev_seed.v3_features import (
    checklist_seed,
    commission_seed,
    cost_variance_seed,
    feature_flag_seed,
    inventory_projection_seed,
    kot_cancellation_seed,
    stock_issue_seed,
)


# ---------------------------------------------------------------------------
# Dependency order
# ---------------------------------------------------------------------------

# Each tuple is (display_name, module). Order matters: catalog/profiles first,
# transaction-heavy modules after, new-feature seeders last so they can reuse
# records created by earlier modules.
_SEED_MODULES = [
    ("catalog", catalog),
    ("profiles", profiles),
    ("operations", operations),
    ("more_seed", more_seed),
    ("historical_sales", historical_sales),
    ("kot_seed", kot_seed),
    ("kot_error_log_seed", kot_error_log_seed),
    ("purchasing_seed", purchasing_seed),
    ("daily_pnl_seed", daily_pnl_seed),
    # v3 feature seeders
    ("stock_issue", stock_issue_seed),
    ("cost_variance", cost_variance_seed),
    ("kot_cancellation", kot_cancellation_seed),
    ("inventory_projection", inventory_projection_seed),
    ("commission", commission_seed),
    ("feature_flags", feature_flag_seed),
    ("checklist", checklist_seed),
]


# ---------------------------------------------------------------------------
# Company / branch resolution
# ---------------------------------------------------------------------------

def _resolve_company(company_name=None):
    if company_name:
        if not frappe.db.exists("Company", company_name):
            frappe.throw(f"Company '{company_name}' not found.")
        return company_name

    company = frappe.db.get_value("Company", {}, "name")
    if not company:
        frappe.throw("No Company found on this site — cannot seed demo data.")
    return company


def _resolve_branch(branch_name=None, company_name=None):
    if branch_name:
        if not frappe.db.exists("Branch", branch_name):
            frappe.throw(f"Branch '{branch_name}' not found.")
        return branch_name

    # Prefer a branch linked to the chosen company, fall back to any branch.
    branch = frappe.db.get_value("Branch", {"company": company_name}, "name") if company_name else None
    if not branch:
        branch = frappe.db.get_value("Branch", {}, "name")
    if not branch:
        frappe.throw("No Branch found on this site — cannot seed demo data.")
    return branch


def _ensure_branch_company(branch_name, company_name):
    """Make sure the Branch record is linked to the resolved Company.

    Several downstream seeders (operations.py, stock_issue_seed.py) create
    documents that validate branch.company consistency.
    """
    current_company = frappe.db.get_value("Branch", branch_name, "company")
    if not current_company:
        frappe.db.set_value("Branch", branch_name, "company", company_name)
        print(f"  Linked Branch {branch_name} to Company {company_name}")


def _set_defaults(company_name, branch_name):
    frappe.defaults.set_user_default("Company", company_name)
    frappe.defaults.set_user_default("Branch", branch_name)
    frappe.db.set_default("company", company_name)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def seed_all(company_name=None, branch_name=None):
    """Run every demo-data seeder against the resolved Company/Branch."""
    company_name = _resolve_company(company_name)
    branch_name = _resolve_branch(branch_name, company_name)

    print(f"=== demo_runner: company={company_name}, branch={branch_name} ===")
    _ensure_branch_company(branch_name, company_name)
    _set_defaults(company_name, branch_name)

    results = {}
    for display_name, module in _SEED_MODULES:
        print(f"=== demo_runner: {display_name} ===")
        try:
            result = module.seed()
            results[display_name] = {"ok": True, "result": result}
        except Exception as e:
            results[display_name] = {"ok": False, "error": str(e)}
            print(f"  ! {display_name} failed: {e}")
            frappe.log_error(
                title=f"dev_seed {display_name} failed",
                message=frappe.get_traceback(),
            )
            # Continue with the next seeder so one broken module does not
            # prevent the rest of the demo data from landing.

        frappe.db.commit()

    print("=== demo_runner: done ===")
    return {"company": company_name, "branch": branch_name, "results": results}


# Alias for bench execute consistency.
run = seed_all
