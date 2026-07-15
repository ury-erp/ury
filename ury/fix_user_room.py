import frappe

def fix_user():
    user = "Administrator"
    branches = frappe.get_all("Branch")
    if not branches:
        print("No branches found.")
        return
    branch_name = branches[0].name
    
    # get rooms in the branch
    meta = frappe.get_meta("Branch")
    
    rooms = frappe.db.sql("select name from `tabURY Room` limit 1")
    if not rooms:
        print("No rooms found, creating one...")
        room_doc = frappe.get_doc({
            "doctype": "URY Room",
            "room_name": "Main Room",
            "branch": branch_name
        })
        room_doc.insert(ignore_permissions=True)
        frappe.db.commit()
        room_name = room_doc.name
    else:
        room_name = rooms[0][0]
        
    print("Assigning room:", room_name, "to user", user, "in branch", branch_name)
    
    doc = frappe.get_doc("Branch", branch_name)
    
    ury_user_fieldname = None
    for d in meta.get_table_fields():
        if d.options == "URY User":
            ury_user_fieldname = d.fieldname
            
    if not ury_user_fieldname:
        print("No URY User child table found.")
        return
        
    exists = False
    for row in doc.get(ury_user_fieldname, []):
        if row.user == user:
            row.room = room_name
            exists = True
            break
            
    if not exists:
        doc.append(ury_user_fieldname, {
            "user": user,
            "room": room_name
        })
        
    doc.save(ignore_permissions=True)
    frappe.db.commit()
    print("Successfully assigned user room!")
