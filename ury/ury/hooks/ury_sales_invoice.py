import frappe


def before_insert(doc, method):
    sales_invoice_naming(doc, method)


def sales_invoice_naming(doc, method):
    if frappe.db.get_value("POS Profile", doc.pos_profile, "restaurant_prefix") == 1:
        restaurant = frappe.db.get_value("POS Profile", doc.pos_profile, "restaurant")
        doc.naming_series = "SINV-" + frappe.db.get_value(
            "URY Restaurant", restaurant, "invoice_series_prefix"
        )
