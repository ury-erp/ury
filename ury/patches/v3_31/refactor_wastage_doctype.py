import frappe
from frappe.utils import flt


def execute():
    # Migrate() syncs doctypes from app code BEFORE running patches, so on
    # any site that already had "URY Issue Wastage", the sync step has
    # already created the new "URY Wastage" doctype (and its empty table)
    # by the time this patch runs -- a plain rename_doc then dies with
    # "Another DocType with name URY Wastage exists". Handle both shapes:
    # rename when only the old doctype exists, copy-and-drop when both do.
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

    old_exists = frappe.db.exists("DocType", "URY Issue Wastage")
    new_exists = frappe.db.exists("DocType", "URY Wastage")

    if old_exists and not new_exists:
        print("Renaming URY Issue Wastage -> URY Wastage...")
        frappe.rename_doc("DocType", "URY Issue Wastage", "URY Wastage", force=True)
        frappe.db.commit()
    elif old_exists and new_exists:
        print("URY Wastage already exists (sync ran before patches); migrating data...")
        _migrate_rows()
        frappe.delete_doc("DocType", "URY Issue Wastage", force=True)
        frappe.db.commit()
        if frappe.db.sql("SHOW TABLES LIKE 'tabURY Issue Wastage'"):
            frappe.db.sql("DROP TABLE `tabURY Issue Wastage`")
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


def _migrate_rows():
    """Copy rows from the old table into the sync-created new one.

    Columns that survived the restructure move as-is; the removed
    `wasted_qty`/`component_item` fields are carried over as one `items`
    (Wastage Item) child row per parent so the quantities are not lost.
    """
    old_cols = frappe.db.get_table_columns("URY Issue Wastage")
    new_cols = set(frappe.db.get_table_columns("URY Wastage"))
    common = [c for c in old_cols if c in new_cols]
    if common:
        col_list = ", ".join(f"`{c}`" for c in common)
        frappe.db.sql(
            f"INSERT INTO `tabURY Wastage` ({col_list}) "
            f"SELECT {col_list} FROM `tabURY Issue Wastage`"
        )

    if "wasted_qty" not in old_cols:
        return
    rows = frappe.db.sql(
        """SELECT name, component_item, stock_uom, wasted_qty
        FROM `tabURY Issue Wastage`""",
        as_dict=True,
    )
    for idx, row in enumerate(rows, start=1):
        qty = flt(row.wasted_qty)
        if not qty:
            continue
        uom = row.stock_uom or frappe.db.get_value("Item", row.component_item, "stock_uom")
        child = frappe.new_doc("Wastage Item")
        child.update({
            "parent": row.name,
            "parenttype": "URY Wastage",
            "parentfield": "items",
            "idx": idx,
            "item_code": row.component_item,
            "qty": qty,
            "uom": uom,
        })
        child.db_insert()
    if rows:
        frappe.db.commit()
