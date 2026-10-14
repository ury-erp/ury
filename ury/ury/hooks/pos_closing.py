import frappe
from frappe import _
from datetime import datetime

from ury.ury_pos.api import (
	_goal_submitted_since,
	_phase_dependent_rows,
	_role_rank,
)


def validate_daily_checklists(doc, method):
	"""Closing runs Order Taker -> Cashier -> Restaurant Manager, and the
	POS Closing Entry is the FINAL step -- the cashier may close only after
	all three submitted their closing checklist for this shift (each review
	created since the shift opened). Role-level: one submission per role
	suffices no matter how many users hold it. A submitted checklist may
	contain FAIL objectives -- valid response, not a blocker."""
	pos_profile = frappe.get_doc("POS Profile", doc.pos_profile)
	branch = pos_profile.branch

	# Parse start date
	start_date = doc.period_start_date
	if isinstance(start_date, str):
		try:
			start_date = datetime.strptime(start_date, "%Y-%m-%d %H:%M:%S.%f")
		except ValueError:
			start_date = datetime.strptime(start_date, "%Y-%m-%d %H:%M:%S")

	non_completed_checklists = []

	def validate_and_throw(error_messages):
		if error_messages != []:
			error_list = [_("{}".format(msg)) for msg in error_messages]
			frappe.throw(error_list, title=_("Validation Error"), as_list=True)

	for row in _phase_dependent_rows(doc.pos_profile, "Closing"):
		if _goal_submitted_since(row.quality_checklist, branch, start_date):
			doc.append(
				"quality_checklist",
				{"checklist": row.quality_checklist, "check_2": 1},
			)
		elif _role_rank(row.role) is not None:
			# Every ranked role in the closing sequence gates the closing
			# document: Order Taker AND Cashier AND Restaurant Manager.
			non_completed_checklists.append(
				_("Pending checklist: {} ").format(
					frappe.bold(row.quality_checklist)
				)
			)

	validate_and_throw(non_completed_checklists)


def validate_stock_correction(doc, method=None):
	"""Gate POS Closing Entry when POS Profile.validate_stock_correction is on.

	Wired from hooks.py on every closing validate. When the flag is off this
	is a no-op. When on, ``ury_pos_closing_entry.validate_ported_checks``
	already enforces that a Stock Correction exists for the shift window;
	keep this hook present so Frappe can resolve the path (missing attr
	raises AttributeError and blocks all closes — including profiles that
	never enable the feature).
	"""
	if not frappe.db.get_value(
		"POS Profile", doc.pos_profile, "validate_stock_correction"
	):
		return


def submit_stock_correction(doc, method=None):
	"""Submit linked draft stock corrections after POS Closing Entry submit.

	No-op unless POS Profile.submit_stock_correction is enabled. Stub keeps
	the hooks.py ``on_submit`` path importable on version-16.
	"""
	if not frappe.db.get_value(
		"POS Profile", doc.pos_profile, "submit_stock_correction"
	):
		return

	for row in doc.get("draft_stock_correction") or []:
		name = row.get("stock_correction") or row.get("name")
		if not name:
			continue
		if frappe.db.get_value("Stock Correction", name, "docstatus") == 0:
			frappe.get_doc("Stock Correction", name).submit()


@frappe.whitelist()
def get_draft_stock_correction(
	pos_profile, period_start_date, period_end_date, closing_entry=None
):
	"""Return draft Stock Correction rows for the Desk POS Closing form.

	Used by ``ury/public/js/pos_closing_entry.js``. Returns ``True`` when the
	profile does not require stock-correction submit (skip UI), ``False``
	when required but none found, or a list of draft correction names.
	"""
	if not frappe.db.get_value(
		"POS Profile", pos_profile, "submit_stock_correction"
	):
		return True

	branch = frappe.db.get_value("POS Profile", pos_profile, "branch")
	warehouse = frappe.db.get_value("POS Profile", pos_profile, "warehouse")
	if not branch:
		return False

	filters = {
		"branch": branch,
		"docstatus": 0,
	}
	if warehouse and frappe.get_meta("Stock Correction").has_field("set_warehouse"):
		filters["set_warehouse"] = warehouse

	drafts = frappe.get_all(
		"Stock Correction",
		filters=filters,
		fields=["name"],
		limit=20,
	)
	if not drafts:
		return False
	return [{"stock_correction": d.name} for d in drafts]
