# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt
#
# Guest feedback: a public write path, and a staff read path.
#
# The public half is the dangerous half. A guest submitting a rating is not
# signed in and never will be, so the link they arrive with has to prove by
# itself which branch — and which bill — it belongs to. The link is signed
# with the site's own key and carries no personal data, so a leaked link
# reveals nothing and lets nobody rate on someone else's behalf twice.

import frappe
from frappe import _
from frappe.rate_limiter import rate_limit
from frappe.utils import cint, now_datetime, today

from ury.ury.signed_links import make_token, read_token as read_signed_token, signed_url

from ury.ury.doctype.ury_guest_feedback.ury_guest_feedback import (
	DETRACTOR_AT_OR_BELOW,
	MAX_RECOMMEND,
	MAX_STARS,
	STAR_FIELDS,
	net_promoter_score,
)

# Two kinds of link. A receipt link is about one meal and may be used once; a
# table link is a card on the table that anybody sitting there may use.
INVOICE_SCOPE = "invoice"
BRANCH_SCOPE = "branch"


def read_token(token):
	"""Scope and reference from a feedback link, or a refusal.

	Only the two feedback scopes are honoured here: a driver's tracking link
	is signed with the same key, and this endpoint must not accept it.
	"""
	return read_signed_token(
		token, (INVOICE_SCOPE, BRANCH_SCOPE), _("This feedback link is not valid.")
	)


def feedback_url(scope, reference):
	return signed_url("/feedback", scope, reference)


@frappe.whitelist()
def get_feedback_link(invoice=None, branch=None):
	"""Staff-only: the link or QR to hand a guest.

	Permission is checked against the thing being linked, not against this
	module, so a cashier can mint a link for the bill they just settled and
	nothing else.
	"""
	if invoice:
		doc = frappe.get_doc("POS Invoice", invoice)
		doc.check_permission("read")
		return {"url": feedback_url(INVOICE_SCOPE, invoice), "scope": INVOICE_SCOPE}

	if not branch:
		frappe.throw(_("Name an invoice or a branch."))
	if not frappe.has_permission("Branch", "read", branch):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	return {"url": feedback_url(BRANCH_SCOPE, branch), "scope": BRANCH_SCOPE}


def _context_for(scope, reference):
	"""What the public page needs to render, and nothing more."""
	if scope == INVOICE_SCOPE:
		invoice = frappe.db.get_value(
			"POS Invoice", reference,
			["name", "branch", "restaurant_table", "owner", "posting_date"],
			as_dict=True,
		)
		if not invoice:
			frappe.throw(_("This feedback link is not valid."), frappe.DoesNotExistError)
		return {
			"scope": scope,
			"branch": invoice.branch,
			"invoice": invoice.name,
			"table": invoice.restaurant_table,
			"served_by": invoice.owner,
			# Deliberately absent: the amount, the items, the customer. The
			# link may be forwarded, photographed or left on the table, and
			# none of that should show a stranger what someone ate or paid.
			"already_submitted": bool(
				frappe.db.exists("URY Guest Feedback", {"invoice": invoice.name})
			),
		}

	if not frappe.db.exists("Branch", reference):
		frappe.throw(_("This feedback link is not valid."), frappe.DoesNotExistError)
	return {
		"scope": scope, "branch": reference, "invoice": None, "table": None,
		"served_by": None, "already_submitted": False,
	}


@frappe.whitelist(allow_guest=True, methods=["GET"])
@rate_limit(limit=30, seconds=60)
def page_context(token):
	"""Public: what this link is for."""
	scope, reference = read_token(token)
	context = _context_for(scope, reference)
	context["restaurant_name"] = frappe.db.get_value("Branch", context["branch"], "branch") or ""
	context.pop("served_by", None)
	return context


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=6, seconds=3600)
def submit_feedback(token, overall, food=None, service=None, cleanliness=None,
					recommend_score=None, comment=None, contact_number=None):
	"""Public: record one guest's rating.

	Written with `ignore_permissions` because the author is a guest with no
	account by design. Everything that decides *what* is written comes from
	the signed token rather than the request: the branch, the invoice and the
	member of staff are all read server-side, so the only things a guest can
	set are their own opinions.
	"""
	scope, reference = read_token(token)
	context = _context_for(scope, reference)

	if context["already_submitted"]:
		# Not an error the guest should see as a failure: their rating is
		# already recorded, and saying so is friendlier than a duplicate-key
		# message — and it keeps one bill to one rating.
		return {"status": "already_submitted"}

	doc = frappe.get_doc({
		"doctype": "URY Guest Feedback",
		"branch": context["branch"],
		"invoice": context["invoice"],
		"restaurant_table": context["table"],
		"served_by": context["served_by"],
		"source": "Receipt" if scope == INVOICE_SCOPE else "Table",
		"submitted_at": now_datetime(),
		"overall": cint(overall),
		"food": cint(food) if food not in (None, "") else None,
		"service": cint(service) if service not in (None, "") else None,
		"cleanliness": cint(cleanliness) if cleanliness not in (None, "") else None,
		"recommend_score": cint(recommend_score) if recommend_score not in (None, "") else None,
		"comment": (comment or "")[:1000],
		"contact_number": (contact_number or "")[:20],
		"status": "New",
	})
	doc.insert(ignore_permissions=True)

	return {"status": "recorded", "name": doc.name, "detractor": doc.is_detractor}


@frappe.whitelist()
def get_feedback(from_date=None, to_date=None, status=None, branch=None, limit=100):
	"""Staff: ratings for a branch, newest first."""
	from ury.ury_pos.api import getBranch

	branch = branch if (frappe.session.user == "Administrator" and branch) else getBranch()

	filters = {"branch": branch}
	if status:
		filters["status"] = status
	if from_date and to_date:
		filters["submitted_at"] = ["between", [from_date, to_date]]
	elif from_date:
		filters["submitted_at"] = [">=", from_date]

	return frappe.get_list(
		"URY Guest Feedback",
		filters=filters,
		fields=["name", "branch", "invoice", "restaurant_table", "submitted_at", "served_by",
				"source", "overall", "food", "service", "cleanliness", "recommend_score",
				"comment", "contact_number", "status", "follow_up_notes"],
		order_by="submitted_at desc",
		limit_page_length=cint(limit) or 100,
	)


@frappe.whitelist()
def get_feedback_summary(from_date=None, to_date=None, branch=None):
	"""The numbers a manager acts on: averages, NPS, and what is unanswered."""
	rows = get_feedback(from_date=from_date, to_date=to_date, branch=branch, limit=1000)

	def average(field):
		values = [cint(row[field]) for row in rows if row.get(field)]
		return round(sum(values) / len(values), 2) if values else None

	detractors = [row for row in rows if cint(row["overall"]) <= DETRACTOR_AT_OR_BELOW]

	return {
		"responses": len(rows),
		"averages": {field: average(field) for field in STAR_FIELDS},
		"nps": net_promoter_score([row["recommend_score"] for row in rows]),
		"detractors": len(detractors),
		"unanswered_detractors": sum(1 for row in detractors if row["status"] == "New"),
		"with_comment": sum(1 for row in rows if (row.get("comment") or "").strip()),
		"awaiting_contact": sum(
			1 for row in detractors
			if (row.get("contact_number") or "").strip() and row["status"] == "New"
		),
		"max_stars": MAX_STARS,
		"max_recommend": MAX_RECOMMEND,
	}


@frappe.whitelist()
def set_feedback_status(feedback, status, follow_up_notes=None):
	"""Staff: mark a rating as seen or dealt with."""
	doc = frappe.get_doc("URY Guest Feedback", feedback)
	doc.check_permission("write")
	doc.status = status
	if follow_up_notes is not None:
		doc.follow_up_notes = follow_up_notes
	doc.save()
	return {"name": doc.name, "status": doc.status}


@frappe.whitelist()
def get_branch_feedback_card(branch=None):
	"""The table-card link for a branch, with a QR to print beside it.

	The SVG is rendered here rather than in the browser for the same reason
	the ordering codes are: the code has to be identical whether it is shown
	on a screen, printed, or downloaded, and a client-side generator gives
	three slightly different codes.
	"""
	from ury.ury.api.self_ordering_qr import _render_svg
	from ury.ury_pos.api import getBranch

	branch = branch if (frappe.session.user == "Administrator" and branch) else getBranch()
	if not frappe.has_permission("Branch", "read", branch):
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	url = feedback_url(BRANCH_SCOPE, branch)
	try:
		svg = _render_svg(url)
	except Exception:
		# A missing QR library must not take the link with it: the URL alone
		# is still usable, and the page says so.
		svg = None

	return {"url": url, "svg": svg, "branch": branch, "as_of": today()}
