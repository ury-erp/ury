"""Add the missing `branch` custom field to POS Closing Entry.

`stock_count_gate.validate_pos_closing_entry` (wired into POS Closing
Entry's `validate` hook) reads `doc.get("branch")` to resolve the
per-branch "Stock Count Gate" Alert Rule. POS Closing Entry never had a
`branch` field before -- only POS Opening Entry does -- so on any bench
that provisioned the app before this patch and later enables the Stock
Count Gate Alert Rule, `doc.branch` used to raise a bare AttributeError
(POS Closing Entry has no `branch` attribute at all) instead of safely
resolving to None.

`create_custom_fields` only runs automatically via `after_install`,
which does not touch existing sites, so this patch applies the same
field definition idempotently on `bench migrate`.
"""
import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

from ury.setup_customizations import get_custom_fields


def execute():
	fields = get_custom_fields().get("POS Closing Entry")
	if not fields:
		return
	create_custom_fields({"POS Closing Entry": fields}, update=True)
