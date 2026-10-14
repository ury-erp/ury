"""Add POS Profile.custom_consolidate_on_payment (opt-in realtime SI)."""

from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

from ury.setup_customizations import get_custom_fields


def execute():
	fields = [
		f
		for f in (get_custom_fields().get("POS Profile") or [])
		if f.get("fieldname") == "custom_consolidate_on_payment"
	]
	if not fields:
		return
	create_custom_fields({"POS Profile": fields}, update=True)
