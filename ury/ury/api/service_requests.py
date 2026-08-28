# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt
#
# Staff-facing API for URY Service Request (customer "Request Bill" /
# "Request Assistance" taps from the QR/self-order app — created by
# request_bill() in ury/ury/api/self_ordering.py, the guest-facing trust
# boundary). This module is the opposite side: thin, session-authenticated
# endpoints for floor staff (Captains) to see and clear open requests. Kept
# separate from self_ordering.py rather than added there, since that file is
# explicitly documented as the allow_guest trust boundary and these
# endpoints are deliberately NOT allow_guest.

import frappe
from frappe.utils import now_datetime


@frappe.whitelist()
def list_open_service_requests(branch):
	"""Open/Acknowledged service requests for tables in `branch`, oldest first."""
	if not branch:
		return []

	tables = frappe.get_all("URY Table", filters={"branch": branch}, pluck="name")
	if not tables:
		return []

	return frappe.get_all(
		"URY Service Request",
		filters={"table": ["in", tables], "status": ["in", ["Open", "Acknowledged"]]},
		fields=["name", "request_type", "table", "status", "requested_at"],
		order_by="requested_at asc",
	)


@frappe.whitelist()
def acknowledge_service_request(name):
	req = frappe.get_doc("URY Service Request", name)
	req.status = "Acknowledged"
	req.save(ignore_permissions=True)
	return {"name": req.name, "status": req.status}


@frappe.whitelist()
def resolve_service_request(name):
	req = frappe.get_doc("URY Service Request", name)
	req.status = "Resolved"
	req.resolved_at = now_datetime()
	req.resolved_by = frappe.session.user
	req.save(ignore_permissions=True)
	return {"name": req.name, "status": req.status}
