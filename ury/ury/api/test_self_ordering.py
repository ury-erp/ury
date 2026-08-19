# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt
#
# Phase 3.8: customer-safe ordering API tests. These are unit tests against
# mocked frappe calls (matching the existing test_ury_order.py / test_api.py
# convention) rather than full integration tests against a live site —
# integration coverage (scan table -> order -> KOT -> order again -> same
# invoice updated -> incremental KOT) should be run against a provisioned
# bench as part of this track's acceptance criteria.

import base64
import hmac
import hashlib
import unittest
from unittest.mock import patch, MagicMock

import frappe

from ury.ury.api.self_ordering import (
    _verify_qr_token,
    _sign,
    add_customer_items,
    request_bill,
    create_payment_request,
    get_payment_status,
    share_payment_link,
    register_communication_provider,
)


MOD = "ury.ury.api.self_ordering"


class TestQRTokenRoundtrip(unittest.TestCase):
    @patch(f"{MOD}.frappe.db.exists")
    @patch(f"{MOD}.frappe.get_doc")
    @patch(f"{MOD}._get_profile_secret")
    def test_verify_qr_token_valid_table_token(self, mock_secret, mock_get_doc, mock_exists):
        secret = "test-secret"
        mock_secret.return_value = secret
        mock_exists.return_value = True

        profile_doc = MagicMock()
        profile_doc.enabled = 1
        profile_doc.enable_qr_table_ordering = 1
        mock_get_doc.return_value = profile_doc

        payload = "Profile A|Table 7"
        signature = _sign(payload, secret)
        raw = f"{payload}|{signature}"
        token = base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")

        profile, table, source = _verify_qr_token(token)
        self.assertEqual(profile, profile_doc)
        self.assertEqual(table, "Table 7")
        self.assertEqual(source, "QR Table")

    @patch(f"{MOD}._get_profile_secret")
    def test_verify_qr_token_bad_signature_rejected(self, mock_secret):
        mock_secret.return_value = "test-secret"
        payload = "Profile A|Table 7"
        raw = f"{payload}|deadbeef"
        token = base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")

        with self.assertRaises(frappe.PermissionError):
            _verify_qr_token(token)

    def test_verify_qr_token_malformed_rejected(self):
        with self.assertRaises(frappe.PermissionError):
            _verify_qr_token("not-a-valid-token")


class TestAddCustomerItemsAppendOnly(unittest.TestCase):
    """The core Phase 3 safety guarantee: add_customer_items() only ever
    appends new rows and re-derives price server-side — it must never trust
    a client-supplied rate/tax/cost-center, and must never replace existing
    invoice.items wholesale."""

    def _session_doc(self, table="Table 7", invoice=None, source="QR Table"):
        session = MagicMock()
        session.table = table
        session.invoice = invoice
        session.source = source
        session.device = None
        session.name = "SESSION-1"
        session.ordering_profile = "Profile A"
        return session

    @patch(f"{MOD}.kot_execute")
    @patch(f"{MOD}.price_items_for_invoice")
    @patch(f"{MOD}._resolve_or_create_pos_invoice")
    @patch(f"{MOD}.resolve_restaurant_menu")
    @patch(f"{MOD}.frappe.get_doc")
    @patch(f"{MOD}._resolve_session")
    @patch(f"{MOD}.frappe.db.exists")
    @patch(f"{MOD}.frappe.db.set_value")
    @patch(f"{MOD}.frappe.db.get_value")
    @patch(f"{MOD}.frappe.set_user")
    def test_add_customer_items_appends_without_clearing_existing(
        self, mock_set_user, mock_db_get_value, mock_db_set_value, mock_db_exists, mock_resolve_session, mock_get_doc,
        mock_resolve_menu, mock_resolve_invoice, mock_price_items, mock_kot,
    ):
        mock_db_exists.return_value = True  # Administrator already mapped to the branch
        session = self._session_doc(invoice="POS-INV-100")
        mock_resolve_session.return_value = session

        profile = MagicMock()
        profile.enabled = 1
        profile.allow_add_to_running_table = 1
        profile.branch = "Branch A"
        profile.pos_profile = "POS Profile A"
        profile.default_customer = "Walk-in Customer"

        pos_profile_doc = MagicMock()
        pos_profile_doc.payments = [MagicMock(mode_of_payment="Cash")]

        def get_doc_side_effect(doctype, name=None):
            if doctype == "URY Self Ordering Profile":
                return profile
            if doctype == "POS Profile":
                return pos_profile_doc
            return MagicMock()

        mock_get_doc.side_effect = get_doc_side_effect

        mock_resolve_menu.return_value = {"items": [{"item": "Biryani"}, {"item": "Sandwich"}]}

        existing_row = MagicMock(item_code="Biryani", item_name="Biryani", qty=2)
        invoice = MagicMock()
        invoice.customer = "Walk-in Customer"
        invoice.items = [existing_row]
        invoice.invoice_created = 1
        invoice.invoice_printed = 0
        invoice.restaurant_table = "Table 7"
        invoice.branch = "Branch A"
        invoice.selling_price_list = "Standard Selling"
        invoice.grand_total = 300
        invoice.name = "POS-INV-100"

        # Real Frappe Document.append() mutates the child table list —
        # mirror that here so the post-append aggregation this test exists
        # to verify (current_items_for_kot) actually sees the new row,
        # instead of silently no-op'ing the way a bare MagicMock().append
        # would.
        def append_side_effect(fieldname, row_dict):
            if fieldname == "items":
                invoice.items.append(MagicMock(item_code=row_dict["item_code"], item_name=row_dict["item_name"], qty=row_dict["qty"]))
        invoice.append.side_effect = append_side_effect

        mock_resolve_invoice.return_value = (invoice, "POS-INV-100")

        priced_sandwich = {"item_code": "Sandwich", "item_name": "Sandwich", "qty": 1, "comment": "",
                            "rate": 120, "price_list_rate": 120, "base_price_list_rate": 120, "cost_center": "CC"}
        mock_price_items.return_value = [priced_sandwich]

        mock_db_get_value.return_value = "Menu A"

        result = add_customer_items("session-token", [{"item": "Sandwich", "qty": 1}])

        # Existing rows were never cleared/replaced.
        self.assertIn(existing_row, invoice.items)
        # New row appended, not merged/overwritten.
        invoice.append.assert_any_call("items", priced_sandwich)
        # Server re-derives price via price_items_for_invoice — client qty/item
        # only, no client-supplied rate ever reaches invoice construction.
        mock_price_items.assert_called_once()
        called_items = mock_price_items.call_args[0][0]
        self.assertEqual(called_items, [{"item": "Sandwich", "item_name": "Sandwich", "qty": 1.0, "comment": ""}])
        # KOT still invoked (existing kitchen pipeline untouched) — and
        # crucially, current_items passed to it is the FULL aggregated
        # per-item state (old Biryani row + new Sandwich row), not just the
        # newly-added items. kot_execute's own diff (compare_two_array)
        # treats anything present in previous_items but absent from
        # current_items as removed/cancelled — passing only the new items
        # would make it think the pre-existing Biryani was cancelled.
        mock_kot.assert_called_once()
        kot_args = mock_kot.call_args[0]
        current_items_arg = kot_args[3]
        current_by_item = {row["item_code"]: row["qty"] for row in current_items_arg}
        self.assertEqual(current_by_item, {"Biryani": 2, "Sandwich": 1})
        invoice.save.assert_called_once_with(ignore_permissions=True)

    @patch(f"{MOD}.kot_execute")
    @patch(f"{MOD}.price_items_for_invoice")
    @patch(f"{MOD}._resolve_or_create_pos_invoice")
    @patch(f"{MOD}.resolve_restaurant_menu")
    @patch(f"{MOD}.frappe.get_doc")
    @patch(f"{MOD}._resolve_session")
    @patch(f"{MOD}.frappe.db.exists")
    @patch(f"{MOD}.frappe.db.set_value")
    @patch(f"{MOD}.frappe.db.get_value")
    @patch(f"{MOD}.frappe.set_user")
    def test_add_customer_items_sets_restaurant_table_on_new_invoice(
        self, mock_set_user, mock_db_get_value, mock_db_set_value, mock_db_exists, mock_resolve_session, mock_get_doc,
        mock_resolve_menu, mock_resolve_invoice, mock_price_items, mock_kot,
    ):
        """_resolve_or_create_pos_invoice() never sets restaurant_table on a
        brand-new invoice (that's the caller's job, same as sync_order()
        does it). Without add_customer_items() also doing it, a SECOND call
        for the same table can't find the first call's invoice by name --
        confirmed live: two invoices got created for one table/session
        instead of the running order being updated once."""
        mock_db_exists.return_value = True
        session = self._session_doc(table="Table 9", invoice=None)
        mock_resolve_session.return_value = session

        profile = MagicMock()
        profile.enabled = 1
        profile.allow_add_to_running_table = 1
        profile.branch = "Branch A"
        profile.pos_profile = "POS Profile A"
        profile.default_customer = "Walk-in Customer"

        pos_profile_doc = MagicMock()
        pos_profile_doc.payments = [MagicMock(mode_of_payment="Cash")]

        def get_doc_side_effect(doctype, name=None):
            if doctype == "URY Self Ordering Profile":
                return profile
            if doctype == "POS Profile":
                return pos_profile_doc
            return MagicMock()

        mock_get_doc.side_effect = get_doc_side_effect
        mock_resolve_menu.return_value = {"items": [{"item": "Biryani"}]}
        mock_get_all_patch = patch(f"{MOD}.frappe.get_all", return_value=[])
        mock_get_all_patch.start()
        self.addCleanup(mock_get_all_patch.stop)

        # Brand-new invoice: restaurant_table starts unset, exactly as
        # _resolve_or_create_pos_invoice() actually leaves it.
        new_invoice = MagicMock()
        new_invoice.customer = None
        new_invoice.items = []
        new_invoice.invoice_created = 0
        new_invoice.invoice_printed = 0
        new_invoice.restaurant_table = None
        new_invoice.branch = "Branch A"
        new_invoice.selling_price_list = "Standard Selling"
        new_invoice.grand_total = 100
        new_invoice.name = "POS-INV-NEW"
        mock_resolve_invoice.return_value = (new_invoice, None)
        mock_price_items.return_value = [{"item_code": "Biryani", "item_name": "Biryani", "qty": 1,
                                           "comment": "", "rate": 100, "price_list_rate": 100,
                                           "base_price_list_rate": 100, "cost_center": "CC"}]

        add_customer_items("session-token", [{"item": "Biryani", "qty": 1}])

        self.assertEqual(new_invoice.restaurant_table, "Table 9")

    @patch(f"{MOD}._resolve_session")
    def test_add_customer_items_rejects_item_not_on_menu(self, mock_resolve_session):
        session = self._session_doc(invoice="POS-INV-100")
        mock_resolve_session.return_value = session

        with patch(f"{MOD}.frappe.get_doc") as mock_get_doc, \
             patch(f"{MOD}.resolve_restaurant_menu") as mock_resolve_menu, \
             patch(f"{MOD}.frappe.set_user"):
            profile = MagicMock()
            profile.enabled = 1
            profile.allow_add_to_running_table = 1
            profile.branch = "Branch A"
            mock_get_doc.return_value = profile
            mock_resolve_menu.return_value = {"items": [{"item": "Biryani"}]}

            with self.assertRaises(frappe.ValidationError):
                add_customer_items("session-token", [{"item": "Not On Menu", "qty": 1}])

    @patch(f"{MOD}._resolve_session")
    def test_add_customer_items_rejects_when_running_table_addition_disabled(self, mock_resolve_session):
        session = self._session_doc(invoice="POS-INV-100")
        mock_resolve_session.return_value = session

        with patch(f"{MOD}.frappe.get_doc") as mock_get_doc:
            profile = MagicMock()
            profile.enabled = 1
            profile.allow_add_to_running_table = 0
            mock_get_doc.return_value = profile

            with self.assertRaises(frappe.ValidationError):
                add_customer_items("session-token", [{"item": "Biryani", "qty": 1}])

    @patch(f"{MOD}.frappe.get_all")
    @patch(f"{MOD}.frappe.set_user")
    @patch(f"{MOD}._resolve_session")
    def test_add_customer_items_rejects_joining_pre_existing_table_order(
        self, mock_resolve_session, mock_set_user, mock_get_all,
    ):
        """session.invoice is None on a session's first call even when the
        table already has an open invoice from staff or another session —
        allow_add_to_running_table=False must still block that join, not
        just block a session's own later calls."""
        session = self._session_doc(invoice=None)
        mock_resolve_session.return_value = session

        with patch(f"{MOD}.frappe.get_doc") as mock_get_doc:
            profile = MagicMock()
            profile.enabled = 1
            profile.allow_add_to_running_table = 0
            mock_get_doc.return_value = profile

            mock_get_all.return_value = [MagicMock(name="POS-INV-EXISTING")]

            with self.assertRaises(frappe.ValidationError):
                add_customer_items("session-token", [{"item": "Biryani", "qty": 1}])

            mock_get_all.assert_called_once()
            called_kwargs = mock_get_all.call_args.kwargs
            self.assertEqual(called_kwargs["or_filters"]["restaurant_table"], "Table 7")

    @patch(f"{MOD}.frappe.get_all")
    @patch(f"{MOD}._resolve_session")
    def test_add_customer_items_first_call_proceeds_when_table_free(
        self, mock_resolve_session, mock_get_all,
    ):
        """Same disabled-flag config, but no pre-existing invoice on the
        table — the new guard must not block a session's own first order."""
        session = self._session_doc(invoice=None)
        mock_resolve_session.return_value = session
        mock_get_all.return_value = []

        with patch(f"{MOD}.frappe.get_doc") as mock_get_doc, \
             patch(f"{MOD}.resolve_restaurant_menu") as mock_resolve_menu, \
             patch(f"{MOD}.frappe.set_user"):
            profile = MagicMock()
            profile.enabled = 1
            profile.allow_add_to_running_table = 0
            profile.branch = "Branch A"
            mock_get_doc.return_value = profile
            mock_resolve_menu.return_value = {"items": [{"item": "Biryani"}]}

            # No exception from the pre-existing-order guard itself; it will
            # fail further down on unmocked invoice-resolution internals,
            # which is fine — this test only asserts the guard we're fixing
            # doesn't false-positive on a session's own legitimate first order.
            with self.assertRaises(Exception) as ctx:
                add_customer_items("session-token", [{"item": "Biryani", "qty": 1}])
            self.assertNotIn("already has an order in progress", str(ctx.exception))


class TestRequestBill(unittest.TestCase):
    @patch(f"{MOD}.now_datetime")
    @patch(f"{MOD}.frappe.get_doc")
    @patch(f"{MOD}.frappe.db.exists")
    @patch(f"{MOD}._resolve_session")
    @patch(f"{MOD}.frappe.set_user")
    def test_request_bill_creates_service_request(self, mock_set_user, mock_resolve_session, mock_exists, mock_get_doc, mock_now):
        session = MagicMock()
        session.table = "Table 7"
        session.invoice = "POS-INV-100"
        session.name = "SESSION-1"
        session.ordering_profile = "Profile A"
        mock_resolve_session.return_value = session

        profile = MagicMock()
        profile.enable_request_bill = 1

        req = MagicMock()
        req.name = "SR-001"

        def get_doc_side_effect(arg, name=None):
            if isinstance(arg, dict):
                return req
            return profile

        mock_get_doc.side_effect = get_doc_side_effect
        mock_exists.return_value = False

        result = request_bill("session-token")

        req.insert.assert_called_once_with(ignore_permissions=True)
        self.assertEqual(result["status"], "Requested")

    @patch(f"{MOD}.frappe.db.exists")
    @patch(f"{MOD}.frappe.get_doc")
    @patch(f"{MOD}._resolve_session")
    @patch(f"{MOD}.frappe.set_user")
    def test_request_bill_idempotent_when_already_open(self, mock_set_user, mock_resolve_session, mock_get_doc, mock_exists):
        session = MagicMock()
        session.table = "Table 7"
        session.invoice = "POS-INV-100"
        session.name = "SESSION-1"
        session.ordering_profile = "Profile A"
        mock_resolve_session.return_value = session

        profile = MagicMock()
        profile.enable_request_bill = 1
        mock_get_doc.return_value = profile
        mock_exists.return_value = "SR-EXISTING"

        result = request_bill("session-token")
        self.assertEqual(result["status"], "Already Requested")
        self.assertEqual(result["request"], "SR-EXISTING")


class TestCreatePaymentRequest(unittest.TestCase):
    @patch("erpnext.accounts.doctype.payment_request.payment_request.make_payment_request")
    @patch(f"{MOD}.frappe.get_doc")
    @patch(f"{MOD}._resolve_session")
    @patch(f"{MOD}.frappe.set_user")
    def test_create_payment_request_never_trusts_client_amount(
        self, mock_set_user, mock_resolve_session, mock_get_doc, mock_make_pr,
    ):
        """The whitelisted signature is create_payment_request(session) --
        there is no amount/currency parameter at all, so a client literally
        cannot influence what gets charged; make_payment_request() derives
        the amount server-side from the POS Invoice itself."""
        session = MagicMock()
        session.invoice = "POS-INV-100"
        session.ordering_profile = "Profile A"
        mock_resolve_session.return_value = session

        profile = MagicMock()
        profile.enable_customer_payment = 1
        profile.enable_payment_link = 0

        invoice = MagicMock()
        invoice.docstatus = 0
        invoice.name = "POS-INV-100"

        def get_doc_side_effect(doctype, name=None):
            if doctype == "URY Self Ordering Profile":
                return profile
            if doctype == "POS Invoice":
                return invoice
            return MagicMock()

        mock_get_doc.side_effect = get_doc_side_effect

        pr = MagicMock()
        pr.name = "PR-001"
        pr.grand_total = 1293.72
        pr.currency = "INR"
        pr.status = "Draft"
        pr.get_payment_url.return_value = "https://pay.example/PR-001"
        mock_make_pr.return_value = pr

        result = create_payment_request("session-token")

        # dt/dn/amount all come from the session-resolved invoice, not from
        # any client-supplied argument (there isn't one to trust).
        mock_make_pr.assert_called_once_with(
            dt="POS Invoice", dn="POS-INV-100", submit_doc=1, mute_email=1,
            order_type="Shopping Cart", return_doc=1,
        )
        self.assertEqual(result["payment_request"], "PR-001")
        self.assertEqual(result["amount"], 1293.72)
        self.assertEqual(result["payment_url"], "https://pay.example/PR-001")

    @patch(f"{MOD}.frappe.get_doc")
    @patch(f"{MOD}._resolve_session")
    def test_create_payment_request_rejects_when_payment_disabled(self, mock_resolve_session, mock_get_doc):
        session = MagicMock()
        session.invoice = "POS-INV-100"
        mock_resolve_session.return_value = session

        profile = MagicMock()
        profile.enable_customer_payment = 0
        profile.enable_payment_link = 0
        mock_get_doc.return_value = profile

        with self.assertRaises(frappe.ValidationError):
            create_payment_request("session-token")

    @patch("erpnext.accounts.doctype.payment_request.payment_request.make_payment_request")
    @patch(f"{MOD}.frappe.get_doc")
    @patch(f"{MOD}._resolve_session")
    @patch(f"{MOD}.frappe.set_user")
    def test_create_payment_request_rejects_already_settled_invoice(
        self, mock_set_user, mock_resolve_session, mock_get_doc, mock_make_pr,
    ):
        session = MagicMock()
        session.invoice = "POS-INV-100"
        mock_resolve_session.return_value = session

        profile = MagicMock()
        profile.enable_customer_payment = 1
        profile.enable_payment_link = 0

        invoice = MagicMock()
        invoice.docstatus = 1  # already submitted/settled

        def get_doc_side_effect(doctype, name=None):
            if doctype == "URY Self Ordering Profile":
                return profile
            return invoice

        mock_get_doc.side_effect = get_doc_side_effect

        with self.assertRaises(frappe.ValidationError):
            create_payment_request("session-token")
        mock_make_pr.assert_not_called()

    @patch("erpnext.accounts.doctype.payment_request.payment_request.make_payment_request")
    @patch(f"{MOD}.frappe.log_error")
    @patch(f"{MOD}.frappe.get_doc")
    @patch(f"{MOD}._resolve_session")
    @patch(f"{MOD}.frappe.set_user")
    def test_create_payment_request_survives_missing_gateway(
        self, mock_set_user, mock_resolve_session, mock_get_doc, mock_log_error, mock_make_pr,
    ):
        """No Payment Gateway Account configured -> get_payment_url() raises.
        The Payment Request itself must still be returned (real, valid, just
        without a link) rather than the whole call failing."""
        session = MagicMock()
        session.invoice = "POS-INV-100"
        mock_resolve_session.return_value = session

        profile = MagicMock()
        profile.enable_customer_payment = 1
        profile.enable_payment_link = 0

        invoice = MagicMock()
        invoice.docstatus = 0
        invoice.name = "POS-INV-100"

        def get_doc_side_effect(doctype, name=None, **kwargs):
            # frappe.log_error()'s own internal frappe.get_doc(doctype="Error
            # Log", ...) call also passes through this same mocked
            # frappe.get_doc (it's patched at the module level) since the
            # missing-gateway path exercises that call — absorb its extra
            # kwargs (error=..., etc.) rather than modeling Error Log too.
            if doctype == "URY Self Ordering Profile":
                return profile
            if doctype == "Error Log":
                return MagicMock()
            return invoice

        mock_get_doc.side_effect = get_doc_side_effect

        pr = MagicMock()
        pr.name = "PR-002"
        pr.grand_total = 500
        pr.currency = "INR"
        pr.status = "Draft"
        pr.get_payment_url.side_effect = Exception("No payment gateway account configured")
        mock_make_pr.return_value = pr

        result = create_payment_request("session-token")
        self.assertEqual(result["payment_request"], "PR-002")
        self.assertIsNone(result["payment_url"])

    @patch("erpnext.accounts.doctype.payment_request.payment_request.make_payment_request")
    @patch(f"{MOD}.frappe.log_error")
    @patch(f"{MOD}.frappe.get_doc")
    @patch(f"{MOD}._resolve_session")
    @patch(f"{MOD}.frappe.set_user")
    def test_create_payment_request_reports_unconfigured_gateway_clearly(
        self, mock_set_user, mock_resolve_session, mock_get_doc, mock_log_error, mock_make_pr,
    ):
        """Live-testing finding: for dt="POS Invoice", ERPNext's
        get_amount() only recognizes payments rows with type="Phone"
        matching a configured gateway account -- with none configured (true
        on a fresh bench with no real Payment Gateway Account set up),
        make_payment_request() itself throws "Payment Entry is already
        created", which reads as if the order were already paid. This must
        surface as a clear "not configured yet" message, not that
        confusing raw error."""
        session = MagicMock()
        session.invoice = "POS-INV-100"
        mock_resolve_session.return_value = session

        profile = MagicMock()
        profile.enable_customer_payment = 1
        profile.enable_payment_link = 0

        invoice = MagicMock()
        invoice.docstatus = 0
        invoice.name = "POS-INV-100"

        def get_doc_side_effect(doctype, name=None, **kwargs):
            if doctype == "URY Self Ordering Profile":
                return profile
            return invoice

        mock_get_doc.side_effect = get_doc_side_effect
        mock_make_pr.side_effect = frappe.ValidationError("Payment Entry is already created")

        with self.assertRaises(frappe.ValidationError) as ctx:
            create_payment_request("session-token")
        self.assertIn("not set up", str(ctx.exception))
        self.assertNotIn("already created", str(ctx.exception))


class TestSharePaymentLink(unittest.TestCase):
    def tearDown(self):
        # Restore the default provider so other tests aren't affected by a
        # provider left registered by this test class.
        from ury.ury.api import self_ordering
        self_ordering._communication_provider = self_ordering._default_communication_provider

    @patch(f"{MOD}.frappe.get_doc")
    @patch(f"{MOD}.frappe.db.get_value")
    @patch(f"{MOD}._resolve_session")
    @patch(f"{MOD}.frappe.set_user")
    def test_share_payment_link_calls_registered_provider(
        self, mock_set_user, mock_resolve_session, mock_db_get_value, mock_get_doc,
    ):
        session = MagicMock()
        session.invoice = "POS-INV-100"
        session.ordering_profile = "Profile A"
        mock_resolve_session.return_value = session

        profile = MagicMock()
        profile.enable_payment_link = 1

        pr_doc = MagicMock()
        pr_doc.get_payment_url.return_value = "https://pay.example/PR-001"

        def get_doc_side_effect(doctype, name=None):
            if doctype == "URY Self Ordering Profile":
                return profile
            if doctype == "Payment Request":
                return pr_doc
            return MagicMock()

        mock_get_doc.side_effect = get_doc_side_effect
        # frappe.db.get_value(..., as_dict=True) returns a dot-accessible
        # frappe._dict in production (production code reads pr.name,
        # pr.grand_total) -- a plain dict would silently not exercise that.
        mock_db_get_value.return_value = frappe._dict({"name": "PR-001", "grand_total": 1293.72})

        sent = {}

        def fake_provider(recipient, message):
            sent["recipient"] = recipient
            sent["message"] = message

        register_communication_provider(fake_provider)

        result = share_payment_link("session-token", "+919876543210")

        self.assertEqual(result["status"], "Sent")
        self.assertEqual(sent["recipient"], "+919876543210")
        self.assertIn("1293.72", sent["message"])
        self.assertIn("https://pay.example/PR-001", sent["message"])

    @patch(f"{MOD}.frappe.get_doc")
    @patch(f"{MOD}._resolve_session")
    def test_share_payment_link_rejects_empty_recipient(self, mock_resolve_session, mock_get_doc):
        session = MagicMock()
        mock_resolve_session.return_value = session
        profile = MagicMock()
        profile.enable_payment_link = 1
        mock_get_doc.return_value = profile

        with self.assertRaises(frappe.ValidationError):
            share_payment_link("session-token", "")


class TestGetPaymentStatus(unittest.TestCase):
    @patch(f"{MOD}.frappe.db.get_value")
    @patch(f"{MOD}._resolve_session")
    @patch(f"{MOD}.frappe.set_user")
    def test_get_payment_status_no_invoice(self, mock_set_user, mock_resolve_session, mock_db_get_value):
        session = MagicMock()
        session.invoice = None
        mock_resolve_session.return_value = session

        result = get_payment_status("session-token")
        self.assertIsNone(result["status"])
        mock_db_get_value.assert_not_called()
