import frappe


def get_store_warehouse(company=None):
	"""Returns the Store warehouse, or None if not set.

	The setting is a site-wide Single, but a Store must belong to the same
	company as the plan it serves (ERPNext rejects cross-company transfers and
	Material Requests). When ``company`` is given and the configured Store
	belongs to another company, fall back to that company's own
	``Stores - <abbr>`` -- the same warehouse department Production Plans use
	as ``for_warehouse``.
	"""
	store = frappe.db.get_single_value("URY Production Settings", "store_warehouse")
	if not company:
		return store
	if store and frappe.db.get_value("Warehouse", store, "company") == company:
		return store
	abbr = frappe.get_cached_value("Company", company, "abbr")
	company_store = f"Stores - {abbr}" if abbr else None
	if company_store and frappe.db.exists("Warehouse", {"name": company_store, "company": company}):
		return company_store
	return store


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
