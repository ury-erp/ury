"""Move Production Plan URY tracking fields onto a dedicated "URY" tab.

Rechains ``insert_after`` for manager-facing fields on the main tab and parks
snapshot hash / JSON result / RQ execution diagnostics under a new Tab Break
(``custom_ury_tab``). Field definitions live in ``setup_customizations.py``;
``create_custom_fields(..., update=True)`` creates any missing fields, then
this patch force-updates ``insert_after`` because Frappe's updater does not
reliably move existing custom fields on the form.
"""
import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

from ury.setup_customizations import get_custom_fields

# (fieldname, insert_after) — the desired main-tab then URY-tab order.
_FIELD_ORDER = (
	("custom_ury_sales_plan", "company"),
	("custom_ury_department", "custom_ury_sales_plan"),
	("custom_ury_department_warehouse", "custom_ury_department"),
	("custom_ury_production_state", "custom_ury_department_warehouse"),
	("custom_ury_production_started_at", "custom_ury_production_state"),
	("custom_ury_tab", "custom_ury_production_started_at"),
	("custom_ury_snapshot_hash", "custom_ury_tab"),
	("custom_ury_production_result", "custom_ury_snapshot_hash"),
	("custom_ury_execution_job_id", "custom_ury_production_result"),
	("custom_ury_execution_attempt", "custom_ury_execution_job_id"),
	("custom_ury_execution_heartbeat", "custom_ury_execution_attempt"),
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
