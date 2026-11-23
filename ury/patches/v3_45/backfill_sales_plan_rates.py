import frappe
from frappe.utils import flt

from ury.ury.api.ury_sales_plan_rate import resolve_item_rates


def execute():
	"""Backfill rate, amount and expected_sales_amount on existing Sales Plans.

	Raw db writes (no save/submit) so approved and locked plans keep their
	workflow state and modified timestamp.
	"""
	frappe.reload_doc("ury", "doctype", "ury_sales_plan_item")
	frappe.reload_doc("ury", "doctype", "ury_sales_plan")

	for plan in frappe.get_all("URY Sales Plan", fields=["name", "branch"]):
		rows = frappe.get_all(
			"URY Sales Plan Item",
			filters={"parent": plan.name, "parenttype": "URY Sales Plan"},
			fields=["name", "item_code", "qty"],
		)
		rates = resolve_item_rates([r.item_code for r in rows], plan.branch)
		total = 0.0
		for row in rows:
			rate = flt(rates.get(row.item_code))
			amount = flt(flt(row.qty) * rate)
			total += amount
			frappe.db.set_value(
				"URY Sales Plan Item", row.name, {"rate": rate, "amount": amount}, update_modified=False
			)
		frappe.db.set_value("URY Sales Plan", plan.name, "expected_sales_amount", total, update_modified=False)
