# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Track-Item N7: optionally auto-create + auto-submit a real ERPNext
``Production Plan`` when a ``URY Sales Plan`` is approved.

Gated behind ``ury.ury.api.ury_production_settings.auto_production_plan_enabled``
(default off, matching the existing manual "Get Items From > Sales Plan"
design intent -- see ``ury_production_plan_adapter.get_items_from_sales_plan``).
When enabled, this module takes the advisory dict produced by
``ury_production_plan_adapter.adapt_sales_plan_to_production_plan``, strips
its ``_``-prefixed advisory keys, and turns it into a real, inserted and
submitted ``Production Plan`` document -- linking it back onto the Sales Plan
via the ``custom_ury_production_plan`` custom field (see
``fixtures/custom_field.json``) so a second approval-triggering save is a
no-op (idempotent).

This must never block a Sales Plan's own approval save: every failure mode
(setting disabled, plan already linked, adapter/insert/submit failure) is
handled without raising out of ``maybe_create_production_plan_on_approval``.
"""

import frappe

from ury.ury.api.ury_production_settings import auto_production_plan_enabled
from ury.ury.api.ury_production_plan_adapter import (
	adapt_sales_plan_to_production_plan,
)

#: Real Production Plan Item fields this module will copy from an adapted
#: po_items row. Deliberately excludes every ``_ury_*`` advisory key the
#: adapter attaches to each row (see ury_production_plan_adapter.py).
PRODUCTION_PLAN_ITEM_FIELDS = (
	"item_code",
	"bom_no",
	"planned_qty",
	"stock_uom",
	"planned_start_date",
	"description",
	"warehouse",
	"custom_ury_department",
)

#: Advisory-only keys on the adapter's Production Plan-shaped dict that are
#: never real Production Plan fields and must not reach frappe.get_doc().
ADVISORY_KEYS = ("_source", "_unmapped_fields", "_ury_department_index")

SALES_PLAN_LINK_FIELD = "custom_ury_production_plan"


def maybe_create_production_plan_on_approval(sales_plan_doc):
	"""Called from URY Sales Plan's validate() when status transitions into
	an approved state. No-op unless auto-creation is enabled; never raises.
	"""
	try:
		_maybe_create_production_plan_on_approval(sales_plan_doc)
	except Exception:
		frappe.log_error(
			title="URY Sales Plan auto Production Plan creation failed",
			message=frappe.get_traceback(),
		)


def _maybe_create_production_plan_on_approval(sales_plan_doc):
	if not auto_production_plan_enabled():
		return

	existing = sales_plan_doc.get(SALES_PLAN_LINK_FIELD)
	if existing:
		# Idempotent: already linked to a Production Plan for this approval.
		return

	cleaned = _build_production_plan_doc_dict(sales_plan_doc)

	new_plan = frappe.get_doc(cleaned)
	new_plan.insert()
	new_plan.submit()

	# Use .set() (not frappe.db.set_value) because this runs inside
	# validate(), which is followed by this same save's own db_update() --
	# a direct DB write here would be silently overwritten by db_update()
	# writing back the in-memory (still-None) value for this field.
	sales_plan_doc.set(SALES_PLAN_LINK_FIELD, new_plan.name)


def _build_production_plan_doc_dict(sales_plan_doc):
	adapted = adapt_sales_plan_to_production_plan(sales_plan_doc)

	cleaned = {
		key: value for key, value in adapted.items() if key not in ADVISORY_KEYS
	}
	cleaned["doctype"] = "Production Plan"
	cleaned["po_items"] = [
		{field: row.get(field) for field in PRODUCTION_PLAN_ITEM_FIELDS}
		for row in adapted.get("po_items") or []
	]
	return cleaned
