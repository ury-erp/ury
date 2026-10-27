# Copyright (c) 2023, Tridz and contributors
# For license information, please see license.txt


import frappe
from frappe.utils import get_datetime


def execute(filters=None):
    branch = filters.get("branch")
    columns, data = [], []
    now = get_datetime()
    alert_time = (
        frappe.db.get_value(
            "POS Profile", {"branch": branch}, "custom_kot_warning_time"
        )
        or 0
    )
    kot_list = frappe.db.sql(
        """
		SELECT
			kot.name AS name,
			kot.restaurant_table AS restaurant_table,
			GREATEST(TIMESTAMPDIFF(MINUTE, TIMESTAMP(kot.date, kot.time), %(now)s), 0) AS minutes,
			kot.invoice AS invoice
		FROM
			`tabURY KOT` AS kot
		WHERE
			kot.order_status <> 'Served'
			AND kot.docstatus != 2
			AND GREATEST(TIMESTAMPDIFF(MINUTE, TIMESTAMP(kot.date, kot.time), %(now)s), 0) > %(alert_time)s
			AND kot.branch = %(branch)s
		ORDER BY
			minutes DESC;
	""",
        {"now": now, "alert_time": alert_time, "branch": branch},
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
