"""Bounded manual test-data seed for the sa-v3_nxt V3 track's live bench.

Deliberately small and additive: 2 production departments (matching the
existing Kitchen/Bar production units), a handful of item production
configurations, and one draft URY Sales Plan with real items and real
comparable-weekday history so the Sales Plan page has something to show.

Idempotent: safe to re-run, skips anything that already exists by name.
"""

import frappe
from frappe.utils import nowdate


def run():
	company = "URY"
	branch = "URY Branch"
	warehouse = "Kitchen - U"
	cost_center = "URY - U"

	departments = [
		{"department_name": "Kitchen", "production_unit": "Kitchen"},
		{"department_name": "Bar", "production_unit": "Bar"},
	]

	dept_names = {}
	for d in departments:
		if frappe.db.exists("URY Production Department", d["department_name"]):
			dept_names[d["production_unit"]] = d["department_name"]
			continue
		doc = frappe.get_doc(
			{
				"doctype": "URY Production Department",
				"department_name": d["department_name"],
				"enabled": 1,
				"company": company,
				"branch": branch,
				"department_warehouse": warehouse,
				"cost_center": cost_center,
				"issue_control_policy": "Plan Controlled",
			}
		)
		doc.insert(ignore_permissions=True)
		dept_names[d["production_unit"]] = doc.name
		print(f"Created URY Production Department: {doc.name}")

	# Link the two existing Production Units to their departments (V3-12
	# field), if the field exists and isn't already set.
	for prod_unit, dept in dept_names.items():
		if not frappe.db.exists("URY Production Unit", prod_unit):
			continue
		meta = frappe.get_meta("URY Production Unit")
		if not meta.has_field("department"):
			continue
		current = frappe.db.get_value("URY Production Unit", prod_unit, "department")
		if not current:
			frappe.db.set_value("URY Production Unit", prod_unit, "department", dept)
			print(f"Linked Production Unit {prod_unit} -> department {dept}")

	# A handful of real, existing items get an Item Production Configuration
	# row so the Sales Plan / availability pages have something real to show.
	sample_items = frappe.get_all(
		"Item",
		filters={"is_stock_item": 1, "disabled": 0},
		fields=["item_code", "stock_uom"],
		limit=8,
	)

	item_config_names = []
	for item in sample_items:
		existing = frappe.db.exists(
			"URY Item Production Configuration", {"item": item.item_code}
		)
		if existing:
			item_config_names.append((item.item_code, item.stock_uom))
			continue
		doc = frappe.get_doc(
			{
				"doctype": "URY Item Production Configuration",
				"item": item.item_code,
				"branch": branch,
				"department": dept_names.get("Kitchen"),
				"production_unit": "Kitchen",
				"production_policy": "PRE_PRODUCED",
				"active": 1,
			}
		)
		try:
			doc.insert(ignore_permissions=True)
			item_config_names.append((item.item_code, item.stock_uom))
			print(f"Created Item Production Configuration for {item.item_code}")
		except Exception as e:
			print(f"Skipped {item.item_code}: {e}")

	# One draft Sales Plan with real item rows, so the page has data to
	# render instead of an empty state.
	plan_name = frappe.db.exists(
		"URY Sales Plan", {"branch": branch, "plan_date": nowdate()}
	)
	if not plan_name:
		items = []
		for item_code, uom in item_config_names[:5]:
			items.append(
				{
					"item_code": item_code,
					"qty": 10,
					"stock_uom": uom,
					"department": dept_names.get("Kitchen"),
					"production_unit": "Kitchen",
					"production_policy": "PRE_PRODUCED",
				}
			)
		plan = frappe.get_doc(
			{
				"doctype": "URY Sales Plan",
				"status": "Draft",
				"branch": branch,
				"company": company,
				"plan_date": nowdate(),
				"service_period": "Full Day",
				"items": items,
			}
		)
		plan.insert(ignore_permissions=True)
		print(f"Created draft URY Sales Plan: {plan.name}")
	else:
		print(f"URY Sales Plan for today already exists: {plan_name}")

	frappe.db.commit()
	print("Seed complete.")
