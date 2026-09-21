# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt

"""Tests for ury_server_time.get_server_time().

Phase 4 (sa-comprehensive-test-strategy) round-3 flagged this module as
having no test file and no permission logic in source, and asked for a
follow-up look at whether that's a real gap or intentionally public. Verified
empirically here, not just by reading the source: the function has no
@frappe.whitelist(allow_guest=True), so it still requires a logged-in
session (any authenticated user -- confirmed by calling it as a real
roleless user, not System Manager/Administrator), but it has no doctype- or
role-based permission gate beyond that, and per its own docstring it returns
only the server's current wall-clock time for client clock-integrity checks
-- no tenant/branch-scoped or otherwise sensitive data. That is a real,
intentional design (any authenticated staff member's POS session needs this
for the closing-entry clock check), not an unwired guard -- no PermissionError
guard is added here to match a pattern that doesn't fit this endpoint.
"""

from datetime import datetime

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_server_time import get_server_time


class TestGetServerTime(FrappeTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        email = "p4r4-roleless-servertime@ury.test"
        if frappe.db.exists("User", email):
            frappe.delete_doc("User", email, force=True, ignore_permissions=True)
        cls.roleless_user = frappe.get_doc({
            "doctype": "User",
            "email": email,
            "first_name": "P4R4RolelessServerTime",
            "send_welcome_email": 0,
            "enabled": 1,
        }).insert(ignore_permissions=True)

    def tearDown(self):
        frappe.set_user("Administrator")

    def test_returns_iso_8601_string_for_administrator(self):
        frappe.set_user("Administrator")
        result = get_server_time()
        self.assertIsInstance(result, str)
        # Must round-trip through fromisoformat without raising.
        datetime.fromisoformat(result)

    def test_any_authenticated_roleless_user_can_call_it(self):
        # Confirms this endpoint is intentionally accessible to ANY logged-in
        # user, not gated by role -- documented finding, not an oversight.
        frappe.set_user(self.roleless_user.name)
        result = get_server_time()
        self.assertIsInstance(result, str)
        datetime.fromisoformat(result)

    def test_reflects_real_server_clock_not_a_stub(self):
        # now_datetime() returns Frappe's *System Time Zone*-localized clock,
        # which can differ from this test process's own local/UTC clock by a
        # fixed zone offset (confirmed on this bench: exactly 4h, not a
        # random skew) -- so this asserts against frappe.utils.now_datetime()
        # directly (the same source of truth get_server_time() wraps), not
        # against Python's bare datetime.now()/utcnow(), which would give a
        # false failure purely from timezone-offset arithmetic, not from the
        # function under test actually being stale/stubbed.
        from frappe.utils import now_datetime

        frappe.set_user("Administrator")
        before = now_datetime()
        result = datetime.fromisoformat(get_server_time())
        after = now_datetime()
        self.assertLessEqual(abs((result - before.replace(tzinfo=result.tzinfo)).total_seconds()), 5)
        self.assertLessEqual(abs((after.replace(tzinfo=result.tzinfo) - result).total_seconds()), 5)
