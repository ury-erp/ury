import frappe
from frappe.utils import getdate
from datetime import datetime, timedelta

def execute(filters=None):
    columns, data = [], []

    start_date = getdate(filters.get('start_date'))
    end_date = getdate(filters.get('end_date'))
    branch = filters.get('branch')

    # Fetch time setting from tabURY Report Settings
    time_setting = frappe.db.get_value("URY Report Settings", {"branch": branch}, "hours")
    time_threshold = f"{int(time_setting):02}:00:00" if time_setting is not None else "00:00:00"

    # Generate reversed date_list
    date_list = [start_date + timedelta(days=i) for i in range((end_date - start_date).days + 1)][::-1]

    # Fetch sales_data
    sales_data = frappe.db.sql("""
        SELECT
            DATE_ADD(DATE(TIMESTAMP(a.`posting_date`, a.`posting_time`)), INTERVAL CASE WHEN TIME(a.`posting_time`) >= %s THEN 0 ELSE -1 END DAY) AS `date`,
            SUM(a.`grand_total`) AS `grand_total`
        FROM `tabPOS Invoice` a
        WHERE
            a.`branch` = %s
            AND a.`status` IN ("Consolidated", "Paid")
            AND a.`docstatus` = 1
        GROUP BY `date`
    """, (time_threshold, branch), as_dict=True)
    sales_data = {d.date: d.grand_total for d in sales_data}

    # Fetch table_data
    table_data = frappe.db.sql("""
        SELECT SUM(rt.`no_of_seats`) AS `no_of_seats`
        FROM `tabURY Table` rt
        WHERE rt.`branch` = %s AND rt.`is_take_away` = 0
    """, branch, as_dict=True)
    no_of_seats = table_data[0].no_of_seats if table_data else 0

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
    for date in date_list:
        grand_total = sales_data.get(date, 0)
        working_hours = round(pos_data.get(date, 0), 2)
        total_grand_total += grand_total
        total_working_hours += working_hours

        revpash = round(grand_total / (no_of_seats * working_hours), 2) if working_hours > 0 else 0

        data.append({
            "Date": date,
            "Total Revenue": grand_total,
            "No Of Seats": no_of_seats,
            "Working hours": working_hours,
            "RevPASH": revpash,
            "Total RevPASH": round(total_grand_total / (no_of_seats * total_working_hours), 2) if date == start_date and total_working_hours > 0 else None
        })

    columns = [
        {"label": "Date", "fieldname": "Date", "fieldtype": "Date", "width": 100},
        {"label": "Total Revenue", "fieldname": "Total Revenue", "fieldtype": "Currency", "width": 150},
        {"label": "No Of Seats", "fieldname": "No Of Seats", "fieldtype": "Int", "width": 100},
        {"label": "Working hours", "fieldname": "Working hours", "fieldtype": "Data", "width": 150},
        {"label": "RevPASH", "fieldname": "RevPASH", "fieldtype": "Currency", "width": 100},
        {"label": "Total RevPASH", "fieldname": "Total RevPASH", "fieldtype": "Currency", "width": 150}
    ]

    return columns, data
