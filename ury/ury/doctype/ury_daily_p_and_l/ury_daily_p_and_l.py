# Copyright (c) 2023, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
import json
import calendar
from datetime import datetime

def inner_bom_process(buying_price_list, bom):
    unset_bom_items = []
    bom_buying_price = 0

    for bom_item in bom.items:
        bom_item_qty = bom_item.qty
        bom_item_name = bom_item.item_name
        boms = frappe.db.get_all("BOM", fields=("*"), filters={'item': bom_item.item_code, 'is_active': 1, 'is_default': 1, 'docstatus': 1})
        
        if len(boms) > 0:
            inner_bom = frappe.get_doc("BOM", boms[0].name)
            inner_bom_data = inner_inner_bom_process(buying_price_list, inner_bom)
            inner_bom_buying_price = inner_bom_data['bom_buying_price']
            inner_unset_bom_items = inner_bom_data['unset_bom_items']
            bom_buying_price += float(inner_bom_buying_price) * bom_item_qty

            for item in inner_unset_bom_items:
                if item not in unset_bom_items:
                    unset_bom_items.append(item)
        else:
            bom_items_price = frappe.db.get_all("Item Price", fields=['name', 'price_list_rate'], filters={'price_list': buying_price_list, 'item_code': bom_item.item_code})

            if len(bom_items_price) == 0:
                if bom_item_name not in unset_bom_items:
                    unset_bom_items.append(bom_item_name)
            else:
                bom_buying_price += float(bom_items_price[0].price_list_rate) * bom_item_qty

    bom_buying_price = bom_buying_price / bom.quantity
    return {"bom_buying_price": bom_buying_price, "unset_bom_items": unset_bom_items}


def inner_inner_bom_process(buying_price_list, bom):
    unset_bom_items = []
    bom_buying_price = 0

    for bom_item in bom.items:
        bom_item_qty = bom_item.qty
        bom_item_name = bom_item.item_name
        bom_items_price = frappe.db.get_all("Item Price", fields=['name', 'price_list_rate'], filters={'price_list': buying_price_list, 'item_code': bom_item.item_code})
        if len(bom_items_price) == 0:
            if bom_item_name not in unset_bom_items:
                unset_bom_items.append(bom_item_name)
        else:
            bom_buying_price += float(bom_items_price[0].price_list_rate) * bom_item_qty

    bom_buying_price = bom_buying_price / bom.quantity
    return {"bom_buying_price": bom_buying_price, "unset_bom_items": unset_bom_items}


class URYDailyPandL(Document):
	def cogs_sold(self):
		report_settings = frappe.get_doc("URY Report Settings",self.branch)
		self.cost_of_goods = []
		cogs = 0
		electricity_reading = self.electricity_closing - self.electricity_opening
		if electricity_reading <= 0:
			frappe.throw("Invalid Electricity Reading")

		# Append materials consumed
		for expense in self.materials_consumed:
			if expense.units_consumed <= 0:
				frappe.throw("Invavlid Units Consumed for "+expense.material)
		non_pb_item_sales = frappe.db.sql('''
			SELECT
				c.item_group AS "Item Group",
				c.item_code AS "Item Code",
				c.item_name AS "Item Name",
				SUM(b.qty) AS "Qty"
			FROM `tabPOS Invoice` a
			INNER JOIN `tabPOS Invoice Item` b ON a.name = b.parent
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
					((rs.`hours` IS NULL OR rs.`hours` = 0) AND a.`posting_date` = %(date)s)
					OR (rs.`hours` > 0 AND TIMESTAMP(a.`posting_date`, a.`posting_time`) <= TIMESTAMP(DATE_ADD(%(date)s, INTERVAL 1 DAY), CONCAT(LPAD(rs.`hours`, 2, '0'), ':00:00')) AND TIMESTAMP(a.`posting_date`, a.`posting_time`) >= TIMESTAMP(%(date)s, CONCAT(LPAD(rs.`hours`, 2, '0'), ':00:00')))
					OR (rs.`branch` IS NULL AND a.`posting_date` = %(date)s)
				)
				AND d.new_item_code IS NULL
				AND e.item IS NULL
			GROUP BY 
				c.item_name
			ORDER BY 
				c.item_group ASC, b.item_name ASC
		''', {"branch": self.branch, "date": self.date}, as_dict=True)

		bom_item_sales = frappe.db.sql('''
			SELECT
				c.item_group AS "Item Group",
				c.item_code AS "Item Code",
				c.item_name AS "Item Name",
				SUM(b.qty) AS "Qty"
			FROM `tabPOS Invoice` a
			INNER JOIN `tabPOS Invoice Item` b ON a.name = b.parent
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
					((rs.`hours` IS NULL OR rs.`hours` = 0) AND a.`posting_date` = %(date)s)
					OR (rs.`hours` > 0 AND TIMESTAMP(a.`posting_date`, a.`posting_time`) <= TIMESTAMP(DATE_ADD(%(date)s, INTERVAL 1 DAY), CONCAT(LPAD(rs.`hours`, 2, '0'), ':00:00')) AND TIMESTAMP(a.`posting_date`, a.`posting_time`) >= TIMESTAMP(%(date)s, CONCAT(LPAD(rs.`hours`, 2, '0'), ':00:00')))
					OR (rs.`branch` IS NULL AND a.`posting_date` = %(date)s)
				)
				AND d.new_item_code IS NULL
				AND e.item IS NOT NULL
			GROUP BY 
				c.item_name
			ORDER BY 
				c.item_group ASC, b.item_name ASC
		''', {"branch": self.branch, "date": self.date}, as_dict=True)

		pb_item_sales = frappe.db.sql('''
			SELECT
				c.item_group AS "Item Group",
				c.item_code AS "Item Code",
				c.item_name AS "Item Name",
				SUM(b.qty) AS "Qty"
			FROM `tabPOS Invoice` a
			INNER JOIN `tabPOS Invoice Item` b ON a.name = b.parent
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
					((rs.`hours` IS NULL OR rs.`hours` = 0) AND a.`posting_date` = %(date)s)
					OR (rs.`hours` > 0 AND TIMESTAMP(a.`posting_date`, a.`posting_time`) <= TIMESTAMP(DATE_ADD(%(date)s, INTERVAL 1 DAY), CONCAT(LPAD(rs.`hours`, 2, '0'), ':00:00')) AND TIMESTAMP(a.`posting_date`, a.`posting_time`) >= TIMESTAMP(%(date)s, CONCAT(LPAD(rs.`hours`, 2, '0'), ':00:00')))
					OR (rs.`branch` IS NULL AND a.`posting_date` = %(date)s)
				)
				AND d.new_item_code IS NOT NULL
			GROUP BY 
				c.item_name
			ORDER BY 
				c.item_group ASC, b.item_name ASC
		''', {"branch": self.branch, "date": self.date}, as_dict=True)
		
		unset_item_prices = []
		for item in non_pb_item_sales:
			items_price = frappe.db.get_all("Item Price",fields = ['name','price_list_rate'],filters = {'price_list':report_settings.buying_price_list,'item_code':item['Item Code']})
			item_name = item['Item Name']
			if len(items_price) == 0:
				unset_item_prices.append(item_name)
			else:
				qty = int(item['Qty'])
				self.append("cost_of_goods" ,{
					"item_code":item['Item Code'],
					"item_name":item['Item Name'],
					"item_group":item['Item Group'],
					"qty":qty,
					"buying_price":items_price[0].price_list_rate,
					"amount":items_price[0].price_list_rate * qty
				})
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
				self.append("cost_of_goods" ,{
					"item_code":item['Item Code'],
					"item_name":item['Item Name'],
					"item_group":item['Item Group'],
					"qty":qty,
					"buying_price":buying_price,
					"amount":buying_price * qty
				})
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
				self.append("cost_of_goods" ,{
					"item_code":item['Item Code'],
					"item_name":item['Item Name'],
					"item_group":item['Item Group'],
					"qty":qty,
					"buying_price":buying_price,
					"amount":buying_price * qty
				})
				cogs = cogs + buying_price * qty
		self.cogs = cogs
		
		unset_prices = [
			("ITEMS", unset_item_prices),
			("BUNDLE SUB ITEMS", unset_pb_item_prices),
			("BOM SUB ITEMS", unset_bom_item_prices)
		]
		remarks = "BUYING PRICE NOT SET<br><br>" + "<br><br>".join(f"{label}:-<br>{items}" for label, items in unset_prices if items)
		if any(items for label, items in unset_prices):
			remarks += "<br><br>Update the item prices and then submit the document again to ensure accurate Cost of Goods"
			self.remarks = remarks
		else:
			self.remarks = ""

	
	def before_save(self):
		self.cogs_sold()
		if self.remarks != "":
			frappe.msgprint(title='SET BUYING PRICE',msg=("Please review the remarks below for the items. Submitting now will exclude these items from the cost of goods."))
	
	def before_submit(self):
		self.cogs_sold()
		
		report_settings = frappe.get_doc("URY Report Settings",self.branch)

		self.direct_expenses_breakup = []
		self.employee_costs_breakup = []
		self.indirect_expenses_breakup = []

		'''Total Sales Of the Day'''
		gross_sales = frappe.db.sql('''
			SELECT
				%(date)s AS "Date",
				COUNT(b.`name`) AS "Total Invoices",
				ROUND(SUM(b.`net_total`),2) AS "Item Total",
				ROUND(SUM(b.`grand_total` - b.`net_total`),2) AS "Tax",
				ROUND(SUM(b.`grand_total`),2) AS "Grand Total",
				ROUND(SUM(b.`grand_total` - b.`rounded_total`),2) AS "Round Off",
				ROUND(SUM(b.`rounded_total`),2) AS "Rounded Total",
				ROUND(SUM(b.`rounded_total` - b.`paid_amount` + b.`change_amount`),2) AS "Cash Discounts"
			FROM `tabPOS Invoice` b
			LEFT JOIN `tabURY Report Settings` rs ON (
				rs.`branch` = %(branch)s
			)
			WHERE 
				b.`branch` = %(branch)s
				AND b.`status` IN ("Consolidated", "Paid") 
				AND b.`docstatus` = 1
				AND
				(
					((rs.`hours` IS NULL OR rs.`hours` = 0) AND b.`posting_date` = %(date)s)
					OR (rs.`hours` > 0 AND TIMESTAMP(b.`posting_date`, b.`posting_time`) <= TIMESTAMP(DATE_ADD(%(date)s, INTERVAL 1 DAY), CONCAT(LPAD(rs.`hours`, 2, '0'), ':00:00')) AND TIMESTAMP(b.`posting_date`, b.`posting_time`) >= TIMESTAMP(%(date)s, CONCAT(LPAD(rs.`hours`, 2, '0'), ':00:00')))
					OR (rs.`branch` IS NULL AND b.`posting_date` = %(date)s)
				)
		''', {"branch": self.branch, "date": self.date}, as_dict=True)


		# GROSS AND NET SALES
		self.gross_sales = 0.0
		gross_sales_all =  gross_sales[0]
		if gross_sales_all['Total Invoices'] == 0:
			self.gross_sales = 0.0
			gross_sales = gross_sales[0]
			gross_sales["Round Off"] = gross_sales["Cash Discounts"] = gross_sales["Tax"] = 0.0
		else:
			gross_sales = gross_sales[0]
			self.gross_sales = gross_sales["Grand Total"]

		self.cash_discount_round_off = round((gross_sales["Round Off"] + gross_sales["Cash Discounts"]),2)
		self.tax = gross_sales["Tax"]

		self.net_sales = self.gross_sales - self.cash_discount_round_off - self.tax

		if self.net_sales == 0.0:
			self.gross_sales_percent = self.cash_discount_round_off_percent = self.tax_percent = self.cogs_percent = self.total_direct_expenses_percent = self.gross_profit_percent = self.total_employee_costs_percent = self.other_expenses_percent = self.depreciation_percent = self.total_indirect_expenses_percent = self.net_profit_percent = 0.0
		else:
			self.gross_sales_percent = round(((self.gross_sales / self.net_sales) * 100),2)
			self.cash_discount_round_off_percent = round(((self.cash_discount_round_off / self.net_sales) * 100),2)
			self.tax_percent = round(((self.tax / self.net_sales) * 100),2)

			self.cogs_percent = round(((self.cogs / self.net_sales) * 100),2)

		self.net_sales_percent = 100.0


		# DIRECT EXPENSES
		self.total_direct_expenses = 0
		electricity_reading = self.electricity_closing - self.electricity_opening

		# Append materials consumed
		for expense in self.materials_consumed:
			self.append("direct_expenses_breakup", {"breakup": expense.material, "amount": expense.amount})
			self.total_direct_expenses += expense.amount

		# Append other fixed expenses
		for expense in report_settings.direct_fixed_expenses:
			self.append("direct_expenses_breakup", {"breakup": expense.expense, "amount": expense.amount})
			self.total_direct_expenses += expense.amount


		# GROSS PROFIT
		self.gross_profit = self.net_sales - self.total_direct_expenses - self.cogs
		
		if self.net_sales != 0.0:		
			self.total_direct_expenses_percent = round(((self.total_direct_expenses / self.net_sales) * 100),2)
			self.gross_profit_percent = round(((self.gross_profit / self.net_sales) * 100),2)


		'''INDIRECT EXPENSES'''

		self.total_indirect_expenses = 0


		#EMPLOYEE COSTS
		salary_cost_gross = 0
		self.total_employee_costs = 0

		attendance_count = frappe.db.sql('''
			SELECT
				%(date)s AS "Date",
				COUNT(b.`name`) AS "Total Attendance"
			FROM `tabAttendance` b
			LEFT JOIN `tabEmployee` c ON 
			c.name = b.employee
			WHERE 
				b.`attendance_date` = %(date)s
				AND c.`branch` = %(branch)s
				AND b.`docstatus` = 1
				AND b.`status` IN ("Present", "Half Day")
		''', {"branch": self.branch, "date": self.date}, as_dict=True)    

		attendance_count =  attendance_count[0]

		if attendance_count['Total Attendance'] == 0:
			frappe.throw(title='No Attendance !',msg=("Attendance not marked"))

		ns_employee_attendance_list = frappe.db.sql(''' 
			SELECT
				b.`employee_name` AS "Name"
			FROM `tabAttendance` b
			LEFT JOIN `tabEmployee` c ON (
				c.name = b.employee
				AND (
					(c.`payment_amount` IS NULL OR c.`payment_amount` = 0.0 ) 
					OR 
					(c.`payment_type` IS NULL OR c.`payment_type` = "")
				)
			)
			WHERE 
				b.`attendance_date` = %(date)s
				AND c.`branch` = %(branch)s
			GROUP BY
				b.`employee_name`                
		''', {"branch": self.branch, "date": self.date}, as_dict=True)

		if len(ns_employee_attendance_list) > 0:
			ns_employee_attendance_list = json.dumps(ns_employee_attendance_list)
			frappe.throw(title='Set Payment Type/Amount',msg=("Employees:  {0}").format(ns_employee_attendance_list))

		employee_attendance_dw_list = frappe.db.sql('''
			SELECT
				%(date)s AS "Date",
				b.`employee` AS "Employee",
				b.`status` AS "Status",
				c.`payment_amount` AS "Salary"
			FROM `tabAttendance` b
			LEFT JOIN `tabEmployee` c ON c.name = b.employee
			WHERE 
				b.`attendance_date` = %(date)s
				AND c.`branch` = %(branch)s
				AND c.`payment_type` = "Daily Wage"                        
		''', {"branch": self.branch, "date": self.date}, as_dict=True)

		for attendance in employee_attendance_dw_list:
			if attendance["Status"] == "Half Day":
				salary_cost_gross = round((salary_cost_gross + 0.5 * attendance["Salary"]),2)
			if attendance["Status"] == "Present":
				salary_cost_gross = round((salary_cost_gross + attendance["Salary"]),2)

		date_str =  self.date
		date_obj = datetime.strptime(date_str, '%Y-%m-%d')
		year = date_obj.year
		month_number = date_obj.month
		days = calendar.monthrange(year, month_number)[1]

		employee_attendance_sl_list = frappe.db.sql('''
			SELECT
				%(date)s AS "Date",
				b.`name` AS "Employee",
				b.`payment_amount` AS "Salary"
			FROM `tabEmployee` b
			WHERE 
				b.`branch` = %(branch)s
				AND b.`payment_type` = "Salary"                        
		''', {"branch": self.branch, "date": self.date}, as_dict=True)

		for attendance in employee_attendance_sl_list:
			salary_cost_gross = round((salary_cost_gross + attendance["Salary"]/days),2)

		if self.net_sales != 0.0:
			salary_cost_gross_percent = round(((salary_cost_gross / self.net_sales) * 100),3)
		else:
			salary_cost_gross_percent = 0.0
		self.append("employee_costs_breakup", {"breakup": "Salary Cost Gross", "amount": salary_cost_gross,"percent":salary_cost_gross_percent})
		self.total_employee_costs += salary_cost_gross

		for expense in report_settings.employee_costs:
			if self.net_sales != 0.0:
				expense_percent = round(((expense.amount / self.net_sales) * 100),3)
			else:
				expense_percent = 0.0
			self.append("employee_costs_breakup", {"breakup": expense.expense, "amount": expense.amount,"percent":expense_percent})
			self.total_employee_costs += expense.amount
		if self.net_sales != 0.0:
			self.total_employee_costs_percent = round(((self.total_employee_costs / self.net_sales) * 100),3)
		self.total_indirect_expenses += self.total_employee_costs

		#INDIRECT EXPENSES
		
		# Calculate and append Electricity
		electricity_charges = electricity_reading * report_settings.electricity_charges
		if self.net_sales != 0.0:
			electricity_percent = round(((electricity_charges / self.net_sales) * 100),3)
		else:
			electricity_percent = 0.0
		self.append("indirect_expenses_breakup", {"breakup": "Electricity", "amount": electricity_charges,"percent":electricity_percent})
		self.total_indirect_expenses += electricity_charges

		# Append indirect fixed expenses
		for expense in report_settings.indirect_fixed_expenses:
			if self.net_sales != 0.0:
				expense_percent = round(((expense.amount / self.net_sales) * 100),3)
			else:
				expense_percent = 0.0
			self.append("indirect_expenses_breakup", {"breakup": expense.expense, "amount": expense.amount,"percent":expense_percent})
			self.total_indirect_expenses += expense.amount

		# Append indirect monthly fixed expenses
		for expense in report_settings.monthly_fixed_expenses:
			expense_amount = round((expense.amount/days),2)
			if self.net_sales != 0.0:
				expense_percent = round(((expense_amount / self.net_sales) * 100),3)
			else:
				expense_percent = 0.0
			self.append("indirect_expenses_breakup", {"breakup": expense.expense, "amount": expense_amount,"percent":expense_percent})
			self.total_indirect_expenses += expense_amount

		# Calculate and append percentage expenses
		for expense in report_settings.percentage_expenses:
			if expense.percentage_type in ["Gross Sales", "Net Sales"]:
				base_amount = self.gross_sales if expense.percentage_type == "Gross Sales" else self.net_sales
				amount = round((expense.percent * base_amount) / 100, 2)
				if self.net_sales != 0.0:
					expense_percent = round(((amount / self.net_sales) * 100),3)
				else:
					expense_percent = 0.0
				self.append("indirect_expenses_breakup", {"breakup": expense.expense, "amount": amount ,"percent":expense_percent})
				self.total_indirect_expenses += amount

		# OTHER EXPENSES
		self.total_other_expenses = 0
		for expense in self.other_expenses:
			self.total_indirect_expenses += expense.amount
			self.total_other_expenses += expense.amount

		self.depreciation = report_settings.depreciation
		
		self.total_indirect_expenses = self.total_indirect_expenses + self.depreciation

		# NET PROFIT
		self.net_profit = self.gross_profit - self.total_indirect_expenses

		if self.net_sales != 0.0:
			self.other_expenses_percent = round(((self.total_other_expenses / self.net_sales) * 100),3)
			self.depreciation_percent = round(((self.depreciation / self.net_sales) * 100),3)
			self.total_indirect_expenses_percent = round(((self.total_indirect_expenses / self.net_sales) * 100),2)
			self.net_profit_percent = round(((self.net_profit / self.net_sales) * 100),2)
	
	@frappe.whitelist()
	def get_proft_loss_details(self):
		return frappe.render_template(
			"ury/doctype/ury_daily_p_and_l/profit_loss_details.html",
			{"data": self, "currency": "INR"},
		)