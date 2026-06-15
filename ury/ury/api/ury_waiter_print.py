import frappe
from frappe.utils.print_format import print_by_server

WAITER_PRINT_FORMAT = "URY Waiter Order Slip"
WAITER_PRINT_CACHE_PREFIX = "ury_waiter_print_"


def _get_cache_key(invoice_id):
	return f"{WAITER_PRINT_CACHE_PREFIX}{invoice_id}"


def _invoice_already_printed(invoice_id, modified):
	cached_modified = frappe.cache().get_value(_get_cache_key(invoice_id))
	return cached_modified and cached_modified == modified


def _mark_invoice_printed(invoice_id, modified):
	frappe.cache().set_value(_get_cache_key(invoice_id), modified)


def _get_room_waiter_printers(room):
	return frappe.get_all(
		"URY Printer Settings",
		fields=["printer", "custom_waiter_print_format"],
		filters={
			"parent": room,
			"parenttype": "URY Room",
			"custom_waiter_print": 1,
		},
		order_by="idx",
	)


def print_waiter_order_slip(kot_doc):
	"""Print one waiter order slip per POS Invoice revision for dine-in tables."""
	if not kot_doc.invoice:
		return

	if not kot_doc.restaurant_table or kot_doc.table_takeaway == 1:
		return

	invoice_modified = frappe.db.get_value("POS Invoice", kot_doc.invoice, "modified")
	if not invoice_modified:
		return

	if _invoice_already_printed(kot_doc.invoice, invoice_modified):
		return

	room = frappe.db.get_value("URY Table", kot_doc.restaurant_table, "restaurant_room")
	if not room:
		return

	waiter_printers = _get_room_waiter_printers(room)
	if not waiter_printers:
		return

	printed = False
	for printer_row in waiter_printers:
		waiter_print_format = printer_row.custom_waiter_print_format
		if not waiter_print_format:
			frappe.log_error(
				f"No waiter print format set for printer {printer_row.printer} in room {room}.",
				"URY Waiter Print",
			)
			continue

		if not frappe.db.exists("Print Format", waiter_print_format):
			frappe.log_error(
				f"Waiter print format '{waiter_print_format}' not found.",
				"URY Waiter Print",
			)
			continue

		try:
			print_by_server(
				"POS Invoice",
				kot_doc.invoice,
				printer_row.printer,
				waiter_print_format,
				no_letterhead=1,
			)
			printed = True
		except Exception as e:
			frappe.log_error(
				f"Waiter print failed for invoice {kot_doc.invoice}: {e}",
				"URY Waiter Print",
			)

	if printed:
		_mark_invoice_printed(kot_doc.invoice, invoice_modified)
