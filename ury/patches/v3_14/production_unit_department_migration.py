"""
One-time migration: create URY Production Department records from existing
URY Production Unit rows and attach each unit to its new department.

Wraps ury.ury.services.production_unit_department_migration, which was
previously unwired (not referenced from patches.txt, after_migrate, or any
whitelisted endpoint). The module's own test
(test_apply_idempotency_key_changes_with_effective_payload in
ury/ury/services/test_production_unit_department_migration.py) asserts that
re-running apply_production_department_migration is NOT idempotent when the
target department row doesn't already exist -- so this must run exactly once
per site via the patch framework, not from after_migrate (which reruns on
every `bench migrate`).

No-op safeguards already in the wrapped function:
  - Skipped entirely if the URY Production Department DocType does not exist
    on this site (skipped_reason == "target_doctype_missing").
  - Skipped entirely if there are no URY Production Unit rows (empty plan).
  - Per-row skips (ambiguous/missing company or cost center) are recorded in
    plan["skipped"] and logged, not raised.
"""
import frappe

from ury.ury.services.production_unit_department_migration import (
    apply_production_department_migration,
)


def execute():
    if not frappe.db.exists("DocType", "URY Production Department"):
        return

    plan = apply_production_department_migration(dry_run=False)

    if plan.get("skipped"):
        frappe.log_error(
            title="URY production unit -> department migration",
            message=(
                f"{len(plan['skipped'])} URY Production Unit row(s) could not be "
                f"migrated to URY Production Department (ambiguous/missing company "
                f"or cost center): {plan['skipped']}"
            ),
        )

    frappe.db.commit()
