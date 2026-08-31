"""
Backfill custom_waiter_employee and custom_closing_employee on invoices.

Resolves waiter/cashier (User docnames) to Employee records via Employee.user_id,
filling custom_waiter_employee and custom_closing_employee respectively.

Handles the case where multiple Employee records share the same user_id via a
deterministic tie-break: Active status first, then earliest joining date, then
lowest name.

IMPORTANT: Unresolvable historical rows are left with custom_waiter_employee/
custom_closing_employee = NULL — not dropped, not guessed. Recovery: fix the
Employee record's user_id, then re-run this patch via:
    bench --site <site> execute ury.patches.v3_0.backfill_invoice_employee_attribution.execute

The patch is idempotent and only fills blanks, never overwrites a manual correction.

Idempotent: WHERE IFNULL(..., '') = '' guards ensure this is a no-op on re-run.
"""
import frappe
from frappe.utils.fixtures import sync_fixtures

_PICK = """
    SELECT e.user_id, e.name AS employee
    FROM `tabEmployee` e
    JOIN (
        SELECT user_id, MIN(CONCAT(
            CASE WHEN status = 'Active' THEN '0' ELSE '1' END, '|',
            LPAD(IFNULL(DATEDIFF(date_of_joining, '1970-01-01'), 999999), 6, '0'), '|',
            name)) AS pick
        FROM `tabEmployee`
        WHERE IFNULL(user_id, '') != ''
        GROUP BY user_id
    ) p ON p.user_id = e.user_id
       AND p.pick = CONCAT(
            CASE WHEN e.status = 'Active' THEN '0' ELSE '1' END, '|',
            LPAD(IFNULL(DATEDIFF(e.date_of_joining, '1970-01-01'), 999999), 6, '0'), '|',
            e.name)
"""


def execute():
    # custom_waiter_employee/custom_closing_employee are fixture-declared
    # custom fields (ury/fixtures/custom_field.json). bench migrate runs
    # post_model_sync patches (this one included) BEFORE syncing fixtures,
    # so on a genuinely fresh install these columns don't exist yet when
    # this patch first runs. Sync fixtures here so the columns are always
    # present before the raw SQL below touches them -- sync_fixtures is
    # itself idempotent, so this is a no-op on later re-runs.
    for dt in ("POS Invoice", "Sales Invoice"):
        for dest in ("custom_waiter_employee", "custom_closing_employee"):
            if not frappe.db.has_column(dt, dest):
                sync_fixtures(app="ury")
                break

    for dt in ("POS Invoice", "Sales Invoice"):
        for src, dest in (("waiter", "custom_waiter_employee"),
                          ("cashier", "custom_closing_employee")):
            frappe.db.sql(f"""
                UPDATE `tab{dt}` inv
                JOIN ({_PICK}) m ON m.user_id = inv.`{src}`
                SET inv.`{dest}` = m.employee
                WHERE IFNULL(inv.`{dest}`, '') = ''
                  AND IFNULL(inv.`{src}`, '') != ''
            """)
            frappe.db.commit()
