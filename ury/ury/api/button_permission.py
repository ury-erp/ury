import frappe


@frappe.whitelist()
def cancel_check():
    if frappe.permissions.has_permission(
        "POS Invoice", "cancel", raise_exception=False
    ):
        permission = True
    else:
        permission = False
    return permission


# # custom_autocomplete.py
# import frappe


@frappe.whitelist()
def get_filtered_users(doctype, txt, searchfield, start, page_len, filters):
    role = filters.get("role")
    result = frappe.get_all("Has Role", filters={"role": role}, fields=["parent"])
    users_with_role = [record.parent for record in result]

    # Explicitly specify the table alias for the 'name' column
    users = frappe.get_all(
        "User",
        filters={"name": ("in", users_with_role)},
        fields=["name"],
        limit_page_length=page_len,
    )
    return [user["name"] for user in users]
