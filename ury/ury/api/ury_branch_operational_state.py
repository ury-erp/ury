"""Read-only, server-authoritative branch operating state."""

from datetime import datetime, time

import frappe
from frappe import _
from frappe.utils import get_datetime, getdate, now_datetime

from ury.ury_pos.api import getBranch


def _as_time(value):
	if isinstance(value, time):
		return value
	return get_datetime(str(value)).time() if value else None


def _window_state(window, current_time):
	open_time = _as_time(window.get("open_time"))
	close_time = _as_time(window.get("close_time"))
	if not window.get("enabled", 1) or not open_time or not close_time:
		return None
	# A closing time earlier than opening time crosses midnight.
	active = (open_time <= current_time or current_time < close_time) if close_time <= open_time else open_time <= current_time < close_time
	return {"service_name": window.get("service_name"), "open_time": str(open_time), "close_time": str(close_time), "active": active}


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
	day_field = when.strftime("%A").lower()
	windows = frappe.get_all("URY Branch Service Window", filters={"parent": _row_value(schedule, "name"), "parentfield": day_field, "parenttype": "URY Branch Operating Schedule"}, fields=["service_name", "open_time", "close_time", "enabled"], order_by="idx asc")
	exception = frappe.db.get_value("URY Branch Operating Exception", {"branch": branch, "exception_date": getdate(when)}, ["is_closed", "open_time", "close_time", "reason"], as_dict=True)
	if exception and _row_value(exception, "is_closed"):
		return _snapshot(branch, when, "OFF_HOURS", False, [], _row_value(exception, "reason") or "Operating exception", "HEALTHY")
	if exception and _row_value(exception, "open_time") and _row_value(exception, "close_time"):
		windows = [{"service_name": "Branch", "open_time": _row_value(exception, "open_time"), "close_time": _row_value(exception, "close_time"), "enabled": 1}]
	states = [state for window in windows if (state := _window_state(window, when.time()))]
	active = [state["service_name"] for state in states if state["active"]]
	phase = "SERVICE_OPEN" if active else "OFF_HOURS"
	return _snapshot(branch, when, phase, bool(active), active, None if active else "Outside configured service windows", "HEALTHY", states)


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
