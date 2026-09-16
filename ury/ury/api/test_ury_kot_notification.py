import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_kot_notification import create_system_notification, order_delay_notification

TEST_USER = "Administrator"
TEST_SUBJECT = "_Test Order # 00001 Delayed"


class TestCreateSystemNotification(FrappeTestCase):
    """`create_system_notification` must dedupe on (for_user, subject) within
    a short recent window before inserting a new `Notification Log`, rather
    than blindly inserting on every call (the bug fixed in this PR)."""

    def setUp(self):
        frappe.db.delete("Notification Log", {"subject": TEST_SUBJECT})

    def tearDown(self):
        frappe.db.delete("Notification Log", {"subject": TEST_SUBJECT})

    def _count(self):
        return frappe.db.count(
            "Notification Log", {"for_user": TEST_USER, "subject": TEST_SUBJECT}
        )

    def test_duplicate_call_within_window_is_not_inserted_twice(self):
        create_system_notification("<p>first</p>", TEST_USER, TEST_SUBJECT)
        self.assertEqual(self._count(), 1)

        # Same (for_user, subject) called again immediately: must be a no-op,
        # not a second Notification Log row.
        create_system_notification("<p>second</p>", TEST_USER, TEST_SUBJECT)
        self.assertEqual(self._count(), 1)

    def test_different_subject_is_not_deduped(self):
        create_system_notification("<p>first</p>", TEST_USER, TEST_SUBJECT)
        other_subject = TEST_SUBJECT + " (other)"
        try:
            create_system_notification("<p>second</p>", TEST_USER, other_subject)
            self.assertEqual(self._count(), 1)
            self.assertEqual(
                frappe.db.count(
                    "Notification Log",
                    {"for_user": TEST_USER, "subject": other_subject},
                ),
                1,
            )
        finally:
            frappe.db.delete("Notification Log", {"subject": other_subject})


class TestOrderDelayNotificationPermissionBoundary(FrappeTestCase):
    """order_delay_notification gates on
    frappe.has_permission("URY KOT", "write", doc=kot_doc) and raises
    frappe.PermissionError (not a generic ValidationError) when the calling
    user lacks write access to the target KOT -- confirmed by reading the
    guard in ury_kot_notification.py directly before writing this test.

    Uses a real KOT fixture (no doctype-level mocking of frappe) and a real
    roleless user via frappe.set_user(), matching the round-3 pattern for
    this track (see EXECUTION_LOG.md Phase 4 round 3).
    """

    NEGATIVE_USER = "test_kot_notif_negative@example.com"

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        if not frappe.db.exists("User", cls.NEGATIVE_USER):
            frappe.get_doc(
                {
                    "doctype": "User",
                    "email": cls.NEGATIVE_USER,
                    "first_name": "Kot Notif Negative",
                    "send_welcome_email": 0,
                    "roles": [],
                }
            ).insert(ignore_permissions=True)

    def setUp(self):
        frappe.set_user("Administrator")
        self.kot_name = frappe.db.get_value("URY KOT", {}, "name")

    def tearDown(self):
        frappe.set_user("Administrator")

    def test_roleless_user_cannot_send_notification_for_kot_they_cannot_write(self):
        if not self.kot_name:
            self.skipTest("No URY KOT fixture available on this bench to test against")

        frappe.set_user(self.NEGATIVE_USER)
        with self.assertRaises(frappe.PermissionError):
            order_delay_notification(self.kot_name)
