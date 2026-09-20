# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt
#
# The operations that move money without selling anything.
#
# Frappe already versions field changes on a tracked doctype, and POS Invoice
# is tracked. That is not the same thing as an audit trail, for two reasons:
#
#   1. A version records that `discount_amount` went from 0 to 40,000. It does
#      not record that a cashier pressed a button, on whose authority, against
#      which table, with what reason typed in. The act is what a manager is
#      looking for; the field diff is an artefact of it.
#   2. Half of these paths never touch the ORM. `frappe.db.set_value` and raw
#      SQL — both of which URY uses on the cancellation path — write no
#      version at all. The very operations most worth watching are the ones
#      Frappe's own tracking misses.
#
# Entries are append-only by construction: no role in the doctype has create,
# write or delete, so the only way in is this module running as the server.

import json

import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime

# Every event this module knows how to record. Kept as a tuple rather than
# free strings at the call sites so a typo becomes an error here instead of a
# row nobody will ever find with a filter.
EVENTS = (
	"Discount Applied",
	"Invoice Cancelled",
	"Price Overridden",
	"Payment Refunded",
	"Bill Split",
	"Bill Merged",
	"Table Transferred",
	"Captain Transferred",
	"Shift Closed With Difference",
)


def record_event(
	event,
	reference_doctype=None,
	reference_name=None,
	amount=None,
	old_value=None,
	new_value=None,
	reason=None,
	details=None,
	branch=None,
	pos_profile=None,
):
	"""Write one audit entry.

	Never raises. An audit trail that can fail a sale is an audit trail that
	gets removed the first time it does — and the entry is a record of
	something that already happened, so refusing the operation after the fact
	would be both useless and destructive. A write that cannot be made is
	logged as an error instead, which is itself visible to an administrator.
	"""
	try:
		if event not in EVENTS:
			frappe.log_error(f"Unknown audit event: {event}", "URY Audit Log")
			return None

		if reference_doctype == "POS Invoice" and reference_name and not (branch and pos_profile):
			row = frappe.db.get_value(
				"POS Invoice", reference_name, ["branch", "pos_profile"], as_dict=True
			)
			if row:
				branch = branch or row.branch
				pos_profile = pos_profile or row.pos_profile

		doc = frappe.get_doc(
			{
				"doctype": "URY Audit Log",
				"event": event,
				"reference_doctype": reference_doctype,
				"reference_name": reference_name,
				"branch": branch,
				"pos_profile": pos_profile,
				"amount": amount,
				# The session user, never a caller-supplied one: the whole
				# point is attribution that the operator cannot choose.
				"performed_by": frappe.session.user,
				"occurred_at": now_datetime(),
				"old_value": None if old_value is None else str(old_value)[:140],
				"new_value": None if new_value is None else str(new_value)[:140],
				"reason": reason,
				"details": json.dumps(details, ensure_ascii=False, default=str) if details else None,
			}
		)
		doc.insert(ignore_permissions=True)
		return doc.name
	except Exception:
		try:
			frappe.log_error(frappe.get_traceback(), "Could not write audit entry")
		except Exception:
			pass
		return None


class URYAuditLog(Document):
	def on_trash(self):
		# Belt and braces over the doctype permissions: an audit trail that an
		# administrator can quietly prune is not one.
		frappe.throw(frappe._("Audit entries cannot be deleted."))
