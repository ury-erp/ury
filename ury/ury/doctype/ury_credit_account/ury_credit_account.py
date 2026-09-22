# Copyright (c) 2026, URY and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, getdate, today


class URYCreditAccount(Document):
	def validate(self):
		self.validate_validity_window()
		self.validate_employee_party()

	def validate_validity_window(self):
		if self.valid_from and self.valid_to and getdate(self.valid_to) < getdate(self.valid_from):
			frappe.throw(_("Valid To cannot be earlier than Valid From."))

	def validate_employee_party(self):
		if self.party_type != "Employee" or not self.party:
			return
		employee_branch = frappe.db.get_value("Employee", self.party, "branch")
		if self.branch and employee_branch and employee_branch != self.branch:
			frappe.throw(
				_("Employee {0} belongs to branch {1}, not {2}.").format(
					self.party, employee_branch, self.branch
				)
			)


def is_valid_on(account, on_date=None):
	"""Enabled and inside the validity window on `on_date` (defaults to today)."""
	on_date = getdate(on_date or today())
	if not account.get("enabled"):
		return False
	if account.get("valid_from") and getdate(account["valid_from"]) > on_date:
		return False
	if account.get("valid_to") and getdate(account["valid_to"]) < on_date:
		return False
	return True


def get_outstanding(credit_account):
	"""Total unsettled debt for the account's receivable Customer.

	Consolidated POS Invoices are excluded because their balance has already
	moved onto the Sales Invoice produced by the day-close merge log; counting
	both would double the debt.
	"""
	customer = frappe.db.get_value("URY Credit Account", credit_account, "customer")
	if not customer:
		return 0.0

	pos_total = (
		frappe.db.sql(
			"""
			SELECT COALESCE(SUM(outstanding_amount), 0)
			FROM `tabPOS Invoice`
			WHERE customer = %s
			  AND docstatus = 1
			  AND IFNULL(consolidated_invoice, '') = ''
			""",
			(customer,),
		)[0][0]
		or 0
	)

	sales_total = (
		frappe.db.sql(
			"""
			SELECT COALESCE(SUM(outstanding_amount), 0)
			FROM `tabSales Invoice`
			WHERE customer = %s
			  AND docstatus = 1
			""",
			(customer,),
		)[0][0]
		or 0
	)

	return flt(pos_total) + flt(sales_total)


def get_headroom(credit_account):
	"""Remaining spendable credit, or None when the account has no limit."""
	limit = flt(frappe.db.get_value("URY Credit Account", credit_account, "credit_limit"))
	if not limit:
		return None
	return limit - get_outstanding(credit_account)
