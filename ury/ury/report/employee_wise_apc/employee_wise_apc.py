# Copyright (c) 2025, Tridz and contributors
# For license information, please see license.txt

import frappe

def execute(filters=None):
    if not filters:
        filters = {}

    # Get optional employee filter
    employee = filters.get("employee")

    # Base conditions
    conditions = """
        a.branch = %(branch)s
        AND a.docstatus = 1
        AND a.no_of_pax > 0
        AND a.restaurant_table != ''
        AND a.order_type != 'Take Away'
        AND a.status IN ('Consolidated', 'Paid')
        AND a.posting_date BETWEEN %(from_date)s AND %(to_date)s
    """

    # Add employee filter dynamically
    if employee:
        conditions += " AND a.waiter = %(employee)s"

    # Query: Aggregate sales and pax per employee
    query = f"""
        SELECT
            a.waiter AS employee,
            COUNT(a.name) AS no_of_bills,
            SUM(a.no_of_pax) AS total_pax,
            SUM(a.grand_total) AS total_sales,
            ROUND(SUM(a.grand_total) / NULLIF(SUM(a.no_of_pax),0),2) AS APC
        FROM `tabPOS Invoice` a
        WHERE {conditions}
        GROUP BY a.waiter
        ORDER BY a.waiter
    """

    data = frappe.db.sql(query, filters, as_dict=True)

    columns = [
        {"label": "Employee", "fieldname": "employee", "fieldtype": "Link", "options": "Employee", "width": 180},
        {"label": "No of Bills", "fieldname": "no_of_bills", "fieldtype": "Int", "width": 120},
        {"label": "Total Pax", "fieldname": "total_pax", "fieldtype": "Int", "width": 120},
        {"label": "Total Sales", "fieldname": "total_sales", "fieldtype": "Currency", "width": 150},
        {"label": "APC", "fieldname": "APC", "fieldtype": "Currency", "width": 120},
    ]

    return columns, data