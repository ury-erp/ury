import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_kot_notification import create_system_notification

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
