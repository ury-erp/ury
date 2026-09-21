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
from ury.ury.api.ury_sales_plan_production_plan import (
	SALES_PLAN_LINK_FIELD,
	create_or_get_production_plan,
)


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

	# Shared, locked, reverse-link-idempotent path (same one the button uses).
	name, _created = create_or_get_production_plan(sales_plan_doc, submit=True)

	# Use .set() (not frappe.db.set_value) because this runs inside
	# validate(), which is followed by this same save's own db_update() --
	# a direct DB write here would be silently overwritten.
	sales_plan_doc.set(SALES_PLAN_LINK_FIELD, name)
