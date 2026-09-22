"""Credit account balances, repayment and payroll hand-off.

A credit bill is an ordinary ERPNext receivable: the POS Invoice submits with
nothing paid, so the debt sits on the holder's customer ledger. Clearing it is
therefore a standard Payment Entry, or -- when the holder repays by having it
withheld from wages -- an HRMS Additional Salary deduction.
"""

import frappe
from frappe import _
from frappe.utils import flt, getdate, nowdate

from ury.ury.api.ury_order_attribution import _profile, _require_role
from ury.ury.doctype.ury_credit_account.ury_credit_account import (
	get_headroom,
	get_outstanding,
	is_valid_on,
)

CREDIT_ROLE_FIELD = "custom_roles_allowed_for_credit"


def _authorize(pos_profile):
	profile = _profile(pos_profile)
	if not profile.get("custom_enable_credit_settlement"):
		frappe.throw(_("Credit settlement is not enabled for this POS Profile."), frappe.PermissionError)
	_require_role(profile, CREDIT_ROLE_FIELD, _("You are not permitted to manage credit accounts."))
	return profile


@frappe.whitelist()
def search_credit_accounts(pos_profile, search=None, limit=20):
	"""Credit accounts selectable at this profile's branch."""
	profile = _authorize(pos_profile)

	filters = {"enabled": 1}
	or_filters = None
	if search:
		or_filters = {
			"name": ["like", f"%{search}%"],
			"party": ["like", f"%{search}%"],
		}

	rows = frappe.get_all(
		"URY Credit Account",
		filters=filters,
		or_filters=or_filters,
		fields=["name", "party_type", "party", "customer", "branch", "credit_limit", "valid_from", "valid_to", "enabled"],
		order_by="account_name asc",
		limit=min(int(limit or 20), 50),
	)

	branch = profile.get("branch")
	return [
		{
			"name": row.name,
			"party_type": row.party_type,
			"party": row.party,
			"credit_limit": flt(row.credit_limit),
			"outstanding": get_outstanding(row.name),
		}
		for row in rows
		if is_valid_on(row) and (not row.branch or not branch or row.branch == branch)
	]


@frappe.whitelist()
def get_credit_balance(credit_account, pos_profile=None):
	"""Outstanding debt and remaining headroom for one account."""
	if pos_profile:
		_authorize(pos_profile)
	elif not frappe.has_permission("URY Credit Account", "read", credit_account):
		frappe.throw(_("Not permitted to read this Credit Account."), frappe.PermissionError)

	if not frappe.db.exists("URY Credit Account", credit_account):
		frappe.throw(_("Credit Account {0} does not exist.").format(credit_account))

	return {
		"credit_account": credit_account,
		"outstanding": get_outstanding(credit_account),
		"credit_limit": flt(frappe.db.get_value("URY Credit Account", credit_account, "credit_limit")),
		"headroom": get_headroom(credit_account),
	}


def _open_invoices(customer):
	"""Unsettled bills for the customer, oldest first, ready for allocation."""
	pos_rows = frappe.db.sql(
		"""
		SELECT name, posting_date, outstanding_amount
		FROM `tabPOS Invoice`
		WHERE customer = %s AND docstatus = 1
		  AND IFNULL(consolidated_invoice, '') = ''
		  AND outstanding_amount > 0
		""",
		(customer,),
		as_dict=True,
	)
	for row in pos_rows:
		row["doctype"] = "POS Invoice"

	sales_rows = frappe.db.sql(
		"""
		SELECT name, posting_date, outstanding_amount
		FROM `tabSales Invoice`
		WHERE customer = %s AND docstatus = 1 AND outstanding_amount > 0
		""",
		(customer,),
		as_dict=True,
	)
	for row in sales_rows:
		row["doctype"] = "Sales Invoice"

	return sorted(pos_rows + sales_rows, key=lambda r: (getdate(r["posting_date"]), r["name"]))


def _mode_of_payment_account(mode_of_payment, company):
	account = frappe.db.get_value(
		"Mode of Payment Account",
		{"parent": mode_of_payment, "company": company},
		"default_account",
	)
	if not account:
		frappe.throw(
			_("Set a default account for Mode of Payment {0} in company {1}.").format(
				mode_of_payment, company
			)
		)
	return account


@frappe.whitelist()
def repay_credit(credit_account, amount, mode_of_payment, pos_profile):
	"""Clear debt with a Payment Entry, allocating oldest bills first."""
	profile = _authorize(pos_profile)

	amount = flt(amount)
	if amount <= 0:
		frappe.throw(_("Repayment amount must be greater than zero."))

	account = frappe.db.get_value(
		"URY Credit Account", credit_account, ["name", "customer"], as_dict=True
	)
	if not account:
		frappe.throw(_("Credit Account {0} does not exist.").format(credit_account))

	outstanding = get_outstanding(account.name)
	if amount > outstanding:
		frappe.throw(
			_("Repayment of {0} exceeds the outstanding balance of {1}.").format(amount, outstanding)
		)

	company = profile.get("company")
	from erpnext.accounts.party import get_party_account

	payment = frappe.new_doc("Payment Entry")
	payment.payment_type = "Receive"
	payment.company = company
	payment.posting_date = nowdate()
	payment.mode_of_payment = mode_of_payment
	payment.party_type = "Customer"
	payment.party = account.customer
	payment.paid_from = get_party_account("Customer", account.customer, company)
	payment.paid_to = _mode_of_payment_account(mode_of_payment, company)
	payment.paid_amount = amount
	payment.received_amount = amount

	remaining = amount
	for invoice in _open_invoices(account.customer):
		if remaining <= 0:
			break
		allocated = min(remaining, flt(invoice["outstanding_amount"]))
		payment.append(
			"references",
			{
				"reference_doctype": invoice["doctype"],
				"reference_name": invoice["name"],
				"allocated_amount": allocated,
			},
		)
		remaining -= allocated

	payment.setup_party_account_field()
	payment.set_missing_values()
	payment.save()
	payment.submit()

	_stamp_repaid(account.customer)

	return {"payment_entry": payment.name, "outstanding": get_outstanding(account.name)}


def _stamp_repaid(customer):
	"""Mark fully-cleared credit bills so the settlement stage reflects reality."""
	for doctype in ("POS Invoice", "Sales Invoice"):
		names = frappe.get_all(
			doctype,
			filters={
				"customer": customer,
				"docstatus": 1,
				"custom_settlement_stage": "Transferred On Credit",
				"outstanding_amount": ["<=", 0],
			},
			pluck="name",
		)
		for name in names:
			frappe.db.set_value(doctype, name, "custom_settlement_stage", "Credit Repaid")


@frappe.whitelist()
def push_to_payroll(credit_account, salary_component, payroll_date=None, amount=None):
	"""Recover debt through wages by raising an HRMS Additional Salary deduction."""
	from ury.ury.report_api.utils import require_manager

	require_manager()

	if "hrms" not in frappe.get_installed_apps():
		frappe.throw(_("Payroll deduction requires the HRMS app to be installed."))

	account = frappe.db.get_value(
		"URY Credit Account",
		credit_account,
		["name", "party_type", "party", "repayment_method"],
		as_dict=True,
	)
	if not account:
		frappe.throw(_("Credit Account {0} does not exist.").format(credit_account))
	if account.party_type != "Employee":
		frappe.throw(_("Only an employee credit account can be recovered through payroll."))
	if account.repayment_method != "Payroll Deduction":
		frappe.throw(_("Credit Account {0} is not set to repay by payroll deduction.").format(account.name))

	if frappe.db.get_value("Salary Component", salary_component, "type") != "Deduction":
		frappe.throw(_("Salary Component {0} is not a deduction.").format(salary_component))

	amount = flt(amount) if amount else get_outstanding(account.name)
	if amount <= 0:
		frappe.throw(_("There is nothing outstanding to recover."))

	additional_salary = frappe.new_doc("Additional Salary")
	additional_salary.employee = account.party
	additional_salary.salary_component = salary_component
	additional_salary.amount = amount
	additional_salary.payroll_date = payroll_date or nowdate()
	additional_salary.company = frappe.db.get_value("Employee", account.party, "company")
	additional_salary.overwrite_salary_structure_amount = 0
	additional_salary.save()
	additional_salary.submit()

	return {"additional_salary": additional_salary.name, "amount": amount}
