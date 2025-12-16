import frappe
from frappe import _
import os
import tempfile
import traceback

# Safe import for cups
try:
    import cups
except ImportError:
    cups = None

from frappe.www.printview import validate_print_permission

logger = frappe.logger("pos_printing")

def _get_qz_status(pos_profile):
    """
    Helper to check if QZ Print is enabled for the given POS Profile.
    Returns True if QZ is enabled, False otherwise.
    """
    if not pos_profile:
        return False
    
    return frappe.db.get_value("POS Profile", pos_profile, "qz_print") == 1

def _print_as_text(conn, printer_name, doc_obj, doctype, name):
    """Print document as plain text template (CUPS Only)"""
    try:
        text_content = ""
        
        # ========== KOT-SPECIFIC TEMPLATE ==========
        if doctype == "URY KOT":
            text_content = f"""
{'=' * 50}
{'KITCHEN ORDER TICKET'.center(50)}
{'=' * 50}
KOT #: {doc_obj.name}
Time: {doc_obj.creation}
Table: {doc_obj.get('restaurant_table', 'N/A')}
Order Type: {doc_obj.get('order_type', 'Dine In')}
Customer: {doc_obj.get('customer_name', 'N/A')}
{'-' * 50}
{'ITEMS'.center(50)}
{'-' * 50}
"""
            # KOT items
            if hasattr(doc_obj, 'items'):
                for item in doc_obj.items:
                    if isinstance(item, dict):
                        item_name = item.get('item_name', '')
                        qty = item.get('qty', 0)
                        notes = item.get('notes')
                        item_variant = item.get('item_variant')
                    else:
                        item_name = getattr(item, 'item_name', '')
                        qty = getattr(item, 'qty', 0)
                        notes = getattr(item, 'notes', None)
                        item_variant = getattr(item, 'item_variant', None)
                    
                    display_name = (item_name[:27] + '...') if len(item_name) > 30 else item_name
                    text_content += f"\n{qty:<5.1f} x {display_name:<30}\n"
                    
                    if notes:
                        text_content += f"  NOTE: {notes[:40]}\n"
                    if item_variant:
                        text_content += f"  Variant: {item_variant}\n"
            
            text_content += f"""
{'-' * 50}
Special Instructions: {doc_obj.get('special_instructions', 'None')}
{'-' * 50}
Urgent: {'YES' if doc_obj.get('is_urgent') else 'NO'}
Course: {doc_obj.get('course', 'Main')}
{'-' * 50}
"""

        # ========== INVOICE TEMPLATE ==========
        else:
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
            if hasattr(doc_obj, 'items'):
                text_content += f"{'Qty':<5} {'Item':<30} {'Rate':>10} {'Amount':>12}\n"
                text_content += f"{'-' * 57}\n"
                
                for item in doc_obj.items:
                    if isinstance(item, dict):
                        item_name = item.get('item_name', '')
                        qty = item.get('qty', 0)
                        rate = item.get('rate', 0)
                        amount = item.get('amount', 0)
                    else:
                        item_name = getattr(item, 'item_name', '')
                        qty = getattr(item, 'qty', 0)
                        rate = getattr(item, 'rate', 0)
                        amount = getattr(item, 'amount', 0)
                    
                    display_name = (item_name[:27] + '...') if len(item_name) > 30 else item_name
                    text_content += f"{qty:<5.1f} {display_name:<30} {float(rate):>10.2f} {float(amount):>12.2f}\n"
            
            text_content += f"""
{'-' * 50}
{'TOTALS'.center(50)}
{'-' * 50}
"""
            if hasattr(doc_obj, 'net_total'):
                val = doc_obj.net_total
                net_total = float(val) if val else 0.0
                text_content += f"Net Total: {net_total:>40.2f}\n"
            
            if hasattr(doc_obj, 'total_taxes_and_charges'):
                val = doc_obj.total_taxes_and_charges
                tax = float(val) if val else 0.0
                text_content += f"Tax: {tax:>44.2f}\n"
            
            if hasattr(doc_obj, 'grand_total'):
                val = doc_obj.grand_total
                grand_total = float(val) if val else 0.0
                text_content += f"{'=' * 50}\n"
                text_content += f"GRAND TOTAL: {grand_total:>37.2f}\n"
                text_content += f"{'=' * 50}\n"
            
            text_content += "\nThank you for your business!\n"
        
        with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.txt') as f:
            f.write(text_content)
            file_path = f.name
        
        try:
            conn.printFile(printer_name, file_path, name, {})
            return {"status": "success", "message": "Printed text successfully"}
        finally:
            if os.path.exists(file_path):
                os.unlink(file_path)
        
    except Exception as e:
        logger.error(f"Text Print Error: {traceback.format_exc()}")
        return {"status": "error", "message": f"Failed to print text: {str(e)}"}


def _update_kot_status(kot_name):
    """Update KOT printed status safely"""
    try:
        if not frappe.db.exists("URY KOT", kot_name):
            return

        meta = frappe.get_meta("URY KOT")
        if meta.has_field("kot_printed"):
            frappe.db.set_value("URY KOT", kot_name, "kot_printed", 1, update_modified=False)
        elif meta.has_field("printed"):
            frappe.db.set_value("URY KOT", kot_name, "printed", 1, update_modified=False)
    except Exception:
        logger.error(f"Failed to update KOT status for {kot_name}")


@frappe.whitelist()
def network_printing(doctype, name, printer_setting, print_format=None, doc=None, no_letterhead=0, file_path=None, is_kot=False):
    """
    Standard Server-Side CUPS Printing.
    NOTE: This does NOT handle QZ Tray logic. That is handled in the wrappers.
    """
    try:
        if not cups:
            return {"status": "error", "message": "CUPS module not installed on server"}

        if not frappe.db.exists("Network Printer Settings", printer_setting):
            return {"status": "error", "message": f"Printer setting '{printer_setting}' not found"}

        print_settings = frappe.get_doc("Network Printer Settings", printer_setting)

        try:
            cups.setServer(print_settings.server_ip)
            cups.setPort(print_settings.port)
            conn = cups.Connection()
        except Exception as e:
            return {"status": "error", "message": f"Connection to printer failed: {str(e)}"}

        doc_obj = frappe.get_doc(doctype, name) if not doc else doc
        
        # 1. HTML/PDF Printing
        if print_format:
            try:
                html = frappe.get_print(
                    doctype=doctype,
                    name=name,
                    print_format=print_format,
                    doc=doc_obj,
                    no_letterhead=no_letterhead
                )
                from frappe.utils.pdf import get_pdf
                pdf_content = get_pdf(html)
                
                with tempfile.NamedTemporaryFile(mode='wb', delete=False, suffix='.pdf') as f:
                    f.write(pdf_content)
                    pdf_file_path = f.name
                
                try:
                    conn.printFile(print_settings.printer_name, pdf_file_path, f"{name} - {print_format}", {})
                    if os.path.exists(pdf_file_path):
                        os.unlink(pdf_file_path)
                    
                    if doctype == "URY KOT":
                        _update_kot_status(name)
                        
                    return {"status": "success", "message": "Printed PDF successfully"}
                except Exception as e:
                    if os.path.exists(pdf_file_path):
                        os.unlink(pdf_file_path)
                    raise e 
            except Exception as e:
                logger.error(f"PDF Print failed for {print_format}, falling back to text. Error: {e}")
        
        # 2. Fallback Text Printing
        return _print_as_text(conn, print_settings.printer_name, doc_obj, doctype, name)
            
    except Exception as e:
        logger.error(f"Network Printing Error: {traceback.format_exc()}")
        return {"status": "error", "message": str(e)}


@frappe.whitelist()
def select_network_printer(pos_profile, invoice_id):
    """
    Called by JS to decide how to print an invoice.
    """
    # 1. CHECK QZ STATUS FIRST
    if _get_qz_status(pos_profile):
        # If QZ is enabled, we DO NOT print here. 
        # We return a specific status so the JS knows to run the QZ logic.
        return {"status": "qz_enabled", "message": "Client will handle printing"}

    # 2. Proceed with CUPS Logic
    table = frappe.db.get_value("POS Invoice", invoice_id, "restaurant_table")
    print_format = frappe.db.get_value("POS Profile", pos_profile, "print_format")
    
    printer_setting_name = None

    if table:
        room = frappe.db.get_value("URY Table", table, "restaurant_room")
        printer_setting_name = frappe.db.get_value(
            "URY Printer Settings", 
            {"parent": room, "bill": 1}, 
            "printer"
        )

    if not printer_setting_name:
        printer_setting_name = frappe.db.get_value(
            "URY Printer Settings", 
            {"parent": pos_profile, "bill": 1}, 
            "printer"
        )

    if printer_setting_name:
        return network_printing(
            "POS Invoice", invoice_id, printer_setting_name, print_format
        )
    
    return {"status": "error", "message": "No suitable printer found configuration"}


@frappe.whitelist()
def qz_print_update(invoice):
    """
    Called by JS AFTER QZ Tray successfully prints, or to update status.
    """
    try:
        table = frappe.db.get_value("POS Invoice", invoice, "restaurant_table")
        
        frappe.db.set_value("POS Invoice", invoice, "invoice_printed", 1, update_modified=False)
        
        if frappe.db.get_value("POS Invoice", invoice, "invoice_printed") != 1:
             return {"status": "Failure"}

        if table:
             frappe.db.set_value(
                "URY Table", 
                table, 
                {"occupied": 0, "latest_invoice_time": None},
                update_modified=True
            )
             
             if frappe.db.get_value("URY Table", table, "occupied") != 0:
                 return {"status": "Failure"}
        
        return {"status": "Success"}
        
    except Exception as e:
        frappe.log_error(title="Print Update Fail", message=traceback.format_exc())
        return {"status": "Failure"}


@frappe.whitelist()
def print_pos_page(doctype, name, print_format):
    """
    Endpoint to trigger printing. 
    If QZ is enabled, it returns 'qz_enabled' so JS takes over.
    If QZ is disabled, it prints via CUPS.
    """
    logger.debug(f"print_pos_page called for {name}")
    
    try:
        # Fetch POS Profile from the Invoice
        pos_profile = frappe.db.get_value(doctype, name, "pos_profile")
        
        # 1. CHECK QZ STATUS
        if _get_qz_status(pos_profile):
            # QZ is ON. We do NOT print from server.
            # We return success/qz status so the JS knows to proceed with client-side print.
            return {"status": "qz_enabled", "message": "QZ Enabled, Handled by Client"}

        # 2. CUPS PRINTING (Legacy/Server-side)
        printer_settings = frappe.get_all('Network Printer Settings', limit=1)
        if not printer_settings:
            return {"status": "error", "message": "No printer configured"}
        
        printer_setting = printer_settings[0]['name']
        
        result = network_printing(
            doctype=doctype,
            name=name,
            printer_setting=printer_setting,
            print_format=print_format
        )
        
        # UI Realtime updates (Only needed for Server side print usually)
        restaurant_table, branch = frappe.db.get_value(
            "POS Invoice", name, ["restaurant_table", "branch"]
        )
        
        if branch:
            print_channel = f"print_{branch}"
            frappe.publish_realtime(print_channel, {
                "data": {"name": name, "doctype": doctype, "print_format": print_format}
            })
        
        # Update Status (Since server handled the print)
        if frappe.db.get_value("POS Invoice", name, "invoice_printed") == 0:
            frappe.db.set_value("POS Invoice", name, "invoice_printed", 1)

            if restaurant_table:
                frappe.db.set_value(
                    "URY Table",
                    restaurant_table,
                    {"occupied": 0, "latest_invoice_time": None},
                )
        
        return result
            
    except Exception as e:
        frappe.log_error(f"print_pos_page error: {str(e)}", "Print Error")
        return {"status": "error", "message": str(e)}


@frappe.whitelist()
def qz_certificate():
    return frappe.get_site_config().get("qz_cert")


@frappe.whitelist()
def signature_promise():
    return frappe.get_site_config().get("qz_private_key")


@frappe.whitelist()
def print_kot_on_create(doc, method=None):
    """
    Auto-print KOT. 
    If QZ is enabled, publish realtime event for client-side printing.
    Otherwise use CUPS server-side printing.
    """
    try:
        if isinstance(doc, str):
            kot_name = doc
            kot = frappe.get_doc("URY KOT", kot_name)
        else:
            kot = doc
            kot_name = doc.name
        
        pos_profile = kot.pos_profile
        
        # 1. CHECK QZ STATUS
        if _get_qz_status(pos_profile):
            # Get printer settings for this POS Profile
            printer_settings = frappe.get_all(
                "URY Printer Settings",
                filters={
                    "parent": pos_profile, 
                    "parentfield": "printer_settings", 
                    "custom_kot_print": 1
                },
                fields=["name", "printer", "custom_kot_print_format"]
            )
            
            if not printer_settings:
                return {"status": "error", "message": "No KOT printer configured"}
            
            # Publish realtime event with printer details
            frappe.publish_realtime(
                event="ury_kot_created",
                message={
                    "kot_name": kot_name,
                    "pos_profile": pos_profile,
                    "printers": printer_settings
                },
                user=frappe.session.user
            )
            
            logger.info(f"Published KOT event for {kot_name} to {len(printer_settings)} printer(s)")
            return {"status": "qz_enabled", "message": f"KOT event published for {len(printer_settings)} printer(s)"}

        # 2. CUPS PRINTING (unchanged)
        if not pos_profile:
            return {"status": "error", "message": "No POS Profile configured"}
        
        printer_settings = frappe.get_all(
            "URY Printer Settings",
            filters={
                "parent": pos_profile, 
                "parentfield": "printer_settings", 
                "custom_kot_print": 1
            },
            fields=["name", "printer", "custom_kot_print_format"]
        )
        
        if not printer_settings:
            return {"status": "error", "message": "No KOT printer configured"}
        
        results = []
        success_count = 0

        for setting in printer_settings:
            printer = setting.get("printer")
            fmt = setting.get("custom_kot_print_format")
            
            if not printer: continue
            
            res = network_printing(
                doctype="URY KOT",
                name=kot_name,
                printer_setting=printer,
                print_format=fmt,
                doc=kot
            )
            
            status = res.get("status") if isinstance(res, dict) else "unknown"
            if status == "success":
                success_count += 1

            results.append({
                "printer": printer,
                "status": status,
                "message": res.get("message") if isinstance(res, dict) else str(res)
            })
        
        if success_count > 0:
            _update_kot_status(kot_name)
        
        return {
            "status": "success",
            "message": f"KOT printed to {success_count} printer(s)",
            "results": results
        }
        
    except Exception as e:
        frappe.log_error(f"KOT Print Error: {str(e)}", "KOT Print Error")
        return {"status": "error", "message": str(e)}


@frappe.whitelist()
def get_kot_printers(pos_profile):
    return frappe.get_all(
        "URY Printer Settings",
        filters={"parent": pos_profile, "custom_kot_print": 1},
        fields=["name", "printer", "custom_kot_print_format"]
    )
