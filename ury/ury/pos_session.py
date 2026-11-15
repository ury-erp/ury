"""The till: one open POS session per POS Profile at a time.

Cashiers hand over by closing their shift; the next cashier then opens a
new session. Several sessions a day are fine, one after another. ERPNext
16 also refuses orders against a session opened on an earlier day, so the
till must be closed and opened again after midnight.
"""

import frappe
from frappe import _
from frappe.utils import formatdate, getdate, today


def open_session(pos_profile: str):
	"""The open session of this POS Profile, or None."""
	if not pos_profile:
		return None
	rows = frappe.get_all(
		"POS Opening Entry",
		filters={"pos_profile": pos_profile, "status": "Open", "docstatus": 1},
		fields=["name", "user", "period_start_date"],
		order_by="period_start_date desc",
		limit=1,
	)
	return rows[0] if rows else None


def current_cashier(pos_profile_doc) -> str:
	"""Whose till an order belongs to: the cashier who opened the session
	that is open now. Falls back to the profile's first user."""
	session = open_session(pos_profile_doc.name)
	if session and session.user:
		return session.user
	users = pos_profile_doc.get("applicable_for_users") or []
	return users[0].user if users else frappe.session.user


def explain_error(error) -> str | None:
	"""A plain explanation for ERPNext's till errors, or None for other errors."""
	text = str(error)
	if "is outdated" in text or "Outdated POS Opening Entry" in text:
		return _(
			"The till was opened on an earlier day. The cashier, or a manager, must close it and"
			" open today's till before orders can be taken or paid."
		)
	if "No open POS Opening Entry" in text or "POS Opening Entry Missing" in text:
		return _("The till is not open. Ask the cashier to open it.")
	return None


def ensure_can_open(pos_profile: str):
	"""Before a cashier opens a session: refuse clearly if one is open."""
	session = open_session(pos_profile)
	if not session:
		return
	if session.user == frappe.session.user:
		frappe.throw(_("Your shift is already open on this till."))
	opener = frappe.utils.get_fullname(session.user) or session.user
	if getdate(session.period_start_date) < getdate(today()):
		frappe.throw(
			_("{0}'s till from {1} is still open. It must be closed before a new one is opened.").format(
				opener, formatdate(session.period_start_date)
			)
		)
	frappe.throw(
		_("{0}'s shift is still open on this till. They need to close their shift first, or a manager can close it.").format(
			opener
		)
	)
