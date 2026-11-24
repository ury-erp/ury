import json

import frappe
from frappe import _
from frappe.query_builder.functions import Coalesce, Sum
from frappe.utils import flt, getdate

from ury.ury.approval.config import control_enabled, get_approval_levels
from ury.ury.approval.documents import approval_branch, validate_mixed_branch
from ury.ury.approval.service import (
	assert_approved,
	document_hash,
	invalidate_requests,
	request_approval,
)


def validate(doc, method=None):
	branch = approval_branch(doc)
	doc.flags.ury_expense_approval_required = False
	if not branch or doc.flags.ury_mixed_branches or not control_enabled(branch, "expense"):
		return
	if not doc.name:
		doc.set_new_name()
	groups = {}
	rows = expense_rows(doc)
	if not rows:
		frappe.msgprint(
			_("No budget was found for this expense; no expense approval was triggered."),
			indicator="orange",
		)
	for row in rows:
		if frappe.db.get_value("Account", row.expense_account, "root_type") != "Expense":
			continue
		match = _find_budget(doc, row)
		if not match:
			frappe.msgprint(
				_("No budget was found for {0} against cost center {1}; no expense approval was triggered.").format(
					row.expense_account, row.cost_center
				),
				indicator="orange",
			)
			continue
		budget, distribution = match
		key = (budget.name, distribution.name, row.expense_account, row.cost_center)
		groups.setdefault(key, {"budget": budget, "distribution": distribution, "amount": 0})
		groups[key]["amount"] += flt(row.amount)
	if not groups:
		release_reservations(doc)
		invalidate_requests(doc, "expense", remarks="No applicable budget remains")
		return
	requires_higher_approval = False
	details = []
	for (budget_name, distribution_name, account, cost_center), group in groups.items():
		budget = group["budget"]
		distribution = group["distribution"]
		amount = group["amount"]
		_lock_budget(budget_name)
		available = available_budget(budget, distribution, doc, account, cost_center)
		if amount > available:
			requires_higher_approval = True
		details.append(
			{
				"budget": budget_name,
				"distribution": distribution_name,
				"available": available,
				"amount": amount,
				"account": account,
				"cost_center": cost_center,
			}
		)
		_upsert_reservation(doc, branch, budget, distribution, account, cost_center, amount)
	levels = get_approval_levels(branch, "expense", doc)
	if not requires_higher_approval:
		levels = levels[:1]
	total = sum(group["amount"] for group in groups.values())
	if total <= 0:
		release_reservations(doc)
		invalidate_requests(doc, "expense", remarks="Return or reversal requires no expense reservation")
		return
	request_approval(
		doc,
		"expense",
		branch,
		levels=levels,
		amount=total,
		details=json.dumps(details, sort_keys=True),
	)
	doc.flags.ury_expense_approval_required = True


def before_submit(doc, method=None):
	validate_mixed_branch(doc)
	branch = approval_branch(doc)
	if branch and control_enabled(branch, "expense") and doc.flags.ury_expense_approval_required:
		assert_approved(doc, "expense")


def on_submit(doc, method=None):
	for reservation in _reservations(doc, status="Reserved"):
		reservation.status = "Consumed"
		reservation.save(ignore_permissions=True)


def on_cancel(doc, method=None):
	release_reservations(doc)
	branch = approval_branch(doc)
	if branch and control_enabled(branch, "expense"):
		invalidate_requests(doc, "expense", remarks="Source document cancelled")


def release_for_request(request_doc):
	if request_doc.control_type != "expense":
		return
	doc = frappe._dict({"doctype": request_doc.reference_doctype, "name": request_doc.reference_name})
	release_reservations(doc)


def release_reservations(doc):
	for reservation in _reservations(doc, status=["Reserved", "Consumed"]):
		reservation.status = "Released"
		reservation.save(ignore_permissions=True)


def expense_rows(doc):
	posting_date = getdate(doc.get("posting_date") or doc.get("transaction_date") or doc.get("expense_date"))
	if doc.doctype == "Employee Advance":
		if not doc.get("custom_ury_expense_account") or not doc.get("custom_ury_cost_center"):
			return []
		return [
			frappe._dict(
				expense_account=doc.custom_ury_expense_account,
				cost_center=doc.custom_ury_cost_center,
				amount=doc.advance_amount,
				posting_date=posting_date,
			)
		]
	rows = []
	for item in doc.get("items") or doc.get("expenses") or []:
		account = item.get("expense_account") or item.get("default_account")
		cost_center = item.get("cost_center") or doc.get("cost_center")
		if account and cost_center:
			rows.append(
				frappe._dict(
					expense_account=account,
					cost_center=cost_center,
					amount=item.get("base_amount") or item.get("amount"),
					posting_date=getdate(item.get("expense_date") or posting_date),
				)
			)
	return rows


def available_budget(budget, distribution, doc, account, cost_center):
	actual = _actual_expense(budget.company, account, cost_center, distribution.start_date, distribution.end_date)
	commitments = _purchase_order_commitments(
		budget.company, account, cost_center, distribution.start_date, distribution.end_date
	) + _material_request_commitments(
		budget.company, account, cost_center, distribution.start_date, distribution.end_date
	)
	reserved = _other_reservations(budget.name, distribution.name, doc)
	return flt(distribution.amount) - flt(actual) - flt(commitments) - flt(reserved)


def _find_budget(doc, row):
	budgets = frappe.get_all(
		"Budget",
		filters={
			"docstatus": 1,
			"company": doc.company,
			"account": row.expense_account,
			"budget_against": "Cost Center",
			"cost_center": row.cost_center,
			"budget_start_date": ["<=", row.posting_date],
			"budget_end_date": [">=", row.posting_date],
		},
		fields=["name", "company", "budget_amount", "distribution_frequency"],
		limit=1,
	)
	if not budgets:
		return None
	if frappe.db.get_value("Cost Center", row.cost_center, "branch") != approval_branch(doc):
		return None
	budget = frappe._dict(budgets[0])
	distributions = frappe.get_all(
		"Budget Distribution",
		filters={
			"parent": budget.name,
			"start_date": ["<=", row.posting_date],
			"end_date": [">=", row.posting_date],
		},
		fields=["name", "start_date", "end_date", "amount"],
		limit=1,
	)
	return (budget, frappe._dict(distributions[0])) if distributions else None


def _actual_expense(company, account, cost_center, start_date, end_date):
	gl = frappe.qb.DocType("GL Entry")
	query = (
		frappe.qb.from_(gl)
		.select(Coalesce(Sum(gl.debit - gl.credit), 0).as_("amount"))
		.where(
			(gl.company == company)
			& (gl.account == account)
			& (gl.cost_center == cost_center)
			& (gl.docstatus == 1)
			& (gl.is_cancelled == 0)
			& (gl.posting_date >= start_date)
			& (gl.posting_date <= end_date)
		)
	)
	return flt(query.run()[0][0])


def _purchase_order_commitments(company, account, cost_center, start_date, end_date):
	po = frappe.qb.DocType("Purchase Order")
	item = frappe.qb.DocType("Purchase Order Item")
	query = (
		frappe.qb.from_(po)
		.inner_join(item)
		.on(po.name == item.parent)
		.select(Coalesce(Sum((item.amount - item.billed_amt) * Coalesce(po.conversion_rate, 1)), 0).as_("amount"))
		.where(
			(po.company == company)
			& (po.docstatus == 1)
			& (po.status != "Closed")
			& (po.transaction_date >= start_date)
			& (po.transaction_date <= end_date)
			& (item.amount > item.billed_amt)
			& (item.expense_account == account)
			& (item.cost_center == cost_center)
		)
	)
	return flt(query.run()[0][0])


def _material_request_commitments(company, account, cost_center, start_date, end_date):
	mr = frappe.qb.DocType("Material Request")
	item = frappe.qb.DocType("Material Request Item")
	query = (
		frappe.qb.from_(mr)
		.inner_join(item)
		.on(mr.name == item.parent)
		.select(
			Coalesce(Sum((item.stock_qty - item.ordered_qty) * item.rate / item.conversion_factor), 0).as_("amount")
		)
		.where(
			(mr.company == company)
			& (mr.docstatus == 1)
			& (mr.material_request_type == "Purchase")
			& (mr.status != "Stopped")
			& (mr.transaction_date >= start_date)
			& (mr.transaction_date <= end_date)
			& (item.stock_qty > item.ordered_qty)
			& (item.expense_account == account)
			& (item.cost_center == cost_center)
		)
	)
	return flt(query.run()[0][0])


def _other_reservations(budget, distribution, doc):
	rows = frappe.qb.get_query(
		"URY Budget Reservation",
		filters={"budget": budget, "budget_distribution": distribution, "status": "Reserved"},
		fields=["reference_doctype", "reference_name", "amount"],
		for_update=True,
	).run(as_dict=True)
	return sum(
		flt(row.amount)
		for row in rows
		if not (row.reference_doctype == doc.doctype and row.reference_name == doc.name)
	)


def _upsert_reservation(doc, branch, budget, distribution, account, cost_center, amount):
	filters = {
		"reference_doctype": doc.doctype,
		"reference_name": doc.name,
		"budget": budget.name,
		"budget_distribution": distribution.name,
	}
	name = frappe.db.exists("URY Budget Reservation", filters)
	values = {
		"branch": branch,
		"company": budget.company,
		"expense_account": account,
		"cost_center": cost_center,
		"period_start": distribution.start_date,
		"period_end": distribution.end_date,
		"amount": max(flt(amount), 0),
		"status": "Reserved" if amount > 0 else "Released",
		"document_version_hash": document_hash(doc),
	}
	if name:
		reservation = frappe.get_doc("URY Budget Reservation", name)
		reservation.update(values)
	else:
		reservation = frappe.get_doc(
			{"doctype": "URY Budget Reservation", **filters, **values}
		)
	if name:
		reservation.save(ignore_permissions=True)
	else:
		reservation.insert(ignore_permissions=True)


def _reservations(doc, status):
	if isinstance(status, str):
		status = [status]
	filters = {"reference_doctype": doc.doctype, "reference_name": doc.name, "status": ["in", status]}
	return [frappe.get_doc("URY Budget Reservation", row.name) for row in frappe.get_all("URY Budget Reservation", filters=filters)]


def _lock_budget(budget_name):
	frappe.qb.get_query("Budget", fields=["name"], filters={"name": budget_name}, for_update=True).run()
