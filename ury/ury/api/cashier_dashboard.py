"""Whitelisted endpoints behind the Daily Operations workspace.

Each Number Card of type "Custom" calls one of the card functions; the waiter chart block
calls `get_waiter_sales_chart`. Every endpoint:

* requires one of the dashboard roles and read permission on the doctypes it aggregates
  (no DocPerm is added for this dashboard),
* derives the branch scope from the session user (a caller can never pass a branch),
* returns aggregates only.
"""

import frappe
from frappe import _

from ury.ury.services import cashier_dashboard as service
from ury.ury.utils.cashier_desk import DASHBOARD_ROLES


def _require_access(*doctypes):
	user = frappe.session.user
	if user != "Administrator" and not DASHBOARD_ROLES & set(frappe.get_roles(user)):
		frappe.throw(_("You do not have permission to access this dashboard."), frappe.PermissionError)
	for doctype in doctypes:
		frappe.has_permission(doctype, "read", throw=True)


def _scope(*doctypes):
	_require_access(*doctypes)
	return service.get_branch_scope()


def _currency(value):
	return {"value": value, "fieldtype": "Currency"}


def _count(value, route=None, route_options=None):
	out = {"value": value, "fieldtype": "Int"}
	if route:
		out["route"] = route
		if route_options:
			out["route_options"] = route_options
	return out


@frappe.whitelist(methods=["GET"])
def yesterday_sales():
	return _currency(service.get_sales_summary(_scope("POS Invoice"))[1]["sales"])


@frappe.whitelist(methods=["GET"])
def yesterday_bills():
	return _count(service.get_sales_summary(_scope("POS Invoice"))[1]["bills"])


@frappe.whitelist(methods=["GET"])
def yesterday_average_bill():
	return _currency(service.get_average_bill(service.get_sales_summary(_scope("POS Invoice"))[1]))


@frappe.whitelist(methods=["GET"])
def today_sales():
	return _currency(service.get_sales_summary(_scope("POS Invoice"))[0]["sales"])


@frappe.whitelist(methods=["GET"])
def today_bills():
	return _count(service.get_sales_summary(_scope("POS Invoice"))[0]["bills"])


@frappe.whitelist(methods=["GET"])
def today_average_bill():
	return _currency(service.get_average_bill(service.get_sales_summary(_scope("POS Invoice"))[0]))


@frappe.whitelist(methods=["GET"])
def cancelled_bills():
	return _count(
		service.get_cancelled_bills_today(_scope("POS Invoice")),
		route=["List", "POS Invoice", "List"],
		route_options={"docstatus": 2},
	)


@frappe.whitelist(methods=["GET"])
def unsettled_bills():
	return _count(
		service.get_unsettled_bills(_scope("POS Invoice")),
		route=["List", "POS Invoice", "List"],
		route_options={"docstatus": 0},
	)


@frappe.whitelist(methods=["GET"])
def open_kots():
	return _count(
		service.get_open_kots(_scope("URY KOT")),
		route=["List", "URY KOT", "List"],
		route_options={"docstatus": 1, "order_status": service.OPEN_KOT_STATUS, "verified": 0},
	)


@frappe.whitelist(methods=["GET"])
def get_waiter_sales_chart():
	"""Waiter-wise sales for the last seven business days (labels, datasets)."""
	return service.get_waiter_sales(_scope("POS Invoice"))
