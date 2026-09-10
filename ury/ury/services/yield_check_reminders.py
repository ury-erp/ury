"""Yield check cadence engine: identify items due for yield checks and notify.

Implements a deterministic scheduler that evaluates yield check cadences
(None / Every Issue / Interval / Sampled) and notifies when items are due.
Uses Notification Log with dedup-by-subject to avoid repeated alerts on the
same branch when nothing changes.
"""

from __future__ import annotations

import hashlib
from datetime import datetime

import frappe
from frappe.utils import add_to_date, getdate, now_datetime

from ury.ury.api.ury_kot_notification import create_system_notification, get_users_with_role
from ury.ury.report_api.utils import require_manager

# Fixed sampling rate for Sampled cadence mode (10% of items on any given day).
# Per-branch sampling rates deferred to future phases.
SAMPLING_RATE = 0.10

# De-duplication window for yield-check notifications per branch, same pattern
# as food_cost_alerts.py: skip if a Notification Log with matching subject
# exists within this window, preventing re-notification every cron tick when
# the same items remain due.
NOTIFICATION_DEDUPE_WINDOW_MINUTES = 24 * 60


def get_due_yield_checks(branch):
	"""Return list of items due for yield check in the given branch.

	Evaluates yield-tracked items by their cadence mode:
	- Every Issue: due if an authorized URY Issue Authorization exists with no
	  corresponding URY Yield Check logged yet.
	- Interval: due if >cadence_interval_days since the last check (or if never
	  checked).
	- Sampled: due if a deterministic hash of (today, branch, item) falls under
	  the sampling rate threshold.

	Args:
		branch: Branch name to evaluate (required).

	Returns:
		list of dicts, one per due item:
		[
			{
				"item": "<item-code>",
				"item_name": "<item-display-name>",
				"cadence": "Every Issue" | "Interval" | "Sampled",
				"reason": "<why-it-is-due>",
				"days_overdue": <int> (only for Interval mode),
			},
			...
		]
	"""
	require_manager()
	# Determine company from branch for scope gating (mirrors ury_yield_variance.py pattern).
	company = frappe.db.get_value("Branch", branch, "company")
	_require_scope(company)

	# Fetch all yield-tracked items with cadence != None for this branch context.
	tracked_items = frappe.get_all(
		"Item",
		filters={
			"custom_yield_tracked": 1,
			"custom_yield_check_cadence": ["!=", "None"],
		},
		fields=[
			"name",
			"item_name",
			"custom_yield_check_cadence",
			"custom_yield_check_interval_days",
		],
	)

	due_items = []
	for item in tracked_items:
		reason, extra = _evaluate_cadence(item, branch)
		if reason:
			due_item = {
				"item": item.name,
				"item_name": item.item_name,
				"cadence": item.custom_yield_check_cadence,
				"reason": reason,
			}
			if extra:
				due_item.update(extra)
			due_items.append(due_item)

	return due_items


@frappe.whitelist()
def get_due_yield_checks_api(branch):
	"""Whitelisted API version of get_due_yield_checks for frontend calls.

	Args:
		branch: Branch name.

	Returns:
		list of due items (same structure as get_due_yield_checks).
	"""
	return get_due_yield_checks(branch)


def notify_overdue_yield_checks():
	"""Cron entry point: check all branches and notify of due yield checks.

	For each branch with due items, creates ONE Notification Log per branch
	(if not already alerted within the dedup window) summarizing the items.
	Uses the same notification approach as food_cost_alerts.py and reuses its
	dedup-by-subject pattern.
	"""
	try:
		_notify_overdue_yield_checks()
	except Exception:
		frappe.log_error(
			title="Yield Check Notification Failed",
			message=frappe.get_traceback(),
		)


def _notify_overdue_yield_checks():
	branches = frappe.get_all("Branch", fields=["name"])
	for branch_doc in branches:
		try:
			due_items = get_due_yield_checks(branch_doc.name)
			if not due_items:
				continue

			_notify_branch(branch_doc.name, due_items)
		except Exception:
			# Guard each branch independently so one failure doesn't abort others.
			frappe.log_error(
				title="Yield Check Notification Failed",
				message=frappe.get_traceback(),
			)


def _notify_branch(branch, due_items):
	"""Create notification for a branch with due items, deduped.

	Args:
		branch: Branch name.
		due_items: list of due item dicts from get_due_yield_checks.
	"""
	if not due_items:
		return

	# Dedup key: branch + today's date. This ensures we notify once per branch
	# per day, and avoid re-notifying if nothing changed.
	today_str = str(getdate())
	subject = f"Yield Check Reminder - {branch} ({today_str})"

	if _already_notified(subject):
		return

	# Build a summary message listing due items and their reasons.
	item_summaries = []
	for item in due_items:
		summary = f"{item['item_name']} ({item['cadence']})"
		if "days_overdue" in item:
			summary += f" - {item['days_overdue']} days overdue"
		item_summaries.append(summary)

	message = (
		f"The following items at branch {branch} are due for yield checks:\n\n"
		f"{chr(10).join('• ' + s for s in item_summaries)}"
	)

	# Notify users with the "Manager" role (or similar; follow food_cost_alerts pattern).
	# For now, create a system notification.
	# If a more sophisticated user/role resolution is needed, mirror get_users_with_role.
	try:
		frappe.get_doc({
			"doctype": "Notification Log",
			"subject": subject,
			"document_type": "Branch",
			"document_name": branch,
			"type": "Info",
			"content": message,
		}).insert(ignore_permissions=True)
	except Exception:
		frappe.log_error(
			title="Failed to create yield check notification",
			message=frappe.get_traceback(),
		)


def _already_notified(subject):
	"""True if a yield-check notification with this subject exists within the
	dedup window, preventing duplicate daily alerts.

	Mirrors _already_alerted from food_cost_alerts.py.
	"""
	window_start = add_to_date(now_datetime(), minutes=-NOTIFICATION_DEDUPE_WINDOW_MINUTES)
	return bool(
		frappe.db.exists(
			"Notification Log",
			{
				"subject": subject,
				"creation": [">", window_start],
			},
		)
	)


def _evaluate_cadence(item, branch):
	"""Evaluate a single item against its cadence mode.

	Args:
		item: Item dict with name, item_name, custom_yield_check_cadence,
		      custom_yield_check_interval_days.
		branch: Branch name.

	Returns:
		tuple (reason_string, extra_dict) where reason_string is None if not due,
		or a string explaining why it is due; extra_dict contains additional
		fields to add to the due item (e.g. days_overdue for Interval mode).
	"""
	cadence = item.get("custom_yield_check_cadence")

	if cadence == "Every Issue":
		return _evaluate_every_issue(item, branch)
	elif cadence == "Interval":
		return _evaluate_interval(item, branch)
	elif cadence == "Sampled":
		return _evaluate_sampled(item, branch)
	else:
		return None, None


def _evaluate_every_issue(item, branch):
	"""Every Issue: due if an authorized issue exists with no yield check logged.

	Returns:
		(reason_str, {}) if due, (None, None) if not.
	"""
	item_code = item.get("name")

	# Find authorized URY Issue Authorization for this item+branch.
	authorized_issues = frappe.get_all(
		"URY Issue Authorization",
		filters={
			"component_item": item_code,
			"branch": branch,
			"status": "Authorized",
		},
		fields=["name"],
	)

	if not authorized_issues:
		return None, None

	# Check if any authorized issue has a corresponding yield check.
	for issue in authorized_issues:
		existing_check = frappe.db.exists(
			"URY Yield Check",
			{
				"item": item_code,
				"branch": branch,
				"issue_authorization": issue.name,
			},
		)
		if not existing_check:
			return (
				f"Authorized issue {issue.name} pending yield check",
				{},
			)

	return None, None


def _evaluate_interval(item, branch):
	"""Interval: due if >interval_days since last check (or never checked).

	Returns:
		(reason_str, {"days_overdue": int}) if due, (None, None) if not.
	"""
	item_code = item.get("name")
	interval_days = item.get("custom_yield_check_interval_days", 0)

	if interval_days <= 0:
		return None, None

	# Find the most recent yield check for this item+branch.
	last_check = frappe.db.get_value(
		"URY Yield Check",
		{
			"item": item_code,
			"branch": branch,
		},
		"checked_on",
		order_by="checked_on desc",
	)

	today = getdate()

	# If never checked, due immediately. Use days since item creation as days_overdue
	# to highlight items that have never been checked in the Overdue report.
	if not last_check:
		item_creation = frappe.db.get_value("Item", item_code, "creation")
		item_creation_date = getdate(item_creation)
		days_since_creation = (today - item_creation_date).days
		return (
			f"No yield check recorded (interval: every {interval_days} days)",
			{"days_overdue": days_since_creation},
		)

	# Compute days overdue.
	last_check_date = getdate(last_check)
	days_since = (today - last_check_date).days

	if days_since > interval_days:
		days_overdue = days_since - interval_days
		return (
			f"{days_since} days since last check (interval: {interval_days} days)",
			{"days_overdue": days_overdue},
		)

	return None, None


def _evaluate_sampled(item, branch):
	"""Sampled: due if deterministic hash of (today, branch, item) falls within
	the sampling threshold.

	Returns:
		(reason_str, {}) if due, (None, None) if not.
	"""
	item_code = item.get("name")
	today_str = str(getdate())

	# Compute deterministic hash of today, branch, item.
	hash_input = f"{today_str}:{branch}:{item_code}"
	hash_value = hashlib.md5(hash_input.encode()).hexdigest()

	# Convert first 8 hex chars to a number in [0, 1).
	hash_int = int(hash_value[:8], 16)
	normalized_hash = (hash_int % 1000000) / 1000000.0

	if normalized_hash < SAMPLING_RATE:
		return (
			f"Sampled for check ({SAMPLING_RATE * 100:.0f}% rate)",
			{},
		)

	return None, None


def _require_scope(company):
	"""Fail closed if company scope is missing, matching ury_yield_variance.py pattern."""
	if not company:
		frappe.throw(
			"Company is required",
			frappe.ValidationError,
		)
