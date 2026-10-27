# Copyright (c) 2024, Tridz and contributors
# For license information, please see license.txt

import frappe
from operator import itemgetter

def execute(filters=None):
	# frappe.msgprint(title='Message',indicator='red',msg=("Complete Order Taker Checklist"))
	branch = filters.get("branch")
	pos_profile = frappe.db.exists(
		"POS Profile", {"branch": branch}
	)
	pos_prof = frappe.get_doc('POS Profile' , pos_profile)
	if pos_prof.buying_price_list == "" or pos_prof.buying_price_list == None:
		frappe.throw("Please set a Buying Price List in the POS Profile.")
	buying_price_list = pos_prof.buying_price_list
	price_list = pos_prof.selling_price_list
	columns, data = [], []
	unsorted_data = []
	non_pb_items = frappe.db.sql('''
		SELECT
			a.item_name AS "Item Name",
			c.price_list_rate AS "Selling Price",
			b.price_list_rate AS "Food Cost",
			ROUND((b.price_list_rate/c.price_list_rate)*100,2) AS "Food Cost Percentage",
			ROUND((c.price_list_rate - b.price_list_rate),2) AS "Gross Profit",
			ROUND(((c.price_list_rate-b.price_list_rate)/c.price_list_rate)*100,2) AS "Gross Profit Percentage"
		FROM `tabItem` a
		LEFT JOIN `tabItem Price` b ON (
			b.item_code = a.item_code
			AND b.`price_list` = %(buying_price_list)s
			AND b.buying = 1
		)
		LEFT JOIN `tabItem Price` c ON (
			c.item_code = a.item_code
			AND c.`price_list` = %(price_list)s
			AND c.selling = 1
		)
		LEFT JOIN `tabProduct Bundle` d ON d.new_item_code = a.item_code
		WHERE
			b.item_code IS NOT NULL
			AND c.item_code IS NOT NULL
			AND d.new_item_code IS NULL
		GROUP BY 
			a.item_name
		ORDER BY 
			a.item_name ASC
	''', {"price_list": price_list, "buying_price_list": buying_price_list}, as_dict=True)
	data = []
	for item in non_pb_items:
		item_data = [
			item["Item Name"],
			item["Selling Price"],
			item["Food Cost"],
			item["Food Cost Percentage"],
			item["Gross Profit"],
			item["Gross Profit Percentage"]
		]
		unsorted_data.append(item)
	
	pb_items = frappe.db.sql('''
		SELECT
			a.item_name AS "Item Name",
			a.item_code AS "Item Code",
			b.price_list_rate AS "Selling Price"
		FROM `tabItem` a
		LEFT JOIN `tabItem Price` b ON (
			b.item_code = a.item_code
			AND b.`price_list` = %(price_list)s
			AND b.selling = 1
		)
		LEFT JOIN `tabProduct Bundle` d ON d.new_item_code = a.item_code
		WHERE
			b.item_code IS NOT NULL
			AND d.new_item_code IS NOT NULL
		GROUP BY 
			a.item_name
		ORDER BY 
			a.item_name ASC
	''', {"price_list": price_list}, as_dict=True)

	for item in pb_items:
		pb_items = frappe.db.get_all("Product Bundle",fields = ("*"),filters = {'new_item_code':item['Item Code']})
		pb = frappe.get_doc("Product Bundle",pb_items[0].name)
		food_cost = 0
		food_cost_complete = True
		for pb_item in pb.items:
			if food_cost_complete == True:
				item_qty = pb_item.qty
				boms = frappe.db.get_all("BOM",fields = ("*"),filters = {'item':pb_item.item_code,'is_active':1,'is_default':1,'docstatus':1})
				if len(boms) > 0:
					bom_buying_price = 0
					bom = frappe.get_doc("BOM",boms[0].name)
					for bom_item in bom.items:
						bom_item_qty = pb_item.qty
						bom_items_price = frappe.db.get_all("Item Price",fields = ['name','price_list_rate'],filters = {'price_list':buying_price_list,'item_code':bom_item.item_code})
						if len(bom_items_price) == 0:
							food_cost_complete =  False
						else:
							bom_buying_price += float(bom_items_price[0].price_list_rate)*bom_item_qty
					bom_buying_price = bom_buying_price/bom.quantity
					food_cost += float(bom_buying_price)*item_qty
				else:
					sub_item = frappe.get_doc("Item",pb_item.item_code)
					items_price = frappe.db.get_all("Item Price",fields = ['name','price_list_rate'],filters = {'price_list':buying_price_list,'item_code':pb_item.item_code})
					if len(items_price) == 0:
						food_cost_complete =  False
					else:
						food_cost += float(items_price[0].price_list_rate)*item_qty
		
		if food_cost_complete == True:
			item_data ={
				"Item Name":item["Item Name"],
				"Selling Price":item["Selling Price"],
				"Food Cost":round(food_cost,2),
				"Food Cost Percentage":round((food_cost/item["Selling Price"])*100,2),
				"Gross Profit":round((item["Selling Price"] - food_cost),2),
				"Gross Profit Percentage":round(((item["Selling Price"]-food_cost)/item["Selling Price"])*100,2)
			}
			unsorted_data.append(item_data)
	if unsorted_data != []:
		sorted_data = sorted(unsorted_data, key=itemgetter('Food Cost Percentage'),reverse=True)
		num_items_to_display = 3
		top_items = sorted_data[-num_items_to_display:]  # Top 3 highest
		bottom_items = sorted_data[:num_items_to_display]  # Top 3 lowest
		# frappe.msgprint(title='Message',indicator='red',msg=("Complete Order Taker Checklist"))
		total_rows = len(sorted_data)
		for index, dat in enumerate(bottom_items + top_items):
			red = int(255 - (255 * index / total_rows))
			green = int(255 * index / total_rows)

			if index < total_rows/2:
				color = f'rgb(255, {green}, 0)'
			else:
				color = f'rgb({red}, 255, 0)'

			# Create a row with the 'Food Cost' value and colored background
			row = [
				f' {dat["Item Name"]} <span style="display: block; width: 100%; background-color: {color};"><hr style="height: 10px;"></span>',
				dat["Selling Price"],
				dat["Food Cost"],
				dat["Food Cost Percentage"],
				dat["Gross Profit"],
				dat["Gross Profit Percentage"]
			]
			data.append(row)
	columns = ["Item Name","Selling Price","Food Cost","Food Cost Percentage","Gross Profit","Gross Profit Percentage"]
	return columns, data
