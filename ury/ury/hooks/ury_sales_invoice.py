import frappe
from frappe import _


def before_insert(doc, method):
    sales_invoice_naming(doc, method)

def on_update(doc, method):
    aggregator_unpaid(doc, method)
    
def sales_invoice_naming(doc, method):
    if not doc.is_pos:
        return
    
    if not doc.pos_profile:
        return
    
    pos_profile = frappe.db.get_value(
        "POS Profile", 
        doc.pos_profile, 
        ["restaurant_prefix", "restaurant"], 
        as_dict=True
    )

    if not pos_profile:
        frappe.throw(_("POS Profile '{0}' does not exist. Please select a valid POS Profile.").format(doc.pos_profile))
    
    restaurant = pos_profile.get("restaurant")

    if pos_profile.get("restaurant_prefix") == 1 and restaurant:
        if doc.order_type == "Aggregators":
            
            # Get the aggregator series prefix
            aggregator_series_prefix = frappe.db.get_value(
                "URY Restaurant", 
                restaurant, 
                "aggregator_series_prefix"
            )
            
            if aggregator_series_prefix: 
                doc.naming_series = "SINV-" + aggregator_series_prefix
                
            else: 
                # Fallback to invoice_series_prefix if aggregator_series_prefix is not available            
                doc.naming_series = "SINV-" + frappe.db.get_value("URY Restaurant", restaurant, "invoice_series_prefix")
                      
        else:
            # Use invoice_series_prefix for non-aggregator orders
            doc.naming_series = "SINV-" + frappe.db.get_value(
                "URY Restaurant", restaurant, "invoice_series_prefix"
            )
            
            
def aggregator_unpaid(doc, method):
    if doc.order_type == "Aggregators" and frappe.db.get_value("Branch", doc.branch, "custom_make_unpaid") == 1:
        doc.is_pos = 0

        

