import frappe
from frappe import _

CONTROL_FIELDS = {
	"purchase_price": "custom_ury_purchase_approval_levels",
	"expense": "custom_ury_expense_approval_levels",
	"backdated": "custom_ury_backdated_approval_levels",
}

ENABLE_FIELDS = {
	"purchase_price": "custom_ury_enable_purchase_approval",
	"payment": "custom_ury_enable_payment_approval",
	"expense": "custom_ury_enable_expense_approval",
	"backdated": "custom_ury_enable_backdated_control",
}


def control_enabled(branch, control_type):
	if not branch:
		return False
	config = frappe.get_cached_doc("Branch", branch)
	return bool(config.get("custom_ury_master_approval_control") and config.get(ENABLE_FIELDS[control_type]))


def validate_branch(doc, method=None):
	for control_type, fieldname in CONTROL_FIELDS.items():
		if doc.get(ENABLE_FIELDS[control_type]):
			_validate_levels(doc.get(fieldname) or [], control_type)
	if doc.get("custom_ury_enable_payment_approval"):
		_validate_levels(doc.get("custom_ury_payment_approval_levels") or [], "payment")
	lock_day = doc.get("custom_ury_backdated_lock_day")
	if lock_day and not 1 <= lock_day <= 31:
		frappe.throw(_("Backdated Lock Day must be between 1 and 31"))


def _validate_levels(rows, control_type):
	if not rows:
		frappe.throw(
			_("At least one approver is required when {0} is enabled").format(
				control_type.replace("_", " ").title()
			)
		)
	seen = set()
	for row in rows:
		if not row.approver_role and not row.approver_user:
			frappe.throw(_("Every approval level must have an approver User or Role"))
		if row.approver_role and row.approver_user:
			frappe.throw(_("Choose either an approver User or an approver Role, not both"))
		if not row.level or row.level < 1:
			frappe.throw(_("Approval levels must be positive integers"))
		if row.threshold and row.threshold < 0:
			frappe.throw(_("Payment thresholds cannot be negative"))
		key = (row.payment_type or "", row.mode_of_payment or "", row.level)
		if key in seen:
			frappe.throw(
				_("Duplicate approval level {0} for {1}").format(row.level, row.payment_type or control_type)
			)
		seen.add(key)


def get_approval_levels(branch, control_type, doc=None):
	config = frappe.get_doc("Branch", branch)
	if control_type == "payment":
		return get_payment_levels(config, doc)
	rows = config.get(CONTROL_FIELDS[control_type]) or []
	return [_level_dict(row) for row in sorted(rows, key=lambda row: row.level)]


def get_payment_levels(config, doc):
	payment_type = get_payment_type(doc)
	rows = [
		row
		for row in (config.get("custom_ury_payment_approval_levels") or [])
		if row.payment_type == payment_type
		and (not row.mode_of_payment or row.mode_of_payment == doc.get("mode_of_payment"))
	]
	if not rows and payment_type in {"Cash", "Employee Advance"}:
		fieldname = (
			"custom_ury_advance_approver_role"
			if payment_type == "Employee Advance"
			else "custom_ury_cash_approver_role"
		)
		return [{"level": 1, "approver_role": config.get(fieldname), "approver_user": None}]
	if not rows:
		frappe.throw(
			_("No {0} payment approval rule is configured for branch {1}").format(payment_type, config.name)
		)
	amount = _payment_amount(doc)
	rows = sorted(rows, key=lambda row: row.level)
	for row in rows:
		threshold = row.threshold
		if payment_type == "Bank" and threshold in (None, 0):
			threshold = config.get("custom_ury_default_bank_threshold")
		if threshold and amount <= threshold:
			return [_level_dict(row)]
	if rows[-1].level != 1 or len(rows) == 1:
		return [_level_dict(rows[-1])]
	return [_level_dict(rows[-1])]


def get_payment_type(doc):
	if doc.doctype == "Employee Advance":
		return "Employee Advance"
	mode = doc.get("mode_of_payment")
	mode_type = frappe.db.get_value("Mode of Payment", mode, "type") if mode else None
	if mode_type == "Cash":
		return "Cash"
	if mode_type == "Phone":
		return "UPI"
	return "Bank"


def _payment_amount(doc):
	from frappe.utils import flt

	return flt(
		doc.get("advance_amount") if doc.doctype == "Employee Advance" else doc.get("base_paid_amount")
	)


def _level_dict(row):
	return {
		"level": row.level,
		"approver_role": row.approver_role,
		"approver_user": row.approver_user,
	}
