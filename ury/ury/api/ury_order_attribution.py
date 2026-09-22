"""Authorisation and validation for orders recorded on behalf of another party.

Two independent axes hang off a POS Profile, both resolved here so the rules stay
in one reviewable place:

* **Performer** -- the employee credited with the work. A car-wash attendant or a
  runner cannot reach the terminal, so an authorised operator keys the order for
  them. The operator stays `POS Invoice.waiter` (that field drives ownership and
  room scoping); the performer lands on `custom_waiter_employee`, which is what
  the sales, commission and payroll reports already read.
* **Credit party** -- the `URY Credit Account` a bill is charged to instead of
  being paid now. Settlement then rides ERPNext's native receivable, so the debt
  shows up on the customer ledger and is cleared by an ordinary Payment Entry.

Everything here fails closed: a flag that is off makes the corresponding payload
an error rather than something quietly dropped.
"""

import frappe
from frappe import _
from frappe.utils import flt

from ury.ury.doctype.ury_credit_account.ury_credit_account import (
	get_outstanding,
	is_valid_on,
)

PERFORMER_FIELDS = ("custom_enable_order_on_behalf", "custom_roles_allowed_to_order_on_behalf")


def _profile(pos_profile):
	if not pos_profile:
		frappe.throw(_("POS Profile is required."))
	return frappe.get_cached_doc("POS Profile", pos_profile)


def _is_super_user():
	return frappe.session.user == "Administrator" or "System Manager" in frappe.get_roles()


def _require_role(profile, fieldname, message):
	"""Fail unless the acting user holds one of the profile's permitted roles."""
	if _is_super_user():
		return
	# Imported lazily: ury_order imports this module, so a top-level import cycles.
	from ury.ury.doctype.ury_order.ury_order import _has_role

	if not _has_role(frappe.get_roles(), profile.get(fieldname)):
		frappe.throw(message, frappe.PermissionError)


def _validate_employee(employee, branch):
	row = frappe.db.get_value(
		"Employee", employee, ["name", "status", "branch", "employee_name"], as_dict=True
	)
	if not row:
		frappe.throw(_("Employee {0} does not exist.").format(employee))
	if row.status != "Active":
		frappe.throw(_("Employee {0} is not active.").format(row.employee_name or employee))
	if branch and row.branch != branch:
		frappe.throw(
			_("Employee {0} is not assigned to branch {1}.").format(
				row.employee_name or employee, branch
			)
		)
	return row


def resolve_order_performer(pos_profile, branch, employee, existing=None):
	"""Return the Employee to credit for this order, or None to leave it untouched.

	`existing` is the performer already stored on the invoice; it keeps an order
	that predates the profile flag editable.
	"""
	profile = _profile(pos_profile)
	enabled = bool(profile.get("custom_enable_order_on_behalf"))

	if not employee:
		if enabled and profile.get("custom_require_performer_on_order") and not existing:
			frappe.throw(_("Select the employee this order is for."))
		return None

	if not enabled:
		frappe.throw(
			_("Recording an order on behalf of another employee is not enabled for this POS Profile."),
			frappe.PermissionError,
		)

	_require_role(
		profile,
		"custom_roles_allowed_to_order_on_behalf",
		_("You are not permitted to record an order on behalf of another employee."),
	)
	_validate_employee(employee, branch)
	return employee


def resolve_line_performers(pos_profile, branch, items):
	"""Map each supplied line performer to a validated Employee.

	Returns {employee: employee}. Distinct employees are validated once, so a
	hundred-line cart costs one lookup per person rather than one per line.
	"""
	requested = {
		item.get("performed_by")
		for item in (items or [])
		if isinstance(item, dict) and item.get("performed_by")
	}
	if not requested:
		return {}

	profile = _profile(pos_profile)
	if not profile.get("custom_enable_order_on_behalf"):
		frappe.throw(
			_("Recording an order on behalf of another employee is not enabled for this POS Profile."),
			frappe.PermissionError,
		)

	_require_role(
		profile,
		"custom_roles_allowed_to_order_on_behalf",
		_("You are not permitted to record an order on behalf of another employee."),
	)

	for employee in requested:
		_validate_employee(employee, branch)
	return {employee: employee for employee in requested}


@frappe.whitelist()
def list_eligible_performers(pos_profile, search=None, limit=20):
	"""Employees selectable as the performer on this profile's branch."""
	profile = _profile(pos_profile)
	if not profile.get("custom_enable_order_on_behalf"):
		return []

	_require_role(
		profile,
		"custom_roles_allowed_to_order_on_behalf",
		_("You are not permitted to record an order on behalf of another employee."),
	)

	filters = {"status": "Active"}
	if profile.get("branch"):
		filters["branch"] = profile.branch

	or_filters = None
	if search:
		or_filters = {"name": ["like", f"%{search}%"], "employee_name": ["like", f"%{search}%"]}

	return frappe.get_all(
		"Employee",
		filters=filters,
		or_filters=or_filters,
		fields=["name", "employee_name", "designation"],
		order_by="employee_name asc",
		limit=min(int(limit or 20), 50),
	)


def get_credit_mode_of_payment(pos_profile):
	profile = _profile(pos_profile)
	if not profile.get("custom_enable_credit_settlement"):
		return None
	return profile.get("custom_credit_mode_of_payment")


def resolve_credit_account(pos_profile, branch, credit_account, amount=0):
	"""Authorise charging `amount` to `credit_account`; returns its receivable Customer."""
	profile = _profile(pos_profile)

	if not profile.get("custom_enable_credit_settlement"):
		frappe.throw(
			_("Credit settlement is not enabled for this POS Profile."), frappe.PermissionError
		)
	if not profile.get("custom_credit_mode_of_payment"):
		frappe.throw(_("Set a Credit Mode Of Payment on POS Profile {0}.").format(profile.name))

	_require_role(
		profile,
		"custom_roles_allowed_for_credit",
		_("You are not permitted to settle an order on credit."),
	)

	account = frappe.db.get_value(
		"URY Credit Account",
		credit_account,
		["name", "enabled", "party_type", "party", "customer", "branch", "credit_limit", "valid_from", "valid_to"],
		as_dict=True,
	)
	if not account:
		frappe.throw(_("Credit Account {0} does not exist.").format(credit_account))
	if not is_valid_on(account):
		frappe.throw(_("Credit Account {0} is disabled or outside its validity period.").format(account.name))
	if account.branch and branch and account.branch != branch:
		frappe.throw(_("Credit Account {0} is not available at branch {1}.").format(account.name, branch))
	if not account.customer:
		frappe.throw(_("Credit Account {0} has no receivable Customer.").format(account.name))

	check_credit_limit(account, amount)
	return account


def check_credit_limit(account, amount):
	"""Reject a charge that would push the account past its limit. Zero means no limit."""
	limit = flt(account.get("credit_limit"))
	if not limit:
		return
	projected = get_outstanding(account["name"]) + flt(amount)
	if projected > limit:
		frappe.throw(
			_("Credit limit exceeded for {0}. Limit {1}, outstanding after this bill would be {2}.").format(
				account["name"], limit, projected
			)
		)
