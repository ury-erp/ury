"""Re-layout Production Plan URY custom fields into sections and columns.

The v3_27 Tab Break was inserted after ``company``, which pulled ERPNext's
assembly / MR item tables onto the URY tab. This patch:

1. Creates any new Section / Column Break fields from ``setup_customizations``.
2. Force-updates ``insert_after`` so identity fields stay on the main tab in a
   2-column URY section, and the URY tab (with structured sections) is appended
   after ``amended_from``.
"""
import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

from ury.setup_customizations import get_custom_fields

# (fieldname, insert_after) — main-tab URY section, then URY tab after ERPNext.
_FIELD_ORDER = (
	("custom_ury_section", "company"),
	("custom_ury_sales_plan", "custom_ury_section"),
	("custom_ury_department", "custom_ury_sales_plan"),
	("custom_ury_column_break", "custom_ury_department"),
	("custom_ury_department_warehouse", "custom_ury_column_break"),
	("custom_ury_production_state", "custom_ury_department_warehouse"),
	("custom_ury_production_started_at", "custom_ury_production_state"),
	("custom_ury_tab", "amended_from"),
	("custom_ury_snapshot_section", "custom_ury_tab"),
	("custom_ury_snapshot_hash", "custom_ury_snapshot_section"),
	("custom_ury_result_section", "custom_ury_snapshot_hash"),
	("custom_ury_production_result", "custom_ury_result_section"),
	("custom_ury_execution_section", "custom_ury_production_result"),
	("custom_ury_execution_job_id", "custom_ury_execution_section"),
	("custom_ury_execution_attempt", "custom_ury_execution_job_id"),
	("custom_ury_execution_column", "custom_ury_execution_attempt"),
	("custom_ury_execution_heartbeat", "custom_ury_execution_column"),
	("custom_ury_execution_step", "custom_ury_execution_heartbeat"),
)


def execute():
	all_fields = get_custom_fields()
	production_plan_fields = all_fields.get("Production Plan")
	if production_plan_fields:
		create_custom_fields({"Production Plan": production_plan_fields}, update=True)

	for fieldname, insert_after in _FIELD_ORDER:
		name = f"Production Plan-{fieldname}"
		if not frappe.db.exists("Custom Field", name):
			continue
		frappe.db.set_value("Custom Field", name, "insert_after", insert_after, update_modified=False)

	frappe.clear_cache(doctype="Production Plan")
