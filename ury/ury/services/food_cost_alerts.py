"""Scheduled high-food-cost alerting for recently paid POS Invoices.

Ported from grillax's `notify_items` / `notify_high_food_cost` cron job.
Reuses ury's shared BOM/Product-Bundle cost resolver, the Alert Settings
doctype (to gate whether/who gets notified), and the existing KOT
notification helpers (to resolve roles to users and create the actual
Notification Log entries).
"""

from __future__ import annotations

import frappe
from frappe.utils import add_to_date, now_datetime

from ury.ury.api.ury_kot_notification import create_system_notification, get_users_with_role
from ury.ury.doctype.alert_settings.alert_settings import get_alert_rule
from ury.ury.services.bom_cost_resolver import resolve_item_cost


def notify_high_food_cost():
	"""Cron entry point: check recently-Paid POS Invoices for high food cost items.

	For each item on a recently-Paid POS Invoice, resolves its buying cost via
	the shared BOM/Product Bundle cost resolver and compares it to the invoice's
	POS Profile `high_food_cost` threshold. If exceeded, and the 'High Food Cost'
	Alert Rule is enabled for the invoice's branch, notifies the roles configured
	on that rule.
	"""
	try:
		_notify_high_food_cost()
	except Exception:
		frappe.log_error(
			title="High Food Cost Notification Failed",
			message=frappe.get_traceback(),
		)


def _notify_high_food_cost():
	datetime_check = add_to_date(now_datetime(), minutes=-5)

	invoices = frappe.db.get_all(
		"POS Invoice",
		filters={
			"status": "Paid",
			"docstatus": 1,
			"modified": (">=", datetime_check),
		},
		fields=["name", "pos_profile", "branch"],
	)

	for inv in invoices:
		_check_invoice(inv)


def _check_invoice(inv):
	high_food_cost = frappe.db.get_value("POS Profile", inv.pos_profile, "high_food_cost")
	if not high_food_cost or high_food_cost <= 0:
		return

	alert_rule = get_alert_rule("High Food Cost", branch=inv.branch)
	if not alert_rule:
		return

	notify_roles = alert_rule.get("notify_roles")
	if not notify_roles:
		return

	buying_price_list = frappe.db.get_value("POS Profile", inv.pos_profile, "buying_price_list")
	if not buying_price_list:
		return

	invoice = frappe.get_doc("POS Invoice", inv.name)

	flagged_items = []
	for item in invoice.items:
		cost_result = resolve_item_cost(item.item_code, buying_price_list)
		if cost_result.get("cost", 0) > high_food_cost:
			flagged_items.append(item.item_name or item.item_code)

	if not flagged_items:
		return

	subject = f"High Food Cost Alert - Invoice {invoice.name}"
	message = (
		f"Invoice {invoice.name} at branch {inv.branch} has item(s) exceeding "
		f"the high food cost threshold ({high_food_cost}): {', '.join(flagged_items)}"
	)

	for role in notify_roles:
		role_name = role.get("role") if isinstance(role, dict) else getattr(role, "role", role)
		if not role_name:
			continue
		users = get_users_with_role(role_name, branch=inv.branch)
		for user in users:
			create_system_notification(message, user.name, subject)
