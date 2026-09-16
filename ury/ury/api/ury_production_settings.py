import frappe


def get_store_warehouse():
	"""Returns the configured Store warehouse, or None if not set."""
	return frappe.db.get_single_value("URY Production Settings", "store_warehouse")


def auto_production_plan_enabled():
	return bool(frappe.db.get_single_value("URY Production Settings", "enable_auto_production_plan"))
