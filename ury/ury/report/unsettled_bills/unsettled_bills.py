# Copyright (c) 2023, URY and contributors
# For license information, please see license.txt

import frappe

from datetime import datetime, timedelta
from frappe.utils import get_datetime, today

def execute(filters=None):
	branch = filters.get("branch")
	columns, data = [], []
	now = get_datetime()
	current_datetime = get_datetime()
	alert_minute = frappe.get_single('Alert Settings').payment_delay_time
	start_time = current_datetime - timedelta(minutes=alert_minute)
	comment_list = frappe.db.sql(
        """
        SELECT name,reference_doctype,reference_name,creation
        FROM `tabComment`
        WHERE reference_doctype = "POS Invoice"
            AND comment_type = "Info"
            AND creation <= %s
			AND DATE(creation) = %s
        """,
        (start_time, today()),
        as_dict=True
        )
	for comment in comment_list:
		billed = frappe.db.get_value("POS Invoice", comment.reference_name, "invoice_printed")
		status = frappe.db.get_value("POS Invoice", comment.reference_name, "docstatus")
		invoiceBranch = frappe.db.get_value("POS Invoice", comment.reference_name, "branch")
		amount = frappe.db.get_value("POS Invoice", comment.reference_name, "rounded_total")
		table = frappe.db.get_value("POS Invoice", comment.reference_name, "restaurant_table")
		order_type = frappe.db.get_value("POS Invoice", comment.reference_name, "order_type")
		printed_time = comment.creation
		time_only = printed_time.strftime("%I:%M:%S %p")
		if invoiceBranch == branch and billed == 1 and status == 0:
			row = [
                comment.reference_name,
                table if table else order_type,
                time_only,
                amount
            ]
			data.append(row)
	columns = ["Order","Table Name","Printed Time","Amount"]
	return columns, data
