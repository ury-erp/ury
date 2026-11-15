import click
import frappe

from ury.setup_customizations import after_install as setup


def set_pos_invoice_type():
    """URY's POS creates POS Invoices. ERPNext v16 added POS Settings
    invoice_type, defaulting to "Sales Invoice" on new sites, which makes
    every URY order fail. v15 has no such field, so skip it there."""
    if frappe.get_meta("POS Settings").has_field("invoice_type"):
        frappe.db.set_single_value("POS Settings", "invoice_type", "POS Invoice")


def after_install():
    try:
        print("Setting up URY...")
        set_pos_invoice_type()
        setup()
        
        click.secho("Thank you for installing URY App!", fg="green")

        
    except Exception as e:
        print(f"Error during installation: {e}")
        pass
