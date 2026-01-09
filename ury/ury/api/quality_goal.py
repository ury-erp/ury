import frappe

@frappe.whitelist()
def quality_goal_for_current_user(
    doctype, txt, searchfield, start, page_len, filters
):
    user = frappe.session.user

    if user == "Administrator":
        return frappe.db.sql("""
            SELECT name
            FROM `tabQuality Goal`
            WHERE name LIKE %s
            ORDER BY modified DESC
            LIMIT %s, %s
        """, (f"%{txt}%", start, page_len))

    roles = frappe.get_roles(user)
    if not roles:
        return []

