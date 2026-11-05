import frappe
from frappe.utils import now_datetime


@frappe.whitelist()
def get_server_time():
	"""Return the Frappe server's current datetime as an ISO 8601 string.

	Internal, dependency-free source of truth for client-side clock-integrity
	checks. Added to replace grillax's `pos_closing_entry_hide_fields.js`
	`onload` fetch to worldtimeapi.org (an external, third-party network call
	that risked breaking offline/self-hosted deployments) with a call to
	ury's own backend, which the app already depends on being reachable for
	everything else.
	"""
	return now_datetime().isoformat()
