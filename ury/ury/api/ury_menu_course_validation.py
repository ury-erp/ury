import frappe

def validate_priority(doc,event):
    # Check if the selected priority is already used by another course
    existing_course = frappe.db.exists(
        'URY Menu Course', 
        {
            'custom_serving_priority': doc.custom_serving_priority,
            'name': ['!=', doc.name]  # Exclude the current record
        }
    )

    if existing_course:
        frappe.throw(f"Priority {doc.custom_serving_priority} is already assigned to another course. Please choose a different priority.")
