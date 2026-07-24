import frappe
from frappe.utils import today

def execute():
    print("Running database restructure patch...")
    current_date = today()
    
    # 1. Order Counter Initialization & Branch Settings Fields
    from frappe.custom.doctype.custom_field.custom_field import create_custom_fields
    create_custom_fields({
        "Branch": [
            {"fieldname": "custom_branch_settings_section", "label": "POS Settings", "fieldtype": "Section Break", "insert_after": "custom_no_taxes"},
            {"fieldname": "custom_reset_order_number_daily", "label": "Reset Order Number Daily", "fieldtype": "Check", "default": "1", "insert_after": "custom_branch_settings_section"},
            {"fieldname": "custom_order_counter", "label": "Order Counter", "fieldtype": "Int", "default": "0", "hidden": 1, "insert_after": "custom_reset_order_number_daily"},
            {"fieldname": "custom_aggregator_order_counter", "label": "Aggregator Order Counter", "fieldtype": "Int", "default": "0", "hidden": 1, "insert_after": "custom_order_counter"},
            {"fieldname": "custom_last_reset_date", "label": "Last Reset Date", "fieldtype": "Date", "hidden": 1, "insert_after": "custom_aggregator_order_counter"}
        ],
        "POS Profile": [
            {"fieldname": "custom_captains", "label": "Captains", "fieldtype": "Table", "options": "POS Profile Captain", "insert_after": "applicable_for_users"},
            {"fieldname": "custom_rooms", "label": "Rooms", "fieldtype": "Table MultiSelect", "options": "Multiple Rooms", "insert_after": "role_restricted_for_table_order", "description": "URY Rooms the POS Profile can access"},
            {"fieldname": "custom_captain_access_to_other_profiles", "label": "Captain Access to Other Profiles", "fieldtype": "Check", "default": "0", "insert_after": "custom_cashier_accessible_profiles", "description": "Captains of the POS Profile can access the listed POS Profiles"},
            {"fieldname": "custom_captain_accessible_profiles", "label": "Captain Accessible Profiles", "fieldtype": "Table MultiSelect", "options": "POS Profile Link", "depends_on": "eval:doc.custom_captain_access_to_other_profiles", "insert_after": "custom_captain_access_to_other_profiles"},
            {"fieldname": "custom_cashier_access_to_other_profiles", "label": "Cashier Access to Other Profiles", "fieldtype": "Check", "default": "0", "insert_after": "paid_limit", "description": "Cashiers of the POS Profile can access the listed POS Profiles"},
            {"fieldname": "custom_cashier_accessible_profiles", "label": "Cashier Accessible Profiles", "fieldtype": "Table MultiSelect", "options": "POS Profile Link", "depends_on": "eval:doc.custom_cashier_access_to_other_profiles", "insert_after": "custom_cashier_access_to_other_profiles"}
        ]
    }, ignore_validate=True)

    branches = frappe.get_all("Branch", fields=["name"])
    for branch in branches:
        # Migrate reset_order_number_daily setting from POS Profile to Branch if present
        pos_profile = frappe.db.get_value("POS Profile", {"branch": branch.name}, ["custom_reset_order_number_daily"], as_dict=True)
        reset_val = pos_profile.custom_reset_order_number_daily if pos_profile and pos_profile.get("custom_reset_order_number_daily") is not None else 1

        invoices = frappe.db.sql("""
            SELECT custom_ury_order_number, order_type 
            FROM `tabPOS Invoice`
            WHERE branch = %s AND posting_date = %s
        """, (branch.name, current_date), as_dict=True)
        
        max_order = 0
        max_agr_order = 0
        
        for inv in invoices:
            num_str = inv.get("custom_ury_order_number")
            if not num_str:
                continue
            try:
                if "AGR - " in num_str:
                    val = int(num_str.replace("AGR - ", "").strip())
                    if val > max_agr_order:
                        max_agr_order = val
                else:
                    val = int(num_str.strip())
                    if val > max_order:
                        max_order = val
            except Exception:
                pass
                
        frappe.db.set_value(
            "Branch",
            branch.name,
            {
                "custom_reset_order_number_daily": reset_val,
                "custom_order_counter": max_order,
                "custom_aggregator_order_counter": max_agr_order,
                "custom_last_reset_date": current_date
            },
            update_modified=False
        )
        print(f"Initialized branch {branch.name}: reset_daily={reset_val}, order_counter={max_order}, aggregator_order_counter={max_agr_order}")

    # 2. POS Profile Data Migration
    profiles = frappe.get_all("POS Profile", filters={"custom_enable_multiple_cashier": 1}, fields=["name", "branch"])
    for profile in profiles:
        branch_users = frappe.get_all("URY User", filters={"parent": profile.branch}, fields=["user"])
        profile_doc = frappe.get_doc("POS Profile", profile.name)
        existing_users = {u.user for u in profile_doc.custom_captains}
        
        for bu in branch_users:
            if bu.user and bu.user not in existing_users:
                profile_doc.append("custom_captains", {
                    "user": bu.user,
                    "default": 0
                })
        profile_doc.save(ignore_permissions=True)
        print(f"Migrated branch users to custom_captains in POS Profile {profile.name}")

    # 3. Room Mapping Migration
    branch_rooms = {}
    users_with_rooms = frappe.get_all("URY User", fields=["parent", "room"])
    for u in users_with_rooms:
        if u.parent and u.room:
            if u.parent not in branch_rooms:
                branch_rooms[u.parent] = set()
            branch_rooms[u.parent].add(u.room)
            
    for branch_name, rooms in branch_rooms.items():
        profile_name = frappe.db.get_value("POS Profile", {"branch": branch_name}, "name")
        if profile_name:
            profile_doc = frappe.get_doc("POS Profile", profile_name)
            existing_rooms = {r.room for r in profile_doc.get("custom_rooms", [])}
            for room in rooms:
                if room not in existing_rooms:
                    profile_doc.append("custom_rooms", {
                        "room": room
                    })
            profile_doc.save(ignore_permissions=True)
            print(f"Migrated rooms {list(rooms)} to POS Profile {profile_name}")

    # 4. Production Unit Adjustment
    try:
        units = frappe.db.sql("SELECT name, pos_profile, branch, warehouse FROM `tabURY Production Unit`", as_dict=True)
        for unit in units:
            if unit.get("pos_profile") and not unit.get("branch"):
                profile_info = frappe.db.get_value("POS Profile", unit.pos_profile, ["branch", "warehouse"], as_dict=True)
                if profile_info and profile_info.get("branch"):
                    frappe.db.set_value(
                        "URY Production Unit",
                        unit.name,
                        {
                            "branch": profile_info.branch,
                            "warehouse": profile_info.warehouse or unit.warehouse
                        },
                        update_modified=False
                    )
                    print(f"Updated production unit {unit.name} with branch {profile_info.branch} and warehouse {profile_info.warehouse}")
    except Exception as e:
        print(f"Failed to migrate production units: {e}")
