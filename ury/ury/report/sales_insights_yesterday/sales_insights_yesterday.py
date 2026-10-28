# Copyright (c) 2024, Tridz and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import getdate
from datetime import datetime, timedelta

def execute(filters=None):
    columns, data = [], []
    
    branch = filters.get('branch')
    
    # Get today's date
    today = datetime.today().date()

	# Calculate yesterday's date
    yesterday = today - timedelta(days=1)
	
    sales_data = frappe.db.sql("""
		WITH date_list AS (
			SELECT DATE_SUB(CURDATE(), INTERVAL 1 DAY) AS `date`
		)
        SELECT
            date_list.`date` AS `date`,
            SUM(b.`grand_total`) AS `grand_total`
        FROM date_list
		LEFT JOIN `tabPOS Invoice` b ON (
			b.`branch` = %s
			AND b.`status` IN ("Consolidated","Paid") 
			AND b.`docstatus` = 1
		)
		LEFT JOIN `tabURY Report Settings` rs ON (
			rs.`branch` = b.`branch`
		)
		WHERE 
			(
				((rs.`hours` IS NULL OR rs.`hours` = 0) AND b.`posting_date` = date_list.`date`)
				OR (rs.`hours` > 0 AND TIMESTAMP(b.`posting_date`, b.`posting_time`) <= TIMESTAMP(DATE_ADD(date_list.`date`, INTERVAL 1 DAY), CONCAT(LPAD(rs.`hours`, 2, '0'), ':00:00')) AND TIMESTAMP(b.`posting_date`, b.`posting_time`) >= TIMESTAMP(date_list.`date`, CONCAT(LPAD(rs.`hours`, 2, '0'), ':00:00')))
				OR (rs.`branch` IS NULL AND b.`posting_date` = date_list.`date`)
			)
        GROUP BY `date`
    """, branch, as_dict=True)
    sales_data = {d.date: d.grand_total for d in sales_data}

    # Fetch table_data
    table_data = frappe.db.sql("""
        SELECT SUM(rt.`no_of_seats`) AS `no_of_seats`,
		COUNT(rt.`name`) AS `table_count`
        FROM `tabURY Table` rt
        WHERE rt.`branch` = %s AND rt.`is_take_away` = 0
    """, branch, as_dict=True)
    no_of_seats = table_data[0].no_of_seats if table_data else 0
    table_count = table_data[0].table_count if table_data else 0

    # Fetch pos_data
    pos_data_raw = frappe.db.sql("""
        SELECT
            pc.`period_start_date`,
            pc.`period_end_date`
        FROM `tabPOS Closing Entry` pc
        LEFT JOIN `tabPOS Opening Entry` po ON (
            po.`branch` = %s
            AND pc.`pos_opening_entry` = po.`name`
        )
        WHERE
            pc.`status` = "Submitted"
            AND pc.`docstatus` = 1
            AND po.`name` IS NOT NULL
    """, branch, as_dict=True)

	# Fetch acc_data
    acc_data = frappe.db.sql("""
        WITH RECURSIVE date_list AS (
            SELECT DATE_SUB(CURDATE(), INTERVAL 1 DAY) AS `date`
        )
        SELECT
            date_list.`date` AS 'date',
            COUNT(DISTINCT b.name) AS 'Total Invoices',
            COUNT(DISTINCT(dc.custom_course)) AS 'Total Courses',
            ROUND(IFNULL(COUNT(DISTINCT(dc.custom_course)) / NULLIF(COUNT(DISTINCT b.name), 0), 0), 2) AS 'average_course_count'
        FROM date_list
        LEFT JOIN `tabPOS Invoice` b ON (
			b.`branch` = %s
			AND b.`status` IN ("Consolidated","Paid") 
			AND b.`docstatus` = 1
		)
		LEFT JOIN `tabURY Report Settings` rs ON (
			rs.`branch` = b.`branch`
		)
        LEFT JOIN `tabPOS Invoice Item` dc ON b.name = dc.parent
		WHERE 
			(
				((rs.`hours` IS NULL OR rs.`hours` = 0) AND b.`posting_date` = date_list.`date`)
				OR (rs.`hours` > 0 AND TIMESTAMP(b.`posting_date`, b.`posting_time`) <= TIMESTAMP(DATE_ADD(date_list.`date`, INTERVAL 1 DAY), CONCAT(LPAD(rs.`hours`, 2, '0'), ':00:00')) AND TIMESTAMP(b.`posting_date`, b.`posting_time`) >= TIMESTAMP(date_list.`date`, CONCAT(LPAD(rs.`hours`, 2, '0'), ':00:00')))
				OR (rs.`branch` IS NULL AND b.`posting_date` = date_list.`date`)
			)
        GROUP BY `date`
    """, branch, as_dict=True)
    acc_data = {d.date: d.average_course_count for d in acc_data}

    # Calculate working_hours using Python
    pos_data = {}
    for entry in pos_data_raw:
        try:
            start_datetime = datetime.strptime(str(entry.period_start_date), '%Y-%m-%d %H:%M:%S.%f')
        except ValueError:
            start_datetime = datetime.strptime(str(entry.period_start_date), '%Y-%m-%d %H:%M:%S')
        try:
            end_datetime = datetime.strptime(str(entry.period_end_date), '%Y-%m-%d %H:%M:%S.%f')
        except ValueError:
            end_datetime = datetime.strptime(str(entry.period_end_date), '%Y-%m-%d %H:%M:%S')
        delta = end_datetime - start_datetime
        working_hours = delta.total_seconds() / 3600.0
        date = start_datetime.date()
        pos_data[date] = working_hours

    # Combine data
    
    total_grand_total = 0
    total_working_hours = 0
    grand_total = sales_data.get(yesterday, 0)
    working_hours = round(pos_data.get(yesterday, 0),2)
    total_grand_total += grand_total
    total_working_hours += working_hours
    acc = acc_data.get(yesterday, 0)

    revpash = round(grand_total / (no_of_seats * working_hours), 2) if no_of_seats and working_hours else None

    data.append({
        "Date": yesterday,
        "Total Revenue": grand_total,
        "Active Table Count": table_count,
        "No Of Seats": no_of_seats,
        "Working hours": working_hours,
        "RevPASH": revpash,
        "ACC": acc
    })

    columns = [
        {"label": "Date", "fieldname": "Date", "fieldtype": "Date", "width": 100},
        {"label": "Total Revenue", "fieldname": "Total Revenue", "fieldtype": "Currency", "width": 150},
		{"label": "Active Table Count", "fieldname": "Active Table Count", "fieldtype": "Int", "width": 100},
        {"label": "No Of Seats", "fieldname": "No Of Seats", "fieldtype": "Int", "width": 100},
        {"label": "Working hours", "fieldname": "Working hours", "fieldtype": "Data", "width": 150},
        {"label": "RevPASH", "fieldname": "RevPASH", "fieldtype": "Currency", "width": 100},
		{"label": "ACC", "fieldname": "ACC", "fieldtype": "Currency", "width": 100}
    ]

    return columns, data
