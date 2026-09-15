import json
from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_wastage import (
    approve_wastage,
    capture_kot_cancellation_wastage,
    capture_wastage,
    compute_wastage_valuation,
    held_quantity,
    list_wastage,
    reject_wastage,
    resolve_posting_accounts,
    reverse_wastage,
)


MODULE = "ury.ury.api.ury_wastage"

# `held_quantity()` routes its wastage sum through
# `ury_issue_authorization.sum_issue_sourced_wastage()` (the single shared
# KOT-source guard). That is still covered by patching `{MODULE}.frappe.*`:
# `ury_wastage.frappe` and `ury_issue_authorization.frappe` are the SAME module
# object, so `patch("<either module>.frappe.get_all")` replaces one shared
# attribute and both callers see it. The corollary is that two patches of the
# "same" target through different module paths do NOT give the two modules
# different values -- the last one applied simply wins for both. Where a test
# needs different answers per doctype, it must use a doctype-aware side_effect,
# not two patches.


def _doctype_exists(present=("URY Issue Wastage",)):
    """frappe.db.exists side_effect: only `present` doctypes exist."""

    def _exists(doctype, name=None, *args, **kwargs):
        if doctype == "DocType":
            return name in present
        return False

    return _exists


def _auth_doc(**values):
    doc = frappe._dict(
        {
            "name": "AUTH-1",
            "plan": "PLAN-1",
            "branch": "Branch A",
            "company": "Company A",
            "department": "DEPT-1",
            "production_unit": None,
            "component_item": "COMP-1",
            "stock_uom": "Nos",
            "status": "Authorized",
            "authorized_qty": 10,
        }
    )
    doc.update(values)
    return doc


def _new_doc_recorder():
    created = {}

    def _get_doc(*args, **kwargs):
        arg = args[0] if args else kwargs.get("arg1")
        if isinstance(arg, dict):
            doc = frappe._dict(arg)
            doc.insert = MagicMock()
            doc.save = MagicMock()
            created["doc"] = doc
            return doc
        raise AssertionError("other lookups should be mocked separately")

    return _get_doc, created


class TestCaptureWastage(FrappeTestCase):
    def setUp(self):
        # capture_wastage() calls frappe.utils.now(), which otherwise
        # chains into get_system_settings() -> get_cached_doc("System
        # Settings") -- a real DB/cache path these unit tests do not
        # stub. Fix the clock instead of routing that lookup through
        # the get_doc mocks below.
        now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
        now_patcher.start()
        self.addCleanup(now_patcher.stop)

    def test_capture_succeeds_within_held_qty(self):
        auth_doc = _auth_doc()
        new_doc_side_effect, created = _new_doc_recorder()

        def get_doc_dispatch(*args, **kwargs):
            if args and args[0] == "URY Issue Authorization":
                return auth_doc
            return new_doc_side_effect(*args, **kwargs)

        with patch(f"{MODULE}.frappe.get_roles", return_value=["Production Manager"]), patch(
            f"{MODULE}.frappe.has_permission", return_value=True
        ), patch(f"{MODULE}.frappe.get_doc", side_effect=get_doc_dispatch), patch(
            f"{MODULE}.frappe.db.get_value", return_value="Company A"
        ), patch(
            f"{MODULE}.frappe.get_all", return_value=[]
        ), patch(
            f"{MODULE}.frappe.db.exists", return_value=False
        ):
            result = capture_wastage(
                issue_authorization="AUTH-1",
                wasted_qty=3,
                reason_category="Spoilage",
                branch="Branch A",
                company="Company A",
            )

        self.assertEqual(result.status, "Draft")
        self.assertEqual(result.wasted_qty, 3)
        self.assertEqual(result.held_qty_before, 10)
        audit = json.loads(result.audit_log)
        self.assertEqual(audit[0]["event"], "captured")
        result.insert.assert_called_once()

    def test_capture_rejected_when_exceeding_held_qty(self):
        # authorized_qty=10, 8 already approved-wasted -> held=2, request 3 fails.
        auth_doc = _auth_doc()
        with patch(f"{MODULE}.frappe.get_roles", return_value=["Production Manager"]), patch(
            f"{MODULE}.frappe.has_permission", return_value=True
        ), patch(f"{MODULE}.frappe.get_doc", return_value=auth_doc), patch(
            f"{MODULE}.frappe.db.get_value", return_value="Company A"
        ), patch(
            f"{MODULE}.frappe.get_all",
            return_value=[{"name": "W-1", "wasted_qty": 8}],
        ), patch(
            f"{MODULE}.frappe.db.exists", side_effect=_doctype_exists()
        ), patch(
            f"{MODULE}.frappe.db.has_column", return_value=False
        ):
            with self.assertRaises(frappe.ValidationError):
                capture_wastage(
                    issue_authorization="AUTH-1",
                    wasted_qty=3,
                    reason_category="Spoilage",
                    branch="Branch A",
                    company="Company A",
                )

    def test_branch_mismatch_fails_closed(self):
        auth_doc = _auth_doc()
        with patch(f"{MODULE}.frappe.get_roles", return_value=["Production Manager"]), patch(
            f"{MODULE}.frappe.has_permission", return_value=True
        ), patch(f"{MODULE}.frappe.get_doc", return_value=auth_doc):
            with self.assertRaises(frappe.ValidationError):
                capture_wastage(
                    issue_authorization="AUTH-1",
                    wasted_qty=1,
                    reason_category="Spoilage",
                    branch="Branch B",
                    company="Company A",
                )

    def test_company_scope_ambiguity_fails_closed(self):
        auth_doc = _auth_doc()
        with patch(f"{MODULE}.frappe.get_roles", return_value=["Production Manager"]), patch(
            f"{MODULE}.frappe.has_permission", return_value=True
        ), patch(f"{MODULE}.frappe.get_doc", return_value=auth_doc), patch(
            f"{MODULE}.frappe.db.get_value", return_value="Other Company"
        ):
            with self.assertRaises(frappe.ValidationError):
                capture_wastage(
                    issue_authorization="AUTH-1",
                    wasted_qty=1,
                    reason_category="Spoilage",
                    branch="Branch A",
                    company="Company A",
                )

    def test_unauthorized_actor_rejected_role_check(self):
        with patch(f"{MODULE}.frappe.get_roles", return_value=["Stock User"]):
            with self.assertRaises(frappe.PermissionError):
                capture_wastage(
                    issue_authorization="AUTH-1",
                    wasted_qty=1,
                    reason_category="Spoilage",
                    branch="Branch A",
                    company="Company A",
                )

    def test_unauthorized_actor_rejected_has_permission_false(self):
        with patch(f"{MODULE}.frappe.get_roles", return_value=["Production Manager"]), patch(
            f"{MODULE}.frappe.has_permission", return_value=False
        ):
            with self.assertRaises(frappe.PermissionError):
                capture_wastage(
                    issue_authorization="AUTH-1",
                    wasted_qty=1,
                    reason_category="Spoilage",
                    branch="Branch A",
                    company="Company A",
                )

    def test_capture_rejects_unauthorized_issue_authorization_status(self):
        auth_doc = _auth_doc(status="Rejected")
        with patch(f"{MODULE}.frappe.get_roles", return_value=["Production Manager"]), patch(
            f"{MODULE}.frappe.has_permission", return_value=True
        ), patch(f"{MODULE}.frappe.get_doc", return_value=auth_doc):
            with self.assertRaises(frappe.ValidationError):
                capture_wastage(
                    issue_authorization="AUTH-1",
                    wasted_qty=1,
                    reason_category="Spoilage",
                    branch="Branch A",
                    company="Company A",
                )


class TestApproveWastage(FrappeTestCase):
    def setUp(self):
        # capture_wastage() calls frappe.utils.now(), which otherwise
        # chains into get_system_settings() -> get_cached_doc("System
        # Settings") -- a real DB/cache path these unit tests do not
        # stub. Fix the clock instead of routing that lookup through
        # the get_doc mocks below.
        now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
        now_patcher.start()
        self.addCleanup(now_patcher.stop)

    def _draft_doc(self, **values):
        doc = frappe._dict(
            {
                "name": "W-1",
                "issue_authorization": "AUTH-1",
                "plan": "PLAN-1",
                "branch": "Branch A",
                "company": "Company A",
                "department": "DEPT-1",
                "component_item": "COMP-1",
                "status": "Draft",
                "wasted_qty": 3,
                "audit_log": None,
            }
        )
        doc.update(values)
        doc.save = MagicMock()
        return doc

    def test_draft_wastage_does_not_count_until_approved(self):
        # held_quantity only sums status="Authorized" wastage rows; a Draft
        # row (status != Authorized) must not appear in what get_all returns
        # for that filter, so it never reduces held qty / entitlement.
        auth_doc = _auth_doc()
        with patch(f"{MODULE}.frappe.get_all", return_value=[]) as mocked_get_all, patch(
            f"{MODULE}.frappe.db.exists", side_effect=_doctype_exists()
        ), patch(
            f"{MODULE}.frappe.db.has_column", return_value=True
        ):
            result = held_quantity(auth_doc)
        self.assertEqual(result, 10)
        called_filters = mocked_get_all.call_args.kwargs.get("filters") or mocked_get_all.call_args[0][1]
        self.assertEqual(called_filters.get("status"), "Authorized")

    def test_approval_requires_correct_permission(self):
        draft = self._draft_doc()
        with patch(f"{MODULE}.frappe.get_roles", return_value=["Production Manager"]):
            with self.assertRaises(frappe.PermissionError):
                approve_wastage("W-1", actor="line-cook@example.com")

    def test_approval_succeeds_with_authorized_role_and_flips_status(self):
        draft = self._draft_doc()
        auth_doc = _auth_doc()

        def get_doc_dispatch(*args, **kwargs):
            if args and args[0] == "URY Issue Wastage":
                return draft
            if args and args[0] == "URY Issue Authorization":
                return auth_doc
            raise AssertionError("unexpected get_doc call")

        with patch(f"{MODULE}.frappe.get_roles", return_value=["Stock Manager"]), patch(
            f"{MODULE}.frappe.has_permission", return_value=True
        ), patch(f"{MODULE}.frappe.get_doc", side_effect=get_doc_dispatch), patch(
            f"{MODULE}.frappe.get_all", return_value=[]
        ), patch(
            f"{MODULE}.frappe.db.get_value", return_value=None
        ), patch(
            f"{MODULE}.frappe.db.exists", return_value=False
        ):
            result = approve_wastage("W-1", actor="stock-mgr@example.com")

        self.assertEqual(result.status, "Authorized")
        # No BOM, no last_purchase_rate and no warehouse to read an incoming
        # rate from -> the cascade resolves nothing and the row stays flagged
        # as an estimate rather than inventing a number.
        self.assertEqual(result.valuation_amount, 0)
        self.assertEqual(result.valuation_is_estimated, 1)
        # No disposition on an Issue-Authorization-sourced row -> posts nothing,
        # exactly as before this module learned to post at all.
        self.assertIsNone(result.get("stock_entry"))
        result.save.assert_called_once()

    def test_reject_wastage_leaves_status_rejected(self):
        draft = self._draft_doc()
        with patch(f"{MODULE}.frappe.get_roles", return_value=["Stock Manager"]), patch(
            f"{MODULE}.frappe.has_permission", return_value=True
        ), patch(f"{MODULE}.frappe.get_doc", return_value=draft):
            result = reject_wastage("W-1", actor="stock-mgr@example.com")

        self.assertEqual(result.status, "Rejected")


class TestValuationHook(FrappeTestCase):
    def setUp(self):
        # capture_wastage() calls frappe.utils.now(), which otherwise
        # chains into get_system_settings() -> get_cached_doc("System
        # Settings") -- a real DB/cache path these unit tests do not
        # stub. Fix the clock instead of routing that lookup through
        # the get_doc mocks below.
        now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
        now_patcher.start()
        self.addCleanup(now_patcher.stop)

    def test_valuation_hook_computes_qty_times_rate(self):
        doc = frappe._dict({"wasted_qty": 4, "valuation_rate": None})
        amount = compute_wastage_valuation(doc, valuation_rate=2.5)
        self.assertEqual(amount, 10.0)
        self.assertEqual(doc.valuation_rate, 2.5)
        self.assertEqual(doc.valuation_amount, 10.0)
        # An explicitly passed rate short-circuits the cascade and is treated
        # as an estimate: it did not come from the stock ledger.
        self.assertEqual(doc.valuation_is_estimated, 1)

    # -- Item 9 acceptance criterion 5: real BOM -> last_purchase_rate ->
    # get_incoming_rate cascade, with valuation_is_estimated set per source.

    def _doc(self, **values):
        base = {
            "wasted_qty": 2,
            "component_item": "COMP-1",
            "warehouse": "Kitchen - CA",
            "company": "Company A",
        }
        base.update(values)
        return frappe._dict(base)

    def test_valuation_resolves_from_active_bom_first(self):
        doc = self._doc()
        with patch(
            f"{MODULE}.frappe.get_all",
            return_value=[{"name": "BOM-1", "total_cost": 50, "quantity": 5}],
        ), patch(f"{MODULE}.frappe.db.get_value", return_value=999) as last_purchase:
            amount = compute_wastage_valuation(doc)

        self.assertEqual(doc.valuation_rate, 10.0)  # 50 / 5
        self.assertEqual(amount, 20.0)  # 10 * qty 2
        # BOM cost is derived, not a ledger rate -> still an estimate.
        self.assertEqual(doc.valuation_is_estimated, 1)
        last_purchase.assert_not_called()

    def test_valuation_falls_back_to_last_purchase_rate(self):
        doc = self._doc()
        with patch(f"{MODULE}.frappe.get_all", return_value=[]), patch(
            f"{MODULE}.frappe.db.get_value", return_value=7.5
        ), patch(f"{MODULE}._incoming_rate") as incoming:
            amount = compute_wastage_valuation(doc)

        self.assertEqual(doc.valuation_rate, 7.5)
        self.assertEqual(amount, 15.0)
        self.assertEqual(doc.valuation_is_estimated, 1)
        incoming.assert_not_called()

    def test_valuation_falls_back_to_incoming_rate_and_is_not_estimated(self):
        doc = self._doc()
        with patch(f"{MODULE}.frappe.get_all", return_value=[]), patch(
            f"{MODULE}.frappe.db.get_value", return_value=0
        ), patch(f"{MODULE}._incoming_rate", return_value=3.25) as incoming:
            amount = compute_wastage_valuation(doc)

        self.assertEqual(doc.valuation_rate, 3.25)
        self.assertEqual(amount, 6.5)
        # get_incoming_rate IS the stock ledger's own valuation -> not an estimate.
        self.assertEqual(doc.valuation_is_estimated, 0)
        incoming.assert_called_once()

    def test_valuation_unresolved_stays_zero_and_estimated(self):
        doc = self._doc()
        with patch(f"{MODULE}.frappe.get_all", return_value=[]), patch(
            f"{MODULE}.frappe.db.get_value", return_value=None
        ), patch(f"{MODULE}._incoming_rate", return_value=0):
            amount = compute_wastage_valuation(doc)

        self.assertEqual(amount, 0)
        self.assertEqual(doc.valuation_is_estimated, 1)

    def test_incoming_rate_skipped_without_a_warehouse(self):
        from ury.ury.api.ury_wastage import _incoming_rate

        self.assertEqual(_incoming_rate("COMP-1", None, "Company A", 2), 0)


class TestListWastage(FrappeTestCase):
    def setUp(self):
        # capture_wastage() calls frappe.utils.now(), which otherwise
        # chains into get_system_settings() -> get_cached_doc("System
        # Settings") -- a real DB/cache path these unit tests do not
        # stub. Fix the clock instead of routing that lookup through
        # the get_doc mocks below.
        now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
        now_patcher.start()
        self.addCleanup(now_patcher.stop)

    def test_list_scoped_by_branch_succeeds(self):
        rows = [
            {
                "name": "W-1",
                "component_item": "COMP-1",
                "wasted_qty": 3,
                "status": "Authorized",
                "department": "DEPT-1",
                "branch": "Branch A",
                "company": "Company A",
                "valuation_rate": 2.5,
                "valuation_amount": 7.5,
            }
        ]
        with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
            f"{MODULE}.frappe.get_all", return_value=rows
        ) as mocked_get_all:
            result = list_wastage(branch="Branch A")

        self.assertEqual(result, rows)
        called_filters = mocked_get_all.call_args.kwargs.get("filters")
        self.assertEqual(called_filters, {"branch": "Branch A"})

    def test_list_fails_closed_when_branch_missing(self):
        with self.assertRaises(frappe.ValidationError):
            list_wastage(branch=None)

    def test_list_narrowed_by_department_and_date_filters(self):
        with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
            f"{MODULE}.frappe.get_all", return_value=[]
        ) as mocked_get_all:
            list_wastage(
                branch="Branch A",
                department="DEPT-1",
                from_date="2026-01-01",
                to_date="2026-01-31",
            )

        called_filters = mocked_get_all.call_args.kwargs.get("filters")
        self.assertEqual(called_filters.get("department"), "DEPT-1")
        self.assertEqual(
            called_filters.get("creation"), ["between", ["2026-01-01", "2026-01-31"]]
        )


# ---------------------------------------------------------------------------
# Item 9 -- KOT cancellation write-off capture (acceptance criteria 1, 3, 4)
# ---------------------------------------------------------------------------


def _posting_intent(components, name="INTENT-1", stock_entry="SE-MFG-1", department="DEPT-1"):
    return {
        "name": name,
        "erpnext_stock_entry": stock_entry,
        "department": department,
        "production_unit": "PU-1",
        "frozen_payload_json": json.dumps(
            {
                "kot": "KOT-1",
                "item_code": "DISH-1",
                "department": department,
                "production_unit": "PU-1",
                "components": components,
            }
        ),
    }


class TestCaptureKotCancellationWastage(FrappeTestCase):
    def setUp(self):
        now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
        now_patcher.start()
        self.addCleanup(now_patcher.stop)

    def _run(self, intents, **kwargs):
        created = []

        def get_doc(*args, **a):
            arg = args[0] if args else None
            self.assertIsInstance(arg, dict)
            doc = frappe._dict(arg)
            doc.insert = MagicMock()
            created.append(doc)
            return doc

        def get_all(doctype, **a):
            if doctype == "URY Issue Wastage":
                return []  # no prior capture for this KOT
            if doctype == "URY Fulfilment Posting Intent":
                return intents
            raise AssertionError("unexpected get_all for {0}".format(doctype))

        with patch(f"{MODULE}.frappe.get_roles", return_value=["URY Manager"]), patch(
            f"{MODULE}.frappe.has_permission", return_value=True
        ), patch(f"{MODULE}.frappe.db.exists", return_value=True), patch(
            f"{MODULE}.frappe.get_all", side_effect=get_all
        ), patch(
            f"{MODULE}.frappe.db.get_value", return_value="Nos"
        ), patch(
            f"{MODULE}.frappe.get_doc", side_effect=get_doc
        ):
            result = capture_kot_cancellation_wastage(
                kot="KOT-1", branch="Branch A", company="Company A", **kwargs
            )
        return result, created

    def test_kot_sourced_row_saves_without_an_issue_authorization(self):
        """AC 1: source_type='KOT Cancellation' + source_kot, issue_authorization null."""
        result, created = self._run(
            [_posting_intent([{"item_code": "COMP-1", "qty": 2, "s_warehouse": "Kitchen - CA"}])]
        )

        self.assertEqual(len(created), 1)
        row = created[0]
        self.assertEqual(row.source_type, "KOT Cancellation")
        self.assertEqual(row.source_kot, "KOT-1")
        self.assertIsNone(row.issue_authorization)
        self.assertIsNone(row.plan)
        self.assertEqual(row.status, "Draft")
        self.assertEqual(row.disposition, "Wastage")
        self.assertEqual(row.warehouse, "Kitchen - CA")
        row.insert.assert_called_once()
        self.assertEqual(result["derivation"], "posting_intent")

    def test_one_row_per_consumed_component_matching_the_manufacture_entry(self):
        """AC 3: one Draft row per consumed component, qtys mirroring the posting."""
        result, created = self._run(
            [
                _posting_intent(
                    [
                        {"item_code": "COMP-1", "qty": 2, "s_warehouse": "Kitchen - CA"},
                        {"item_code": "COMP-2", "qty": 0.5, "s_warehouse": "Kitchen - CA"},
                    ]
                )
            ]
        )

        self.assertEqual(len(created), 2)
        by_item = {row.component_item: row for row in created}
        self.assertEqual(by_item["COMP-1"].wasted_qty, 2)
        self.assertEqual(by_item["COMP-2"].wasted_qty, 0.5)
        for row in created:
            self.assertEqual(row.source_kot, "KOT-1")
            audit = json.loads(row.audit_log)
            self.assertEqual(audit[0]["derivation"], "posting_intent")
            self.assertEqual(audit[0]["manufacture_stock_entry"], "SE-MFG-1")

    def test_components_aggregate_across_multiple_posted_intents(self):
        result, created = self._run(
            [
                _posting_intent(
                    [{"item_code": "COMP-1", "qty": 2, "s_warehouse": "Kitchen - CA"}],
                    name="INTENT-1",
                ),
                _posting_intent(
                    [{"item_code": "COMP-1", "qty": 3, "s_warehouse": "Kitchen - CA"}],
                    name="INTENT-2",
                ),
            ]
        )
        self.assertEqual(len(created), 1)
        self.assertEqual(created[0].wasted_qty, 5)

    def test_nothing_posted_and_no_bom_context_captures_nothing(self):
        """AC 4 (mechanism): a KOT that consumed nothing produces no rows."""
        with patch(f"{MODULE}._consumption_from_bom", return_value=[]):
            result, created = self._run([])
        self.assertEqual(created, [])
        self.assertEqual(result["created"], [])

    def test_recapture_is_idempotent(self):
        def get_all(doctype, **a):
            if doctype == "URY Issue Wastage":
                return ["W-EXISTING"]
            raise AssertionError("must not reach the consumption query")

        with patch(f"{MODULE}.frappe.get_roles", return_value=["URY Manager"]), patch(
            f"{MODULE}.frappe.has_permission", return_value=True
        ), patch(f"{MODULE}.frappe.db.exists", return_value=True), patch(
            f"{MODULE}.frappe.get_all", side_effect=get_all
        ):
            result = capture_kot_cancellation_wastage(
                kot="KOT-1", branch="Branch A", company="Company A"
            )

        self.assertTrue(result["idempotent_replay"])
        self.assertEqual(result["created"], [])
        self.assertEqual(result["existing"], ["W-EXISTING"])

    def test_pos_manager_role_may_capture_but_unrelated_role_may_not(self):
        """The floor manager who confirms the cancellation can capture the Draft."""
        with patch(f"{MODULE}.frappe.get_roles", return_value=["Stock User"]):
            with self.assertRaises(frappe.PermissionError):
                capture_kot_cancellation_wastage(kot="KOT-1")

    def test_unknown_disposition_fails_closed(self):
        with patch(f"{MODULE}.frappe.get_roles", return_value=["URY Manager"]), patch(
            f"{MODULE}.frappe.has_permission", return_value=True
        ):
            with self.assertRaises(frappe.ValidationError):
                capture_kot_cancellation_wastage(kot="KOT-1", disposition="Eaten By Chef")


# ---------------------------------------------------------------------------
# Item 9 -- Stock Entry posting on approval (acceptance criteria 6, 7, 8, 9)
# ---------------------------------------------------------------------------


class TestWastageStockPosting(FrappeTestCase):
    def setUp(self):
        now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
        now_patcher.start()
        self.addCleanup(now_patcher.stop)

    def _kot_draft(self, **values):
        doc = frappe._dict(
            {
                "name": "W-KOT-1",
                "source_type": "KOT Cancellation",
                "source_kot": "KOT-1",
                "issue_authorization": None,
                "plan": None,
                "branch": "Branch A",
                "company": "Company A",
                "department": None,
                "component_item": "COMP-1",
                "warehouse": "Kitchen - CA",
                "status": "Draft",
                "wasted_qty": 2,
                "valuation_rate": 5,
                "disposition": "Wastage",
                "stock_entry": None,
                "audit_log": None,
            }
        )
        doc.update(values)
        doc.save = MagicMock()
        return doc

    def _branch_config(self, account="Wastage Expense - CA", cost_center="Main - CA"):
        def get_value(doctype, name, fieldname, *a, **kw):
            if doctype == "Branch" and fieldname in (
                "wastage_expense_account",
                "damage_expense_account",
                "staff_meal_expense_account",
            ):
                return account
            if doctype == "Branch" and fieldname == "wastage_cost_center":
                return cost_center
            return None

        return get_value

    def _approve(self, draft, get_value, submitted):
        def get_doc(*args, **kwargs):
            arg = args[0] if args else None
            if arg == "URY Issue Wastage":
                return draft
            if isinstance(arg, dict) and arg.get("doctype") == "Stock Entry":
                entry = frappe._dict(arg)
                entry.name = "SE-WASTE-1"
                entry.insert = MagicMock()
                entry.submit = MagicMock(side_effect=lambda: submitted.append(entry))
                return entry
            raise AssertionError("unexpected get_doc: {0}".format(arg))

        with patch(f"{MODULE}.frappe.get_roles", return_value=["Stock Manager"]), patch(
            f"{MODULE}.frappe.has_permission", return_value=True
        ), patch(f"{MODULE}.frappe.get_doc", side_effect=get_doc), patch(
            f"{MODULE}.frappe.get_all", return_value=[]
        ), patch(
            f"{MODULE}.frappe.db.get_value", side_effect=get_value
        ), patch(
            f"{MODULE}._incoming_rate", return_value=5
        ):
            return approve_wastage("W-KOT-1", actor="stock-mgr@example.com")

    def test_approval_posts_exactly_one_material_issue_with_configured_account(self):
        """AC 6: one submitted Material Issue, linked, on the configured account/cc."""
        draft = self._kot_draft()
        submitted = []
        result = self._approve(draft, self._branch_config(), submitted)

        self.assertEqual(result.status, "Authorized")
        self.assertEqual(result.stock_entry, "SE-WASTE-1")
        self.assertEqual(len(submitted), 1)
        entry = submitted[0]
        self.assertEqual(entry.stock_entry_type, "Material Issue")
        self.assertEqual(entry.purpose, "Material Issue")
        self.assertEqual(len(entry["items"]), 1)
        item = entry["items"][0]
        self.assertEqual(item["item_code"], "COMP-1")
        self.assertEqual(item["qty"], 2)
        self.assertEqual(item["s_warehouse"], "Kitchen - CA")
        self.assertEqual(item["expense_account"], "Wastage Expense - CA")
        self.assertEqual(item["cost_center"], "Main - CA")
        entry.insert.assert_called_once()

    def test_damaged_disposition_also_posts(self):
        draft = self._kot_draft(disposition="Damaged")
        submitted = []
        result = self._approve(draft, self._branch_config(), submitted)
        self.assertEqual(result.stock_entry, "SE-WASTE-1")
        self.assertEqual(len(submitted), 1)

    def test_replated_disposition_posts_nothing(self):
        """AC 9: Re-plated leaves stock in place."""
        draft = self._kot_draft(disposition="Re-plated")
        submitted = []
        result = self._approve(draft, self._branch_config(), submitted)

        self.assertEqual(result.status, "Authorized")
        self.assertIsNone(result.get("stock_entry"))
        self.assertEqual(submitted, [])

    def test_approval_fails_closed_when_expense_account_unconfigured(self):
        """AC 7: named, actionable message; row is NOT left Authorized."""
        draft = self._kot_draft()
        submitted = []
        with self.assertRaises(frappe.ValidationError) as ctx:
            self._approve(draft, self._branch_config(account=None), submitted)

        message = str(ctx.exception)
        self.assertIn("Branch A", message)
        self.assertIn("Wastage Expense Account", message)
        self.assertEqual(submitted, [])
        self.assertEqual(draft.status, "Draft")
        draft.save.assert_not_called()

    def test_approval_fails_closed_when_cost_center_unconfigured(self):
        draft = self._kot_draft()
        submitted = []
        with self.assertRaises(frappe.ValidationError) as ctx:
            self._approve(draft, self._branch_config(cost_center=None), submitted)

        message = str(ctx.exception)
        self.assertIn("Branch A", message)
        self.assertIn("Wastage Cost Center", message)
        self.assertEqual(draft.status, "Draft")

    def test_account_resolution_never_infers_by_name(self):
        """AC 7: no LIKE '%Wastage%' inference anywhere in the implementation."""
        import ast
        import inspect

        from ury.ury.api import ury_wastage

        source = inspect.getsource(ury_wastage)
        # Strip every docstring, so the module's own prose EXPLAINING that it
        # does not do name inference cannot make this assertion pass or fail.
        tree = ast.parse(source)
        for node in ast.walk(tree):
            if isinstance(node, (ast.Module, ast.FunctionDef, ast.ClassDef)) and ast.get_docstring(
                node
            ):
                node.body = node.body[1:] or [ast.Pass()]
        code = ast.dump(ast.fix_missing_locations(tree))

        for forbidden in ("%Wastage%", "%Damage%", "%Damaged%", " like ", " LIKE "):
            self.assertNotIn(forbidden, code)
        # No raw SQL at all in this module -- account resolution is
        # frappe.db.get_value on named Branch fields, nothing else.
        self.assertNotIn("attr='sql'", code)

    def test_reversing_a_posted_row_cancels_its_stock_entry(self):
        """AC 8: no orphan submitted entries."""
        posted = self._kot_draft(status="Authorized", stock_entry="SE-WASTE-1")
        entry = frappe._dict({"name": "SE-WASTE-1", "docstatus": 1})
        entry.cancel = MagicMock()

        def get_doc(*args, **kwargs):
            if args and args[0] == "URY Issue Wastage":
                return posted
            if args and args[0] == "Stock Entry":
                return entry
            raise AssertionError("unexpected get_doc")

        with patch(f"{MODULE}.frappe.get_roles", return_value=["Stock Manager"]), patch(
            f"{MODULE}.frappe.has_permission", return_value=True
        ), patch(f"{MODULE}.frappe.get_doc", side_effect=get_doc):
            result = reverse_wastage("W-KOT-1", actor="stock-mgr@example.com")

        self.assertEqual(result.status, "Rejected")
        entry.cancel.assert_called_once()
        audit = json.loads(result.audit_log)
        self.assertEqual(audit[-1]["event"], "reversed")
        self.assertEqual(audit[-1]["cancelled_stock_entry"], "SE-WASTE-1")

    def test_reverse_refuses_a_draft_row(self):
        draft = self._kot_draft()
        with patch(f"{MODULE}.frappe.get_roles", return_value=["Stock Manager"]), patch(
            f"{MODULE}.frappe.has_permission", return_value=True
        ), patch(f"{MODULE}.frappe.get_doc", return_value=draft):
            with self.assertRaises(frappe.ValidationError):
                reverse_wastage("W-KOT-1", actor="stock-mgr@example.com")

    def test_rejecting_an_unposted_draft_cancels_nothing(self):
        draft = self._kot_draft()
        with patch(f"{MODULE}.frappe.get_roles", return_value=["Stock Manager"]), patch(
            f"{MODULE}.frappe.has_permission", return_value=True
        ), patch(f"{MODULE}.frappe.get_doc", return_value=draft) as get_doc:
            result = reject_wastage("W-KOT-1", actor="stock-mgr@example.com")

        self.assertEqual(result.status, "Rejected")
        self.assertIsNone(result.get("stock_entry"))
        self.assertEqual(get_doc.call_count, 1)

    def test_resolve_posting_accounts_rejects_a_non_posting_disposition(self):
        with self.assertRaises(frappe.ValidationError):
            resolve_posting_accounts("Branch A", "Re-plated")

    def test_posting_fails_closed_without_a_warehouse(self):
        draft = self._kot_draft(warehouse=None)
        submitted = []
        with self.assertRaises(frappe.ValidationError) as ctx:
            self._approve(draft, self._branch_config(), submitted)
        self.assertIn("warehouse", str(ctx.exception))
        self.assertEqual(draft.status, "Draft")


# ---------------------------------------------------------------------------
# Item 9, acceptance criteria 10 and 12 -- blast-radius containment.
# ---------------------------------------------------------------------------


class TestWastageGeneralisationBlastRadius(FrappeTestCase):
    def _report(self):
        import json as _json
        import os

        path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "report",
            "wastage_and_damage_report",
            "wastage_and_damage_report.json",
        )
        with open(path) as handle:
            return _json.load(handle)

    def test_report_returns_kot_sourced_rows_with_a_null_department(self):
        """AC 10: the existing report keeps working, unmodified.

        A KOT-sourced row has `department` NULL. The report's department
        filter is optional and short-circuits on NULL/'' BEFORE comparing, so
        an unfiltered run returns those rows and a filtered run simply does
        not match them -- neither path errors, and no row is dropped by the
        mandatory predicates (branch/captured_on are set on every KOT row).
        """
        query = self._report()["query"]
        self.assertIn(
            "(%(department)s IS NULL OR %(department)s = '' OR w.department = %(department)s)",
            query,
        )
        # Nothing the report selects was removed or renamed by this change.
        for column in (
            "w.component_item",
            "w.department",
            "w.wasted_qty",
            "w.reason_category",
            "w.valuation_rate",
            "w.valuation_amount",
            "w.valuation_is_estimated",
            "w.status",
            "w.branch",
        ):
            self.assertIn(column, query)
        # The report is NOT narrowed to one source_type: KOT-sourced rows must
        # show up in it, which is the whole point of reusing the doctype.
        self.assertNotIn("source_type", query)

    def test_reason_category_vocabulary_is_unchanged(self):
        """Locked product-owner decision: the 5 categories are untouched."""
        import json as _json
        import os

        from ury.ury.api.ury_wastage import REASON_CATEGORIES

        expected = {"Spoilage", "Preparation Error", "Dropped/Damaged", "Expired", "Other"}
        self.assertEqual(REASON_CATEGORIES, expected)

        path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "doctype",
            "ury_issue_wastage",
            "ury_issue_wastage.json",
        )
        with open(path) as handle:
            doctype = _json.load(handle)
        field = next(f for f in doctype["fields"] if f["fieldname"] == "reason_category")
        self.assertEqual(
            field["options"], "Spoilage\nPreparation Error\nDropped/Damaged\nExpired\nOther"
        )

    def test_doctype_relaxes_the_issue_authorization_anchor(self):
        """AC 1 at the schema level: the former mandatory anchors are optional."""
        import json as _json
        import os

        path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "doctype",
            "ury_issue_wastage",
            "ury_issue_wastage.json",
        )
        with open(path) as handle:
            doctype = _json.load(handle)
        by_name = {f["fieldname"]: f for f in doctype["fields"]}

        for optional in ("issue_authorization", "plan", "department"):
            self.assertEqual(by_name[optional].get("reqd", 0), 0, optional)
        for added in ("source_type", "source_kot", "source_kot_execution", "warehouse",
                      "stock_entry", "disposition"):
            self.assertIn(added, by_name)
        # Default keeps every existing row behaving exactly as it does today.
        self.assertEqual(by_name["source_type"]["default"], "Issue Authorization")
        self.assertEqual(
            by_name["disposition"]["options"], "\nWastage\nDamaged\nStaff Meal\nRe-plated"
        )

    def test_daily_p_and_l_is_not_touched_by_this_item(self):
        """AC 12: option 1 -- wastage reaches P&L through the GL, not this doctype."""
        import inspect

        from ury.ury.doctype.ury_daily_p_and_l import ury_daily_p_and_l

        source = inspect.getsource(ury_daily_p_and_l)
        for forbidden in ("wastage", "Wastage", "URY Issue Wastage", "wastage_cost"):
            self.assertNotIn(forbidden, source)
