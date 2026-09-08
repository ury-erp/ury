import frappe
from ury.services.bom_cost_resolver import resolve_item_cost, resolve_product_bundle_cost


def _resolve_disposable_cost(item_code, buying_price_list):
	"""Sum the cost of an item's mapped Disposable Items rows.

	Each `Disposable Items` child-table row (parent = item_code) links a
	disposable Item plus a qty. We resolve each disposable's own cost via
	resolve_item_cost and multiply by qty, so packaging/consumable cost
	that is invisible on the (zero-rated) POS Invoice line still shows up
	as real cost here.

	Returns 0.0 if the item has no mapped disposables.
	"""
	disposable_rows = frappe.get_all(
		"Disposable Items",
		filters={"parent": item_code},
		fields=["item", "qty"],
	)

	total_cost = 0.0
	for row in disposable_rows:
		if not row.item or not row.qty:
			continue
		result = resolve_item_cost(row.item, buying_price_list, qty=row.qty)
		total_cost += result.get("cost", 0) or 0

	return total_cost


def execute(filters=None):
	"""Generate Food Cost and Margin Report.

	Computes per-item food-cost % and gross-profit % by sourcing buying and selling
	price lists from the POS Profile. Handles both regular items and product bundles
	via the shared bom_cost_resolver utility for recursive BOM cost resolution.

	Args:
		filters: dict with 'branch' key (mandatory)

	Returns:
		(columns, data) where:
		- columns: list of column definitions
		- data: list of rows, sorted by item group and food cost %,
		        with food cost % column colored in a red->green heatmap
	"""
	branch = filters.get("branch")
	if not branch:
		frappe.throw("Branch is required.")

	# Get POS Profile for the branch
	pos_profile_name = frappe.db.exists("POS Profile", {"branch": branch})
	if not pos_profile_name:
		frappe.throw(f"No POS Profile found for branch: {branch}")

	pos_prof = frappe.get_doc("POS Profile", pos_profile_name)

	# Validate required price lists
	if not pos_prof.buying_price_list:
		frappe.throw("Please set a Buying Price List in the POS Profile.")
	if not pos_prof.selling_price_list:
		frappe.throw("Please set a Selling Price List in the POS Profile.")

	buying_price_list = pos_prof.buying_price_list
	selling_price_list = pos_prof.selling_price_list

	unsorted_data = []

	# Query non-product-bundle items with both buying and selling prices
	non_pb_items = frappe.db.sql('''
		SELECT
			a.item_code AS "item_code",
			a.item_name AS "Item Name",
			a.item_group AS "Item Group",
			c.price_list_rate AS "Selling Price",
			b.price_list_rate AS "Food Cost"
		FROM `tabItem` a
		LEFT JOIN `tabItem Price` b ON (
			b.item_code = a.item_code
			AND b.`price_list` = %(buying_price_list)s
			AND b.buying = 1
		)
		LEFT JOIN `tabItem Price` c ON (
			c.item_code = a.item_code
			AND c.`price_list` = %(selling_price_list)s
			AND c.selling = 1
		)
		LEFT JOIN `tabProduct Bundle` d ON d.new_item_code = a.item_code
		WHERE
			b.item_code IS NOT NULL
			AND c.item_code IS NOT NULL
			AND d.new_item_code IS NULL
		ORDER BY
			a.item_name ASC
	''', {"buying_price_list": buying_price_list, "selling_price_list": selling_price_list}, as_dict=True)

	# Process non-product-bundle items
	for item in non_pb_items:
		selling_price = float(item["Selling Price"]) if item["Selling Price"] else 0
		base_food_cost = float(item["Food Cost"]) if item["Food Cost"] else 0
		disposable_cost = round(_resolve_disposable_cost(item["item_code"], buying_price_list), 2)
		food_cost = round(base_food_cost + disposable_cost, 2)

		if selling_price > 0:
			food_cost_pct = round((food_cost / selling_price) * 100, 2)
			gross_profit = round(selling_price - food_cost, 2)
			gross_profit_pct = round((gross_profit / selling_price) * 100, 2)

			unsorted_data.append({
				"Item Name": item["Item Name"],
				"Item Group": item["Item Group"],
				"Selling Price": selling_price,
				"Food Cost": food_cost,
				"Disposable Cost": disposable_cost,
				"Food Cost Percentage": food_cost_pct,
				"Gross Profit": gross_profit,
				"Gross Profit Percentage": gross_profit_pct
			})

	# Query product-bundle items
	pb_items = frappe.db.sql('''
		SELECT
			a.item_code AS "item_code",
			a.item_name AS "Item Name",
			a.item_group AS "Item Group",
			b.price_list_rate AS "Selling Price"
		FROM `tabItem` a
		LEFT JOIN `tabItem Price` b ON (
			b.item_code = a.item_code
			AND b.`price_list` = %(selling_price_list)s
			AND b.selling = 1
		)
		LEFT JOIN `tabProduct Bundle` d ON d.new_item_code = a.item_code
		WHERE
			b.item_code IS NOT NULL
			AND d.new_item_code IS NOT NULL
		ORDER BY
			a.item_name ASC
	''', {"selling_price_list": selling_price_list}, as_dict=True)

	# Process product-bundle items using shared bom_cost_resolver utility
	for item in pb_items:
		selling_price = float(item["Selling Price"]) if item["Selling Price"] else 0

		if selling_price <= 0:
			continue

		# Use shared utility to resolve product bundle cost
		result = resolve_product_bundle_cost(
			item["item_code"],
			buying_price_list,
			max_depth=2
		)

		disposable_cost = round(_resolve_disposable_cost(item["item_code"], buying_price_list), 2)
		food_cost = result['cost'] + disposable_cost
		is_complete = result['complete']

		if is_complete:
			food_cost_pct = round((food_cost / selling_price) * 100, 2)
			gross_profit = round(selling_price - food_cost, 2)
			gross_profit_pct = round((gross_profit / selling_price) * 100, 2)

			unsorted_data.append({
				"Item Name": item["Item Name"],
				"Item Group": item["Item Group"],
				"Selling Price": selling_price,
				"Food Cost": round(food_cost, 2),
				"Disposable Cost": disposable_cost,
				"Food Cost Percentage": food_cost_pct,
				"Gross Profit": gross_profit,
				"Gross Profit Percentage": gross_profit_pct
			})

	# Sort by item group and food cost percentage
	if unsorted_data:
		sorted_data = sorted(unsorted_data, key=lambda x: (x["Item Group"], x["Food Cost Percentage"]))
		data = _apply_heatmap_coloring(sorted_data)
	else:
		data = []

	columns = [
		{"label": "Item Group", "fieldname": "Item Group", "fieldtype": "Data", "width": 150},
		{"label": "Item Name", "fieldname": "Item Name", "fieldtype": "Data", "width": 150},
		{"label": "Selling Price", "fieldname": "Selling Price", "fieldtype": "Currency", "width": 120},
		{"label": "Food Cost", "fieldname": "Food Cost", "fieldtype": "Currency", "width": 120},
		{"label": "Disposable Cost", "fieldname": "Disposable Cost", "fieldtype": "Currency", "width": 120},
		{"label": "Food Cost Percentage", "fieldname": "Food Cost Percentage", "fieldtype": "Data", "width": 150},
		{"label": "Gross Profit", "fieldname": "Gross Profit", "fieldtype": "Currency", "width": 120},
		{"label": "Gross Profit Percentage", "fieldname": "Gross Profit Percentage", "fieldtype": "Data", "width": 150}
	]

	return columns, data


def _apply_heatmap_coloring(sorted_data):
	"""Apply red->green heatmap coloring to Food Cost Percentage column.

	Groups by Item Group and applies color gradient within each group,
	where red (high cost %) transitions to green (low cost %).
	"""
	data = []
	current_item_group = None
	group_items = []

	for dat in sorted_data:
		item_group = dat["Item Group"]

		# When item group changes, process accumulated group and add separator row
		if item_group != current_item_group:
			if group_items:
				data.extend(_color_group_items(group_items))
				# Add visual separator row
				data.append([None, None, None, None, None, None, None, None])
			current_item_group = item_group
			group_items = []

		group_items.append(dat)

	# Process final group
	if group_items:
		data.extend(_color_group_items(group_items))

	return data


def _color_group_items(group_items):
	"""Apply gradient coloring to items within a group.

	Colors from red (highest cost %) to green (lowest cost %) based on position in sorted group.
	"""
	colored_rows = []
	group_count = len(group_items)

	for idx, dat in enumerate(group_items):
		# Calculate color: red at start (idx=0), green at end (idx=group_count-1)
		red = int(255 * (group_count - 1 - idx) / (group_count - 1)) if group_count > 1 else 255
		green = int(255 * idx / (group_count - 1)) if group_count > 1 else 0
		background_color = f'rgb({red}, {green}, 0)'

		# Format Food Cost Percentage with background color
		food_cost_pct_html = f'<span style="display: block; width: 100%; background-color: {background_color}; text-align:right; color:black;">{dat["Food Cost Percentage"]}</span>'

		row = [
			dat["Item Group"],
			dat["Item Name"],
			dat["Selling Price"],
			dat["Food Cost"],
			dat["Disposable Cost"],
			food_cost_pct_html,
			dat["Gross Profit"],
			dat["Gross Profit Percentage"]
		]
		colored_rows.append(row)

	return colored_rows
