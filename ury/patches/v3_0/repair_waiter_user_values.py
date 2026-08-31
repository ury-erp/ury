"""
Repair waiter/cashier values on POS Invoice and Sales Invoice.

Resolves waiter/cashier values that nearly match a real User (whitespace/case
differences) to the canonical User name. Logs (via frappe.log_error) any values
that don't resolve to a User at all. Never blanks an unresolvable value.

Idempotent: WHERE clause guards ensure this is a no-op on re-run.
"""
import frappe


def execute():
    for dt in ("POS Invoice", "Sales Invoice"):
        for field in ("waiter", "cashier"):
            frappe.db.sql(f"""
                UPDATE `tab{dt}` inv
                JOIN `tabUser` u ON LOWER(TRIM(inv.`{field}`)) = LOWER(u.`name`)
                SET inv.`{field}` = u.`name`
                WHERE inv.`{field}` IS NOT NULL AND inv.`{field}` != ''
                  AND inv.`{field}` != u.`name`
            """)
            residue = frappe.db.sql(f"""
                SELECT COUNT(*) FROM `tab{dt}` inv
                LEFT JOIN `tabUser` u ON u.`name` = inv.`{field}`
                WHERE inv.`{field}` IS NOT NULL AND inv.`{field}` != '' AND u.`name` IS NULL
            """)[0][0]
            if residue:
                frappe.log_error(
                    title="URY commission migration",
                    message=f"{residue} `{dt}`.`{field}` values do not resolve to a User; "
                            f"they will render as broken links and stay unattributed.",
                )
    frappe.db.commit()
