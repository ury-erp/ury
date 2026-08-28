from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_sales_plan import freeze_approval_snapshot, transition_sales_plan


class TestURYSalesPlanContract(FrappeTestCase):
    def _doc(self, **values):
        doc = frappe._dict({"status": "Submitted for Approval", "branch": "Branch A", "company": "Company A", "plan_date": "2026-09-12", "items": [{"item_code": "ITEM-1", "qty": 2, "production_policy": "PRE_PRODUCED", "bom": "BOM-1"}], "insight_snapshot": {"source": "history"}})
        doc.update(values)
        return doc

    def test_approval_freezes_deterministic_snapshot(self):
        doc = self._doc()
        with patch("ury.ury.api.ury_sales_plan.frappe.has_permission", return_value=True), patch(
            "ury.ury.api.ury_sales_plan.frappe.db.get_value", return_value="Company A"
        ), patch(
            "ury.ury.api.ury_sales_plan.validate_item_production_configuration"
        ) as validate:
            transition_sales_plan(doc, "Approved", actor="approver@example.com")
        validate.assert_called_once_with("ITEM-1", "Branch A")
        self.assertTrue(doc.approval_snapshot_hash)
        self.assertEqual(doc.status, "Approved")
        self.assertEqual(doc.audit_log[0]["to_state"], "Approved")

    def test_invalid_transition_fails_closed(self):
        with self.assertRaises(frappe.ValidationError):
            transition_sales_plan(self._doc(status="Draft"), "Approved")

    def test_approval_requires_permission(self):
        with patch("ury.ury.api.ury_sales_plan.frappe.has_permission", return_value=False):
            with self.assertRaises(frappe.PermissionError):
                transition_sales_plan(self._doc(), "Approved")

    def test_branch_company_mismatch_fails_closed(self):
        with patch("ury.ury.api.ury_sales_plan.frappe.has_permission", return_value=True), patch(
            "ury.ury.api.ury_sales_plan.frappe.db.get_value", return_value="Other Company"
        ):
            with self.assertRaises(frappe.ValidationError):
                transition_sales_plan(self._doc(), "Approved")

    def test_item_validation_runs_before_approval(self):
        doc = self._doc()
        with patch("ury.ury.api.ury_sales_plan.frappe.has_permission", return_value=True), patch(
            "ury.ury.api.ury_sales_plan.frappe.db.get_value", return_value="Company A"
        ), patch(
            "ury.ury.api.ury_sales_plan.validate_item_production_configuration",
            side_effect=frappe.ValidationError("invalid mapping"),
        ):
            with self.assertRaises(frappe.ValidationError):
                transition_sales_plan(doc, "Approved")
        self.assertFalse(doc.get("approval_snapshot"))

    def test_snapshot_is_immutable_once_created(self):
        doc = self._doc()
        first = freeze_approval_snapshot(doc)
        # doc is a frappe._dict (a dict subclass), so "doc.items" resolves to
        # the built-in dict.items() bound method rather than the "items"
        # field -- use item access to reach the actual field instead.
        doc["items"][0]["qty"] = 99
        self.assertEqual(freeze_approval_snapshot(doc), first)
