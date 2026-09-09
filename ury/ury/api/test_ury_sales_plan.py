from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_sales_plan import (
    _validate_plan_scope,
    freeze_approval_snapshot,
    transition_sales_plan,
    validate_plan_items,
)


class TestURYSalesPlanContract(FrappeTestCase):
    """transition_sales_plan() only checks transition legality + permission now.

    Scope checking, item validation, snapshot freezing, and audit logging moved
    to URYSalesPlan.validate() (ury/ury/doctype/ury_sales_plan/ury_sales_plan.py)
    so they fire on every status-changing save, including a Desk/Workflow-driven
    transition that never calls transition_sales_plan() at all. Those guardrails
    are exercised here as direct unit tests of the still-standalone helper
    functions instead of through transition_sales_plan().
    """

    def _doc(self, **values):
        doc = frappe._dict({"status": "Submitted for Approval", "branch": "Branch A", "company": "Company A", "plan_date": "2026-09-12", "items": [{"item_code": "MTPL", "qty": 2, "production_policy": "PRE_PRODUCED", "bom": "BOM-1"}], "insight_snapshot": {"source": "history"}})
        doc.update(values)
        return doc

    def test_transition_updates_status_when_permitted(self):
        doc = self._doc()
        with patch("ury.ury.api.ury_sales_plan.frappe.has_permission", return_value=True):
            transition_sales_plan(doc, "Approved", actor="approver@example.com")
        self.assertEqual(doc.status, "Approved")

    def test_invalid_transition_fails_closed(self):
        with self.assertRaises(frappe.ValidationError):
            transition_sales_plan(self._doc(status="Draft"), "Approved")

    def test_approval_requires_permission(self):
        with patch("ury.ury.api.ury_sales_plan.frappe.has_permission", return_value=False):
            with self.assertRaises(frappe.PermissionError):
                transition_sales_plan(self._doc(), "Approved")

    def test_validate_plan_scope_fails_closed_on_mismatch(self):
        with patch("ury.ury.api.ury_sales_plan.frappe.db.get_value", return_value="Other Company"):
            with self.assertRaises(frappe.ValidationError):
                _validate_plan_scope(self._doc())

    def test_validate_plan_items_runs_production_configuration_check(self):
        doc = self._doc()
        with patch(
            "ury.ury.api.ury_sales_plan.validate_item_production_configuration"
        ) as validate:
            validate_plan_items(doc)
        validate.assert_called_once_with("MTPL", "Branch A")

    def test_validate_plan_items_fails_closed_on_bad_mapping(self):
        doc = self._doc()
        with patch(
            "ury.ury.api.ury_sales_plan.validate_item_production_configuration",
            side_effect=frappe.ValidationError("invalid mapping"),
        ):
            with self.assertRaises(frappe.ValidationError):
                validate_plan_items(doc)
        self.assertFalse(doc.get("approval_snapshot"))

    def test_snapshot_is_immutable_once_created(self):
        doc = self._doc()
        first = freeze_approval_snapshot(doc)
        # doc is a frappe._dict (a dict subclass), so "doc.items" resolves to
        # the built-in dict.items() bound method rather than the "items"
        # field -- use item access to reach the actual field instead.
        doc["items"][0]["qty"] = 99
        self.assertEqual(freeze_approval_snapshot(doc), first)


class TestURYSalesPlanEndpoints(FrappeTestCase):
    def _ensure_company(self, company_name, abbr):
        if not frappe.db.exists("Company", company_name):
            frappe.get_doc(
                {
                    "doctype": "Company",
                    "company_name": company_name,
                    "default_currency": "INR",
                    "abbr": abbr,
                }
            ).insert()

    def _ensure_branch(self, branch_name, company):
        if not frappe.db.exists("Branch", branch_name):
            frappe.get_doc(
                {
                    "doctype": "Branch",
                    "branch": branch_name,
                    "company": company,
                    "user": [{"user": "Administrator"}],
                }
            ).insert()

    def _ensure_item(self, item_code):
        if not frappe.db.exists("Item", item_code):
            frappe.get_doc(
                {
                    "doctype": "Item",
                    "item_code": item_code,
                    "item_name": item_code,
                    "item_group": "All Item Groups",
                    "stock_uom": "Nos",
                    "is_stock_item": 1,
                }
            ).insert()

    def setUp(self):
        self.company = "Sales Plan Test Co"
        self.branch = "Sales Plan Test Branch"
        self.plan_date = "2026-09-20"
        self._ensure_company(self.company, "SPT")
        self._ensure_branch(self.branch, self.company)
        self._ensure_item("MTPL")
        frappe.db.delete(
            "URY Sales Plan",
            {"branch": self.branch, "company": self.company, "plan_date": self.plan_date},
        )

    def tearDown(self):
        frappe.db.delete(
            "URY Sales Plan",
            {"branch": self.branch, "company": self.company, "plan_date": self.plan_date},
        )

    def test_save_draft_creates_new_plan(self):
        from ury.ury.api.ury_sales_plan import save_draft

        result = save_draft(
            plan_date=self.plan_date,
            branch=self.branch,
            company=self.company,
            items=[{"item_code": "MTPL", "qty": 5}],
        )
        self.assertEqual(result["status"], "Draft")
        self.assertTrue(frappe.db.exists("URY Sales Plan", result["name"]))
        self.assertEqual(
            frappe.db.count(
                "URY Sales Plan",
                {"branch": self.branch, "company": self.company, "plan_date": self.plan_date},
            ),
            1,
        )

    def test_save_draft_updates_existing_draft_without_duplicating(self):
        from ury.ury.api.ury_sales_plan import save_draft

        first = save_draft(
            plan_date=self.plan_date,
            branch=self.branch,
            company=self.company,
            items=[{"item_code": "MTPL", "qty": 5}],
        )
        second = save_draft(
            plan_date=self.plan_date,
            branch=self.branch,
            company=self.company,
            items=[{"item_code": "MTPL", "qty": 9}],
        )
        self.assertEqual(first["name"], second["name"])
        self.assertEqual(
            frappe.db.count(
                "URY Sales Plan",
                {"branch": self.branch, "company": self.company, "plan_date": self.plan_date},
            ),
            1,
        )
        doc = frappe.get_doc("URY Sales Plan", second["name"])
        self.assertEqual(len(doc.items), 1)
        self.assertEqual(doc.items[0].qty, 9)

    def test_save_draft_rejects_mismatched_branch_company(self):
        from ury.ury.api.ury_sales_plan import save_draft

        with self.assertRaises(frappe.ValidationError):
            save_draft(
                plan_date=self.plan_date,
                branch=self.branch,
                company="Some Other Company",
                items=[],
            )

    def test_transition_plan_moves_draft_to_proposed(self):
        from ury.ury.api.ury_sales_plan import save_draft, transition_plan

        created = save_draft(
            plan_date=self.plan_date,
            branch=self.branch,
            company=self.company,
            items=[{"item_code": "MTPL", "qty": 5}],
        )
        result = transition_plan(name=created["name"], target_state="Proposed")
        self.assertEqual(result["status"], "Proposed")

    def test_transition_plan_rejects_illegal_jump(self):
        from ury.ury.api.ury_sales_plan import save_draft, transition_plan

        created = save_draft(
            plan_date=self.plan_date,
            branch=self.branch,
            company=self.company,
            items=[{"item_code": "MTPL", "qty": 5}],
        )
        with self.assertRaises(frappe.ValidationError):
            transition_plan(name=created["name"], target_state="Approved")

    def test_get_plan_returns_doc_for_permitted_user(self):
        from ury.ury.api.ury_sales_plan import get_plan, save_draft

        created = save_draft(
            plan_date=self.plan_date,
            branch=self.branch,
            company=self.company,
            items=[{"item_code": "MTPL", "qty": 5}],
        )
        result = get_plan(created["name"])
        self.assertEqual(result["name"], created["name"])
        self.assertEqual(result["status"], "Draft")

    def test_get_plan_status_returns_status_for_existing_plan(self):
        from ury.ury.api.ury_sales_plan import get_plan_status, save_draft

        created = save_draft(
            plan_date=self.plan_date,
            branch=self.branch,
            company=self.company,
            items=[{"item_code": "MTPL", "qty": 5}],
        )
        result = get_plan_status(branch=self.branch, plan_date=self.plan_date)
        self.assertEqual(result["name"], created["name"])
        self.assertEqual(result["status"], "Draft")

    def test_get_plan_status_returns_none_when_no_plan_exists(self):
        from ury.ury.api.ury_sales_plan import get_plan_status

        result = get_plan_status(branch=self.branch, plan_date="2099-01-01")
        self.assertIsNone(result["name"])
        self.assertIsNone(result["status"])
