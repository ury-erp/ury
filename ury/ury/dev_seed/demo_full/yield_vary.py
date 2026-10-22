"""Vary per-item yield-check completeness so the Yield Compliance demo is not uniform."""
import frappe

# Checks to keep per tracked item, cycled across items (interval 2 days => 15 required).
KEEP = [10, 9, 7, 11, 4, 8]


def run():
	items = frappe.get_all("Item", filters={"custom_yield_tracked": 1}, pluck="name", order_by="name asc")
	out = {}
	for i, item in enumerate(items):
		keep = KEEP[i % len(KEEP)]
		checks = frappe.get_all("URY Yield Check", filters={"item": item}, fields=["name", "docstatus"], order_by="checked_on desc")
		for c in checks[keep:]:
			if c.docstatus == 1:
				frappe.get_doc("URY Yield Check", c.name).cancel()
			frappe.delete_doc("URY Yield Check", c.name, force=True, ignore_permissions=True)
		out[item] = min(keep, len(checks))
	frappe.db.commit()
	print(out)
	return out
