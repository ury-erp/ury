import frappe
from frappe import _


def get_users_with_role(role_name):
    """Get user details for all users having a given role."""
    rows = frappe.db.sql(
        """SELECT u.name, u.full_name, u.email
           FROM `tabUser` u
           INNER JOIN `tabHas Role` hr ON hr.parent = u.name
           WHERE hr.role = %s""",
        role_name,
        as_dict=True,
    )
    return rows


@frappe.whitelist()
def order_delay_notification(id):
    # Single query to fetch all needed fields
    kot = frappe.db.get_value(
        "URY KOT", id,
        ["restaurant_table", "order_status", "invoice", "type", "pos_profile"],
        as_dict=True,
    )

    if not kot:
        frappe.throw(_("KOT {0} not found").format(id))

    table = kot.restaurant_table or "Take Away"
    order_id = kot.invoice[-5:] if kot.invoice else id
    items = frappe.get_all(
        "URY KOT Items",
        fields=["item_name", "quantity"],
        filters={"parent": id, "parenttype": "KOT"},
        order_by="idx",
    )

    subject = f"Order #{order_id} Delayed"

    item_lines = "\n".join(
        f"<li>{i.item_name} x {i.quantity}</li>" for i in items
    )

    message = f"""<ul>
    <li><b>Table:</b> {table}</li>
    <li><b>Type:</b> {kot.type}</li>
</ul>
<ul>
    {item_lines}
</ul>"""

    recipients = frappe.get_all(
        "URY Notification Recipient",
        fields=["receiver_by_role"],
        filters={"parent": kot.pos_profile, "parenttype": "POS Profile"},
        order_by="idx",
    )

    if kot.order_status == "Ready For Prepare":
        for recipient in recipients:
            users = get_users_with_role(recipient.receiver_by_role)
            for user in users:
                frappe.get_doc(
                    {
                        "doctype": "Notification Log",
                        "email_content": message,
                        "for_user": user.name,
                        "subject": subject,
                        "type": "Alert",
                    }
                ).insert(ignore_permissions=True)