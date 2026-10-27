# Copyright (c) 2024, Tridz and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import getdate
from datetime import datetime, timedelta, date
from ury.ury.doctype.ury_daily_p_and_l.ury_daily_p_and_l import inner_bom_process

def execute(filters=None):
    columns, data = [], []
    
    branch = filters.get('branch')

    if not frappe.db.exists("URY Report Settings", branch):
        frappe.throw(f"URY Report Settings not found for branch: {branch}. Create it to set the buying price list.")

    report_settings = frappe.get_doc("URY Report Settings", branch)

	# Get today's date
    today = datetime.today().date()

	# Calculate yesterday's date
    yesterday = today - timedelta(days=1)

    cogs = 0
    
    non_pb_item_sales = frappe.db.sql('''
		SELECT
			c.item_group AS "Item Group",
			c.item_code AS "Item Code",
			c.item_name AS "Item Name",
			SUM(b.qty) AS "Qty"
		FROM `tabPOS Invoice` a
		INNER JOIN `tabPOS Invoice Item` b ON (
			a.name = b.parent
			AND b.is_disposable = 0
		)
		LEFT JOIN `tabItem` c ON c.item_code = b.item_code
		LEFT JOIN `tabProduct Bundle` d ON d.new_item_code = b.item_code
		LEFT JOIN `tabBOM` e ON (
			e.item = b.item_code
			AND e.is_active = 1
			AND e.is_default = 1
			AND e.docstatus = 1
		)
		LEFT JOIN `tabURY Report Settings` rs ON (
			rs.`branch` = %(branch)s
		)
		WHERE 
			a.`branch` = %(branch)s
			AND a.`status` IN ("Consolidated", "Paid") 
			AND a.`docstatus` = 1
			AND
			(
				(rs.`hours` IS NULL AND a.`posting_date` = %(date)s)
				OR (rs.`hours` > 0 AND TIMESTAMP(a.`posting_date`, a.`posting_time`) <= TIMESTAMP(DATE_ADD(%(date)s, INTERVAL 1 DAY), CONCAT(LPAD(rs.`hours`, 2, '0'), ':00:00')) AND TIMESTAMP(a.`posting_date`, a.`posting_time`) >= TIMESTAMP(%(date)s, CONCAT(LPAD(rs.`hours`, 2, '0'), ':00:00')))
				OR (rs.`branch` IS NULL AND a.`posting_date` = %(date)s)
			)
			AND d.new_item_code IS NULL
			AND e.item IS NULL
		GROUP BY 
			c.item_name
		ORDER BY 
			c.item_group ASC, b.item_name ASC
	''', {"branch": branch, "date": yesterday}, as_dict=True)

    bom_item_sales = frappe.db.sql('''
		SELECT
			c.item_group AS "Item Group",
			c.item_code AS "Item Code",
			c.item_name AS "Item Name",
			SUM(b.qty) AS "Qty"
		FROM `tabPOS Invoice` a
		INNER JOIN `tabPOS Invoice Item` b ON (
			a.name = b.parent
			AND b.is_disposable = 0
		)
		LEFT JOIN `tabItem` c ON c.item_code = b.item_code
		LEFT JOIN `tabProduct Bundle` d ON d.new_item_code = b.item_code
		LEFT JOIN `tabBOM` e ON (
			e.item = b.item_code
			AND e.is_active = 1
			AND e.is_default = 1
			AND e.docstatus = 1
		)
		LEFT JOIN `tabURY Report Settings` rs ON (
			rs.`branch` = %(branch)s
		)
		WHERE 
			a.`branch` = %(branch)s
			AND a.`status` IN ("Consolidated", "Paid") 
			AND a.`docstatus` = 1
			AND
			(
				(rs.`hours` IS NULL AND a.`posting_date` = %(date)s)
				OR (rs.`hours` > 0 AND TIMESTAMP(a.`posting_date`, a.`posting_time`) <= TIMESTAMP(DATE_ADD(%(date)s, INTERVAL 1 DAY), CONCAT(LPAD(rs.`hours`, 2, '0'), ':00:00')) AND TIMESTAMP(a.`posting_date`, a.`posting_time`) >= TIMESTAMP(%(date)s, CONCAT(LPAD(rs.`hours`, 2, '0'), ':00:00')))
				OR (rs.`branch` IS NULL AND a.`posting_date` = %(date)s)
			)
			AND d.new_item_code IS NULL
			AND e.item IS NOT NULL
		GROUP BY 
			c.item_name
		ORDER BY 
			c.item_group ASC, b.item_name ASC
	''', {"branch": branch, "date": yesterday}, as_dict=True)

    pb_item_sales = frappe.db.sql('''
		SELECT
			c.item_group AS "Item Group",
			c.item_code AS "Item Code",
			c.item_name AS "Item Name",
			SUM(b.qty) AS "Qty"
		FROM `tabPOS Invoice` a
		INNER JOIN `tabPOS Invoice Item` b ON (
			a.name = b.parent
			AND b.is_disposable = 0
		)
		LEFT JOIN `tabItem` c ON c.item_code = b.item_code
		LEFT JOIN `tabProduct Bundle` d ON d.new_item_code = b.item_code
		LEFT JOIN `tabURY Report Settings` rs ON (
			rs.`branch` = %(branch)s
		)
		WHERE 
			a.`branch` = %(branch)s
			AND a.`status` IN ("Consolidated", "Paid") 
			AND a.`docstatus` = 1
			AND
			(
				(rs.`hours` IS NULL AND a.`posting_date` = %(date)s)
				OR (rs.`hours` > 0 AND TIMESTAMP(a.`posting_date`, a.`posting_time`) <= TIMESTAMP(DATE_ADD(%(date)s, INTERVAL 1 DAY), CONCAT(LPAD(rs.`hours`, 2, '0'), ':00:00')) AND TIMESTAMP(a.`posting_date`, a.`posting_time`) >= TIMESTAMP(%(date)s, CONCAT(LPAD(rs.`hours`, 2, '0'), ':00:00')))
				OR (rs.`branch` IS NULL AND a.`posting_date` = %(date)s)
			)
			AND d.new_item_code IS NOT NULL
		GROUP BY 
			c.item_name
		ORDER BY 
			c.item_group ASC, b.item_name ASC
	''', {"branch": branch, "date": yesterday}, as_dict=True)

    cogs_items = {}
    for item in non_pb_item_sales:
        items_price = frappe.db.get_all("Item Price",fields = ['name','price_list_rate'],filters = {'price_list':report_settings.buying_price_list,'item_code':item['Item Code']})
        item_name = item['Item Name']
        if len(items_price) > 0:
            qty = int(item['Qty'])
            if item['Item Group'] in cogs_items:
                cogs_items[item['Item Group']] += items_price[0].price_list_rate * qty
            else:
                cogs_items[item['Item Group']] = items_price[0].price_list_rate * qty
            cogs = cogs + items_price[0].price_list_rate * qty
	
    unset_bom_item_prices = []
    for item in bom_item_sales:
        buying_price = 0
        buying_price_list = report_settings.buying_price_list
        boms = frappe.db.get_all("BOM",fields = ("*"),filters = {'item':item['Item Code'],'is_active':1,'is_default':1,'docstatus':1})
        bom = frappe.get_doc("BOM",boms[0].name)
        bom_data = inner_bom_process(buying_price_list,bom)
        bom_buying_price = bom_data['bom_buying_price']
        unset_bom_items = bom_data['unset_bom_items']
        buying_price += float(bom_buying_price)
        for unset_item in unset_bom_items:
            if unset_item not in unset_bom_item_prices:
                unset_bom_item_prices.append(unset_item)
        if buying_price > 0:
            qty = float(item['Qty'])
            if item['Item Group'] in cogs_items:
                cogs_items[item['Item Group']] += buying_price * qty
            else:
                cogs_items[item['Item Group']] = buying_price * qty
            cogs = cogs + buying_price * qty

    unset_pb_item_prices = []
    for item in pb_item_sales:
        pb_items = frappe.db.get_all("Product Bundle",fields = ("*"),filters = {'new_item_code':item['Item Code']})
        pb = frappe.get_doc("Product Bundle",pb_items[0].name)
        buying_price = 0
        for pb_item in pb.items:
            item_qty = pb_item.qty
            boms = frappe.db.get_all("BOM",fields = ("*"),filters = {'item':pb_item.item_code,'is_active':1,'is_default':1,'docstatus':1})
            if len(boms) > 0:
                buying_price_list = report_settings.buying_price_list
                bom = frappe.get_doc("BOM",boms[0].name)
                bom_data = inner_bom_process(buying_price_list,bom)
                bom_buying_price = bom_data['bom_buying_price']
                unset_bom_items = bom_data['unset_bom_items']
                buying_price += float(bom_buying_price)*item_qty
                for unset_item in unset_bom_items:
                    if unset_item not in unset_bom_item_prices:
                        unset_bom_item_prices.append(unset_item)
            else:
                sub_item = frappe.get_doc("Item",pb_item.item_code)
                item_name = sub_item.item_name
                items_price = frappe.db.get_all("Item Price",fields = ['name','price_list_rate'],filters = {'price_list':report_settings.buying_price_list,'item_code':pb_item.item_code})
                if len(items_price) == 0:
                    if item_name not in unset_pb_item_prices:
                        unset_pb_item_prices.append(item_name)
                else:
                    buying_price += float(items_price[0].price_list_rate)*item_qty
		
        if buying_price > 0:
            qty = float(item['Qty'])
            if item['Item Group'] in cogs_items:
                cogs_items[item['Item Group']] += buying_price * qty
            else:
                cogs_items[item['Item Group']] = buying_price * qty
            cogs = cogs + buying_price * qty

    sorted_items = dict(sorted(cogs_items.items(), key=lambda item: item[1], reverse=True))

	# Convert sorted dictionary to a list of tuples
    sorted_items_list = list(sorted_items.items())

	# Access the first and last items
    highest = sorted_items_list[0]
    lowest = sorted_items_list[-1]

    data.append({
		"cogs": cogs,
		"cogs_percent": 100,
        "lowest_item":lowest[0],
        "lowest_cost": lowest[1],
        "lowest_cost_percent": round((lowest[1]/cogs)*100,2),
        "highest_item":highest[0],
        "highest_cost": highest[1],
        "highest_cost_percent": round((highest[1]/cogs)*100,2)
	})

    columns = [
        {"label": "Cost Of Goods", "fieldname": "cogs", "fieldtype": "Currency", "width": 100},
        {"label": "Cost Of Goods Percentage", "fieldname": "cogs_percent", "fieldtype": "Percent", "width": 100},
        {"label": "Lowest Cost Group", "fieldname": "lowest_item", "fieldtype": "Data", "width": 200},
        {"label": "Lowest Cost", "fieldname": "lowest_cost", "fieldtype": "Currency", "width": 100},
        {"label": "Lowest Cost Percentage", "fieldname": "lowest_cost_percent", "fieldtype": "Percent", "width": 100},
        {"label": "Highest Cost Group", "fieldname": "highest_item", "fieldtype": "Data", "width": 200},
        {"label": "Highest Cost", "fieldname": "highest_cost", "fieldtype": "Currency", "width": 150},
        {"label": "Highest Cost Percentage", "fieldname": "highest_cost_percent", "fieldtype": "Percent", "width": 100}
    ]

    return columns, data
