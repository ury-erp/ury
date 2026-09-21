"""Add the Wave 0 department-execution custom fields to Production Plan, and
hide the deprecated ``URY Sales Plan.custom_ury_production_plan`` link.

Production Plan Automation (revision 4) moves from one Production Plan per
Sales Plan to one Production Plan per department. `custom_ury_department`,
`custom_ury_department_warehouse`, `custom_ury_production_state`,
`custom_ury_production_result`, `custom_ury_production_started_at` and the
D17 execution-liveness fields (`custom_ury_execution_job_id`,
`custom_ury_execution_attempt`, `custom_ury_execution_heartbeat`,
`custom_ury_execution_step`) are defined in `setup_customizations.py`.
`create_custom_fields` only runs automatically via `after_install`, which
does not touch existing sites, so this patch applies the same field
definitions idempotently on `bench migrate`.

`URY Sales Plan.custom_ury_production_plan` cannot remain the source of
truth once a Sales Plan can own several department Production Plans (D11).
It is hidden here rather than deleted, matching the "kept for one release
for compatibility" approach used for `Production Plan Item.custom_ury_department`.
"""
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

from ury.setup_customizations import get_custom_fields


def execute():
	all_fields = get_custom_fields()

	fields_by_doctype = {}
	production_plan_fields = all_fields.get("Production Plan")
	if production_plan_fields:
		fields_by_doctype["Production Plan"] = production_plan_fields

	sales_plan_fields = all_fields.get("URY Sales Plan")
	if sales_plan_fields:
		fields_by_doctype["URY Sales Plan"] = sales_plan_fields

	if not fields_by_doctype:
		return

	create_custom_fields(fields_by_doctype, update=True)
