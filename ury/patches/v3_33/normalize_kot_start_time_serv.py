"""Clean URY KOT.start_time_serv before its column changes from Data to Time.

Runs in [pre_model_sync]: MariaDB cannot convert '' (or free text) to TIME, so
blank and non-time values are set to NULL while the column is still varchar.
Valid "H:M:S" strings are left as-is (TIME accepts them). Idempotent, and a
no-op once the column is already a TIME type.
"""

import frappe

TIME_REGEX = r"^[0-9]{1,2}:[0-9]{1,2}(:[0-9]{1,2}(\.[0-9]+)?)?$"


def execute():
	if not frappe.db.table_exists("URY KOT"):
		return

	col_type = frappe.db.sql(
		"""
		SELECT DATA_TYPE FROM information_schema.COLUMNS
		WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tabURY KOT'
		AND COLUMN_NAME = 'start_time_serv'
		""",
		as_dict=True,
	)
	# Column missing, or already TIME: nothing to normalise.
	if not col_type or col_type[0].DATA_TYPE.lower() == "time":
		return

	frappe.db.sql(
		"""
		UPDATE `tabURY KOT`
		SET start_time_serv = NULL
		WHERE start_time_serv IS NOT NULL
		AND (TRIM(start_time_serv) = ''
			OR start_time_serv NOT REGEXP %(rx)s
			OR TIME_TO_SEC(start_time_serv) IS NULL)
		""",
		{"rx": TIME_REGEX},
	)
