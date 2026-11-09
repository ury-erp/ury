import frappe
import json
import os

def execute():
    frappe.flags.in_migrate = True
    frappe.flags.in_patch = True
    # 1. Remove any default_print_format override on POS Invoice so it keeps the default existing print format
    frappe.db.delete("Property Setter", {"name": "POS Invoice-main-default_print_format"})

    # 2. Ensure mode of payment and discount fields are visible in POS Invoice default/standard print format
    fields_to_unhide = [
        ("POS Invoice", "additional_discount_percentage", "print_hide", "0", "Check"),
        ("POS Invoice", "additional_discount_percentage", "print_hide_if_no_value", "1", "Check"),
        ("POS Invoice", "discount_amount", "print_hide", "0", "Check"),
        ("POS Invoice", "discount_amount", "print_hide_if_no_value", "1", "Check"),
        ("POS Invoice", "payments", "print_hide", "0", "Check"),
        ("POS Invoice", "paid_amount", "print_hide", "0", "Check"),
        ("POS Invoice", "change_amount", "print_hide", "0", "Check"),
        ("POS Invoice", "change_amount", "print_hide_if_no_value", "1", "Check"),
        ("Sales Invoice Payment", "type", "print_hide", "1", "Check"),
    ]

    for dt, fn, prop, val, ptype in fields_to_unhide:
        frappe.make_property_setter(
            {
                "doctype": dt,
                "doctype_or_field": "DocField",
                "fieldname": fn,
                "property": prop,
                "value": val,
                "property_type": ptype,
            }
        )

    # 2. Update Merged POS Invoice Format with payment details
    json_path = os.path.join(
        os.path.dirname(__file__),
        "..",
        "..",
        "ury",
        "print_format",
        "merged_pos_invoice_format",
        "merged_pos_invoice_format.json",
    )
    if os.path.exists(json_path):
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if frappe.db.exists("Print Format", "Merged POS Invoice Format"):
            frappe.db.set_value(
                "Print Format",
                "Merged POS Invoice Format",
                "html",
                data.get("html", ""),
                update_modified=False,
            )

    # 3. Ensure standard POS Invoice print format has closing </tr> on payments
    if frappe.db.exists("Print Format", "POS Invoice"):
        pf = frappe.get_doc("Print Format", "POS Invoice")
        if pf.html and "<tr>\n\t\t{%- endfor -%}" in pf.html:
            new_html = pf.html.replace("<tr>\n\t\t{%- endfor -%}", "</tr>\n\t\t{%- endfor -%}")
            frappe.db.set_value("Print Format", "POS Invoice", "html", new_html, update_modified=False)

    frappe.clear_cache(doctype="POS Invoice")
    frappe.clear_cache(doctype="Sales Invoice Payment")
    frappe.db.commit()
