"""Item rate resolution and amount totals for URY Sales Plan.

Rates come from ``Item Price`` through the Price List attached to a URY Menu
(``URY Menu.price_list``). Resolution order, per item:

1. The branch restaurant's default menu (``URY Restaurant.active_menu``).
2. The price lists of the branch's other URY Menus (ordered by menu name).
3. Not found: rate 0 (never an error).
"""

import frappe
from frappe.utils import flt


def get_branch_price_lists(branch):
	"""Ordered, de-duplicated price lists for a branch: default menu first."""
	if not branch:
		return []

	price_lists = []

	active_menu = frappe.db.get_value("URY Restaurant", {"branch": branch}, "active_menu")
	if active_menu:
		default_price_list = frappe.db.get_value("URY Menu", active_menu, "price_list")
		if default_price_list:
			price_lists.append(default_price_list)

	for price_list in frappe.get_all(
		"URY Menu",
		filters={"branch": branch, "price_list": ["is", "set"]},
		order_by="name asc",
		pluck="price_list",
	):
		if price_list not in price_lists:
			price_lists.append(price_list)

	return price_lists


def resolve_item_rates(item_codes, branch):
	"""Return ``{item_code: rate}`` for every requested item (0 when unpriced)."""
	codes = sorted({code for code in (item_codes or []) if code})
	rates = {code: 0.0 for code in codes}
	if not codes:
		return rates

	remaining = set(codes)
	for price_list in get_branch_price_lists(branch):
		if not remaining:
			break
		for row in frappe.get_all(
			"Item Price",
			filters={"price_list": price_list, "selling": 1, "item_code": ["in", list(remaining)]},
			fields=["item_code", "price_list_rate"],
			order_by="valid_from desc, modified desc",
		):
			if row["item_code"] in remaining:
				rates[row["item_code"]] = flt(row["price_list_rate"])
				remaining.discard(row["item_code"])

	return rates


def resolve_item_rate(item_code, branch):
	return resolve_item_rates([item_code], branch).get(item_code, 0.0)


@frappe.whitelist()
def get_item_rate(item_code, branch):
	"""Whitelisted wrapper used by the Desk form."""
	return resolve_item_rate(item_code, branch)


def populate_item_rates(doc):
	"""Set ``rate`` on every row from the branch menu price lists."""
	rows = doc.get("items") or []
	rates = resolve_item_rates([row.get("item_code") for row in rows], doc.get("branch"))
	for row in rows:
		row.rate = rates.get(row.get("item_code"), 0.0)


def calculate_totals(doc):
	"""Row amount = qty x rate; parent expected_sales_amount = sum of amounts."""
	total = 0.0
	for row in doc.get("items") or []:
		row.amount = flt(flt(row.get("qty")) * flt(row.get("rate")), row.precision("amount"))
		total += row.amount
	doc.expected_sales_amount = flt(total, doc.precision("expected_sales_amount"))
