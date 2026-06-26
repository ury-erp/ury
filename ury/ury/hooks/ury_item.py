import frappe


def validate(doc, method):
    update_menu_item(doc, method)
    update_variants_add_on(doc, method)
    
    
def update_menu_item(doc, event):
    menu_items = frappe.get_all('URY Menu Item', filters={'item': doc.item_code}, fields=['name'])
    if menu_items:
        # Batch update instead of N+1 individual set_value calls
        names = [m.name for m in menu_items]
        frappe.db.sql(
            "UPDATE `tabURY Menu Item` SET item_name = %s WHERE name IN %s",
            (doc.item_name, names)
        )

def update_variants_add_on(doc, event):
    if doc.custom_pos_add_on_items:
        for row in doc.custom_pos_add_on_items:
            if not frappe.db.exists("URY Menu Item", {"item": row.item}):
                frappe.throw(f"Item '{row.item}' in POS Add On Items is not in URY Menu")

    if doc.custom_pos_item_variants:
        for row in doc.custom_pos_item_variants:
            if not frappe.db.exists("URY Menu Item", {"item": row.item}):
                frappe.throw(f"Item '{row.item}' in POS Item Variants is not in URY Menu")
