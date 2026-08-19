# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase

TEST_NON_MANAGER = "_test_ury_insight_non_manager@example.com"
TEST_MANAGER = "_test_ury_insight_manager@example.com"


class TestURYInsight(FrappeTestCase):
    pass


class TestURYInsightPermissions(FrappeTestCase):
    """`URY Insight` grants read/write only to System Manager / URY Manager /
    Administrator (see ury_insight.json permissions) — no public/guest read.
    These tests exercise that under real user sessions, not mocked roles.
    """

    def setUp(self):
        frappe.set_user("Administrator")
        self._create_user(TEST_NON_MANAGER, roles=[])
        self._create_user(TEST_MANAGER, roles=["URY Manager"])
        self.insight = frappe.get_doc(
            {
                "doctype": "URY Insight",
                "title": "_Test Insight",
                "severity": "Info",
                "rule_key": "_test_rule",
            }
        ).insert(ignore_permissions=True)

    def tearDown(self):
        frappe.set_user("Administrator")
        for name in frappe.get_all(
            "URY Insight", filters={"rule_key": "_test_rule"}, pluck="name"
        ):
            frappe.delete_doc("URY Insight", name, force=True, ignore_permissions=True)
        for user in (TEST_NON_MANAGER, TEST_MANAGER):
            if frappe.db.exists("User", user):
                frappe.delete_doc("User", user, force=True, ignore_permissions=True)

    def _create_user(self, email, roles):
        if frappe.db.exists("User", email):
            frappe.delete_doc("User", email, force=True, ignore_permissions=True)
        user = frappe.get_doc(
            {
                "doctype": "User",
                "email": email,
                "first_name": email.split("@")[0],
                "send_welcome_email": 0,
                "enabled": 1,
            }
        ).insert(ignore_permissions=True)
        for role in roles:
            user.add_roles(role)
        return user

    # ------------------------------------------------------------ non-manager

    def test_non_manager_cannot_read(self):
        frappe.set_user(TEST_NON_MANAGER)
        try:
            self.assertFalse(frappe.has_permission("URY Insight", "read", doc=self.insight))
            self.assertEqual(
                frappe.get_all("URY Insight", filters={"name": self.insight.name}),
                [],
            )
        finally:
            frappe.set_user("Administrator")

    def test_non_manager_cannot_write(self):
        frappe.set_user(TEST_NON_MANAGER)
        try:
            self.assertFalse(frappe.has_permission("URY Insight", "write", doc=self.insight))
            with self.assertRaises(frappe.PermissionError):
                frappe.get_doc("URY Insight", self.insight.name).save()
        finally:
            frappe.set_user("Administrator")

    def test_non_manager_cannot_create(self):
        frappe.set_user(TEST_NON_MANAGER)
        try:
            with self.assertRaises(frappe.PermissionError):
                frappe.get_doc(
                    {
                        "doctype": "URY Insight",
                        "title": "_Test Insight Unauthorized",
                        "severity": "Info",
                        "rule_key": "_test_rule",
                    }
                ).insert()
        finally:
            frappe.set_user("Administrator")

    # ---------------------------------------------------------------- manager

    def test_manager_can_read(self):
        frappe.set_user(TEST_MANAGER)
        try:
            self.assertTrue(frappe.has_permission("URY Insight", "read", doc=self.insight))
            self.assertEqual(
                {row.name for row in frappe.get_all("URY Insight", filters={"name": self.insight.name})},
                {self.insight.name},
            )
        finally:
            frappe.set_user("Administrator")

    def test_manager_can_write(self):
        frappe.set_user(TEST_MANAGER)
        try:
            self.assertTrue(frappe.has_permission("URY Insight", "write", doc=self.insight))
            doc = frappe.get_doc("URY Insight", self.insight.name)
            doc.severity = "Warning"
            doc.save()
        finally:
            frappe.set_user("Administrator")

        self.assertEqual(
            frappe.db.get_value("URY Insight", self.insight.name, "severity"), "Warning"
        )

    def test_administrator_can_read_and_write(self):
        # setUp/tearDown already run as Administrator; this asserts it
        # explicitly rather than relying on that as an implicit side effect.
        self.assertTrue(frappe.has_permission("URY Insight", "read", doc=self.insight))
        self.assertTrue(frappe.has_permission("URY Insight", "write", doc=self.insight))
