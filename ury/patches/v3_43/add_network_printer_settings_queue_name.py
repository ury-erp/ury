"""Add Printer Queue Name to Network Printer Settings.

URY Print Job fetches ``printer_name`` from ``printer.custom_printer_queue_name``
and ury_printer_watch matches health entries by queue name. The field was
previously created only manually on some sites; define it in
``setup_customizations.py`` and create it here so stock sites get the column.
"""
import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

from ury.setup_customizations import get_custom_fields


def execute():
	fields = get_custom_fields().get("Network Printer Settings")
	if fields:
		create_custom_fields({"Network Printer Settings": fields}, update=True)
		frappe.clear_cache(doctype="Network Printer Settings")
