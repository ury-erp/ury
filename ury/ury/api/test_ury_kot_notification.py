# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and Contributors
# See license.txt

from unittest import mock

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api import ury_kot_notification


def make_kot(**kwargs):
    kot = frappe.get_doc(
        {
            "doctype": "URY KOT",
            "naming_series": "KOT-TEST-.####",
            "date": frappe.utils.today(),
            "invoice": "TEST-INV-00042",
            **kwargs,
        }
    )
    kot.insert(ignore_permissions=True, ignore_links=True)
    return kot


def make_user(email, roles=None):
    if frappe.db.exists("User", email):
        return frappe.get_doc("User", email)
    user = frappe.get_doc(
        {
            "doctype": "User",
            "email": email,
            "first_name": "KOT Notification Test",
            "send_welcome_email": 0,
            "roles": [{"role": role} for role in (roles or [])],
        }
    )
    user.insert(ignore_permissions=True, ignore_links=True)
    return user


class TestOrderDelayNotification(FrappeTestCase):
    def tearDown(self):
        frappe.set_user("Administrator")

    def test_nonexistent_kot_is_rejected(self):
        self.assertRaises(
            frappe.ValidationError,
            ury_kot_notification.order_delay_notification,
            "KOT-DOES-NOT-EXIST",
        )

    def test_unauthorized_user_cannot_trigger_notification(self):
        kot = make_kot(order_status="Ready For Prepare")
        make_user("kot-notify-outsider@example.com", roles=[])

        frappe.set_user("kot-notify-outsider@example.com")
        with mock.patch.object(
            ury_kot_notification, "create_system_notification"
        ) as create_notification:
            self.assertRaises(
                frappe.PermissionError,
                ury_kot_notification.order_delay_notification,
                kot.name,
            )
        create_notification.assert_not_called()

        self.assertFalse(
            frappe.db.exists(
                "Notification Log",
                {"subject": f"Order # {kot.invoice[-5:]} Delayed"},
            )
        )

    def test_authorized_user_can_trigger_notification(self):
        kot = make_kot(order_status="Ready For Prepare")
        make_user("kot-notify-manager@example.com", roles=["URY Manager"])

        def fake_get_all(doctype, **kwargs):
            if doctype == "URY Notification Recipient":
                return [frappe._dict(receiver_by_role="URY Manager")]
            return []

        frappe.set_user("kot-notify-manager@example.com")
        with (
            mock.patch.object(
                ury_kot_notification.frappe, "get_all", side_effect=fake_get_all
            ),
            mock.patch.object(
                ury_kot_notification,
                "get_users_with_role",
                return_value=[frappe._dict(name="Administrator")],
            ),
            mock.patch.object(
                ury_kot_notification, "create_system_notification"
            ) as create_notification,
        ):
            ury_kot_notification.order_delay_notification(kot.name)

        create_notification.assert_called_once_with(
            mock.ANY, "Administrator", f"Order # {kot.invoice[-5:]} Delayed"
        )

    def test_no_notification_when_kot_not_ready_for_prepare(self):
        kot = make_kot(order_status="Served")

        with mock.patch.object(
            ury_kot_notification, "create_system_notification"
        ) as create_notification:
            ury_kot_notification.order_delay_notification(kot.name)

        create_notification.assert_not_called()
