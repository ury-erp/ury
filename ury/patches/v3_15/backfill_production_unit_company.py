"""
One-time backfill for URY Production Unit's existing `company` custom
field (fixture `URY Production Unit-company`), which this same change
wires to `fetch_from: department.company` (it was previously a plain,
never-populated Link field). ury_item_production_configuration.py's own
validate_link_ownership() reads `production_unit.company` to enforce
company-scoping -- since the field was always blank, every URY Item
Production Configuration row with a `production_unit` set has always
failed that validation with "Production Unit {0} must belong to Company
{1}". This affected every production-config row on every site with a
production_unit assigned, not just this one bench.

`fetch_from` only populates on save when the source field (`department`)
changes -- it does not retroactively backfill existing rows, so this patch
sets `company` directly from each row's linked department for every
existing URY Production Unit.
"""
import frappe


def execute():
    if not frappe.db.exists("DocType", "URY Production Unit"):
        return

    rows = frappe.get_all(
        "URY Production Unit",
        filters={"company": ["in", ["", None]]},
        fields=["name", "department"],
    )
    updated = 0
    for row in rows:
        if not row.department:
            continue
        company = frappe.db.get_value("URY Production Department", row.department, "company")
        if company:
            frappe.db.set_value("URY Production Unit", row.name, "company", company, update_modified=False)
            updated += 1

    if updated:
        frappe.db.commit()
