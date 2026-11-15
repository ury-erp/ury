"""Manager approval for actions a cashier may only take with a manager's OK.

A cashier cancelling an order, or anyone below manager removing items that
were already sent to the kitchen, needs a manager to type their approval
PIN on the same screen. The PIN never opens a session; it only identifies
the approving manager for this one action. Every approved action, by a
manager or with a manager's PIN, is recorded in URY Order Approval Log.

The POS learns that approval is needed from the ApprovalRequired error
(exc_type "ApprovalRequired"), shows the PIN pad, and repeats the request
with the PIN.
"""

import frappe
from frappe import _
from frappe.utils import cint, now_datetime

from ury.ury import roles
from ury.ury.station import pin as pin_rules

CANCEL_ORDER = "Cancel Order"
REMOVE_SENT_ITEMS = "Remove Sent Items"

MAX_WRONG_PINS = 5
LOCK_MINUTES = 5


class ApprovalRequired(frappe.ValidationError):
	"""A manager must approve; the message says why or what went wrong."""

	http_status_code = 403


def _ask(message):
	"""Stop and tell the POS to ask a manager. frappe.throw carries the
	message to the screen; the exception type tells the POS to show the PIN pad."""
	frappe.throw(message, ApprovalRequired)


def _wrong_pin_key(user):
	return f"ury_approval:wrong_pins:{user}"


def _lock_key(user):
	return f"ury_approval:locked:{user}"


def _verify_pin(approval_pin) -> str:
	"""The manager whose approval PIN this is, or raise ApprovalRequired."""
	requester = frappe.session.user
	if frappe.cache.get_value(_lock_key(requester)):
		_ask(
			_("Too many wrong manager PINs. Try again in {0} minutes.").format(LOCK_MINUTES)
		)

	pin = approval_pin if isinstance(approval_pin, str) else str(approval_pin or "")
	matches = pin_rules.find_users(pin, doctype=pin_rules.MANAGER_PINS) if pin.isdigit() else []
	approver = matches[0] if len(matches) == 1 else None
	if approver and not (frappe.db.get_value("User", approver, "enabled") and roles.is_manager(user=approver)):
		approver = None

	if not approver:
		wrong = cint(frappe.cache.get_value(_wrong_pin_key(requester))) + 1
		if wrong >= MAX_WRONG_PINS:
			frappe.cache.set_value(_lock_key(requester), 1, expires_in_sec=LOCK_MINUTES * 60)
			frappe.cache.delete_value(_wrong_pin_key(requester))
			_ask(
				_("Too many wrong manager PINs. Try again in {0} minutes.").format(LOCK_MINUTES)
			)
		frappe.cache.set_value(_wrong_pin_key(requester), wrong, expires_in_sec=LOCK_MINUTES * 60)
		_ask(
			_("That manager PIN is not right. {0} tries left.").format(MAX_WRONG_PINS - wrong)
		)

	frappe.cache.delete_value(_wrong_pin_key(requester))
	frappe.db.set_value("URY Manager PIN", {"user": approver}, "last_used", now_datetime(), update_modified=False)
	return approver


def approve(action, invoice, reason=None, approval_pin=None, detail=None) -> str:
	"""Approve `action` on `invoice` for the session user, or raise.

	A manager approves their own action. Anyone else needs a manager's
	approval PIN. Returns the approving manager and records the approval.
	"""
	if roles.is_manager():
		approver = frappe.session.user
	elif not approval_pin:
		_ask(_("A manager must approve this. Ask a manager to enter their PIN."))
	else:
		approver = _verify_pin(approval_pin)

	frappe.get_doc(
		{
			"doctype": "URY Order Approval Log",
			"action": action,
			"invoice": invoice,
			"requested_by": frappe.session.user,
			"approved_by": approver,
			"reason": reason,
			"detail": detail,
			"time": now_datetime(),
		}
	).insert(ignore_permissions=True)
	return approver
