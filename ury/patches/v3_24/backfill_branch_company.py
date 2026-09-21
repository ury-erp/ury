"""
One-time backfill for Branch's `company` custom field (fixture
`Branch-company`, a plain Link with no `fetch_from`). Any Branch created
before this field existed has it blank -- discovered live via
sa-kot-cancellation-and-qty-reduction: KOT submission calls
ury_kot_execution_service._kot_scope(), which hard-requires a resolvable
branch->company link and raises ExecutionError("Branch {0} has no
resolvable company scope") otherwise. This affected every Branch row
without a company set on every site restored from a pre-field backup,
not just one bench -- the same shape of gap as
v3_15.backfill_production_unit_company.

Resolution order per blank-company Branch, most to least specific:
1. Any POS Profile linked to this Branch -- take its `company`.
2. If the site has exactly one Company, use it (unambiguous default).
Branches that still can't be resolved (multiple companies, no POS
Profile link) are left blank and counted in the patch's own log line --
those need a human decision, this patch does not guess.
"""
import frappe


def execute():
    if not frappe.db.exists("DocType", "Branch"):
        return
    if not frappe.get_meta("Branch").has_field("company"):
        return

    rows = frappe.get_all("Branch", filters={"company": ["in", ["", None]]}, fields=["name"])
    if not rows:
        return

    single_company = None
    all_companies = frappe.get_all("Company", pluck="name")
    if len(all_companies) == 1:
        single_company = all_companies[0]

    updated = 0
    unresolved = 0
    for row in rows:
        company = frappe.db.get_value("POS Profile", {"branch": row.name}, "company")
        if not company:
            company = single_company
        if company:
            frappe.db.set_value("Branch", row.name, "company", company, update_modified=False)
            updated += 1
        else:
            unresolved += 1

    if updated:
        frappe.db.commit()
    if unresolved:
        frappe.logger().warning(
            f"backfill_branch_company: {unresolved} Branch row(s) could not be resolved to a "
            "company (multiple companies exist and no POS Profile links to that branch) -- "
            "set Branch.company manually for those."
        )
