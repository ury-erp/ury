import frappe
import os
import click
from frappe import _

from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

def after_install():
    create_custom_fields(get_custom_fields())
    
def before_uninstall():
	delete_custom_fields(get_custom_fields())
 
def get_custom_fields():
	"""URY specific custom fields that need to be added to the masters in ERPNext"""
	return {
     	"POS Invoice": [
				{
					"fieldname": "mobile_number",
					"fieldtype": "Data",
					"fetch_from": "customer.mobile_number",
					"label": "Mobile Number",
					"insert_after": "customer_name",
					"translatable": 0,
				},
				{
					"fieldname": "order_info",
					"fieldtype": "Section Break",
					"label": "Order Info",
					"insert_after": "return_against",
				},
				{
					"fieldname": "order_type",
					"fieldtype": "Select",
					"default": "Dine In",
					"label": "Order Type",
					"options": "\nDine In\nTake Away\nDelivery\nPhone In\nAggregators",
					"insert_after": "order_info",
					"translatable": 0
				},
				{
					"fieldname": "waiter",
					"fieldtype": "Data",
					"label": "Waiter",
					"read_only": 0,
					"insert_after": "order_type",
					"translatable": 0
				},
				{
					"fieldname": "column_break_rwbwf",
					"fieldtype": "Column Break",
					"insert_after": "waiter"
				},
				{
					"fieldname": "no_of_pax",
					"fieldtype": "Data",
					"label": "Pax",
					"insert_after": "column_break_rwbwf",
					"read_only": 0,
					"translatable": 0
				},
				{
					"fieldname": "cashier",
					"fieldtype": "Data",
					"label": "Cashier",
					"insert_after": "no_of_pax",
					"read_only": 0,
					"translatable": 0
				},
				{
					"fieldname": "invoice_printed",
					"fieldtype": "Check",
					"label": "Invoice Printed",
					"insert_after": "cashier",
					"read_only": 1,
				},
				{
					"fieldname": "invoice_created",
					"fieldtype": "Check",
					"label": "Invoice Created",
					"insert_after": "invoice_printed",
					"read_only": 0,
					"hidden": 1,
				},
				{
					"fieldname": "restaurant_info",
					"fieldtype": "Section Break",
					"label": "Restaurant Info",
					"insert_after": "invoice_created",
				},
				{
					"fieldname": "restaurant",
					"fieldtype": "Link",
					"insert_after": "restaurant_info",
					"label": "Restaurant",
					"options": "URY Restaurant",
					"read_only": 0,
				},
				{
					"fieldname": "branch",
					"fieldtype": "Link",
					"insert_after": "restaurant",
					"label": "Branch",
					"options": "Branch",
					"read_only": 0,
				},
				{
					"fieldname": "restaurant_table",
					"fieldtype": "Link",
					"insert_after": "branch",
					"label": "Restaurant Table",
					"options": "URY Table",
					"read_only": 0,
				},
				{
					"fieldname": "column_break_gd1mq",
					"fieldtype": "Column Break",
					"insert_after": "restaurant_table",
				},
				{
					"fieldname": "arrived_time",
					"fieldtype": "Time",
					"insert_after": "column_break_gd1mq",
					"label": "Arrived Time"
				},
				{
					"fieldname": "total_spend_time",
					"fieldtype": "Time",
					"insert_after": "arrived_time",
					"label": "Total Spend Time"
				}
				],
      
		"Sales Invoice": [
					{
					"fieldname": "mobile_number",
					"fieldtype": "Data",
					"fetch_from": "customer.mobile_number",
					"label": "Mobile Number",
					"insert_after": "customer_name",
					"translatable": 0,
				},
				{
					"fieldname": "order_info",
					"fieldtype": "Section Break",
					"label": "Order Info",
					"insert_after": "return_against",
				},
				{
					"fieldname": "order_type",
					"fieldtype": "Select",
					"default": "Dine In",
					"options": "URY Restaurant",
					"fetch_from": "customer.mobile_number",
					"label": "Order Type",
					"options": "\nDine In\nTake Away\nDelivery\nPhone In\nAggregators",
					"insert_after": "order_info",
					"translatable": 0
				},
				{
					"fieldname": "waiter",
					"fieldtype": "Data",
					"label": "Waiter",
					"read_only": 0,
					"insert_after": "order_type",
					"translatable": 0
				},
				{
					"fieldname": "column_break_rwbwf",
					"fieldtype": "Column Break",
					"insert_after": "waiter"
				},
				{
					"fieldname": "no_of_pax",
					"fieldtype": "Data",
					"label": "Pax",
					"insert_after": "column_break_rwbwf",
					"read_only": 0,
					"translatable": 0
				},
				{
					"fieldname": "cashier",
					"fieldtype": "Data",
					"label": "Cashier",
					"insert_after": "no_of_pax",
					"read_only": 0,
					"translatable": 0
				},
				{
					"fieldname": "restaurant_info",
					"fieldtype": "Section Break",
					"label": "Restaurant Info",
					"insert_after": "invoice_created",
				},
				{
					"fieldname": "restaurant",
					"fieldtype": "Link",
					"insert_after": "restaurant_info",
					"label": "Restaurant",
					"options": "URY Restaurant",
					"read_only": 0,
				},
				{
					"fieldname": "branch",
					"fieldtype": "Link",
					"insert_after": "restaurant",
					"label": "Branch",
					"options": "Branch",
					"read_only": 0,
				},
				{
					"fieldname": "restaurant_table",
					"fieldtype": "Link",
					"insert_after": "branch",
					"label": "Restaurant Table",
					"options": "URY Table",
					"read_only": 0,
				},
				{
					"fieldname": "column_break_gd1mq",
					"fieldtype": "Column Break",
					"insert_after": "restaurant_table",
				},
				{
					"fieldname": "arrived_time",
					"fieldtype": "Time",
					"insert_after": "column_break_gd1mq",
					"label": "Arrived Time"
				},
				{
					"fieldname": "total_spend_time",
					"fieldtype": "Time",
					"insert_after": "arrived_time",
					"label": "Total Spend Time"
				}
				],

		"POS Profile": [
			{
				"fieldname": "restaurant_info",
				"fieldtype": "Section Break",
				"label": "Restaurant Info",
				"insert_after": "company_address",
			},
			{
				"fieldname": "restaurant",
				"fieldtype": "Link",
				"insert_after": "restaurant_info",
				"label": "Restaurant",
				"options": "URY Restaurant",
			},
			{
				"fieldname": "column_break_c10ag",
				"fieldtype": "Column Break",
				"insert_after": "restaurant",
			},
			{
				"fetch_from": "restaurant.branch" ,
				"fieldname": "branch",
				"fieldtype": "Link",
				"insert_after": "column_break_c10ag",
				"label": "Branch",
				"options": "Branch"
			},
			{
				"fieldname": "printer_info",
				"fieldtype": "Section Break",
				"label": "Printer Info",
				"insert_after": "branch",
			},
			{
				"depends_on": "eval:doc.qz_print != 1" , 
				"fieldname": "printer_settings",
				"fieldtype": "Table",
				"insert_after": "printer_info",
				"label": "Printer Settings",
				"options": "URY Printer Settings"
			},
			{
				"fieldname": "qz_print",
				"fieldtype": "Check",
				"label": "QZ Print",
				"insert_after": "printer_settings"
			},
			{
				"depends_on": "qz_print",
				"fieldname": "qz_host",
				"fieldtype": "Data",
				"insert_after": "qz_print",
				"label": "QZ Host",
				"translatable": 0,
			}
		],
  
		"POS Opening Entry": [
			{
				"fieldname": "restaurant_info",
				"fieldtype": "Section Break",
				"label": "Restaurant Info",
				"insert_after": "user",
			},
			{
				"fieldname": "restaurant",
				"fieldtype": "Link",
				"insert_after": "restaurant_info",
				"label": "Restaurant",
				"options": "URY Restaurant",
				"reqd": 1
			},
			{
				"fieldname": "column_break_e3dky",
				"fieldtype": "Column Break",
				"insert_after": "restaurant",
			},
			{	
				"fieldname": "branch",
				"fieldtype": "Link",
				"insert_after": "column_break_e3dky",
				"label": "Branch",
				"options": "Branch",
				"reqd": 1
			}
		],

		"Price List": [
			{
				"fieldname": "restaurant_menu",
				"fieldtype": "Link",
				"options": "URY Menu",
				"label": "Restaurant Menu",
				"insert_after": "currency",
			}
		],
  
		"Branch": [
			{
				"fieldname": "user",
				"fieldtype": "Table",
				"options": "URY User",
				"label": "User",
				"insert_after": "branch",
				"reqd": 1
			}
		],

		"Customer": [
			{
				"fieldname": "mobile_number",
				"fieldtype": "Data",
				"label": "Mobile Number",
				"insert_after": "customer_name",
				"translatable": 0,
				"reqd": 1
			},
		],

		"POS Invoice Iten": [
			{
				"fieldname": "comment",
				"fieldtype": "Data",
				"label": "Comment",
				"insert_after": "description",
				"translatable": 0
			}
		],
     
    }
 
def delete_custom_fields(custom_fields):
    for doctype, fields in custom_fields.items():
        frappe.db.delete(
			"Custom Field",
			{
				"fieldname": ("in", [field["fieldname"] for field in fields]),
				"dt": doctype,
			},
		)
        
        frappe.clear_cache(doctype=doctype)
 
 
    
