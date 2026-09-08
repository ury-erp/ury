"""Read-only, server-authoritative branch operating state."""

from datetime import datetime, time, timedelta

import frappe
from frappe import _
from frappe.utils import get_datetime, getdate, now_datetime

from ury.ury_pos.api import getBranch


def _as_time(value):
	if isinstance(value, time):
		return value
	return get_datetime(str(value)).time() if value else None


def _window_state(window, current_time, is_carryover=False, service_date=None):
	open_time = _as_time(window.get("open_time"))
	close_time = _as_time(window.get("close_time"))
	if not window.get("enabled", 1) or not open_time or not close_time:
		return None
	# A closing time earlier than (or equal to) opening time crosses midnight.
	overnight = close_time <= open_time
	if is_carryover:
		# This window belongs to YESTERDAY's schedule row. It can only still be
		# active today if it is an overnight window and today's time-of-day has
		# not yet reached its close time. Yesterday's open_time is irrelevant
		# here — the window already opened on the day it belongs to.
		if not overnight:
			return None
		active = current_time < close_time
	else:
		# Today's own row. An overnight window only opens at/after its own
		# open_time; it must NOT be reported active before that just because
		# current_time happens to be less than close_time (that "still before
		# close" carryover state belongs to yesterday's row, handled above).
		active = (open_time <= current_time) if overnight else (open_time <= current_time < close_time)
	return {
		"service_name": window.get("service_name"),
		"open_time": str(open_time),
		"close_time": str(close_time),
		"active": active,
		"carryover": is_carryover,
		"service_date": str(service_date) if service_date else None,
	}


def _row_value(row, field, default=None):
	if row is None:
		return default
	if hasattr(row, "get"):
		return row.get(field, default)
	return getattr(row, field, default)


def resolve_branch_operational_state(branch=None, at=None):
	"""Return branch state; branch is always session-scoped unless privileged."""
	requested = branch
	session_branch = getBranch()
	if session_branch in (None, "", "all", "All", "ALL") and "System Manager" not in frappe.get_roles():
		frappe.throw(_("A single branch scope is required for operational state."), frappe.PermissionError)
	if requested and requested != session_branch and "System Manager" not in frappe.get_roles():
		frappe.throw(_("You do not have access to Branch {0}").format(requested), frappe.PermissionError)
	branch = requested or session_branch
	if branch in (None, "", "all", "All", "ALL"):
		frappe.throw(_("A concrete branch is required for operational state."), frappe.ValidationError)
	when = get_datetime(at) if at else now_datetime()
	schedule = frappe.db.get_value("URY Branch Operating Schedule", {"branch": branch}, ["name", "enabled"], as_dict=True)
	if not schedule or not _row_value(schedule, "enabled"):
		return _snapshot(branch, when, "NOT_CONFIGURED", False, [], "No enabled operating schedule", "WARNING")
	today_date = getdate(when)
	yesterday_date = today_date - timedelta(days=1)
	day_field = when.strftime("%A").lower()
	yesterday_day_field = datetime.combine(yesterday_date, time()).strftime("%A").lower()
	windows = frappe.get_all("URY Branch Service Window", filters={"parent": _row_value(schedule, "name"), "parentfield": day_field, "parenttype": "URY Branch Operating Schedule"}, fields=["service_name", "open_time", "close_time", "enabled"], order_by="idx asc")
	yesterday_windows = frappe.get_all("URY Branch Service Window", filters={"parent": _row_value(schedule, "name"), "parentfield": yesterday_day_field, "parenttype": "URY Branch Operating Schedule"}, fields=["service_name", "open_time", "close_time", "enabled"], order_by="idx asc")
	exception = frappe.db.get_value("URY Branch Operating Exception", {"branch": branch, "exception_date": today_date}, ["is_closed", "open_time", "close_time", "reason"], as_dict=True)
	yesterday_exception = frappe.db.get_value("URY Branch Operating Exception", {"branch": branch, "exception_date": yesterday_date}, ["is_closed", "open_time", "close_time", "reason"], as_dict=True)
	if exception and _row_value(exception, "is_closed"):
		return _snapshot(branch, when, "OFF_HOURS", False, [], _row_value(exception, "reason") or "Operating exception", "HEALTHY")
	if exception and _row_value(exception, "open_time") and _row_value(exception, "close_time"):
		windows = [{"service_name": "Branch", "open_time": _row_value(exception, "open_time"), "close_time": _row_value(exception, "close_time"), "enabled": 1}]
	# Yesterday's schedule (or its own exception override) may still be an
	# active overnight window that spans past midnight into today. An
	# explicit "closed" exception yesterday takes precedence and blocks any
	# carryover from that day, mirroring how a "closed" exception today
	# blocks today's own windows above.
	if yesterday_exception and _row_value(yesterday_exception, "is_closed"):
		yesterday_windows = []
	elif yesterday_exception and _row_value(yesterday_exception, "open_time") and _row_value(yesterday_exception, "close_time"):
		yesterday_windows = [{"service_name": "Branch", "open_time": _row_value(yesterday_exception, "open_time"), "close_time": _row_value(yesterday_exception, "close_time"), "enabled": 1}]
	states = [state for window in windows if (state := _window_state(window, when.time(), service_date=today_date))]
	carryover_states = [state for window in yesterday_windows if (state := _window_state(window, when.time(), is_carryover=True, service_date=yesterday_date))]
	all_states = carryover_states + states
	active = [state["service_name"] for state in all_states if state["active"]]
	phase = "SERVICE_OPEN" if active else "OFF_HOURS"
	# The service date is the calendar day the currently-open session logically
	# belongs to: if the branch is open only because of yesterday's overnight
	# carryover window, the session opened yesterday, not today.
	active_carryover = any(state["active"] for state in carryover_states)
	service_date = yesterday_date if active_carryover else today_date
	snapshot = _snapshot(branch, when, phase, bool(active), active, None if active else "Outside configured service windows", "HEALTHY", all_states)
	snapshot["service_date"] = str(service_date)
	return snapshot


def _snapshot(branch, when, phase, is_open, active_services, reason, health, services=None):
	return {
		"branch": branch,
		"service_date": str(getdate(when)),
		"inside_business_hours": is_open,
		"primary_phase": phase,
		"phase": phase,
		"state": phase,
		"health": health,
		"is_open": is_open,
		"summary": reason or ("Service is open" if is_open else "Closed now"),
		"active_services": active_services,
		"services": services or [],
		"progress": {},
		"blockers": [],
		"next_actions": [],
		"reason": reason,
	}


@frappe.whitelist(methods=["GET"])
def get_branch_operational_state(branch: str | None = None, at: str | None = None):
	return resolve_branch_operational_state(branch, at)
