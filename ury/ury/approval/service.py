import hashlib
import json

import frappe
from frappe import _
from frappe.utils import now_datetime

from ury.ury.approval.config import get_approval_levels

OPEN_STATUSES = ("Pending", "Changes Requested")
FINAL_STATUSES = ("Approved", "Rejected", "Invalidated")
VOLATILE_FIELDS = {
	"modified",
	"modified_by",
	"creation",
	"owner",
	"idx",
	"docstatus",
	"status",
	"__islocal",
	"__unsaved",
	"_liked_by",
	"_comments",
	"_assign",
	"_user_tags",
}
LIFECYCLE_FIELDS = {
	"Employee Advance": {
		"advance_account",
		"claimed_amount",
		"paid_amount",
		"pending_amount",
		"return_amount",
	},
	"Purchase Invoice": {"remarks"},
	"Payment Entry": {"base_total_allocated_amount", "total_allocated_amount"},
}


def _strip_volatile_fields(value, fieldnames):
	if isinstance(value, dict):
		for fieldname in fieldnames:
			value.pop(fieldname, None)
		for nested in value.values():
			_strip_volatile_fields(nested, fieldnames)
	elif isinstance(value, list):
		for nested in value:
			_strip_volatile_fields(nested, fieldnames)


def document_hash(doc, action="submit"):
	data = doc.as_dict()
	data.pop("doctype", None)
	_strip_volatile_fields(data, VOLATILE_FIELDS | LIFECYCLE_FIELDS.get(doc.doctype, set()))
	payload = json.dumps(
		{"document": data, "action": action}, sort_keys=True, default=str, separators=(",", ":")
	)
	return hashlib.sha256(payload.encode()).hexdigest()


def request_approval(doc, control_type, branch, action="submit", levels=None, amount=None, details=None):
	if not doc.name:
		doc.set_new_name()
	version_hash = document_hash(doc, action)
	levels = levels or get_approval_levels(branch, control_type, doc)
	if not levels:
		frappe.throw(_("No approvers are configured for this request"))
	_lock_branch(branch)
	existing = _latest_request(doc.doctype, doc.name, control_type, action)
	if existing and existing.status in OPEN_STATUSES:
		return _update_open_request(existing, doc, branch, version_hash, levels, amount, details)
	if existing and existing.status == "Approved" and existing.document_version_hash == version_hash:
		return existing
	if existing and existing.status == "Approved":
		_set_status(
			existing, "Invalidated", "cancel", "Document version changed after approval", release=False
		)
	request_doc = frappe.get_doc(
		{
			"doctype": "URY Approval Request",
			"reference_doctype": doc.doctype,
			"reference_name": doc.name,
			"control_type": control_type,
			"action": action,
			"branch": branch,
			"requester": frappe.session.user,
			"status": "Pending",
			"current_level": levels[0]["level"],
			"requested_amount": amount,
			"document_version_hash": version_hash,
			"approval_plan": json.dumps(levels, sort_keys=True),
			"details": details,
			"created_at": now_datetime(),
		}
	)
	request_doc.flags.ury_approval_internal = True
	request_doc.insert(ignore_permissions=True)
	_append_log(request_doc, "submit")
	_notify_status_change(request_doc, None, "Pending")
	return request_doc


def _update_open_request(request_doc, doc, branch, version_hash, levels, amount, details):
	old_status = request_doc.status
	changed = request_doc.document_version_hash != version_hash
	request_doc.document_version_hash = version_hash
	request_doc.branch = branch
	request_doc.requested_amount = amount
	request_doc.details = details
	request_doc.approval_plan = json.dumps(levels, sort_keys=True)
	if changed:
		request_doc.current_level = levels[0]["level"]
		if request_doc.status == "Changes Requested":
			request_doc.status = "Pending"
	request_doc.flags.ury_approval_internal = True
	request_doc.save(ignore_permissions=True)
	if old_status != request_doc.status:
		_append_log(request_doc, "submit", "Changes requested document resubmitted")
		_notify_status_change(request_doc, old_status, request_doc.status)
	return request_doc


def assert_approved(doc, control_type, action="submit"):
	version_hash = document_hash(doc, action)
	request_doc = _latest_request(doc.doctype, doc.name, control_type, action)
	if (
		not request_doc
		or request_doc.status != "Approved"
		or request_doc.document_version_hash != version_hash
	):
		frappe.throw(
			_("{0} approval is required for {1} {2}").format(
				control_type.replace("_", " ").title(), doc.doctype, doc.name
			),
			frappe.PermissionError,
		)
	return request_doc


def invalidate_requests(doc, control_type=None, action="submit", remarks=None):
	filters = {
		"reference_doctype": doc.doctype,
		"reference_name": doc.name,
		"action": action,
		"status": ["in", ["Pending", "Approved", "Changes Requested"]],
	}
	if control_type:
		filters["control_type"] = control_type
	version_hash = document_hash(doc, action)
	for row in frappe.get_all("URY Approval Request", filters=filters):
		request_doc = frappe.get_doc("URY Approval Request", row.name)
		if request_doc.document_version_hash != version_hash:
			_set_status(request_doc, "Invalidated", "cancel", remarks or "Document version changed")


@frappe.whitelist(methods=["POST"])
def decide_approval(request_name, action, remarks=None):
	if action not in {"approve", "reject", "request_changes"}:
		frappe.throw(_("Unsupported approval action"))
	request_doc = frappe.get_doc("URY Approval Request", request_name)
	if request_doc.status not in OPEN_STATUSES:
		frappe.throw(_("Only an open approval request can be decided"))
	_validate_approver(request_doc)
	old_status = request_doc.status
	levels = json.loads(request_doc.approval_plan)
	current_index = next(
		(index for index, level in enumerate(levels) if level["level"] == request_doc.current_level),
		None,
	)
	if current_index is None:
		frappe.throw(_("The current approval level is not present in the approval plan"))
	if action == "approve":
		if current_index + 1 < len(levels):
			request_doc.current_level = levels[current_index + 1]["level"]
		else:
			request_doc.status = "Approved"
			request_doc.decided_at = now_datetime()
	elif action == "reject":
		request_doc.status = "Rejected"
		request_doc.decided_at = now_datetime()
	else:
		request_doc.status = "Changes Requested"
	request_doc.flags.ury_approval_internal = True
	request_doc.save(ignore_permissions=True)
	_append_log(request_doc, action, remarks)
	if old_status != request_doc.status:
		_notify_status_change(request_doc, old_status, request_doc.status)
	if action == "reject":
		from ury.ury.approval.budget import release_for_request

		release_for_request(request_doc)
	return request_doc


@frappe.whitelist(methods=["POST"])
def cancel_approval(request_name, remarks=None):
	request_doc = frappe.get_doc("URY Approval Request", request_name)
	if frappe.session.user != request_doc.requester and "System Manager" not in frappe.get_roles():
		frappe.throw(_("Only the requester can cancel this approval request"), frappe.PermissionError)
	_set_status(request_doc, "Invalidated", "cancel", remarks)
	return request_doc


def _validate_approver(request_doc):
	user = frappe.session.user
	levels = json.loads(request_doc.approval_plan)
	level = next((row for row in levels if row["level"] == request_doc.current_level), None)
	if not level:
		frappe.throw(_("No approver configured for the current level"), frappe.PermissionError)
	allowed = user == level.get("approver_user") or (
		level.get("approver_role") and level["approver_role"] in frappe.get_roles(user)
	)
	if not allowed:
		frappe.throw(_("You are not the configured approver for this level"), frappe.PermissionError)
	if user == request_doc.requester:
		allow_self = frappe.db.get_value("Branch", request_doc.branch, "custom_ury_allow_self_approval")
		if not allow_self:
			frappe.throw(_("Requesters cannot approve their own requests"), frappe.PermissionError)


def _set_status(request_doc, status, log_action, remarks=None, release=True):
	old_status = request_doc.status
	if old_status == status:
		return
	request_doc.status = status
	request_doc.decided_at = now_datetime() if status in FINAL_STATUSES else None
	request_doc.flags.ury_approval_internal = True
	request_doc.save(ignore_permissions=True)
	_append_log(request_doc, log_action, remarks)
	_notify_status_change(request_doc, old_status, status)
	if release and status in {"Rejected", "Invalidated"}:
		from ury.ury.approval.budget import release_for_request

		release_for_request(request_doc)


def _append_log(request_doc, action, remarks=None):
	log_doc = frappe.get_doc(
		{
			"doctype": "URY Approval Log",
			"approval_request": request_doc.name,
			"requester": request_doc.requester,
			"approver": frappe.session.user if action != "submit" else None,
			"action": action,
			"action_at": now_datetime(),
			"remarks": remarks,
		}
	)
	log_doc.flags.ury_approval_internal = True
	log_doc.insert(ignore_permissions=True)


def _notify_status_change(request_doc, old_status, new_status):
	if old_status == new_status:
		return
	recipients = {request_doc.requester}
	if new_status == "Pending":
		levels = json.loads(request_doc.approval_plan)
		level = next((row for row in levels if row["level"] == request_doc.current_level), {})
		if level.get("approver_user"):
			recipients.add(level["approver_user"])
		if level.get("approver_role"):
			recipients.update(
				frappe.get_all("Has Role", filters={"role": level["approver_role"]}, pluck="parent")
			)
	for user in recipients:
		if not user or not frappe.db.exists("User", user):
			continue
		frappe.get_doc(
			{
				"doctype": "Notification Log",
				"type": "Alert",
				"document_type": "URY Approval Request",
				"document_name": request_doc.name,
				"for_user": user,
				"from_user": frappe.session.user,
				"subject": _("Approval {0}: {1} {2}").format(
					new_status, request_doc.reference_doctype, request_doc.reference_name
				),
			}
		).insert(ignore_permissions=True)


def _latest_request(reference_doctype, reference_name, control_type, action):
	rows = frappe.get_all(
		"URY Approval Request",
		filters={
			"reference_doctype": reference_doctype,
			"reference_name": reference_name,
			"control_type": control_type,
			"action": action,
		},
		order_by="creation desc",
		limit=1,
	)
	return frappe.get_doc("URY Approval Request", rows[0].name) if rows else None


def _lock_branch(branch):
	frappe.qb.get_query("Branch", fields=["name"], filters={"name": branch}, for_update=True).run()
