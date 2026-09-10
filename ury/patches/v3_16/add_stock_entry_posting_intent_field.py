"""Add the indexed `custom_ury_posting_intent` field to Stock Entry.

`_find_existing_stock_entry` in `ury_fulfilment_posting_service.py` used to
run `SELECT ... FROM tabStock Entry WHERE docstatus = 1 AND remarks LIKE
'%...%' FOR UPDATE`. A leading-wildcard LIKE can never use a B-tree index,
so on InnoDB that `FOR UPDATE` locked every row (and gap) it scanned for the
rest of the transaction -- effectively a table-wide exclusive lock on a
table (`tabStock Entry`) that grows unboundedly.

The fix stores the posting-intent name directly in a new, indexed field
(`custom_ury_posting_intent`, defined in `setup_customizations.py`) and
queries that with an exact match instead. `create_custom_fields` only runs
automatically via `after_install`, which does not touch existing sites, so
this patch applies the same field definition idempotently on `bench
migrate` for sites that installed the app before this change.
"""
import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

from ury.setup_customizations import get_custom_fields


def execute():
	fields = get_custom_fields().get("Stock Entry")
	if not fields:
		return
	create_custom_fields({"Stock Entry": fields}, update=True)
