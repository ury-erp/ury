# Copyright (c) 2026, Tridz Technologies Pvt. Ltd and Contributors
# See license.txt
"""End-to-end integration test for the P0/P1 flow verified live on 2026-08-19:

    opening checklist -> POS opening -> checklist resume/complete -> KOT error
    visibility -> multi-cashier closing data fetch.

This hits the real database (no mocks) via ``FrappeTestCase``, the same way
``ury/ury/doctype/sub_pos_closing/test_sub_pos_closing.py`` and the
``TestUryPosApi`` class in ``ury_pos/test_api.py`` do for their DB-backed
cases. All permission-scoped API calls are made as the real test cashier user
(``frappe.set_user``) so the branch-scoping logic in each function is
actually exercised, not bypassed via Administrator.
"""

import json
from datetime import date

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury_pos.api import (
    get_checklist,
    get_open_pos_opening_entries,
    submit_checklist,
)
from ury.ury.api.ury_kot_validation import get_kot_errors
from ury.ury.doctype.sub_pos_closing.sub_pos_closing import get_pos_invoices

TEST_COMPANY = "URY"
TEST_MODE_OF_PAYMENT = "Cash"
TEST_BRANCH = "_Test E2E P0P1 Branch"
TEST_ROOM = "_Test E2E P0P1 Room"
TEST_RESTAURANT = "_Test E2E P0P1 Restaurant"
TEST_POS_PROFILE = "_Test E2E P0P1 POS Profile"
TEST_USER_EMAIL = "e2e_p0_p1_cashier@example.com"
CHECKLIST_ITEM_LABEL = "Cash Drawer Verified"


class TestP0P1EndToEndFlow(FrappeTestCase):
    """Regression coverage for the opening checklist -> POS opening ->
    closing -> KOT visibility flow, run as a single continuous sequence
    against real inserted records (Branch, POS Profile, User, POS Opening
    Entry) rather than mocks.
    """

    def setUp(self):
        frappe.set_user("Administrator")
        self._cleanup()

        self.cashier = self._make_cashier_user()
        self.branch = self._make_branch()
        self.restaurant = self._make_restaurant()
        self.pos_profile = self._make_pos_profile()
        self.opening_entry = self._make_pos_opening_entry()

    def tearDown(self):
        frappe.set_user("Administrator")
        self._cleanup()

    # -- fixture setup -----------------------------------------------------

    def _make_cashier_user(self):
        if frappe.db.exists("User", TEST_USER_EMAIL):
            user = frappe.get_doc("User", TEST_USER_EMAIL)
        else:
            user = frappe.get_doc(
                {
                    "doctype": "User",
                    "email": TEST_USER_EMAIL,
                    "first_name": "E2E P0P1 Cashier",
                    "send_welcome_email": 0,
                    "enabled": 1,
                }
            )
            user.insert(ignore_permissions=True)

        # "URY Cashier" is the real cashier role (see
        # patches/v2_0/default_permissions.py) with read/create/submit on
        # POS Opening Entry, read/write on POS Invoice, and read/create on
        # URY POS Checklist Log / URY KOT Error Log. Deliberately NOT
        # System Manager / URY Manager, since those are the supervisor
        # roles the branch-scoping in each API function special-cases.
        if "URY Cashier" not in frappe.get_roles(user.name):
            user.add_roles("URY Cashier")

        return user

    def _make_branch(self):
        # Branch -> URY User is how getBranch() maps a session user to a
        # branch (see ury_pos/api.py:getBranch, SELECT ... FROM `tabURY
        # User` a INNER JOIN `tabBranch` b ON a.parent = b.name). The
        # "user" child table is mandatory on Branch, so it must be
        # populated before the first insert, not appended afterwards.
        if frappe.db.exists("Branch", TEST_BRANCH):
            branch = frappe.get_doc("Branch", TEST_BRANCH)
            branch.set("user", [])
            branch.append("user", {"user": self.cashier.name})
            branch.save(ignore_permissions=True)
        else:
            branch = frappe.get_doc(
                {
                    "doctype": "Branch",
                    "branch": TEST_BRANCH,
                    "user": [{"user": self.cashier.name}],
                }
            )
            branch.insert(ignore_permissions=True)
        return branch

    def _make_restaurant(self):
        # POS Opening Entry has mandatory custom fields "branch" and
        # "restaurant" (fixtures/custom_field.json), and URY Restaurant in
        # turn requires a "default_room" (URY Room), which requires a
        # "branch". None of these are populated automatically outside the
        # desk form's fetch_from wiring, so they're created explicitly here.
        if frappe.db.exists("URY Room", TEST_ROOM):
            room = frappe.get_doc("URY Room", TEST_ROOM)
        else:
            room = frappe.get_doc(
                {"doctype": "URY Room", "name": TEST_ROOM, "branch": self.branch.name}
            )
            room.insert(ignore_permissions=True)

        if frappe.db.exists("URY Restaurant", TEST_RESTAURANT):
            restaurant = frappe.get_doc("URY Restaurant", TEST_RESTAURANT)
        else:
            restaurant = frappe.get_doc(
                {
                    "doctype": "URY Restaurant",
                    "name": TEST_RESTAURANT,
                    "company": TEST_COMPANY,
                    "invoice_series_prefix": "E2EP0P1",
                    "branch": self.branch.name,
                    "default_room": room.name,
                }
            )
            restaurant.insert(ignore_permissions=True)
        return restaurant

    def _make_pos_profile(self):
        if frappe.db.exists("POS Profile", TEST_POS_PROFILE):
            frappe.delete_doc(
                "POS Profile", TEST_POS_PROFILE, ignore_permissions=True, force=1
            )

        pos_profile = frappe.get_doc(
            {
                "doctype": "POS Profile",
                "name": TEST_POS_PROFILE,
                "naming_series": "_T-POS Profile-",
                "company": TEST_COMPANY,
                "currency": "INR",
                "warehouse": frappe.db.get_value(
                    "Warehouse", {"company": TEST_COMPANY, "is_group": 0}, "name"
                ),
                "cost_center": frappe.db.get_value(
                    "Cost Center", {"company": TEST_COMPANY, "is_group": 0}, "name"
                ),
                "income_account": frappe.db.get_value(
                    "Account",
                    {"company": TEST_COMPANY, "account_type": "Income Account", "is_group": 0},
                    "name",
                ),
                "expense_account": frappe.db.get_value(
                    "Account",
                    {"company": TEST_COMPANY, "account_type": "Cost of Goods Sold", "is_group": 0},
                    "name",
                ),
                "write_off_account": frappe.db.get_value(
                    "Account",
                    {"company": TEST_COMPANY, "account_name": ["like", "%Write Off%"], "is_group": 0},
                    "name",
                ),
                "write_off_cost_center": frappe.db.get_value(
                    "Cost Center", {"company": TEST_COMPANY, "is_group": 0}, "name"
                ),
                "write_off_limit": 0,
                "selling_price_list": "Standard Selling",
                "branch": self.branch.name,
                "restaurant": self.restaurant.name,
                "custom_checklist_items": [
                    {
                        "item_label": CHECKLIST_ITEM_LABEL,
                        "applies_to": "Opening",
                        "is_mandatory": 1,
                    }
                ],
            }
        )
        pos_profile.append("payments", {"mode_of_payment": TEST_MODE_OF_PAYMENT, "default": 1})
        pos_profile.insert(ignore_permissions=True)
        return pos_profile

    def _make_pos_opening_entry(self):
        frappe.set_user(self.cashier.name)

        entry = frappe.new_doc("POS Opening Entry")
        entry.pos_profile = self.pos_profile.name
        entry.user = self.cashier.name
        entry.company = self.pos_profile.company
        entry.period_start_date = frappe.utils.get_datetime()
        # Mandatory custom fields (fixtures/custom_field.json) that are
        # normally auto-populated by the desk form's fetch_from wiring;
        # set explicitly here since we insert directly via the API.
        entry.branch = self.branch.name
        entry.restaurant = self.restaurant.name
        entry.set(
            "balance_details",
            [{"mode_of_payment": row.mode_of_payment} for row in self.pos_profile.payments],
        )
        entry.insert(ignore_permissions=True)
        entry.submit()

        frappe.set_user("Administrator")
        return entry

    def _cleanup(self):
        frappe.set_user("Administrator")

        frappe.db.delete(
            "URY POS Checklist Log",
            {"pos_profile": TEST_POS_PROFILE, "shift_date": date.today()},
        )
        frappe.db.delete("URY KOT Error Log", {"pos_profile": TEST_POS_PROFILE})

        for name in frappe.get_all(
            "POS Opening Entry",
            filters={"pos_profile": TEST_POS_PROFILE},
            pluck="name",
        ):
            doc = frappe.get_doc("POS Opening Entry", name)
            if doc.docstatus == 1:
                doc.cancel()
            frappe.delete_doc("POS Opening Entry", name, ignore_permissions=True, force=1)

        if frappe.db.exists("POS Profile", TEST_POS_PROFILE):
            frappe.delete_doc(
                "POS Profile", TEST_POS_PROFILE, ignore_permissions=True, force=1
            )

        if frappe.db.exists("URY Restaurant", TEST_RESTAURANT):
            frappe.delete_doc(
                "URY Restaurant", TEST_RESTAURANT, ignore_permissions=True, force=1
            )

        if frappe.db.exists("URY Room", TEST_ROOM):
            frappe.delete_doc("URY Room", TEST_ROOM, ignore_permissions=True, force=1)

        if frappe.db.exists("Branch", TEST_BRANCH):
            frappe.delete_doc("Branch", TEST_BRANCH, ignore_permissions=True, force=1)

        frappe.db.commit()

    # -- the continuous flow -------------------------------------------------

    def test_opening_checklist_to_kot_visibility_flow(self):
        pos_profile = self.pos_profile.name

        # Run every permission-scoped call as the real cashier, not
        # Administrator, so branch-scoping in each function is actually
        # exercised rather than short-circuited.
        frappe.set_user(self.cashier.name)

        # 1 & 2 done in setUp: Branch/POS Profile/cashier user created,
        # POS Opening Entry submitted (docstatus=1).
        self.assertEqual(self.opening_entry.docstatus, 1)
        self.opening_entry.reload()
        self.assertEqual(self.opening_entry.status, "Open")

        # 3. get_open_pos_opening_entries returns the entry just created.
        open_entries = get_open_pos_opening_entries(pos_profile)
        open_entry_names = [e["name"] for e in open_entries]
        self.assertIn(self.opening_entry.name, open_entry_names)

        # 4. get_checklist: configured item appears, nothing submitted yet.
        checklist = get_checklist(pos_profile, "Opening")
        item_labels = [item["item_label"] for item in checklist["items"]]
        self.assertIn(CHECKLIST_ITEM_LABEL, item_labels)
        self.assertIsNone(checklist["log_name"])
        self.assertIsNone(checklist["log_status"])

        # 5. submit_checklist with the mandatory item unchecked -> "In Progress".
        unchecked_items = json.dumps(
            [{"item_label": CHECKLIST_ITEM_LABEL, "is_checked": False, "remarks": ""}]
        )
        first_submit = submit_checklist(
            pos_profile,
            "Opening",
            unchecked_items,
            pos_opening_entry=self.opening_entry.name,
        )
        self.assertEqual(first_submit["status"], "In Progress")
        log_name = first_submit["name"]

        # 6. get_checklist again -> resumes the SAME log, status "In Progress".
        checklist_resumed = get_checklist(pos_profile, "Opening")
        self.assertEqual(checklist_resumed["log_name"], log_name)
        self.assertEqual(checklist_resumed["log_status"], "In Progress")

        # 7. submit_checklist again with the item checked -> "Complete".
        checked_items = json.dumps(
            [{"item_label": CHECKLIST_ITEM_LABEL, "is_checked": True, "remarks": ""}]
        )
        second_submit = submit_checklist(
            pos_profile,
            "Opening",
            checked_items,
            pos_opening_entry=self.opening_entry.name,
        )
        self.assertEqual(second_submit["status"], "Complete")
        self.assertEqual(second_submit["name"], log_name)

        # 8. get_checklist a third time -> log_status == "Complete".
        # Regression test: get_checklist previously only ever reported
        # "In Progress" (or nothing) and never surfaced a completed log's
        # true status. This is the exact bug fixed alongside this flow.
        checklist_completed = get_checklist(pos_profile, "Opening")
        self.assertEqual(checklist_completed["log_name"], log_name)
        self.assertEqual(
            checklist_completed["log_status"],
            "Complete",
            "Regression: get_checklist must report the log's true status "
            "('Complete'), not just 'In Progress' or None.",
        )

        # 9. get_kot_errors: branch-scoping must not crash for this profile,
        # and it must return a list (empty is fine, no KOTs were created).
        kot_errors = get_kot_errors(pos_profile)
        self.assertIsInstance(kot_errors, list)
        self.assertEqual(kot_errors, [])

        # 10. sub_pos_closing.get_pos_invoices: core data-fetch call for the
        # multi-cashier closing path. Empty result is fine; it must not
        # raise for a same-branch profile queried by the owning cashier.
        start = frappe.utils.add_to_date(frappe.utils.now_datetime(), hours=-1)
        end = frappe.utils.add_to_date(frappe.utils.now_datetime(), hours=1)
        invoices = get_pos_invoices(start, end, pos_profile, self.cashier.name)
        self.assertIsInstance(invoices, list)
        self.assertEqual(invoices, [])
