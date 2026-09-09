# Copyright (c) 2024, Tridz and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils import getdate
from typing import Dict, List
from ury.ury.services.bom_cost_resolver import resolve_item_cost, resolve_product_bundle_cost

Columns = List[Dict[str, str]]


def execute(filters=None):
	"""Generate the Product Categorization report (BCG-matrix style menu engineering).

	Classifies items into four categories based on sales volume and gross margin percentage:
	- Star: high volume, high margin
	- Work Horse: high volume, low margin
	- Dog: low volume, low margin
	- Puzzle: low volume, high margin
	"""
	if not filters:
		filters = {}

	branch = filters.get("branch")
	category = filters.get("category")
	start_date = getdate(filters.get("start_date"))
	end_date = getdate(filters.get("end_date"))

	# Get POS Profile and validate
	pos_profile = frappe.db.exists("POS Profile", {"branch": branch})
	if not pos_profile:
		frappe.throw(f"No POS Profile found for branch {branch}.")

	pos_prof = frappe.get_doc("POS Profile", pos_profile)
	if not pos_prof.buying_price_list:
		frappe.throw("Please set a Buying Price List in the POS Profile.")

	buying_price_list = pos_prof.buying_price_list
	selling_price_list = pos_prof.selling_price_list

	# Get category thresholds from POS Profile
	category_mapping = [
		{"category": "Star", "margin": pos_prof.high_margin, "volume": pos_prof.high_volume},
		{"category": "Work Horse", "margin": pos_prof.low_margin, "volume": pos_prof.high_volume},
		{"category": "Dog", "margin": pos_prof.low_margin, "volume": pos_prof.low_volume},
		{"category": "Puzzle", "margin": pos_prof.high_margin, "volume": pos_prof.low_volume},
	]

	# Find the margin and volume thresholds for the requested category
	margin_threshold = None
	volume_threshold = None
	for cat_info in category_mapping:
		if cat_info["category"] == category:
			margin_threshold = cat_info["margin"]
			volume_threshold = cat_info["volume"]
			break

	if margin_threshold is None:
		frappe.throw(f"Invalid category: {category}")

	# Query for items sold in the date range (excluding product bundles)
	non_pb_items = frappe.db.sql("""
		SELECT
			a.item_code,
			a.item_name,
			a.item_group,
			SUM(sii.qty) AS total_qty
		FROM `tabItem` a
		LEFT JOIN `tabSales Invoice Item` sii ON sii.item_code = a.item_code
		LEFT JOIN `tabSales Invoice` si ON (
			si.name = sii.parent
			AND si.docstatus = 1
			AND DATE(si.posting_date) >= %s
			AND DATE(si.posting_date) <= %s
			AND si.branch = %s
		)
		LEFT JOIN `tabProduct Bundle` pb ON pb.new_item_code = a.item_code
		WHERE
			pb.new_item_code IS NULL
			AND sii.item_code IS NOT NULL
		GROUP BY a.item_code, a.item_name, a.item_group
	""", (start_date, end_date, branch), as_dict=True)

	# Query for product bundle items sold in the date range
	pb_items = frappe.db.sql("""
		SELECT
			a.item_code,
			a.item_name,
			a.item_group,
			SUM(sii.qty) AS total_qty
		FROM `tabItem` a
		LEFT JOIN `tabSales Invoice Item` sii ON sii.item_code = a.item_code
		LEFT JOIN `tabSales Invoice` si ON (
			si.name = sii.parent
			AND si.docstatus = 1
			AND DATE(si.posting_date) >= %s
			AND DATE(si.posting_date) <= %s
			AND si.branch = %s
		)
		LEFT JOIN `tabProduct Bundle` pb ON pb.new_item_code = a.item_code
		WHERE
			pb.new_item_code IS NOT NULL
			AND sii.item_code IS NOT NULL
		GROUP BY a.item_code, a.item_name, a.item_group
	""", (start_date, end_date, branch), as_dict=True)

	# Process regular items
	categorized_items = []

	for item in non_pb_items:
		item_code = item["item_code"]
		item_name = item["item_name"]
		item_group = item["item_group"]
		total_qty = item["total_qty"]

		# Get selling price
		selling_price = frappe.db.get_value(
			"Item Price",
			{
				"item_code": item_code,
				"price_list": selling_price_list,
				"selling": 1,
			},
			"price_list_rate",
		) or 0

		# Get food cost using bom_cost_resolver
		cost_result = resolve_item_cost(
			item_code,
			buying_price_list,
			qty=1,
			max_depth=2,
		)
		food_cost = cost_result.get("cost", 0)

		# Calculate margin if selling price is available
		if selling_price > 0:
			gross_profit = selling_price - food_cost
			gross_profit_pct = (gross_profit / selling_price) * 100
		else:
			gross_profit = 0
			gross_profit_pct = 0

		# Check if item matches the category criteria
		if _matches_category(category, total_qty, gross_profit_pct, volume_threshold, margin_threshold):
			categorized_items.append({
				"item_group": item_group,
				"item_name": item_name,
				"qty": total_qty,
				"margin_pct": round(gross_profit_pct, 2),
			})

	# Process product bundle items
	for item in pb_items:
		item_code = item["item_code"]
		item_name = item["item_name"]
		item_group = item["item_group"]
		total_qty = item["total_qty"]

		# Get selling price
		selling_price = frappe.db.get_value(
			"Item Price",
			{
				"item_code": item_code,
				"price_list": selling_price_list,
				"selling": 1,
			},
			"price_list_rate",
		) or 0

		# Get bundle cost using bom_cost_resolver
		cost_result = resolve_product_bundle_cost(
			item_code,
			buying_price_list,
			max_depth=2,
		)
		food_cost = cost_result.get("cost", 0)

		# Calculate margin if selling price is available
		if selling_price > 0:
			gross_profit = selling_price - food_cost
			gross_profit_pct = (gross_profit / selling_price) * 100
		else:
			gross_profit = 0
			gross_profit_pct = 0

		# Check if item matches the category criteria
		if _matches_category(category, total_qty, gross_profit_pct, volume_threshold, margin_threshold):
			categorized_items.append({
				"item_group": item_group,
				"item_name": item_name,
				"qty": total_qty,
				"margin_pct": round(gross_profit_pct, 2),
			})

	# Sort by item group
	categorized_items.sort(key=lambda x: (x["item_group"], x["item_name"]))

	# Format data for report
	data = [
		[
			item["item_group"],
			item["item_name"],
			item["qty"],
			item["margin_pct"],
		]
		for item in categorized_items
	]

	columns = get_columns()
	return columns, data


def _matches_category(category: str, volume: float, margin_pct: float, volume_threshold: float, margin_threshold: float) -> bool:
	"""Check if an item matches the category criteria.

	Star: volume > threshold AND margin > threshold
	Work Horse: volume > threshold AND margin < threshold
	Dog: volume < threshold AND margin < threshold
	Puzzle: volume < threshold AND margin > threshold
	"""
	if category == "Star":
		return volume > volume_threshold and margin_pct > margin_threshold
	elif category == "Work Horse":
		return volume > volume_threshold and margin_pct < margin_threshold
	elif category == "Dog":
		return volume < volume_threshold and margin_pct < margin_threshold
	elif category == "Puzzle":
		return volume < volume_threshold and margin_pct > margin_threshold
	else:
		return False


def get_columns() -> Columns:
	"""Return the column definitions for the report."""
	return [
		{"label": _("Item Group"), "fieldname": "item_group", "fieldtype": "Data", "width": 200},
		{"label": _("Item Name"), "fieldname": "item_name", "fieldtype": "Data", "width": 200},
		{"label": _("Qty"), "fieldname": "qty", "fieldtype": "Float", "width": 150},
		{"label": _("Margin %"), "fieldname": "margin_pct", "fieldtype": "Percent", "width": 150},
	]
