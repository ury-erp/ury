# Copyright (c) 2026, Safwan Erooth and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class AlertSettings(Document):
	pass


@frappe.whitelist()
def get_alert_rule(alert_type, branch=None):
	"""
	Look up an alert rule by type and optional branch override.

	Returns the matching rule dict if found and enabled, otherwise None.
	Prioritizes branch-specific overrides over global defaults.

	Args:
		alert_type: The alert type to look up (e.g., "Payment Delay")
		branch: Optional branch name for branch-specific overrides

	Returns:
		dict: The matching alert rule row, or None if not found/not enabled
	"""
	settings = frappe.get_single("Alert Settings")

	if not settings.custom_alerts:
		return None

	# First priority: exact match on alert_type and branch. If a branch-specific
	# row exists, its `enabled` value is authoritative — do not fall through to
	# the global default even if this row is disabled.
	if branch:
		for rule in settings.custom_alerts:
			if rule.alert_type == alert_type and rule.branch == branch:
				return rule.as_dict() if rule.enabled else None

	# Fall back to global default (alert_type match, no branch)
	for rule in settings.custom_alerts:
		if rule.alert_type == alert_type and not rule.branch and rule.enabled:
			return rule.as_dict()

	return None
