import frappe

from ury.ury.doctype.alert_settings.alert_settings import get_alert_rule


def validate_pos_opening_entry(doc, method=None):
	"""Block starting a new POS Opening until the prior day's Stock Reconciliation
	has been submitted, if the "Stock Count Gate" Alert Rule is enabled for the branch.

	Ported from grillax's pos_opening.js `validate_stock_reconciliation` (gated there by
	a `check_validation` checkbox; here gated by the Alert Settings resolver instead so it
	is an opt-in, per-branch rollout rather than hard-enabled).

	Mirrors the original logic: find the branch's most recently submitted POS Opening
	Entry; if its status is "Closed", a submitted Stock Reconciliation for the branch
	must exist with a `modified` timestamp on/after that POS Opening Entry's `modified`
	timestamp. If not, block with frappe.throw.
	"""
	if not doc.branch:
		return

	if not get_alert_rule("Stock Count Gate", branch=doc.branch):
		return

	last_pos_opening = frappe.db.get_value(
		"POS Opening Entry",
		{"branch": doc.branch, "docstatus": 1},
		["name", "status", "modified"],
		order_by="creation desc",
		as_dict=True,
	)

	if not last_pos_opening or last_pos_opening.status != "Closed":
		return

	last_stock_reconciliation_modified = frappe.db.get_value(
		"Stock Reconciliation",
		{"branch": doc.branch, "docstatus": 1},
		"modified",
		order_by="modified desc",
	)

	if not last_stock_reconciliation_modified or last_stock_reconciliation_modified < last_pos_opening.modified:
		frappe.throw(
			"Stock Reconciliation Not Completed: please submit the Stock Reconciliation "
			f"for branch {doc.branch} before opening a new POS session."
		)


def validate_pos_closing_entry(doc, method=None):
	"""Require a Stock Reconciliation (at least Draft) to exist for the branch before a
	POS Closing Entry can close, if the "Stock Count Gate" Alert Rule is enabled for the
	branch.

	Ported from grillax's pos_closing_entry_hide_fields.js `submit_stock_reconciliation`
	trigger, which called `pos_closing.get_draft_stock_reconciliation` (the
	worldtimeapi.org clock-fetch in that same file is intentionally NOT ported).
	"""
	if not doc.branch:
		return

	if not get_alert_rule("Stock Count Gate", branch=doc.branch):
		return

	stock_reconciliation_exists = frappe.db.exists(
		"Stock Reconciliation",
		{"branch": doc.branch, "docstatus": ["in", [0, 1]]},
	)

	if not stock_reconciliation_exists:
		frappe.throw(
			f"No Stock Reconciliation found for branch {doc.branch}. "
			"Please create and save a Stock Reconciliation before closing this POS session."
		)
