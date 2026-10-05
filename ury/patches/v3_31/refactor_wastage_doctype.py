import frappe

def execute():
    if frappe.db.exists("DocType", "URY Issue Wastage"):
        print("Renaming URY Issue Wastage -> URY Wastage...")
        frappe.rename_doc("DocType", "URY Issue Wastage", "URY Wastage", force=True)
        frappe.db.commit()

    if not frappe.db.exists("DocType", "Wastage Item"):
        print("Creating Wastage Item child table...")
        doc = frappe.new_doc("DocType")
        doc.name = "Wastage Item"
        doc.module = "URY"
        doc.custom = 0
        doc.istable = 1
        doc.editable_grid = 1
        
        fields = [
            {"fieldname": "item_code", "fieldtype": "Link", "options": "Item", "reqd": 1, "label": "Item Code", "in_list_view": 1},
            {"fieldname": "item_name", "fieldtype": "Data", "read_only": 1, "fetch_from": "item_code.item_name", "label": "Item Name", "in_list_view": 1},
            {"fieldname": "qty", "fieldtype": "Float", "reqd": 1, "label": "Quantity", "in_list_view": 1},
            {"fieldname": "uom", "fieldtype": "Link", "options": "UOM", "read_only": 1, "fetch_from": "item_code.stock_uom", "label": "UOM"},
            {"fieldname": "rate", "fieldtype": "Currency", "label": "Rate", "in_list_view": 1},
            {"fieldname": "amount", "fieldtype": "Currency", "label": "Amount", "read_only": 1, "in_list_view": 1}
        ]
        
        for f in fields:
            doc.append("fields", f)
            
        doc.insert(ignore_permissions=True)
        frappe.db.commit()

    print("Updating URY Wastage schema...")
    doc = frappe.get_doc("DocType", "URY Wastage")
    
    for df in doc.fields:
        if df.fieldname == "issue_authorization":
            df.hidden = 1
            df.reqd = 0
            df.read_only = 0
        elif df.fieldname == "plan":
            df.reqd = 0
            df.read_only = 0
        elif df.fieldname == "department":
            df.reqd = 0
            df.read_only = 0
        elif df.fieldname in ["branch", "company", "production_unit", "status", "reason_category", "reason_notes"]:
            df.read_only = 0

    fields_to_remove = [
        "component_item", "stock_uom", "wasted_qty", "valuation_rate", 
        "valuation_amount", "held_qty_before", "valuation_is_estimated", 
        "section_break_valuation", "section_break_qty", "column_break_qty"
    ]
    doc.fields = [df for df in doc.fields if df.fieldname not in fields_to_remove]
    
    if not any(df.fieldname == "warehouse" for df in doc.fields):
        doc.append("fields", {
            "fieldname": "warehouse",
            "fieldtype": "Link",
            "options": "Warehouse",
            "label": "Warehouse",
            "insert_after": "department"
        })
    
    if not any(df.fieldname == "items" for df in doc.fields):
        doc.append("fields", {
            "fieldname": "items",
            "fieldtype": "Table",
            "options": "Wastage Item",
            "label": "Items",
            "reqd": 1,
            "insert_after": "status"
        })
        
    if not any(df.fieldname == "stock_entry" for df in doc.fields):
        doc.append("fields", {
            "fieldname": "stock_entry",
            "fieldtype": "Link",
            "options": "Stock Entry",
            "label": "Stock Entry",
            "read_only": 1,
            "insert_after": "items"
        })
    
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    print("Done applying schema changes.")
