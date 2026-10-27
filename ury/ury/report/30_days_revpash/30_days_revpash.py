# Copyright (c) 2024, Tridz and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import getdate
from datetime import datetime, timedelta

def execute(filters=None):
    columns, data = [], []
    
    branch = filters.get('branch')
    
    # Define the start and end dates
    end_date = datetime.now().date() - timedelta(days=1)  # This is equivalent to CURDATE()
    start_date = end_date - timedelta(days=29)

    # Generate the list of dates
    date_list = [start_date + timedelta(days=i) for i in range((end_date - start_date).days + 1)]
    
    date_list = date_list[::-1]
    # Fetch sales_data
	
    sales_data = frappe.db.sql("""
		WITH RECURSIVE date_list AS (
			SELECT CURDATE() AS `date`
			UNION ALL
			SELECT DATE_SUB(`date`, INTERVAL 1 DAY)
			FROM date_list
			WHERE `date` > DATE_SUB(CURDATE(), INTERVAL 29 DAY)
		)
        SELECT
            date_list.`date` AS `date`,
            SUM(a.`grand_total`) AS `grand_total`
        FROM date_list
		LEFT JOIN `tabPOS Invoice` a ON (
			a.`branch` = %s
			AND a.`status` IN ("Consolidated","Paid") 
			AND a.`docstatus` = 1
		)
        LEFT JOIN `tabURY Report Settings` rs ON (
			rs.`branch` = a.`branch`
		)
        WHERE
			(
				((rs.`hours` IS NULL OR rs.`hours` = 0) AND a.`posting_date` = date_list.`date`)
				OR (rs.`hours` > 0 AND TIMESTAMP(a.`posting_date`, a.`posting_time`) <= TIMESTAMP(DATE_ADD(date_list.`date`, INTERVAL 1 DAY), CONCAT(LPAD(rs.`hours`, 2, '0'), ':00:00')) AND TIMESTAMP(a.`posting_date`, a.`posting_time`) >= TIMESTAMP(date_list.`date`, CONCAT(LPAD(rs.`hours`, 2, '0'), ':00:00')))
				OR (rs.`branch` IS NULL AND a.`posting_date` = date_list.`date`)
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
            SELECT CURDATE() AS `date`
            UNION ALL
            SELECT DATE_SUB(`date`, INTERVAL 1 DAY)
            FROM date_list
            WHERE `date` > DATE_SUB(CURDATE(), INTERVAL 29 DAY)
        )
        SELECT
            date_list.`date` AS 'date',
            COUNT(DISTINCT i.name) AS 'Total Invoices',
            COUNT(DISTINCT(dc.custom_course)) AS 'Total Courses',
            ROUND(IFNULL(COUNT(DISTINCT(dc.custom_course)) / NULLIF(COUNT(DISTINCT i.name), 0), 0), 2) AS 'average_course_count'
        FROM
            date_list
            LEFT JOIN `tabPOS Invoice` i ON (
                i.branch = %s
                AND i.status IN ("Consolidated","Paid") 
                AND i.docstatus = 1
            )
            LEFT JOIN `tabURY Report Settings` rs ON (
				rs.`branch` = i.branch
			)
            LEFT JOIN `tabPOS Invoice Item` dc ON i.name = dc.parent
        WHERE
            (
                ((rs.`hours` IS NULL OR rs.`hours` = 0) AND i.`posting_date` = date_list.`date`)
                OR (rs.`hours` > 0 AND TIMESTAMP(i.`posting_date`, i.`posting_time`) <= TIMESTAMP(DATE_ADD(date_list.`date`, INTERVAL 1 DAY), CONCAT(LPAD(rs.`hours`, 2, '0'), ':00:00')) AND TIMESTAMP(i.`posting_date`, i.`posting_time`) >= TIMESTAMP(date_list.`date`, CONCAT(LPAD(rs.`hours`, 2, '0'), ':00:00')))
                OR (rs.`branch` IS NULL AND i.`posting_date` = date_list.`date`)
            )
        GROUP BY 
            date_list.`date`
        ORDER BY 
        date_list.`date` ASC
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
        pos_data[date] = round(pos_data.get(date, 0.0) + working_hours, 2)

    # Combine data
    
    total_grand_total = 0
    total_working_hours = 0
    for date in date_list:
        grand_total = sales_data.get(date, 0)
        hours = pos_data.get(date)
        working_hours = round(hours, 2) if hours else None
        total_grand_total += grand_total
        total_working_hours += hours or 0.0
        acc = acc_data.get(date, 0)

        revpash = round(grand_total / (no_of_seats * hours), 2) if no_of_seats and hours else None

        data.append({
            "Date": date,
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
