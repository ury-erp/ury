import json
from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_issue_authorization import (
    create_issue_authorization,
    list_issue_authorizations,
    remaining_entitlement,
)


MODULE = "ury.ury.api.ury_issue_authorization"


def _demand_row(**values):
    row = {
        "component_item": "COMP-1",
        "department": "DEPT-1",
        "production_unit": None,
        "required_qty": 10,
        "stock_uom": "Nos",
        "control_mode": "HARD",
    }
    row.update(values)
    return row


def _plan_doc(**values):
    snapshot = {"demand_vector": [_demand_row()]}
    doc = frappe._dict(
        {
            "name": "PLAN-1",
            "status": "Approved",
            "branch": "Branch A",
            "company": "Company A",
            "approval_snapshot": json.dumps(snapshot),
            "approval_snapshot_hash": "hash123",
        }
    )
    doc.update(values)
    return doc


class TestURYIssueAuthorization(FrappeTestCase):
    def setUp(self):
        # append_audit() calls frappe.utils.now(), which otherwise
        # chains into get_system_settings() -> get_cached_doc("System
        # Settings") -- a real DB/cache path these unit tests do not
        # stub. Fix the clock instead of routing that lookup through
        # the get_doc mocks below.
        now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
        now_patcher.start()
        self.addCleanup(now_patcher.stop)

    def _new_doc_recorder(self):
        """Return a frappe.get_doc side_effect that records the constructed record."""
        created = {}

        def _get_doc(*args, **kwargs):
            arg = args[0] if args else kwargs.get("arg1")
            if isinstance(arg, dict):
                doc = frappe._dict(arg)
                doc.insert = MagicMock()
                created["doc"] = doc
                return doc
            # second call pattern: frappe.get_doc("URY Sales Plan", plan)
            raise AssertionError("plan lookup should be mocked separately")

        return _get_doc, created

    def test_authorizes_within_entitlement(self):
        plan_doc = _plan_doc()
        new_doc_side_effect, created = self._new_doc_recorder()

        def get_doc_dispatch(*args, **kwargs):
            if args and args[0] == "URY Sales Plan":
                return plan_doc
            return new_doc_side_effect(*args, **kwargs)

        with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
            f"{MODULE}.frappe.get_doc", side_effect=get_doc_dispatch
        ), patch(f"{MODULE}.frappe.db.get_value", return_value="Company A"), patch(
            f"{MODULE}.frappe.get_all", return_value=[]
        ), patch(
            f"{MODULE}.frappe.db.exists", return_value=False
        ):
            result = create_issue_authorization(
                plan="PLAN-1",
                department="DEPT-1",
                component_item="COMP-1",
                requested_qty=4,
                branch="Branch A",
                company="Company A",
            )

        self.assertEqual(result.authorized_qty, 4)
        self.assertEqual(result.remaining_before_qty, 10)
        self.assertEqual(result.remaining_after_qty, 6)
        self.assertEqual(result.status, "Authorized")
        audit = json.loads(result.audit_log)
        self.assertEqual(audit[0]["authorized_qty"], 4)
        result.insert.assert_called_once()

    def test_rejects_when_exceeding_remaining_entitlement(self):
        plan_doc = _plan_doc()
        # Prior authorizations already consumed 8 of the 10 required units.
        with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
            f"{MODULE}.frappe.get_doc", return_value=plan_doc
        ), patch(f"{MODULE}.frappe.db.get_value", return_value="Company A"), patch(
            f"{MODULE}.frappe.get_all", return_value=[8]
        ), patch(
            f"{MODULE}.frappe.db.exists", return_value=False
        ):
            with self.assertRaises(frappe.ValidationError):
                create_issue_authorization(
                    plan="PLAN-1",
                    department="DEPT-1",
                    component_item="COMP-1",
                    requested_qty=5,
                    branch="Branch A",
                    company="Company A",
                )

    def test_exact_demand_never_exceeds_required_qty_across_authorizations(self):
        # Two sequential authorizations must never let authorized total exceed
        # required_qty=10: first takes 6, second attempts 5 (would total 11).
        plan_doc = _plan_doc()
        new_doc_side_effect, created = self._new_doc_recorder()

        def get_doc_dispatch(*args, **kwargs):
            if args and args[0] == "URY Sales Plan":
                return plan_doc
            return new_doc_side_effect(*args, **kwargs)

        with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
            f"{MODULE}.frappe.get_doc", side_effect=get_doc_dispatch
        ), patch(f"{MODULE}.frappe.db.get_value", return_value="Company A"), patch(
            f"{MODULE}.frappe.get_all", return_value=[]
        ), patch(
            f"{MODULE}.frappe.db.exists", return_value=False
        ):
            first = create_issue_authorization(
                plan="PLAN-1",
                department="DEPT-1",
                component_item="COMP-1",
                requested_qty=6,
                branch="Branch A",
                company="Company A",
            )
        self.assertEqual(first.remaining_after_qty, 4)

        with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
            f"{MODULE}.frappe.get_doc", return_value=plan_doc
        ), patch(f"{MODULE}.frappe.db.get_value", return_value="Company A"), patch(
            f"{MODULE}.frappe.get_all", return_value=[6]
        ), patch(
            f"{MODULE}.frappe.db.exists", return_value=False
        ):
            with self.assertRaises(frappe.ValidationError):
                create_issue_authorization(
                    plan="PLAN-1",
                    department="DEPT-1",
                    component_item="COMP-1",
                    requested_qty=5,
                    branch="Branch A",
                    company="Company A",
                )

    def test_rejects_unapproved_plan(self):
        plan_doc = _plan_doc(status="Draft")
        with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
            f"{MODULE}.frappe.get_doc", return_value=plan_doc
        ):
            with self.assertRaises(frappe.ValidationError):
                create_issue_authorization(
                    plan="PLAN-1",
                    department="DEPT-1",
                    component_item="COMP-1",
                    requested_qty=1,
                    branch="Branch A",
                    company="Company A",
                )

    def test_rejects_plan_missing_approval_snapshot(self):
        plan_doc = _plan_doc(approval_snapshot=None, approval_snapshot_hash=None)
        with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
            f"{MODULE}.frappe.get_doc", return_value=plan_doc
        ):
            with self.assertRaises(frappe.ValidationError):
                create_issue_authorization(
                    plan="PLAN-1",
                    department="DEPT-1",
                    component_item="COMP-1",
                    requested_qty=1,
                    branch="Branch A",
                    company="Company A",
                )

    def test_branch_mismatch_fails_closed(self):
        plan_doc = _plan_doc()
        with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
            f"{MODULE}.frappe.get_doc", return_value=plan_doc
        ):
            with self.assertRaises(frappe.ValidationError):
                create_issue_authorization(
                    plan="PLAN-1",
                    department="DEPT-1",
                    component_item="COMP-1",
                    requested_qty=1,
                    branch="Branch B",
                    company="Company A",
                )

    def test_company_scope_ambiguity_fails_closed(self):
        # Branch's own company record disagrees with the plan's company.
        plan_doc = _plan_doc()
        with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
            f"{MODULE}.frappe.get_doc", return_value=plan_doc
        ), patch(f"{MODULE}.frappe.db.get_value", return_value="Other Company"):
            with self.assertRaises(frappe.ValidationError):
                create_issue_authorization(
                    plan="PLAN-1",
                    department="DEPT-1",
                    component_item="COMP-1",
                    requested_qty=1,
                    branch="Branch A",
                    company="Company A",
                )

    def test_permission_check_blocks_unauthorized_actor(self):
        with patch(f"{MODULE}.frappe.has_permission", return_value=False):
            with self.assertRaises(frappe.PermissionError):
                create_issue_authorization(
                    plan="PLAN-1",
                    department="DEPT-1",
                    component_item="COMP-1",
                    requested_qty=1,
                    branch="Branch A",
                    company="Company A",
                )

    def test_missing_frozen_demand_fails_closed(self):
        plan_doc = _plan_doc()
        with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
            f"{MODULE}.frappe.get_doc", return_value=plan_doc
        ), patch(f"{MODULE}.frappe.db.get_value", return_value="Company A"):
            with self.assertRaises(frappe.ValidationError):
                create_issue_authorization(
                    plan="PLAN-1",
                    department="DEPT-1",
                    component_item="COMP-UNKNOWN",
                    requested_qty=1,
                    branch="Branch A",
                    company="Company A",
                )


class TestListIssueAuthorizations(FrappeTestCase):
    def setUp(self):
        # append_audit() calls frappe.utils.now(), which otherwise
        # chains into get_system_settings() -> get_cached_doc("System
        # Settings") -- a real DB/cache path these unit tests do not
        # stub. Fix the clock instead of routing that lookup through
        # the get_doc mocks below.
        now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
        now_patcher.start()
        self.addCleanup(now_patcher.stop)

    def test_lists_records_scoped_by_branch(self):
        rows = [
            {
                "name": "IA-1",
                "plan": "PLAN-1",
                "component_item": "COMP-1",
                "department": "DEPT-1",
                "authorized_qty": 4,
                "required_qty": 10,
                "remaining_after_qty": 6,
                "status": "Authorized",
                "branch": "Branch A",
                "company": "Company A",
                "production_unit": None,
                "stock_uom": "Nos",
                "creation": "2026-08-28 00:00:00",
            }
        ]
        with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
            f"{MODULE}.frappe.get_all", return_value=rows
        ) as get_all:
            result = list_issue_authorizations(branch="Branch A")

        self.assertEqual(result, rows)
        _, kwargs = get_all.call_args
        self.assertEqual(kwargs["filters"], {"branch": "Branch A"})

    def test_missing_branch_fails_closed(self):
        with self.assertRaises(frappe.ValidationError):
            list_issue_authorizations(branch=None)

    def test_optional_department_and_date_filters_narrow_results(self):
        with patch(f"{MODULE}.frappe.has_permission", return_value=True), patch(
            f"{MODULE}.frappe.get_all", return_value=[]
        ) as get_all:
            list_issue_authorizations(
                branch="Branch A",
                department="DEPT-1",
                from_date="2026-08-01",
                to_date="2026-08-31",
            )

        _, kwargs = get_all.call_args
        self.assertEqual(
            kwargs["filters"],
            {
                "branch": "Branch A",
                "department": "DEPT-1",
                "creation": ["between", ["2026-08-01", "2026-08-31"]],
            },
        )


class TestRemainingEntitlementFormula(FrappeTestCase):
    def setUp(self):
        # append_audit() calls frappe.utils.now(), which otherwise
        # chains into get_system_settings() -> get_cached_doc("System
        # Settings") -- a real DB/cache path these unit tests do not
        # stub. Fix the clock instead of routing that lookup through
        # the get_doc mocks below.
        now_patcher = patch(f"{MODULE}.frappe.utils.now", return_value="2024-01-01 00:00:00")
        now_patcher.start()
        self.addCleanup(now_patcher.stop)

    def test_formula_matches_v3_30_contract(self):
        self.assertEqual(remaining_entitlement(10, 4, 1, 2), 5)

    def test_formula_floors_at_zero(self):
        self.assertEqual(remaining_entitlement(10, 12, 0, 0), 0)


# ---------------------------------------------------------------------------
# Item 9, acceptance criterion 2 -- THE regression guard.
#
# `URY Issue Wastage` became a shared doctype: it now also carries POS
# KOT-cancellation write-off rows (`source_type = "KOT Cancellation"`), which
# have no `plan`, no `issue_authorization` and often no `department`. Those
# rows must be COMPLETELY INVISIBLE to issue entitlement. If even one of them
# leaked into `prior_quantities()` or `held_quantity()`, every customer
# cancellation would silently shrink the kitchen's material budget for that
# item -- a regression that would be invisible until a department ran out of
# entitlement it should have had.
#
# These tests prove the exclusion by running the SAME scope twice, once
# without KOT-sourced rows and once with them present in the identical
# branch/company/item scope, and asserting byte-identical results.
# ---------------------------------------------------------------------------


class TestKotSourcedWastageIsInvisibleToEntitlement(FrappeTestCase):
    SCOPE = {
        "plan": "PLAN-1",
        "department": "DEPT-1",
        "branch": "Branch A",
        "company": "Company A",
        "component_item": "COMP-1",
    }

    def _prior(self, wastage_rows, has_source_type_column=True):
        """Run prior_quantities() with `wastage_rows` as the live wastage table."""
        from ury.ury.api.ury_issue_authorization import prior_quantities

        def get_all(doctype, **kwargs):
            if doctype == "URY Issue Authorization":
                return [4]  # pluck: one prior authorization of 4
            if doctype == "URY Issue Wastage":
                return wastage_rows
            raise AssertionError("unexpected get_all for {0}".format(doctype))

        def exists(doctype, name=None, *a, **kw):
            # "URY Issue Return" absent, "URY Issue Wastage" present.
            return name != "URY Issue Return" if doctype == "DocType" else True

        with patch(f"{MODULE}.frappe.get_all", side_effect=get_all), patch(
            f"{MODULE}.frappe.db.exists", side_effect=exists
        ), patch(
            f"{MODULE}.frappe.db.has_column", return_value=has_source_type_column
        ):
            return prior_quantities(**self.SCOPE)

    def test_prior_quantities_byte_identical_with_kot_rows_present(self):
        issue_rows = [
            {"name": "W-1", "wasted_qty": 3, "source_type": "Issue Authorization"},
            {"name": "W-2", "wasted_qty": 1.5, "source_type": "Issue Authorization"},
        ]
        kot_rows = [
            # Same branch/company/component_item scope, deliberately large so
            # any leak would be unmissable.
            {"name": "W-KOT-1", "wasted_qty": 100, "source_type": "KOT Cancellation"},
            {"name": "W-KOT-2", "wasted_qty": 250, "source_type": "KOT Cancellation"},
        ]

        without_kot = self._prior(list(issue_rows))
        with_kot = self._prior(issue_rows + kot_rows)

        self.assertEqual(without_kot, with_kot)
        self.assertEqual(with_kot["wasted_qty"], 4.5)
        self.assertEqual(with_kot["authorized_qty"], 4)

    def test_only_kot_rows_present_means_zero_wasted(self):
        result = self._prior(
            [
                {"name": "W-KOT-1", "wasted_qty": 100, "source_type": "KOT Cancellation"},
                {"name": "W-KOT-2", "wasted_qty": 7, "source_type": "KOT Cancellation"},
            ]
        )
        self.assertEqual(result["wasted_qty"], 0)

    def test_legacy_rows_with_null_source_type_still_count(self):
        """The other direction of the same regression.

        Rows written before `source_type` existed have NULL in that column on
        a bench where the doctype migrated but the backfill patch has not run.
        A naive SQL `source_type = 'Issue Authorization'` filter would silently
        DROP them and inflate entitlement. They must keep counting.
        """
        rows = [
            {"name": "W-LEGACY-1", "wasted_qty": 3, "source_type": None},
            {"name": "W-LEGACY-2", "wasted_qty": 2, "source_type": ""},
            {"name": "W-KOT-1", "wasted_qty": 100, "source_type": "KOT Cancellation"},
        ]
        self.assertEqual(self._prior(rows)["wasted_qty"], 5)

    def test_unmigrated_schema_without_the_column_counts_every_row(self):
        """On a bench with no `source_type` column at all, nothing is dropped."""
        rows = [{"name": "W-LEGACY-1", "wasted_qty": 3}, {"name": "W-LEGACY-2", "wasted_qty": 2}]
        self.assertEqual(
            self._prior(rows, has_source_type_column=False)["wasted_qty"], 5
        )

    def test_held_quantity_byte_identical_with_kot_rows_present(self):
        from ury.ury.api.ury_wastage import held_quantity

        auth_doc = frappe._dict(
            {"name": "AUTH-1", "component_item": "COMP-1", "authorized_qty": 10}
        )
        issue_rows = [{"name": "W-1", "wasted_qty": 3, "source_type": "Issue Authorization"}]
        kot_rows = [{"name": "W-KOT-1", "wasted_qty": 500, "source_type": "KOT Cancellation"}]

        def run(rows):
            def get_all(doctype, **kwargs):
                if doctype == "URY Issue Wastage":
                    return rows
                raise AssertionError("unexpected get_all for {0}".format(doctype))

            # `ury_wastage.frappe` and `ury_issue_authorization.frappe` are the
            # same module object, so these must be ONE doctype-aware stub --
            # patching the "two" paths separately would just have the last one
            # win for both callers. "URY Issue Return" is absent; the wastage
            # doctype is present.
            def exists(doctype, name=None, *a, **kw):
                return doctype == "DocType" and name == "URY Issue Wastage"

            with patch(f"{MODULE}.frappe.get_all", side_effect=get_all), patch(
                f"{MODULE}.frappe.db.exists", side_effect=exists
            ), patch(
                f"{MODULE}.frappe.db.has_column", return_value=True
            ):
                return held_quantity(auth_doc)

        without_kot = run(list(issue_rows))
        with_kot = run(issue_rows + kot_rows)

        self.assertEqual(without_kot, with_kot)
        self.assertEqual(with_kot, 7)  # 10 authorized - 3 genuinely wasted

    def test_exclude_wastage_still_works_alongside_the_source_guard(self):
        from ury.ury.api.ury_issue_authorization import sum_issue_sourced_wastage

        rows = [
            {"name": "W-1", "wasted_qty": 3, "source_type": "Issue Authorization"},
            {"name": "W-2", "wasted_qty": 4, "source_type": "Issue Authorization"},
            {"name": "W-KOT-1", "wasted_qty": 99, "source_type": "KOT Cancellation"},
        ]
        with patch(f"{MODULE}.frappe.get_all", return_value=rows), patch(
            f"{MODULE}.frappe.db.exists", return_value=True
        ), patch(f"{MODULE}.frappe.db.has_column", return_value=True):
            self.assertEqual(
                sum_issue_sourced_wastage({}, "wasted_qty", exclude_name="W-2"), 3
            )

    def test_wastage_query_never_sends_a_null_unsafe_source_type_predicate(self):
        """The guard must not become a SQL filter: NULL would break both ways."""
        from ury.ury.api.ury_issue_authorization import sum_issue_sourced_wastage

        with patch(f"{MODULE}.frappe.get_all", return_value=[]) as get_all, patch(
            f"{MODULE}.frappe.db.exists", return_value=True
        ), patch(f"{MODULE}.frappe.db.has_column", return_value=True):
            sum_issue_sourced_wastage(dict(self.SCOPE), "wasted_qty")

        sent_filters = get_all.call_args.kwargs["filters"]
        self.assertNotIn("source_type", sent_filters)
        self.assertIn("source_type", get_all.call_args.kwargs["fields"])
