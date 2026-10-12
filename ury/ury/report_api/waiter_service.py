"""Manager report of guest-funded service charges owed to waiters.

The POS Invoice is the source of truth: submission fixes both the charge and
its credited employee. The charge posts to the configured liability account.
This report shows accrued amounts; any later payout must clear that ledger.
"""

import frappe
from frappe.utils import flt

from ury.ury.report_api.utils import (
    get_business_day_range_condition,
    report_settings_join,
    require_manager,
    validate_date_range,
)


@frappe.whitelist()
def get_waiter_service_payables(start_date, end_date, branch=None):
    require_manager()
    validate_date_range(start_date, end_date)
    params = {"start_date": start_date, "end_date": end_date, "branch": branch}
    branch_filter = "AND b.`branch` = %(branch)s" if branch else ""
    rows = frappe.db.sql(
        f"""
        SELECT b.`name` AS invoice, b.`posting_date`, b.`branch`,
               b.`custom_waiter_employee` AS employee,
               e.`employee_name`, b.`currency`,
               b.`custom_service_charge_amount` AS amount
        FROM `tabPOS Invoice` b
        LEFT JOIN `tabEmployee` e ON e.`name` = b.`custom_waiter_employee`
        {report_settings_join()}
        WHERE b.`docstatus` = 1
          AND b.`status` IN ('Paid', 'Consolidated')
          AND IFNULL(b.`custom_service_charge_amount`, 0) > 0
          {branch_filter}
          AND {get_business_day_range_condition()}
        ORDER BY b.`posting_date` DESC, b.`name` DESC
        """,
        params,
        as_dict=True,
    )
    employees = {}
    currency_totals = {}
    for row in rows:
        entry = employees.setdefault((row.employee, row.currency), {
            "employee": row.employee,
            "employee_name": row.employee_name or row.employee,
            "currency": row.currency,
            "amount": 0,
            "invoices": 0,
        })
        entry["amount"] += flt(row.amount)
        entry["invoices"] += 1
        currency_totals[row.currency] = currency_totals.get(row.currency, 0) + flt(row.amount)
    for entry in employees.values():
        entry["amount"] = flt(entry["amount"], 2)
    return {
        "employees": sorted(employees.values(), key=lambda entry: entry["employee_name"] or ""),
        "invoices": rows,
        "totals": [
            {"currency": currency, "amount": flt(amount, 2)}
            for currency, amount in sorted(currency_totals.items())
        ],
    }
