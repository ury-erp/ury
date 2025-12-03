import frappe
from frappe import _

import os

from pypdf import PdfWriter

no_cache = 1

base_template_path = "www/printview.html"
standard_format = "templates/print_formats/standard.html"

from frappe.www.printview import validate_print_permission


@frappe.whitelist()
def network_printing(
    doctype,
    name,
    printer_setting,
    print_format=None,
    doc=None,
    no_letterhead=0,
    file_path=None,
):
    """Print directly as text - faster and more reliable than PDF"""
    try:
        # Get printer settings
        print_settings = frappe.get_doc("Network Printer Settings", printer_setting)

        # Import cups
        try:
            import cups
        except ImportError:
            return "Failed to import cups"

        # Connect to CUPS
        try:
            cups.setServer(print_settings.server_ip)
            cups.setPort(print_settings.port)
            conn = cups.Connection()
        except Exception as e:
            return f"Failed to connect to the printer: {str(e)}"

        # TEXT PRINTING LOGIC (proven to work)
        try:
            # Get the document
            doc_obj = frappe.get_doc(doctype, name) if not doc else doc
            
            # ========== ENHANCED TEXT TEMPLATE ==========
            # Create text content with proper formatting
            text_content = f"""
{'=' * 50}
{'INVOICE'.center(50)}
{'=' * 50}
Invoice: {doc_obj.name}
Date: {doc_obj.posting_date} {doc_obj.posting_time}
Customer: {doc_obj.customer_name if hasattr(doc_obj, 'customer_name') else doc_obj.customer}
Table: {doc_obj.get('restaurant_table', 'Take Away') or 'Take Away'}
Order Type: {doc_obj.get('order_type', 'N/A')}
Waiter: {doc_obj.get('waiter', 'N/A')}
{'-' * 50}
{'ITEMS'.center(50)}
{'-' * 50}
"""
            
            # Add items with proper formatting
            if hasattr(doc_obj, 'items'):
                # Header
                text_content += f"{'Qty':<5} {'Item':<30} {'Rate':>10} {'Amount':>12}\n"
                text_content += f"{'-' * 57}\n"
                
                # Items
                for item in doc_obj.items:
                    # Truncate long item names
                    item_name = (item.item_name[:27] + '...') if len(item.item_name) > 30 else item.item_name
                    text_content += f"{item.qty:<5.1f} {item_name:<30} {float(item.rate):>10.2f} {float(item.amount):>12.2f}\n"
            
            # Add totals section
            text_content += f"""
{'-' * 50}
{'TOTALS'.center(50)}
{'-' * 50}
"""
            
            # Check for different total fields
            if hasattr(doc_obj, 'net_total'):
                text_content += f"Net Total: {float(doc_obj.net_total):>40.2f}\n"
            
            if hasattr(doc_obj, 'total_taxes_and_charges'):
                text_content += f"Tax: {float(doc_obj.total_taxes_and_charges):>44.2f}\n"
            
            if hasattr(doc_obj, 'grand_total'):
                text_content += f"{'=' * 50}\n"
                text_content += f"GRAND TOTAL: {float(doc_obj.grand_total):>37.2f}\n"
                text_content += f"{'=' * 50}\n"
            
            # Footer
            text_content += f"""
Thank you for your business!
"""
            # ========== END ENHANCED TEMPLATE ==========
            
            # Create temp file
            import tempfile
            import os
            with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.txt') as f:
                f.write(text_content)
                file_path = f.name
            
            # Print the text file
            conn.printFile(print_settings.printer_name, file_path, name, {})
            
            # Clean up temp file
            os.unlink(file_path)
            
            # Update invoice and table status
            restaurant_table = doc_obj.get('restaurant_table')
            invoice_printed = doc_obj.get('invoice_printed', 0)
            
            if restaurant_table and invoice_printed == 0:
                frappe.db.set_value(doctype, name, "invoice_printed", 1)
                frappe.db.set_value(
                    "URY Table",
                    restaurant_table,
                    {"occupied": 0, "latest_invoice_time": None},
                )
            else:
                frappe.db.set_value(doctype, name, "invoice_printed", 1)

            return "Success"
            
        except Exception as e:
            import traceback
            traceback.print_exc()
            return f"Failed to print: {str(e)}"
            
    except Exception as e:
        import traceback
        traceback.print_exc()
        return f"An error occurred: {str(e)}"


@frappe.whitelist()
def select_network_printer(pos_profile, invoice_id):
    table = frappe.db.get_value("POS Invoice", invoice_id, "restaurant_table")
    print_format = frappe.db.get_value("POS Profile", pos_profile, "print_format")

    if table:
        room = frappe.db.get_value("URY Table", table, "restaurant_room")
        room_bill_printer = frappe.db.get_value(
            "URY Printer Settings", {"parent": room, "bill": 1}, "printer"
        )
        if room_bill_printer:
            print = network_printing(
                "POS Invoice", invoice_id, room_bill_printer, print_format
            )
            return print

    else:
        pos_bill_printer = frappe.db.get_value(
            "URY Printer Settings", {"parent": pos_profile, "bill": 1}, "printer"
        )
        if pos_bill_printer:
            print = network_printing(
                "POS Invoice", invoice_id, pos_bill_printer, print_format
            )
            return print


@frappe.whitelist()
def qz_print_update(invoice):
    try:
        table = frappe.db.get_value("POS Invoice", invoice, "restaurant_table")
        
        if table == None or table == "":
            # Update invoice_printed
            frappe.db.set_value(
                "POS Invoice", invoice, "invoice_printed", 1, update_modified=False
            )
            
            # Validate the update
            new_invoice_printed = frappe.db.get_value("POS Invoice", invoice, "invoice_printed")
            if new_invoice_printed != 1:
                return {"status": "Failure"}                
        else:
            invoice_printed = frappe.db.get_value("POS Invoice", invoice, "invoice_printed")

            if invoice_printed == 0:
                # Update invoice_printed
                frappe.db.set_value(
                    "POS Invoice", invoice, "invoice_printed", 1, update_modified=False
                )
                
                # Update table status
                frappe.db.set_value(
                    "URY Table", table, {"occupied": 0, "latest_invoice_time": None}
                )
                
                # Validate both updates
                new_invoice_printed = frappe.db.get_value("POS Invoice", invoice, "invoice_printed")
                new_table_status = frappe.db.get_value("URY Table", table, "occupied")
                
                if new_invoice_printed != 1 or new_table_status != 0:
                    return {"status": "Failure"}
        
        return {"status": "Success"}
        
    except Exception as e:
        frappe.log_error(message=e, title="Print Fail")
        frappe.throw(_("Error while printing order",e))                   
        return {"status": "Failure"}


@frappe.whitelist()
def print_pos_page(doctype, name, print_format):
    """ACTUALLY PRINT instead of just sending realtime events"""
    print("=" * 60)
    print("DEBUG: print_pos_page called")
    print(f"  doctype: {doctype}")
    print(f"  name: {name}")
    print(f"  print_format: {print_format}")
    print("=" * 60)
    
    try:
        # Get default printer setting
        printer_settings = frappe.get_all('Network Printer Settings', limit=1)
        
        print(f"  Found {len(printer_settings)} printer settings")
        
        if not printer_settings:
            print("  ERROR: No printer configured")
            return {"status": "error", "message": "No printer configured"}
        
        printer_setting = printer_settings[0]['name']
        print(f"  Using printer setting: {printer_setting}")
        
        # Call network_printing to actually print
        print("  Calling network_printing...")
        result = network_printing(
            doctype=doctype,
            name=name,
            printer_setting=printer_setting,
            print_format=print_format
        )
        
        print(f"  network_printing result: {result}")
        
        # Also send realtime event for UI updates
        restaurant_table, branch, invoice_name = frappe.db.get_value(
            "POS Invoice", name, ["restaurant_table", "branch", "name"]
        )
        
        print(f"  Branch: {branch}, Table: {restaurant_table}")
        
        if branch:
            print_channel = "{}_{}".format("print", branch)
            frappe.publish_realtime(print_channel, {"data": {"name": name, "doctype": doctype, "print_format": print_format}})
            print(f"  Sent realtime event to channel: {print_channel}")
        
        # Update status if not already done by network_printing
        invoice_printed = frappe.db.get_value("POS Invoice", name, "invoice_printed")
        print(f"  Current invoice_printed status: {invoice_printed}")
        
        if invoice_printed == 0:
            frappe.db.set_value("POS Invoice", name, "invoice_printed", 1)
            print(f"  Updated invoice_printed to 1")

            if restaurant_table:
                frappe.db.set_value(
                    "URY Table",
                    restaurant_table,
                    {"occupied": 0, "latest_invoice_time": None},
                )
                print(f"  Updated table {restaurant_table} status")
        
        if result == "Success":
            print("  ✓ Returning success")
            return {"status": "success", "message": "Printed successfully"}
        else:
            print(f"  ✗ Returning error: {result}")
            return {"status": "error", "message": result}
            
    except Exception as e:
        print(f"  EXCEPTION: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        frappe.log_error(f"print_pos_page error: {str(e)}", "Print Error")
        return {"status": "error", "message": str(e)}


@frappe.whitelist()
def qz_certificate():
    site_config = frappe.get_site_config()
    qz_key_value = site_config.get("qz_cert")

    return qz_key_value


@frappe.whitelist()
def signature_promise():
    site_config = frappe.get_site_config()
    key_value = site_config.get("qz_private_key")

    return key_value