"""Add ``Production Plan Item.custom_ury_no_work_order``.

A MADE_TO_ORDER row is itself a real target now (see
``ury_production_target_compiler``'s "MADE_TO_ORDER items" section): it gets
a real ``po_items`` row, so ERPNext's mandatory ``po_items`` constraint is
satisfied without an empty-department Production Plan (which ERPNext refuses
to insert at all -- confirmed directly: ``MandatoryError:
[Production Plan, ...]: po_items``). That row must never get a Work Order,
since an MTO item is produced only from the actual order, never in advance.

This field is the marker `ury_work_order_hooks` checks to refuse a Work
Order server-side -- regardless of who tries to create one, including
ERPNext's own native "Create Work Order" button on the Production Plan form,
which has no knowledge of this rule on its own.

`create_custom_fields` only runs automatically via `after_install`, which
does not touch existing sites, so this patch applies the field definition
idempotently on `bench migrate`.
"""
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

from ury.setup_customizations import get_custom_fields


def execute():
	fields = get_custom_fields().get("Production Plan Item")
	if not fields:
		return

	create_custom_fields({"Production Plan Item": fields}, update=True)
