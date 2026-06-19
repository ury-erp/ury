import frappe


def before_insert(doc, method):
    sales_invoice_naming(doc, method)

def on_update(doc,method):
    aggregator_unpaid(doc,method)
    
def sales_invoice_naming(doc, method):
    if not doc.is_pos:
        return
    
    if not doc.pos_profile:
        return
    
    pos_profile = frappe.db.get_value(
        "POS Profile", 
        doc.pos_profile, 
        ["restaurant_prefix", "branch"], 
        as_dict=True
    )

    if not pos_profile:
        frappe.throw(f"POS Profile '{doc.pos_profile}' does not exist. Please select a valid POS Profile.")
    
    branch = pos_profile.get("branch")

    if pos_profile.get("restaurant_prefix") == 1 and branch:
        if doc.order_type == "Aggregators":
            
            # Get the aggregator series prefix
            aggregator_series_prefix = frappe.db.get_value(
                "Branch", 
                branch, 
                "aggregator_series_prefix"
            )
            
            if aggregator_series_prefix: 
                doc.naming_series = "SINV-" +  aggregator_series_prefix
                
            else: 
                # Fallback to invoice_series_prefix if aggregator_series_prefix is not available            
                doc.naming_series = "SINV-" + frappe.db.get_value("Branch", branch, "invoice_series_prefix")
                      
        else:
            # Use invoice_series_prefix for non-aggregator orders
            doc.naming_series = "SINV-" + frappe.db.get_value(
                "Branch", branch, "invoice_series_prefix"
            )
            
            
def aggregator_unpaid(doc,method):
    if doc.order_type == "Aggregators" and frappe.db.get_value("Branch", doc.branch , "custom_make_unpaid") == 1 :
        doc.is_pos = 0
        
        
def remove_tax(doc,method):
    
    if doc.order_type == "Aggregators" and frappe.db.get_value("Branch", doc.branch , "custom_no_taxes") == 1 :

        doc.taxes_and_charges = None
        
        doc.taxes.clear()
       # Manually adjust totals
        # doc.total_taxes_and_charges = 0
        # doc.grand_total = doc.base_grand_total = doc.net_total
        # doc.outstanding_amount = doc.grand_total - doc.paid_amount
        # doc.run_method("validate")

        

