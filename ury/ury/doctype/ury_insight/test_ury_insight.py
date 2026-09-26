# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_insight import get_active_insights
from ury.ury.tests.factories import make_branch, make_user

TEST_NON_MANAGER = "_test_ury_insight_non_manager@example.com"
TEST_MANAGER = "_test_ury_insight_manager@example.com"
TEST_STAFF = "_test_ury_insight_staff@example.com"


class TestURYInsight(FrappeTestCase):
    pass


class TestURYInsightPermissions(FrappeTestCase):
    """`URY Insight` grants read/write only to System Manager / URY Manager /
    Administrator (see ury_insight.json permissions) — no public/guest read.
    These tests exercise that under real user sessions, not mocked roles.
    """

    def setUp(self):
        frappe.set_user("Administrator")
        self.branch = make_branch(branch="_Test Insight Branch").name
        self.other_branch = make_branch(branch="_Test Insight Other Branch").name
        self._create_user(TEST_NON_MANAGER, roles=[])
        self._create_user(TEST_MANAGER, roles=["URY Manager"])
        self._create_user(TEST_STAFF, roles=["URY Cashier"])
        # Assign the staff user to self.branch via Branch's `user` child
        # table so ury.ury_pos.api.getBranch() (which require_branch_staff()
        # calls) resolves it.
        branch_doc = frappe.get_doc("Branch", self.branch)
        branch_doc.append("user", {"user": TEST_STAFF})
        branch_doc.save(ignore_permissions=True)
        self.insight = frappe.get_doc(
            {
                "doctype": "URY Insight",
                "title": "_Test Insight",
                "severity": "Info",
                "rule_key": "_test_rule",
                "branch": self.branch,
            }
        ).insert(ignore_permissions=True)

    def tearDown(self):
        frappe.set_user("Administrator")
        for name in frappe.get_all(
            "URY Insight", filters={"rule_key": "_test_rule"}, pluck="name"
        ):
            frappe.delete_doc("URY Insight", name, force=True, ignore_permissions=True)
        for user in (TEST_NON_MANAGER, TEST_MANAGER, TEST_STAFF):
            if frappe.db.exists("User", user):
                frappe.delete_doc("User", user, force=True, ignore_permissions=True)

    def _create_user(self, email, roles):
        return make_user(email=email, roles=roles, first_name=email.split("@")[0], enabled=1)

    # ------------------------------------------------------------ non-manager

    def test_non_manager_cannot_read(self):
        frappe.set_user(TEST_NON_MANAGER)
        try:
            self.assertFalse(frappe.has_permission("URY Insight", "read", doc=self.insight))
            # frappe.get_all() intentionally bypasses permission checks (by design in
            # Frappe) — use get_list(), which enforces them and raises PermissionError
            # outright for a doctype the user has no read role for, to test
            # doctype-level read permission. The real security boundary for this data
            # is ury.ury.api.ury_insight.get_active_insights()'s require_manager()
            # gate, which runs before any query and is exercised separately below.
            with self.assertRaises(frappe.PermissionError):
                frappe.get_list("URY Insight", filters={"name": self.insight.name})
        finally:
            frappe.set_user("Administrator")

    def test_non_manager_cannot_call_get_active_insights(self):
        """A user with no URY role at all gets PermissionError."""
        frappe.set_user(TEST_NON_MANAGER)
        try:
            with self.assertRaises(frappe.PermissionError):
                get_active_insights()
        finally:
            frappe.set_user("Administrator")

    def test_staff_requesting_another_branch_cannot_call_get_active_insights(self):
        """A staff (non-manager) user requesting a branch other than their own
        gets PermissionError -- see require_branch_staff()."""
        frappe.set_user(TEST_STAFF)
        try:
            with self.assertRaises(frappe.PermissionError):
                get_active_insights(branch=self.other_branch)
        finally:
            frappe.set_user("Administrator")

    def test_staff_requesting_own_branch_can_call_get_active_insights(self):
        """A staff user requesting their own branch is allowed."""
        frappe.set_user(TEST_STAFF)
        try:
            result = get_active_insights(branch=self.branch)
            self.assertIsInstance(result, list)
        finally:
            frappe.set_user("Administrator")

    def test_staff_with_no_branch_cannot_call_get_active_insights(self):
        """A staff user requesting no branch (i.e. "all branches") gets
        PermissionError -- only manager-tier roles get the all-branches view."""
        frappe.set_user(TEST_STAFF)
        try:
            with self.assertRaises(frappe.PermissionError):
                get_active_insights()
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

    def test_manager_can_call_get_active_insights_for_any_branch(self):
        """A manager may pass any branch, including none (all branches)."""
        frappe.set_user(TEST_MANAGER)
        try:
            result = get_active_insights()
            self.assertIsInstance(result, list)
            result = get_active_insights(branch=self.other_branch)
            self.assertIsInstance(result, list)
        finally:
            frappe.set_user("Administrator")

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
