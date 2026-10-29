"""Sanitize no_of_pax column values and update default to 0.

Runs in [pre_model_sync]:
MariaDB strict mode fails with 'Invalid use of NULL value' or 'Incorrect integer value'
when modifying no_of_pax to `NOT NULL DEFAULT 0` if existing rows contain NULL or empty strings.
This patch backfills existing NULL, blank, or non-numeric values to 0 on Sales Invoice and
POS Invoice tables, and sets the Custom Field default to '0'.
"""

import frappe


def execute():
	doctypes = ("Sales Invoice", "POS Invoice")

	for dt in doctypes:
		if not frappe.db.table_exists(dt):
			continue

		if frappe.db.has_column(dt, "no_of_pax"):
			# Sanitize existing rows so MariaDB allows ALTER TABLE ... NOT NULL DEFAULT 0
			frappe.db.sql(
				f"""
				UPDATE `tab{dt}`
				SET `no_of_pax` = 0
				WHERE `no_of_pax` IS NULL
					OR TRIM(`no_of_pax`) = ''
					OR `no_of_pax` NOT REGEXP '^[0-9]+$'
				"""
			)

		custom_field_name = f"{dt}-no_of_pax"
		if frappe.db.exists("Custom Field", custom_field_name):
			frappe.db.set_value("Custom Field", custom_field_name, "default", "0")
