import frappe
from frappe.utils import flt
from frappe.utils.print_format import print_by_server

WAITER_PRINT_FORMAT = "URY Waiter Order Slip"
ADD_KOT_TYPES = ("New Order", "Order Modified")
CANCEL_KOT_TYPES = ("Partially cancelled", "Cancelled")


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


def _is_takeaway_table(restaurant_table):
	if not restaurant_table:
		return True
	return frappe.db.get_value("URY Table", restaurant_table, "is_take_away") == 1


def _aggregate_kot_items(kot_docs):
	add_items = {}
	cancel_items = {}

	for kot in kot_docs:
		for row in kot.kot_items:
			key = (row.item, row.comments or "")
			if kot.type in CANCEL_KOT_TYPES:
				if key not in cancel_items:
					cancel_items[key] = {
					"item": row.item,
					"item_name": row.item_name,
					"quantity": flt(row.quantity or 0),
					"cancelled_qty": flt(row.cancelled_qty or 0),
					"comments": row.comments,
					"course": row.course,
					}
			elif kot.type in ADD_KOT_TYPES:
				if key not in add_items:
					add_items[key] = {
					"item": row.item,
					"item_name": row.item_name,
					"quantity": flt(row.quantity or 0),
					"comments": row.comments,
					"course": row.course,
					}

	return list(add_items.values()) + list(cancel_items.values())


def _get_invoice_item_qty_map(invoice_id):
	if not invoice_id:
		return {}

	qty_map = {}
	for row in frappe.get_all(
		"POS Invoice Item",
		filters={"parent": invoice_id},
		fields=["item_code", "qty", "comment"],
	):
		key = (row["item_code"], row.get("comment") or "")
		qty_map[key] = flt(row.get("qty") or 0)

	return qty_map


def _enrich_item_display_fields(items, invoice_id):
	invoice_qty_map = _get_invoice_item_qty_map(invoice_id)
	enriched_items = []

	for item in items:
		item = dict(item)
		key = (item["item"], item.get("comments") or "")

		if item.get("cancelled_qty"):
			old_qty = flt(item.get("quantity") or 0)
			cancelled_qty = flt(item.get("cancelled_qty") or 0)
			new_qty = max(old_qty - cancelled_qty, 0)
			item["display_mode"] = "old_new"
			item["old_qty"] = old_qty
			item["new_qty"] = new_qty
		else:
			delta_qty = flt(item.get("quantity") or 0)
			new_qty = invoice_qty_map.get(key, delta_qty)
			old_qty = new_qty - delta_qty

			if old_qty <= 0:
				item["display_mode"] = "single_qty"
				item["old_qty"] = 0
				item["new_qty"] = delta_qty
			else:
				item["display_mode"] = "old_new"
				item["old_qty"] = old_qty
				item["new_qty"] = new_qty

		enriched_items.append(item)

	return enriched_items


def build_combined_kot_doc(kot_names):
	if not kot_names:
		return None

	kot_docs = [frappe.get_doc("URY KOT", name) for name in kot_names]
	combined_doc = frappe.copy_doc(kot_docs[0])
	combined_doc.kot_items = []

	if combined_doc.invoice:
		waiter = frappe.db.get_value("POS Invoice", combined_doc.invoice, "waiter")
		if waiter:
			combined_doc.waiter = waiter

	for item in _enrich_item_display_fields(
		_aggregate_kot_items(kot_docs),
		combined_doc.invoice,
	):
		combined_doc.append("kot_items", item)

	return combined_doc


def _validate_waiter_print_format(waiter_print_format, room, printer):
	if not waiter_print_format:
		frappe.log_error(
			f"No waiter print format set for printer {printer} in room {room}.",
			"URY Waiter Print",
		)
		return False

	if not frappe.db.exists("Print Format", waiter_print_format):
		frappe.log_error(
			f"Waiter print format '{waiter_print_format}' not found.",
			"URY Waiter Print",
		)
		return False

	print_format_doctype = frappe.db.get_value("Print Format", waiter_print_format, "doc_type")
	if print_format_doctype != "URY KOT":
		frappe.log_error(
			f"Waiter print format '{waiter_print_format}' must be for URY KOT, not {print_format_doctype}.",
			"URY Waiter Print",
		)
		return False

	return True


def print_combined_waiter_order_slip(invoice_id, kot_names, restaurant_table):
	"""Print one combined waiter slip for all delta KOTs created in an order update."""
	if not invoice_id or not kot_names:
		return

	if not restaurant_table or _is_takeaway_table(restaurant_table):
		return

	room = frappe.db.get_value("URY Table", restaurant_table, "restaurant_room")
	if not room:
		return

	waiter_printers = _get_room_waiter_printers(room)
	if not waiter_printers:
		return

	combined_doc = build_combined_kot_doc(kot_names)
	if not combined_doc or not combined_doc.kot_items:
		return

	for printer_row in waiter_printers:
		waiter_print_format = printer_row.custom_waiter_print_format
		if not _validate_waiter_print_format(
			waiter_print_format, room, printer_row.printer
		):
			continue

		try:
			print_by_server(
				"URY KOT",
				kot_names[0],
				printer_row.printer,
				waiter_print_format,
				doc=combined_doc,
				no_letterhead=1,
			)
		except Exception as e:
			frappe.log_error(
				f"Waiter print failed for invoice {invoice_id}: {e}",
				"URY Waiter Print",
			)
