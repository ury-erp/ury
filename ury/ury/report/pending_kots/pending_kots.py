# Copyright (c) 2023, Tridz and contributors
# For license information, please see license.txt


import frappe
from frappe.utils import get_datetime, today


def execute(filters=None):
    branch = filters.get("branch")
    columns, data = [], []
    now = get_datetime()
    alert_time = frappe.db.get_value(
        "POS Profile", {"branch": branch}, "custom_kot_warning_time"
    )
    kot_list = frappe.db.sql(
        """
		SELECT
			kot.name AS name,
			kot.restaurant_table AS restaurant_table,
			TIMESTAMPDIFF(MINUTE,kot.time, %(now)s) AS minutes,
			kot.invoice AS invoice
		FROM
			`tabURY KOT` AS kot
		WHERE
			kot.order_status <> 'Served'
			AND TIMESTAMPDIFF(MINUTE, kot.time, %(now)s) >  %(alert_time)s
			AND kot.date = %(today)s
			AND kot.branch = %(branch)s
		ORDER BY
			minutes DESC;
	""",
        {"now": now, "alert_time": alert_time, "branch": branch, "today": today()},
        as_dict=True,
    )
    for kot in kot_list:
        tableOrTakeaway = (
            kot["restaurant_table"]
            if kot["restaurant_table"]
            else frappe.db.get_value("POS Invoice", kot["invoice"], "order_type")
        )
        row = [kot["invoice"].split("-")[-1], tableOrTakeaway, f"{kot['minutes']} Mins"]
        data.append(row)
    columns = ["Order", "Table Name", "Time"]
    return columns, data
