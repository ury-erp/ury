import frappe

from ury.ury.report_api.utils import require_manager


@frappe.whitelist()
def get_credit_outstanding(branch=None, only_with_balance=1):
	"""Debt ledger by credit holder.

	Consolidated POS Invoices are skipped because their balance has already
	moved onto the Sales Invoice produced at day close; counting both would
	double every debt.
	"""
	require_manager()

	params = {}
	branch_filter = ""
	if branch:
		branch_filter = "AND (IFNULL(ca.`branch`, '') = '' OR ca.`branch` = %(branch)s)"
		params["branch"] = branch

	rows = frappe.db.sql(
		f"""
		SELECT
			ca.`name` AS credit_account,
			ca.`party_type` AS party_type,
			ca.`party` AS party,
			ca.`branch` AS branch,
			ca.`credit_limit` AS credit_limit,
			ca.`repayment_method` AS repayment_method,
			ROUND(COALESCE(SUM(inv.`outstanding_amount`), 0), 2) AS outstanding,
			MIN(inv.`posting_date`) AS oldest_invoice_date,
			COUNT(inv.`name`) AS open_invoices
		FROM `tabURY Credit Account` ca
		LEFT JOIN (
			SELECT `customer`, `name`, `posting_date`, `outstanding_amount`
			FROM `tabPOS Invoice`
			WHERE `docstatus` = 1
			  AND IFNULL(`consolidated_invoice`, '') = ''
			  AND `outstanding_amount` > 0
			UNION ALL
			SELECT `customer`, `name`, `posting_date`, `outstanding_amount`
			FROM `tabSales Invoice`
			WHERE `docstatus` = 1 AND `outstanding_amount` > 0
		) inv ON inv.`customer` = ca.`customer`
		WHERE ca.`enabled` = 1 {branch_filter}
		GROUP BY ca.`name`
		ORDER BY outstanding DESC
		""",
		params,
		as_dict=True,
	)

	if int(only_with_balance or 0):
		rows = [row for row in rows if row["outstanding"]]

	for row in rows:
		limit = row["credit_limit"] or 0
		row["headroom"] = round(limit - row["outstanding"], 2) if limit else None

	return {
		"branch": branch,
		"accounts": rows,
		"summary": {
			"total_accounts": len(rows),
			"total_outstanding": round(sum(row["outstanding"] for row in rows), 2),
		},
	}
