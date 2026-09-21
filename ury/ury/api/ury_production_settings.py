import frappe


def get_store_warehouse():
	"""Returns the configured Store warehouse, or None if not set."""
	return frappe.db.get_single_value("URY Production Settings", "store_warehouse")


def auto_production_plan_enabled():
	return bool(frappe.db.get_single_value("URY Production Settings", "enable_auto_production_plan"))


def sales_plan_backward_guard_mode():
	"""'Block' (default) or 'Warn' -- see URY Production Settings."""
	return frappe.db.get_single_value("URY Production Settings", "sales_plan_backward_guard") or "Block"


def require_active_menu_for_planning():
	"""Default on: sellable items must be on an enabled branch menu to be planned."""
	value = frappe.db.get_single_value("URY Production Settings", "require_active_menu_for_planning")
	return True if value is None else bool(int(value))


def production_job_stale_minutes():
	"""Heartbeat staleness threshold (D17), not a total-runtime limit.

	A department Production Plan's execution attempt is recoverable only when
	its heartbeat has been stale for longer than this many minutes AND its
	recorded job is confirmed no longer running in the queue.
	"""
	value = frappe.db.get_single_value("URY Production Settings", "production_job_stale_minutes")
	return int(value) if value else 30
