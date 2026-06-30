import frappe


def get_users_with_role(role_name):
    users_with_role = frappe.get_all(
        "Has Role", filters={"role": role_name}, fields=["parent as user"]
    )

    user_ids = [user["user"] for user in users_with_role]
    user_details = frappe.get_all(
        "User",
        filters={"name": ("in", user_ids)},
        fields=["name", "full_name", "email"],
    )

    return user_details


@frappe.whitelist()
def order_delay_notification(id):
    table = frappe.db.get_value("URY KOT", id, "restaurant_table")
    tableOrTakeaway = "Take Away"
    if table:
        tableOrTakeaway = table
    order_status = frappe.db.get_value("URY KOT", id, "order_status")
    invoice_id = frappe.db.get_value("URY KOT", id, "invoice")
    order_id = invoice_id[-5:]
    kot_type = frappe.db.get_value("URY KOT", id, "type")
    pos_profile = frappe.db.get_value("URY KOT", id, "pos_profile")
    items = frappe.get_all(
        "URY KOT Items",
        fields=["item_name", "quantity"],
        filters={"parent": id, "parenttype": "KOT"},
        order_by="idx",
    )

    subject = f"""Order # {order_id} Delayed"""

    message = f"""
            <ul>
                <li><b> Table : </b> {tableOrTakeaway}</li>
                <li><b> Order Type : </b> {kot_type}</li>
                
            
            <ul>
    """

    message += """
            </ul></li>
            </ul>
    """

    receipients = frappe.get_all(
        "URY Notification Recipient",
        fields=["receiver_by_role"],
        filters={"parent": pos_profile, "parenttype": "POS Profile"},
        order_by="idx",
    )
    if order_status == "Ready For Prepare":
        for receipient in receipients:
            users = get_users_with_role(receipient.receiver_by_role)
            for user in users:
                create_system_notification(message, user.name, subject)


def create_system_notification(message, user, subject):
    communication = frappe.get_doc(
        {
            "doctype": "Notification Log",
            "email_content": message,
            "for_user": user,
            "subject": subject,
            "type": "Alert",
        }
    )

    communication.insert(ignore_permissions=True)
