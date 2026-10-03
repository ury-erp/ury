import frappe
from frappe.utils import now_datetime


@frappe.whitelist()
def get_server_time():
	"""Return the Frappe server's current datetime as an ISO 8601 string.

	Authenticated site-local clock for floor-plan table ages and other URY
	clients that need to compare time-only fields with the site's current time.
	Uses Frappe's clock without depending on an external time service.
	"""
	return now_datetime().isoformat()
