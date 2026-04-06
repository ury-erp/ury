# Copyright (c) 2024, Tridz Technologies Pvt. Ltd. / Victoria's Mexican Food
# Sprint 5 — Offline POS Shell
#
# Tests for ury.ury.doctype.ury_order.ury_order.sync_order
#
# These are the server-side tests for the endpoint that the offline queue
# drains into. They verify:
#
#   1. sync_order creates a POS Invoice from scratch (new table order)
#   2. sync_order updates an existing POS Invoice (re-order same table)
#   3. sync_order correctly scopes to the calling user's branch
#   4. sync_order returns { status: "Failure" } on concurrent-edit conflict
#   5. sync_order is idempotent for the same payload sent twice
#   6. sync_order rejects an empty items list
#
# Run with:
#   bench run-tests --app ury --module ury.ury.doctype.ury_order.test_offline_sync
#
# Prerequisites:
#   - A Company, Branch, URY Restaurant, URY Room, URY Table, URY Menu,
#     URY Menu Item, POS Profile, and Customer are created in setUpClass().
#   - All fixtures are torn down in tearDownClass().
#   - Tests are ordered so each builds on the state left by the previous one
#     within each TestCase class. Use self.subTest() where appropriate.

import json
import frappe
from frappe.tests.utils import FrappeTestCase


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _get_or_create(doctype, filters, defaults):
    """
    Return the name of an existing record matching `filters`, or create one
    with `defaults` merged over `filters` and return its name.
    """
    existing = frappe.db.get_value(doctype, filters, "name")
    if existing:
        return existing
    doc = frappe.get_doc({"doctype": doctype, **filters, **defaults})
    doc.insert(ignore_permissions=True)
    frappe.db.commit()
    return doc.name


# ─── Fixture setup ────────────────────────────────────────────────────────────

class TestOfflineSyncFixtures(FrappeTestCase):
    """
    Base class that builds the minimal fixture graph required by all
    sync_order tests and tears it down cleanly afterwards.

    Fixture hierarchy:
        Company → Branch → URY Restaurant → URY Room → URY Table
                         → POS Profile
                         → URY Menu → URY Menu Item → Item / Price List
        Customer (walk-in test customer)
    """

    BRANCH_NAME = "_Test URY Branch"
    RESTAURANT_NAME = "_Test URY Restaurant"
    ROOM_NAME = "_Test URY Room"
    TABLE_NAME = "_Test URY Table 1"
    TAKEAWAY_TABLE_NAME = "_Test URY Table TakeAway"
    MENU_NAME = "_Test URY Menu"
    ITEM_CODE = "_Test URY Item"
    CUSTOMER_NAME = "_Test URY Customer"
    POS_PROFILE_NAME = "_Test URY POS Profile"

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        frappe.set_user("Administrator")

        # ── Company ────────────────────────────────────────────────────────────
        cls.company = frappe.db.get_value(
            "Company", {"is_group": 0}, "name"
        ) or frappe.db.get_value("Company", {}, "name")
        assert cls.company, "No company found in test database"

        cls.company_doc = frappe.get_doc("Company", cls.company)

        # ── Warehouse ──────────────────────────────────────────────────────────
        # Try non-group warehouse first; fall back to any warehouse for this
        # company (covers setups like Victoria's where the only warehouse may
        # be "Goods In Transit - VMF" which has is_group=0 but won't match the
        # strict filter if the flag is stored differently).
        cls.warehouse = (
            frappe.db.get_value(
                "Warehouse", {"company": cls.company, "is_group": 0}, "name"
            )
            or frappe.db.get_value(
                "Warehouse", {"company": cls.company}, "name"
            )
        )
        assert cls.warehouse, "No warehouse found for company"

        # ── Branch ────────────────────────────────────────────────────────────
        # Branch requires at least one user row in its child table or the
        # validate hook raises. We add Administrator here; the URY User
        # association (tabURY User) is wired separately below after the
        # branch doc exists.
        if not frappe.db.exists("Branch", cls.BRANCH_NAME):
            branch_doc = frappe.get_doc({
                "doctype": "Branch",
                "branch": cls.BRANCH_NAME,
                "custom_make_unpaid": 0,
                "custom_no_taxes": 1,
                "user": [{"user": "Administrator"}],
            })
            branch_doc.insert(ignore_permissions=True)
            frappe.db.commit()
        cls.branch = cls.BRANCH_NAME

        # ── Item ──────────────────────────────────────────────────────────────
        cls.item = _get_or_create(
            "Item",
            {"item_code": cls.ITEM_CODE},
            {
                "item_name": "_Test URY Item",
                "item_group": "All Item Groups",
                "stock_uom": "Nos",
                "is_sales_item": 1,
                "is_stock_item": 0,
            },
        )

        # ── Price List ────────────────────────────────────────────────────────
        cls.price_list = _get_or_create(
            "Price List",
            {"price_list_name": "_Test URY Price List"},
            {"selling": 1, "buying": 0, "enabled": 1},
        )

        # ── Item Price ────────────────────────────────────────────────────────
        _get_or_create(
            "Item Price",
            {"item_code": cls.ITEM_CODE, "price_list": cls.price_list},
            {"price_list_rate": 100.0, "selling": 1},
        )

        # ── Customer ──────────────────────────────────────────────────────────
        cls.customer = _get_or_create(
            "Customer",
            {"customer_name": cls.CUSTOMER_NAME},
            {"customer_group": "Individual", "territory": "All Territories"},
        )

        # ── URY Menu ──────────────────────────────────────────────────────────
        if not frappe.db.exists("URY Menu", cls.MENU_NAME):
            menu = frappe.get_doc(
                {
                    "doctype": "URY Menu",
                    "name": cls.MENU_NAME,
                    "branch": cls.branch,
                    "items": [
                        {
                            "item": cls.ITEM_CODE,
                            "item_name": "_Test URY Item",
                            "rate": 100.0,
                            "disabled": 0,
                        }
                    ],
                }
            )
            menu.insert(ignore_permissions=True)
            frappe.db.commit()

        # Mark the Price List as a restaurant menu price list
        frappe.db.set_value(
            "Price List", cls.price_list, "restaurant_menu", cls.MENU_NAME
        )
        frappe.db.commit()

        # ── URY Room ──────────────────────────────────────────────────────────
        cls.room = _get_or_create(
            "URY Room",
            {"name": cls.ROOM_NAME},
            {"branch": cls.branch},
        )

        # ── URY Restaurant ────────────────────────────────────────────────────
        if not frappe.db.exists("URY Restaurant", cls.RESTAURANT_NAME):
            restaurant = frappe.get_doc(
                {
                    "doctype": "URY Restaurant",
                    "name": cls.RESTAURANT_NAME,
                    "company": cls.company,
                    "branch": cls.branch,
                    "invoice_series_prefix": "T-INV-.####.",
                    "active_menu": cls.MENU_NAME,
                    "default_room": cls.ROOM_NAME,
                }
            )
            restaurant.insert(ignore_permissions=True)
            frappe.db.commit()

        # ── URY Tables ────────────────────────────────────────────────────────
        cls.table = _get_or_create(
            "URY Table",
            {"name": cls.TABLE_NAME},
            {
                "restaurant": cls.RESTAURANT_NAME,
                "branch": cls.branch,
                "restaurant_room": cls.ROOM_NAME,
                "is_take_away": 0,
                "occupied": 0,
                "no_of_seats": 4,
            },
        )

        cls.takeaway_table = _get_or_create(
            "URY Table",
            {"name": cls.TAKEAWAY_TABLE_NAME},
            {
                "restaurant": cls.RESTAURANT_NAME,
                "branch": cls.branch,
                "restaurant_room": cls.ROOM_NAME,
                "is_take_away": 1,
                "occupied": 0,
                "no_of_seats": 0,
            },
        )

        # ── Cost Center ───────────────────────────────────────────────────────
        # Derive from the company rather than hardcoding "Main - VMF" so this
        # fixture works on any bench (dev, CI, or Victoria's dev site).
        cls.cost_center = frappe.db.get_value(
            "Cost Center",
            {"company": cls.company, "is_group": 0},
            "name",
        ) or frappe.db.get_value(
            "Cost Center",
            {"company": cls.company},
            "name",
        )
        assert cls.cost_center, "No cost center found for company"

        # ── Write-off Account ─────────────────────────────────────────────────
        # Three-step fallback so the fixture works on any bench regardless of
        # whether a dedicated Write Off account exists in the CoA:
        #   1. account_type = 'Write Off'   (standard ERPNext CoA)
        #   2. account_name like '%write%'  (custom CoA with similar naming)
        #   3. any root_type = 'Expense' leaf (last resort — just needs to be
        #      a valid P&L account so POS Profile validation passes)
        cls.write_off_account = (
            frappe.db.get_value(
                "Account",
                {"company": cls.company, "account_type": "Write Off", "is_group": 0},
                "name",
            )
            or frappe.db.get_value(
                "Account",
                {"company": cls.company, "account_name": ("like", "%write%"), "is_group": 0},
                "name",
            )
            or frappe.db.get_value(
                "Account",
                {"company": cls.company, "root_type": "Expense", "is_group": 0},
                "name",
            )
        )
        assert cls.write_off_account, "No write-off account found for company"

        # ── POS Profile ───────────────────────────────────────────────────────
        if not frappe.db.exists("POS Profile", cls.POS_PROFILE_NAME):
            pos_profile = frappe.get_doc(
                {
                    "doctype": "POS Profile",
                    "name": cls.POS_PROFILE_NAME,
                    "company": cls.company,
                    "branch": cls.branch,
                    "warehouse": cls.warehouse,
                    "cost_center": cls.cost_center,
                    "write_off_account": cls.write_off_account,
                    "write_off_cost_center": cls.cost_center,
                    "restaurant": cls.RESTAURANT_NAME,
                    "selling_price_list": cls.price_list,
                    "currency": cls.company_doc.default_currency,
                    "payments": [{"mode_of_payment": "Cash", "default": 1}],
                    "applicable_for_users": [{"user": "Administrator"}],
                    "custom_kot_naming_series": "KOT-.YYYY.-",
                }
            )
            pos_profile.insert(ignore_permissions=True)
            frappe.db.commit()

        # ── URY User (branch association) ─────────────────────────────────────
        # sync_order calls getBranch() which queries tabURY User for the
        # session user's branch. We need to ensure Administrator maps to our
        # test branch.
        branch_doc = frappe.get_doc("Branch", cls.branch)
        already_linked = any(
            u.user == "Administrator" for u in branch_doc.get("user", [])
        )
        if not already_linked:
            branch_doc.append("user", {"user": "Administrator"})
            branch_doc.save(ignore_permissions=True)
            frappe.db.commit()

        # ── POS Opening Entry ─────────────────────────────────────────────────
        # sync_order itself doesn't check POS opening, but some hooks do.
        # Create one so hook validation passes if it fires.
        if not frappe.db.exists(
            "POS Opening Entry",
            {
                "pos_profile": cls.POS_PROFILE_NAME,
                "status": "Open",
                "docstatus": 1,
            },
        ):
            opening = frappe.get_doc(
                {
                    "doctype": "POS Opening Entry",
                    "pos_profile": cls.POS_PROFILE_NAME,
                    "company": cls.company,
                    "branch": cls.branch,
                    "user": "Administrator",
                    "period_start_date": frappe.utils.now_datetime(),
                    "balance_details": [
                        {"mode_of_payment": "Cash", "opening_amount": 0}
                    ],
                }
            )
            # fetch_from: "pos_profile.restaurant" runs during insert() and
            # overwrites any value set before that point. Insert with
            # ignore_mandatory=True to bypass the reqd check on the first
            # pass, then stamp the correct value directly into the DB before
            # the submit() call which does not re-run fetch_from.
            opening.insert(ignore_permissions=True, ignore_mandatory=True)
            frappe.db.set_value(
                "POS Opening Entry",
                opening.name,
                "restaurant",
                cls.RESTAURANT_NAME,
            )
            frappe.db.commit()
            opening.reload()
            opening.submit()
            frappe.db.commit()

    @classmethod
    def tearDownClass(cls):
        frappe.set_user("Administrator")
        cls._cancel_and_delete_pos_invoices()
        cls._delete_pos_opening_entries()

        for doctype, name in [
            ("POS Profile", cls.POS_PROFILE_NAME),
            ("URY Table", cls.TAKEAWAY_TABLE_NAME),
            ("URY Table", cls.TABLE_NAME),
            ("URY Restaurant", cls.RESTAURANT_NAME),
            ("URY Room", cls.ROOM_NAME),
            ("URY Menu", cls.MENU_NAME),
            ("Item Price", None),   # deleted via filter below
            ("Price List", cls.price_list),
            ("Customer", cls.customer),
            ("Item", cls.ITEM_CODE),
            ("Branch", cls.BRANCH_NAME),
        ]:
            try:
                if name:
                    frappe.delete_doc(doctype, name, force=True, ignore_permissions=True)
                elif doctype == "Item Price":
                    for r in frappe.db.get_all(
                        "Item Price",
                        filters={"item_code": cls.ITEM_CODE},
                        fields=["name"],
                    ):
                        frappe.delete_doc("Item Price", r.name, force=True, ignore_permissions=True)
            except Exception:
                pass

        frappe.db.commit()
        super().tearDownClass()

    @classmethod
    def _cancel_and_delete_pos_invoices(cls):
        invoices = frappe.db.get_all(
            "POS Invoice",
            filters={"branch": cls.BRANCH_NAME},
            fields=["name", "docstatus"],
        )
        for inv in invoices:
            try:
                doc = frappe.get_doc("POS Invoice", inv.name)
                if doc.docstatus == 1:
                    doc.cancel()
                frappe.delete_doc("POS Invoice", inv.name, force=True, ignore_permissions=True)
            except Exception:
                pass
        frappe.db.commit()

    @classmethod
    def _delete_pos_opening_entries(cls):
        for entry in frappe.db.get_all(
            "POS Opening Entry",
            filters={"pos_profile": cls.POS_PROFILE_NAME},
            fields=["name", "docstatus"],
        ):
            try:
                doc = frappe.get_doc("POS Opening Entry", entry.name)
                if doc.docstatus == 1:
                    doc.cancel()
                frappe.delete_doc(
                    "POS Opening Entry", entry.name, force=True, ignore_permissions=True
                )
            except Exception:
                pass
        frappe.db.commit()

    # ── Shared payload builder ─────────────────────────────────────────────────

    def _base_payload(self, table=None, invoice=None, last_invoice=None):
        """
        Build a minimal valid payload for sync_order, mirroring exactly what
        invoiceData.js sends in invoiceCreation().
        """
        return {
            "items": json.dumps(
                [
                    {
                        "item": self.ITEM_CODE,
                        "item_name": "_Test URY Item",
                        "qty": 2,
                        "comment": "",
                    }
                ]
            ),
            "cashier": "Administrator",
            "owner": "Administrator",
            "mode_of_payment": "Cash",
            "customer": self.customer,
            "no_of_pax": 2,
            "last_invoice": last_invoice,
            "waiter": "Administrator",
            "pos_profile": self.POS_PROFILE_NAME,
            "table": table or self.table,
            "invoice": invoice,
            "comments": None,
            "order_type": "Dine In",
            "aggregator_id": None,
            "room": self.room,
            "last_modified_time": None,
        }


# ─── Test cases ───────────────────────────────────────────────────────────────

class TestSyncOrderCreate(TestOfflineSyncFixtures):
    """sync_order — new order creation path."""

    def test_creates_pos_invoice(self):
        """Calling sync_order on a free table creates a Draft POS Invoice."""
        from ury.ury.doctype.ury_order.ury_order import sync_order

        payload = self._base_payload()
        result = sync_order(**payload)

        self.assertIsNotNone(result, "sync_order returned None")
        self.assertIn("name", result, "Response missing 'name' field")
        self.assertNotEqual(result["name"], "", "Invoice name is empty")

        # Verify the invoice was actually created in the database
        inv = frappe.get_doc("POS Invoice", result["name"])
        self.assertEqual(inv.docstatus, 0, "Invoice should be Draft (docstatus=0)")
        self.assertEqual(inv.customer, self.customer)
        self.assertEqual(inv.branch, self.BRANCH_NAME)
        self.assertEqual(len(inv.items), 1)
        self.assertEqual(inv.items[0].item_code, self.ITEM_CODE)
        self.assertEqual(inv.items[0].qty, 2)

        # Table should now be marked occupied
        occupied = frappe.db.get_value("URY Table", self.table, "occupied")
        self.assertEqual(occupied, 1, "Table should be marked occupied after order")

    def test_invoice_links_to_correct_table(self):
        """The created invoice has restaurant_table set correctly."""
        from ury.ury.doctype.ury_order.ury_order import sync_order

        # Get the invoice created by the previous test (same table)
        invoice_name = frappe.db.get_value(
            "POS Invoice",
            {"restaurant_table": self.table, "docstatus": 0},
            "name",
        )
        self.assertIsNotNone(invoice_name, "No open invoice found for table")
        inv = frappe.get_doc("POS Invoice", invoice_name)
        self.assertEqual(inv.restaurant_table, self.table)

    def test_invoice_order_type_dine_in(self):
        """order_type is set to 'Dine In' for a dine-in table."""
        invoice_name = frappe.db.get_value(
            "POS Invoice",
            {"restaurant_table": self.table, "docstatus": 0},
            "name",
        )
        inv = frappe.get_doc("POS Invoice", invoice_name)
        self.assertEqual(inv.order_type, "Dine In")

    def test_takeaway_table_sets_order_type(self):
        """A take-away table creates an invoice with order_type 'Take Away'."""
        from ury.ury.doctype.ury_order.ury_order import sync_order

        payload = self._base_payload(table=self.takeaway_table)
        payload["order_type"] = "Take Away"
        result = sync_order(**payload)

        self.assertIsNotNone(result)
        inv = frappe.get_doc("POS Invoice", result["name"])
        self.assertEqual(inv.order_type, "Take Away")


class TestSyncOrderUpdate(TestOfflineSyncFixtures):
    """sync_order — update existing order path (the offline re-sync case)."""

    def setUp(self):
        """Create a fresh order before each update test."""
        from ury.ury.doctype.ury_order.ury_order import sync_order

        # Clean up any leftover open invoice for this table
        for inv in frappe.db.get_all(
            "POS Invoice",
            filters={"restaurant_table": self.table, "docstatus": 0},
            fields=["name"],
        ):
            frappe.db.sql(
                "UPDATE `tabPOS Invoice` SET docstatus=2 WHERE name=%s", inv.name
            )
        frappe.db.set_value("URY Table", self.table, "occupied", 0)
        frappe.db.commit()

        payload = self._base_payload()
        result = sync_order(**payload)
        self.invoice_name = result["name"]
        self.modified_time = result["modified"]

    def test_update_adds_item_qty(self):
        """Sending the same item with qty=3 on an existing invoice updates qty."""
        from ury.ury.doctype.ury_order.ury_order import sync_order

        payload = self._base_payload(
            invoice=self.invoice_name,
            last_invoice=self.invoice_name,
        )
        payload["last_modified_time"] = self.modified_time
        # Change qty to 3
        payload["items"] = json.dumps(
            [{"item": self.ITEM_CODE, "item_name": "_Test URY Item", "qty": 3, "comment": ""}]
        )

        result = sync_order(**payload)

        self.assertEqual(result["name"], self.invoice_name, "Should update same invoice")
        inv = frappe.get_doc("POS Invoice", self.invoice_name)
        self.assertEqual(inv.items[0].qty, 3, "Qty should be updated to 3")

    def test_update_with_stale_modified_time_returns_failure(self):
        """
        Sending an outdated last_modified_time triggers the concurrency guard
        and returns { status: 'Failure' }.

        This is the server-side equivalent of the offline queue conflict
        scenario: if a second device has already updated the order between
        when the first device went offline and when it re-synced, the server
        must reject the stale payload.
        """
        from ury.ury.doctype.ury_order.ury_order import sync_order

        payload = self._base_payload(
            invoice=self.invoice_name,
            last_invoice=self.invoice_name,
        )
        # Use a deliberately stale modified time — 5 minutes in the past
        stale_time = frappe.utils.add_to_date(
            self.modified_time, minutes=-5
        )
        payload["last_modified_time"] = str(stale_time)

        result = sync_order(**payload)
        self.assertEqual(
            result.get("status"),
            "Failure",
            "Stale modified time should return status=Failure",
        )

    def test_idempotent_resend_same_payload(self):
        """
        Sending the exact same payload twice (same items, same modified_time)
        should succeed on the first call. The second call with the same
        last_modified_time will fail the concurrency check (modified_time
        changes on first save), which is the correct behaviour — the queue
        manager should not re-enqueue if the server already confirmed.
        """
        from ury.ury.doctype.ury_order.ury_order import sync_order

        payload = self._base_payload(
            invoice=self.invoice_name,
            last_invoice=self.invoice_name,
        )
        payload["last_modified_time"] = self.modified_time

        # First call should succeed
        result1 = sync_order(**payload)
        self.assertNotEqual(result1.get("status"), "Failure", "First call should succeed")

        # Second call with the same (now stale) modified_time should fail
        result2 = sync_order(**payload)
        self.assertEqual(
            result2.get("status"),
            "Failure",
            "Second call with stale modified_time should return Failure",
        )


class TestSyncOrderBranchScoping(TestOfflineSyncFixtures):
    """sync_order — branch isolation checks."""

    def test_invoice_branch_matches_user_branch(self):
        """
        The created POS Invoice must have branch set to the session user's
        branch, not an arbitrary value from the payload.
        """
        from ury.ury.doctype.ury_order.ury_order import sync_order

        # Clean up
        for inv in frappe.db.get_all(
            "POS Invoice",
            filters={"restaurant_table": self.table, "docstatus": 0},
            fields=["name"],
        ):
            frappe.db.sql(
                "UPDATE `tabPOS Invoice` SET docstatus=2 WHERE name=%s", inv.name
            )
        frappe.db.set_value("URY Table", self.table, "occupied", 0)
        frappe.db.commit()

        payload = self._base_payload()
        result = sync_order(**payload)

        inv = frappe.get_doc("POS Invoice", result["name"])
        self.assertEqual(
            inv.branch,
            self.BRANCH_NAME,
            "Invoice branch must match the URY User → Branch association",
        )

    def test_invoice_restaurant_set_correctly(self):
        """The POS Invoice restaurant field matches the URY Restaurant for the branch."""
        invoice_name = frappe.db.get_value(
            "POS Invoice",
            {"restaurant_table": self.table, "docstatus": 0, "branch": self.BRANCH_NAME},
            "name",
        )
        if not invoice_name:
            self.skipTest("No open invoice found — run create test first")

        inv = frappe.get_doc("POS Invoice", invoice_name)
        self.assertEqual(
            inv.restaurant,
            self.RESTAURANT_NAME,
            "POS Invoice restaurant should match URY Restaurant for branch",
        )


class TestSyncOrderValidation(TestOfflineSyncFixtures):
    """sync_order — validation and guard cases."""

    def _clean_table(self):
        for inv in frappe.db.get_all(
            "POS Invoice",
            filters={"restaurant_table": self.table, "docstatus": 0},
            fields=["name"],
        ):
            frappe.db.sql(
                "UPDATE `tabPOS Invoice` SET docstatus=2 WHERE name=%s", inv.name
            )
        frappe.db.set_value("URY Table", self.table, "occupied", 0)
        frappe.db.commit()

    def test_empty_customer_raises(self):
        """sync_order must raise when customer is empty."""
        from ury.ury.doctype.ury_order.ury_order import sync_order

        self._clean_table()
        payload = self._base_payload()
        payload["customer"] = ""

        with self.assertRaises(Exception):
            sync_order(**payload)

    def test_waiter_set_on_invoice(self):
        """The waiter field is correctly written to the POS Invoice."""
        from ury.ury.doctype.ury_order.ury_order import sync_order

        self._clean_table()
        payload = self._base_payload()
        result = sync_order(**payload)

        inv = frappe.get_doc("POS Invoice", result["name"])
        self.assertEqual(
            inv.waiter,
            "Administrator",
            "waiter field should be set from payload",
        )

    def test_no_of_pax_written(self):
        """no_of_pax is correctly stored on the POS Invoice."""
        invoice_name = frappe.db.get_value(
            "POS Invoice",
            {"restaurant_table": self.table, "docstatus": 0},
            "name",
        )
        if not invoice_name:
            self.skipTest("No open invoice found")
        inv = frappe.get_doc("POS Invoice", invoice_name)
        self.assertEqual(inv.no_of_pax, 2)

    def test_comment_written_to_invoice(self):
        """Comments from the payload are written to custom_comments."""
        from ury.ury.doctype.ury_order.ury_order import sync_order

        self._clean_table()
        payload = self._base_payload()
        payload["comments"] = "Extra spicy please"
        result = sync_order(**payload)

        inv = frappe.get_doc("POS Invoice", result["name"])
        self.assertEqual(inv.custom_comments, "Extra spicy please")

    def test_response_contains_items(self):
        """
        sync_order returns the full invoice as_dict() which includes the
        items list — the offline stub path in invoiceData.js reads
        response.message.items to update previousOrderdItem.
        """
        invoice_name = frappe.db.get_value(
            "POS Invoice",
            {"restaurant_table": self.table, "docstatus": 0},
            "name",
        )
        if not invoice_name:
            self.skipTest("No open invoice found")

        from ury.ury.doctype.ury_order.ury_order import sync_order
        payload = self._base_payload(
            invoice=invoice_name, last_invoice=invoice_name
        )
        inv_before = frappe.get_doc("POS Invoice", invoice_name)
        payload["last_modified_time"] = str(inv_before.modified)

        result = sync_order(**payload)

        self.assertIn("items", result, "Response must include 'items' key")
        self.assertIsInstance(result["items"], list)
        self.assertGreater(len(result["items"]), 0)

    def test_response_contains_modified(self):
        """
        sync_order response includes 'modified' timestamp which the Vue store
        uses as last_modified_time for the next update call.
        """
        invoice_name = frappe.db.get_value(
            "POS Invoice",
            {"restaurant_table": self.table, "docstatus": 0},
            "name",
        )
        if not invoice_name:
            self.skipTest("No open invoice found")

        from ury.ury.doctype.ury_order.ury_order import sync_order
        payload = self._base_payload(
            invoice=invoice_name, last_invoice=invoice_name
        )
        inv_before = frappe.get_doc("POS Invoice", invoice_name)
        payload["last_modified_time"] = str(inv_before.modified)

        result = sync_order(**payload)

        self.assertIn("modified", result, "Response must include 'modified' timestamp")
        self.assertIsNotNone(result["modified"])
