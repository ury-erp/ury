import frappe

def on_update(doc, method=None):
    restaurant = frappe.db.exists("URY Restaurant", doc.name)
    
    if not restaurant:
        restaurant_doc = frappe.new_doc("URY Restaurant")
        restaurant_doc.name = doc.name
        restaurant_doc.branch = doc.name
    else:
        restaurant_doc = frappe.get_doc("URY Restaurant", doc.name)
        
    fields_to_sync = [
        "company", "invoice_series_prefix", "aggregator_series_prefix",
        "address", "default_tax_template", "active_menu", "room_wise_menu",
        "default_room", "order_type_wise_menu"
    ]
    
    for field in fields_to_sync:
        if hasattr(doc, field):
            restaurant_doc.set(field, doc.get(field))
            
    child_tables_to_sync = {
        "menu_for_room": "menu_for_room",
        "order_type_menu": "order_type_menu"
    }
    
    for source_field, target_field in child_tables_to_sync.items():
        if hasattr(doc, source_field):
            restaurant_doc.set(target_field, [])
            for row in doc.get(source_field):
                new_row = restaurant_doc.append(target_field, {})
                for k, v in row.as_dict().items():
                    if k not in ["name", "parent", "parentfield", "parenttype", "doctype", "creation", "modified", "modified_by", "owner", "idx"]:
                        new_row.set(k, v)

    frappe.flags.syncing_from_branch = True
    restaurant_doc.flags.ignore_permissions = True
    
    try:
        if not restaurant:
            restaurant_doc.insert()
        else:
            restaurant_doc.save()
    finally:
        frappe.flags.syncing_from_branch = False
