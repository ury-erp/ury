"""URY Brief is served by Huf's portal renderer. Huf never overwrites www_template/delivery on re-sync,
so existing sites that registered the tile as a launcher get the portal settings here."""

import frappe


def execute():
	if not frappe.db.exists("DocType", "HUF App") or not frappe.db.exists("HUF App", "brief"):
		return
	meta = frappe.get_meta("HUF App")
	wanted = {"www_template": "brief_app", "delivery": "portal", "static_routes": "sw.js"}
	values = {k: v for k, v in wanted.items() if meta.has_field(k)}  # older Huf lacks some fields
	if values:
		frappe.db.set_value("HUF App", "brief", values)
