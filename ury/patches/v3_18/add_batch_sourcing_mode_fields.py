"""sa-arch-item1-manufacturing: add sourcing_mode/external_receiving_warehouse
to URY Item Production Configuration, plus the custom_ury_batch_request
Stock Entry field, and default existing PRE_PRODUCED rows to IN_HOUSE.

`sourcing_mode` distinguishes items manufactured at this branch/unit
(IN_HOUSE, via a real BOM-based Manufacture Stock Entry) from items
received already-finished from an external central kitchen/processing
location (EXTERNAL_RECEIPT, via a plain Material Receipt). Before this
patch, no such distinction existed -- see
tracks/sa-architecture-closure/item1-pre-produced-manufacturing-plan.md.

The doctype field's own `"default": "IN_HOUSE"` only applies to new
documents; this patch backfills existing PRE_PRODUCED rows so their
behavior does not change (IN_HOUSE is what every batch flow effectively
was before EXTERNAL_RECEIPT existed).

Also (re)applies the `custom_ury_batch_request` custom field on Stock Entry
via `create_custom_fields(..., update=True)`, same idempotent pattern as
v3_16's `add_stock_entry_posting_intent_field` -- `after_install` alone
does not touch already-installed sites.
"""
import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

from ury.setup_customizations import get_custom_fields


def execute():
	fields = get_custom_fields().get("Stock Entry")
	if fields:
		create_custom_fields({"Stock Entry": fields}, update=True)

	if not frappe.db.table_exists("URY Item Production Configuration"):
		return
	if not frappe.db.has_column("URY Item Production Configuration", "sourcing_mode"):
		return

	frappe.db.sql(
		"""
		UPDATE `tabURY Item Production Configuration`
		SET sourcing_mode = 'IN_HOUSE'
		WHERE production_policy = 'PRE_PRODUCED'
		  AND (sourcing_mode IS NULL OR sourcing_mode = '')
		"""
	)
