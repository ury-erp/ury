import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

def execute():
    # 1. Create Child DocType 'URY Merged POS Invoice Item'
    if not frappe.db.exists("DocType", "URY Merged POS Invoice Item"):
        doc = frappe.get_doc({
            "doctype": "DocType",
            "name": "URY Merged POS Invoice Item",
            "module": "URY",
            "custom": 1,
            "istable": 1,
            "fields": [
                {"fieldname": "item_code", "fieldtype": "Link", "options": "Item", "label": "Item Code", "in_list_view": 1},
                {"fieldname": "item_name", "fieldtype": "Data", "label": "Item Name", "in_list_view": 1},
                {"fieldname": "qty", "fieldtype": "Float", "label": "Quantity", "in_list_view": 1},
                {"fieldname": "rate", "fieldtype": "Currency", "label": "Rate", "in_list_view": 1},
                {"fieldname": "amount", "fieldtype": "Currency", "label": "Amount", "in_list_view": 1}
            ]
        })
        doc.insert()
        print("Created DocType: URY Merged POS Invoice Item")

    # 2. Add custom fields to POS Invoice
    custom_fields = {
        "POS Invoice": [
            {
                "fieldname": "custom_bill_merge_details",
                "fieldtype": "Section Break",
                "label": "Bill Merge Details",
                "insert_after": "total_spend_time" # We will just put it at the end or somewhere
            },
            {
                "fieldname": "custom_merged_pos_invoice",
                "fieldtype": "Link",
                "options": "POS Invoice",
                "label": "Merged POS Invoice",
                "insert_after": "custom_bill_merge_details"
            },
            {
                "fieldname": "custom_merged_items",
                "fieldtype": "Table",
                "options": "URY Merged POS Invoice Item",
                "label": "Merged Items",
                "insert_after": "custom_merged_pos_invoice"
            },
            {
                "fieldname": "custom_merged_total",
                "fieldtype": "Currency",
                "label": "Merged Total",
                "insert_after": "custom_merged_items"
            }
        ]
    }
    create_custom_fields(custom_fields)
    print("Created custom fields for POS Invoice")

    # update hooks.py to include these new fields
    # wait, instead of manually updating hooks.py, the user might just want the fields created.
    # we can append them to hooks.py custom_field list or the script can do it.

