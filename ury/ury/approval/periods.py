import frappe
from frappe import _
from frappe.utils import add_days, add_months, get_first_day, get_last_day, getdate, now_datetime, nowdate

from ury.ury.approval.config import control_enabled
from ury.ury.approval.documents import approval_branch, validate_mixed_branch
from ury.ury.approval.service import assert_approved, invalidate_requests, request_approval


@frappe.whitelist(methods=["POST"])
def finalize_period(branch, year, month):
	_require_finance_head()
	period_start = get_first_day(getdate(f"{int(year)}-{int(month):02d}-01"))
	period_end = get_last_day(period_start)
	name = frappe.db.exists("URY Period Lock", {"branch": branch, "period_end": period_end})
	values = {
		"branch": branch,
		"period_start": period_start,
		"period_end": period_end,
		"status": "Finalized",
		"finalized_by": frappe.session.user,
		"finalized_at": now_datetime(),
		"reopened_by": None,
		"reopened_at": None,
	}
	if name:
		doc = frappe.get_doc("URY Period Lock", name)
		doc.update(values)
		doc.flags.ury_period_lock_internal = True
		doc.save()
	else:
		doc = frappe.get_doc({"doctype": "URY Period Lock", **values})
		doc.flags.ury_period_lock_internal = True
		doc.insert()
	return doc


@frappe.whitelist(methods=["POST"])
def reopen_period(branch, year, month, remarks=None):
	_require_finance_head()
	period_start = get_first_day(getdate(f"{int(year)}-{int(month):02d}-01"))
	period_end = get_last_day(period_start)
	name = frappe.db.exists("URY Period Lock", {"branch": branch, "period_end": period_end})
	if not name:
		frappe.throw(_("No finalized period exists for this branch and month"))
	doc = frappe.get_doc("URY Period Lock", name)
	doc.status = "Reopened"
	doc.reopened_by = frappe.session.user
	doc.reopened_at = now_datetime()
	doc.remarks = remarks
	doc.flags.ury_period_lock_internal = True
	doc.save()
	return doc


def validate(doc, method=None):
	branch = approval_branch(doc)
	doc.flags.ury_backdated_approval_required = False
	if not branch or doc.flags.ury_mixed_branches or not control_enabled(branch, "backdated"):
		return
	posting_date = getdate(doc.get("posting_date") or doc.get("transaction_date"))
	period = _locked_period(branch, posting_date)
	if not period:
		invalidate_requests(doc, "backdated", remarks="Posting date is outside a locked period")
		return
	request_approval(
		doc,
		"backdated",
		branch,
		amount=doc.get("base_grand_total") or doc.get("base_paid_amount") or doc.get("advance_amount"),
		details=f"Locked period: {period['start']} to {period['end']}",
	)
	doc.flags.ury_backdated_approval_required = True
	frappe.msgprint(
		_("This entry is in a locked period and requires backdated exception approval."),
		indicator="orange",
		alert=True,
	)


def before_submit(doc, method=None):
	validate_mixed_branch(doc)
	branch = approval_branch(doc)
	if branch and control_enabled(branch, "backdated") and doc.flags.ury_backdated_approval_required:
		assert_approved(doc, "backdated")


def on_cancel(doc, method=None):
	branch = approval_branch(doc)
	if branch and control_enabled(branch, "backdated"):
		invalidate_requests(doc, "backdated", remarks="Source document cancelled")


def _locked_period(branch, posting_date):
	config = frappe.get_cached_doc("Branch", branch)
	posting_date = getdate(posting_date)
	if posting_date >= get_first_day(getdate(nowdate())):
		return None
	if config.custom_ury_pnl_finalization_required:
		periods = frappe.get_all(
			"URY Period Lock",
			filters={
				"branch": branch,
				"period_end": [">=", posting_date],
				"status": "Finalized",
			},
			fields=["period_start", "period_end"],
			order_by="period_end asc",
			limit=1,
		)
		if not periods:
			return None
		period_start = getdate(periods[0].period_start)
		period_end = getdate(periods[0].period_end)
	else:
		period_start = get_first_day(posting_date)
		period_end = get_last_day(posting_date)
	next_month = get_first_day(add_months(period_start, 1))
	lock_day = min(config.custom_ury_backdated_lock_day or 5, get_last_day(next_month).day)
	activation_date = add_days(next_month, lock_day - 1)
	if getdate(nowdate()) < getdate(activation_date):
		return None
	return {"start": period_start, "end": period_end}


def _require_finance_head():
	if "Finance Head" not in frappe.get_roles():
		frappe.throw(_("Only the Finance Head can finalize or reopen a period"), frappe.PermissionError)
