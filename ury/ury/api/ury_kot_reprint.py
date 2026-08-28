import copy

import frappe
from frappe.utils import cint


@frappe.whitelist()
def reprint_kot(invoice_number):
    try:
        pos_profile, restaurant_table, order_type = frappe.db.get_value(
            "POS Invoice", invoice_number, ["pos_profile", "restaurant_table", "order_type"]
        )
        if not pos_profile:
            frappe.throw(f"POS Profile not found for Invoice {invoice_number}.")

        enable_kot_reprint, kot_print_format, table_order_printer, parcel_order_printer = frappe.db.get_value(
            "POS Profile",
            pos_profile,
            ["custom_enable_kot_reprint", "custom_reprint_kot_format", "custom_table_order_printer", "custom_parcel_order_printer"],
        )

        if not cint(enable_kot_reprint):
            frappe.throw("KOT Reprint is disabled in POS Profile.")

        if not kot_print_format:
            frappe.throw("No KOT Reprint Print Format is set in POS Profile.")

        printer = table_order_printer if order_type == "Dine In" else parcel_order_printer

        if not printer:
            frappe.throw("No printer is assigned for reprinting KOT.")

        print_kot(printer, invoice_number, kot_print_format, restaurant_table, order_type)

        return "Success"

    except Exception as e:
        error_message = f"KOT Reprint Error for Invoice {invoice_number}: {str(e)}"
        frappe.log_error(error_message, "KOT Reprint Error")
        frappe.throw("An unexpected error occurred while reprinting KOT. Please check logs.")


def print_kot(printer, docname, kot_print_format, restaurant_table=None, order_type=None):
    try:
        printer_doc = frappe.get_doc("Network Printer Settings", printer)
        printer_doc.print_doc(
            doctype="POS Invoice",
            name=docname,
            print_format=kot_print_format,
            job_type="KOT_REPRINT",
            extra_metadata={
                "invoice": docname,
                "restaurant_table": restaurant_table,
                "order_type": order_type,
            },
        )
    except Exception as e:
        frappe.log_error(f"KOT Reprint Error: {e}", "KOT Reprint Error")
	"""
	Reprint KOT for an invoice.

	Routing priority:
	  1. Per Production Unit printers (filtered to matching item groups).
	  2. If the invoice has a restaurant_table → Room-level printers (full item list).
	  3. Otherwise (takeaway / direct) → POS Profile-level printers (full item list).

	Each printer row must have ``custom_kot_reprint`` checked and
	``custom_kot_reprint_format`` set.  Rows with ``custom_block_takeaway_kot``
	are skipped for invoices that have no ``restaurant_table``.

	Returns:
	    "Success" when at least one print job was dispatched.
	    "Failure: No valid printers found" when nothing was printed
	    (an Error Log entry is also created in that case).

	Raises:
	    frappe.ValidationError: if KOT reprint is disabled on the POS Profile,
	        or if any *intentional* business-logic error is raised from within
	        (re-raised so the caller sees the original message).
	"""
	try:
		pos_invoice = frappe.get_doc("POS Invoice", invoice_number)
		pos_profile = pos_invoice.pos_profile

		if not pos_profile:
			frappe.throw(f"POS Profile not found for Invoice {invoice_number}.")

		enable_kot_reprint = frappe.db.get_value(
			"POS Profile", pos_profile, "custom_enable_kot_reprint"
		)

		if not cint(enable_kot_reprint):
			frappe.throw("KOT Reprint is disabled in POS Profile.")

		branch = pos_invoice.branch
		productions = frappe.db.get_all(
			"URY Production Unit", filters={"branch": branch}, fields=["name"]
		)

		# --- Batch-fetch item_group for all items in the invoice (avoids N+1 queries) ---
		item_codes = list({item.item_code for item in pos_invoice.items if item.qty > 0})
		item_group_map = {}
		if item_codes:
			rows = frappe.get_all(
				"Item",
				filters={"name": ["in", item_codes]},
				fields=["name", "item_group"],
			)
			item_group_map = {r.name: r.item_group for r in rows}

		printed_any = False
		order_no = pos_invoice.get("custom_ury_order_number") or ""

		# -----------------------------------------------------------------------
		# 1. Production-unit level printing
		# -----------------------------------------------------------------------
		for production in productions:
			production_item_groups = [
				row.item_group
				for row in frappe.get_all(
					"URY Production Item Groups",
					fields=["item_group"],
					filters={
						"parent": production.name,
						"parenttype": "URY Production Unit",
					},
					order_by="idx",
				)
			]

			production_items = [
				item
				for item in pos_invoice.items
				if item.qty > 0 and item_group_map.get(item.item_code) in production_item_groups
			]

			if not production_items:
				continue

			production_unit_printers = frappe.get_all(
				"URY Printer Settings",
				fields=["printer", "custom_block_takeaway_kot", "custom_kot_reprint", "custom_kot_reprint_format"],
				filters={"parent": production.name, "parenttype": "URY Production Unit"},
				order_by="idx",
			)

			if not production_unit_printers:
				continue

			temp_doc = copy.deepcopy(pos_invoice)
			temp_doc.items = production_items
			temp_doc.custom_production_unit = production.name
			temp_doc.order_no = order_no

			for p in production_unit_printers:
				if p.custom_block_takeaway_kot and not pos_invoice.restaurant_table:
					continue
				if p.custom_kot_reprint and p.custom_kot_reprint_format:
					print_kot(p.printer, invoice_number, p.custom_kot_reprint_format, temp_doc)
					printed_any = True

		# -----------------------------------------------------------------------
		# 2. Room-level printing (dine-in with a table)  vs.
		#    POS Profile fallback (takeaway / no table)
		# -----------------------------------------------------------------------
		if pos_invoice.restaurant_table:
			room = frappe.db.get_value(
				"URY Table", pos_invoice.restaurant_table, "restaurant_room"
			)
			if room:
				room_printers = frappe.get_all(
					"URY Printer Settings",
					fields=["printer", "custom_kot_reprint", "custom_kot_reprint_format"],
					filters={"parent": room, "parenttype": "URY Room"},
					order_by="idx",
				)
				if room_printers:
					temp_doc = copy.deepcopy(pos_invoice)
					temp_doc.items = [item for item in pos_invoice.items if item.qty > 0]
					temp_doc.order_no = order_no

					for p in room_printers:
						if p.custom_kot_reprint and p.custom_kot_reprint_format:
							print_kot(p.printer, invoice_number, p.custom_kot_reprint_format, temp_doc)
							printed_any = True
		else:
			pos_profile_printers = frappe.get_all(
				"URY Printer Settings",
				fields=["printer", "custom_kot_reprint", "custom_kot_reprint_format"],
				filters={"parent": pos_profile, "parenttype": "POS Profile"},
				order_by="idx",
			)
			if pos_profile_printers:
				temp_doc = copy.deepcopy(pos_invoice)
				temp_doc.items = [item for item in pos_invoice.items if item.qty > 0]
				temp_doc.order_no = order_no

				for p in pos_profile_printers:
					if p.custom_kot_reprint and p.custom_kot_reprint_format:
						print_kot(p.printer, invoice_number, p.custom_kot_reprint_format, temp_doc)
						printed_any = True

		if not printed_any:
			frappe.log_error(
				"KOT Reprint Error",
				f"No valid production unit or room printers found for Invoice {invoice_number}.",
			)
			return "Failure: No valid printers found"

		return "Success"

	except frappe.ValidationError:
		# Re-raise intentional frappe.throw() / frappe.msgprint() errors so the
		# caller sees the original user-facing message instead of the generic one.
		raise
	except Exception as e:
		error_message = f"KOT Reprint Error for Invoice {invoice_number}: {str(e)}"
		frappe.log_error(error_message, "KOT Reprint Error")
		frappe.throw("An unexpected error occurred while reprinting KOT. Please check logs.")


def print_kot(printer, docname, kot_print_format, doc=None):
	try:
		restaurant_table = doc.get("restaurant_table") if doc else None
		order_type = doc.get("order_type") if doc else None
		submit_and_monitor_print_job(
			doctype="POS Invoice",
			name=docname,
			printer_setting=printer,
			print_format=kot_print_format,
			doc=doc,
			job_type="KOT_REPRINT",
			extra_metadata={
				"invoice": docname,
				"restaurant_table": restaurant_table,
				"order_type": order_type,
			},
		)
	except Exception as e:
		frappe.log_error(f"KOT Reprint Error: {e}", "KOT Reprint Error")
