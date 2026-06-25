import frappe
def run():
    try:
        frappe.get_doc({"doctype": "Gender", "gender": "Male"}).insert(ignore_if_duplicate=True)
        print("Success inserting Gender")
    except Exception as e:
        print(f"Error inserting Gender: {e}")
