import frappe

def before_uninstall():
    try:
        # 1. Custom fields removal
        print("Deleting Custom Fields...")
        frappe.db.delete("Custom Field", {
            "dt": ("like", "%URY%"),
        })
        frappe.db.commit()


        # 2. DELETE Report definitions
        print("Deleting URY Reports...")
        frappe.db.delete("Report", {
            "module": ("like", "URY%"),
        })
        frappe.db.commit()

        # 3. DELETE URY DocTypes
        print("Deleting URY DocTypes...")
        doctypes = frappe.get_all("DocType", filters={"module": ("like", "URY%")})
        for d in doctypes:
            print(f"Deleting DocType: {d.name}")
            frappe.delete_doc("DocType", d.name, force=1, ignore_permissions=True)
        frappe.db.commit()

        print(" ---- CLEANUP COMPLETE ----")

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "URY uninstall failed")
        print("Uninstall failed:", e)


def after_uninstall():
    print("URY uninstall done.")
