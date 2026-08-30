"""
Backfill POS Invoice Item.custom_entered_by_employee from owner field.

Resolves each POS Invoice Item's owner (the Frappe User who added the line) to
an Employee record via the _PICK tie-break logic (imported from
backfill_invoice_employee_attribution).

Idempotent: WHERE IFNULL(..., '') = '' guards ensure this is a no-op on re-run.
"""
from ury.patches.v3_0.backfill_invoice_employee_attribution import _PICK
import frappe


def execute():
    frappe.db.sql(f"""
        UPDATE `tabPOS Invoice Item` it
        JOIN ({_PICK}) m ON m.user_id = it.`owner`
        SET it.`custom_entered_by_employee` = m.employee
        WHERE IFNULL(it.`custom_entered_by_employee`, '') = ''
    """)
    frappe.db.commit()
