import frappe
from ury.setup import get_custom_fields
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

def execute():
    # 1. Create the new Custom Fields on Branch
    create_custom_fields(get_custom_fields())
    
    # 2. Reload the Branch doctype so that we can write to the new fields
    frappe.reload_doc("setup", "doctype", "branch")
    
    # 3. Migrate data
    restaurants = frappe.get_all("URY Restaurant", pluck="name")
    for name in restaurants:
        rest = frappe.get_doc("URY Restaurant", name)
        
        # If it doesn't have a branch or branch doesn't exist, skip
        if not rest.branch or not frappe.db.exists("Branch", rest.branch):
            continue
            
        branch_doc = frappe.get_doc("Branch", rest.branch)
        
        # Simple fields
        fields_to_map = [
            "company", "invoice_series_prefix", "aggregator_series_prefix", 
            "default_tax_template", "active_menu", 
            "room_wise_menu", "default_room", "order_type_wise_menu"
        ]
        
        for field in fields_to_map:
            if rest.get(field) is not None:
                branch_doc.set(field, rest.get(field))
            
        # Child tables
        branch_doc.set("menu_for_room", [])
        for row in rest.get("menu_for_room", []):
            branch_doc.append("menu_for_room", {
                "room": row.room,
                "menu": row.menu
            })
            
        branch_doc.set("order_type_menu", [])
        for row in rest.get("order_type_menu", []):
            branch_doc.append("order_type_menu", {
                "order_type": row.order_type,
                "menu": row.menu
            })
            
        branch_doc.flags.ignore_permissions = True
        branch_doc.flags.ignore_mandatory = True
        branch_doc.save()
