import frappe


def execute():
	# Existing submitted wastage predates the Datetime field. Backfill it from the
	# posting values so the POS closing wastage check keeps working for history.
	frappe.db.sql(
		"""
		UPDATE `tabURY Wastage`
		SET `datetime` = COALESCE(TIMESTAMP(posting_date, posting_time), creation)
		WHERE docstatus = 1 AND `datetime` IS NULL
		"""
	)
