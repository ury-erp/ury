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

# De-duplication window for a given invoice's high-food-cost alert, same
# idempotency principle as create_system_notification()'s own (for_user,
# subject) dedupe in ury_kot_notification.py and _upsert_insight()'s
# rule_key+branch dedupe in ury_insight_rules.py: skip if a matching
# Notification Log already exists within the window rather than adding a
# new "alerted" field/doctype. Deliberately much longer than the 5-minute
# cron cadence (and longer than create_system_notification's own 5-minute
# per-user window) so a repeatedly-modified invoice -- which keeps re-
# entering the `modified >= now-5m` query on every tick -- doesn't re-alert
# on every tick once its per-user dedupe window ages out.
ALERT_DEDUPE_WINDOW_MINUTES = 24 * 60


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
		try:
			_check_invoice(inv)
		except Exception:
			# Guard each invoice independently so one failure doesn't abort
			# the rest of this tick's invoices.
			frappe.log_error(
				title="High Food Cost Notification Failed",
				message=frappe.get_traceback(),
			)


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

	subject = f"High Food Cost Alert - Invoice {inv.name}"
	if _already_alerted(subject):
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


def _already_alerted(subject):
	"""True if a High Food Cost Notification Log with this subject (i.e. for
	this invoice) already exists within ALERT_DEDUPE_WINDOW_MINUTES, for any
	user. Mirrors create_system_notification()'s own dedupe-by-existence-
	check pattern, just keyed by invoice/subject rather than
	(for_user, subject) and with a longer window so this cron's re-checking
	of a repeatedly-modified invoice doesn't re-alert on every 5-minute tick.
	"""
	window_start = add_to_date(now_datetime(), minutes=-ALERT_DEDUPE_WINDOW_MINUTES)
	return bool(
		frappe.db.exists(
			"Notification Log",
			{
				"subject": subject,
				"creation": [">", window_start],
			},
		)
	)
