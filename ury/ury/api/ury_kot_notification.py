import frappe
from frappe import _


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


def _get_authorized_kot(kot_id):
    """Load the URY KOT and verify the caller may access it.

    Only users whose roles grant read access to the specific KOT
    (e.g. System Manager, URY Manager, URY Captain, URY Cashier) may
    trigger delay notifications for it. This prevents arbitrary
    authenticated users from spamming manager Notification Logs for
    any KOT.
    """
    if not kot_id or not frappe.db.exists("URY KOT", kot_id):
        frappe.throw(_("URY KOT {0} does not exist").format(kot_id))

    kot = frappe.get_doc("URY KOT", kot_id)
    if not kot.has_permission("read"):
        frappe.throw(
            _("Not permitted to send delay notification for URY KOT {0}").format(
                kot_id
            ),
            frappe.PermissionError,
        )
    return kot


@frappe.whitelist()
def order_delay_notification(id):
    kot = _get_authorized_kot(id)

    tableOrTakeaway = kot.restaurant_table or "Take Away"
    order_status = kot.order_status
    order_id = (kot.invoice or "")[-5:] or kot.name
    kot_type = kot.type
    pos_profile = kot.pos_profile
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
