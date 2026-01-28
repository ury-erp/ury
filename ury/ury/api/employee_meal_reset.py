import frappe


def reset_employee_meal_taken():
    """Reset all meal_taken flags in Employee Meal Eligibility at the start of each day."""
    frappe.db.sql("""
        UPDATE `tabEmployee Meal Eligibility`
        SET meal_taken = 0
        WHERE IFNULL(meal_taken, 0) = 1
    """)
    frappe.db.commit()
