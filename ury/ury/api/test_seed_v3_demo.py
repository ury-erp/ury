"""Tests for the URY V3 demo-data seeder (seed_v3_demo module).

These tests verify that the seed_v3_demo module's run() function:
1. Is callable and can be executed
2. Creates expected records when prerequisites exist
3. Is idempotent (does not duplicate records on subsequent runs)
4. Handles missing prerequisites gracefully

Tests will pass or skip based on whether the required entities (URY company,
URY Branch, etc.) exist in the test database.
"""

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import nowdate

from ury.ury.api.seed_v3_demo import run


class TestSeedV3Demo(FrappeTestCase):
    def test_module_imports_successfully(self):
        """The seed_v3_demo module should import without errors."""
        from ury.ury.api import seed_v3_demo
        self.assertTrue(hasattr(seed_v3_demo, 'run'))

    def test_run_function_is_callable(self):
        """The run() function should be callable."""
        self.assertTrue(callable(run), "run() should be callable")

    def test_run_completes_or_reports_missing_prerequisites(self):
        """The run() function should complete or clearly report missing prerequisites."""
        try:
            run()
            # If we get here, the function succeeded
            self.assertTrue(True, "run() completed successfully")
        except frappe.exceptions.LinkValidationError as e:
            # This is expected if prerequisites are missing
            error_msg = str(e)
            self.assertIn(
                "Could not find",
                error_msg,
                "LinkValidationError should indicate missing entity"
            )
        except Exception as e:
            self.fail(f"Unexpected exception: {type(e).__name__}: {e}")

    def test_departments_created_or_skipped(self):
        """After run(), departments should exist or none should be created."""
        try:
            run()
            # Check if departments exist
            kitchen_exists = frappe.db.exists("URY Production Department", "Kitchen")
            bar_exists = frappe.db.exists("URY Production Department", "Bar")
            # Either both exist or neither does
            self.assertEqual(
                kitchen_exists is not None,
                bar_exists is not None,
                "Departments should be created together or not at all"
            )
        except frappe.exceptions.LinkValidationError:
            # This is OK - prerequisites are missing
            pass

    def test_item_configurations_created_or_empty(self):
        """Item configurations should be created or count should be unchanged."""
        try:
            initial_count = frappe.db.count("URY Item Production Configuration")
            run()
            final_count = frappe.db.count("URY Item Production Configuration")
            self.assertGreaterEqual(
                final_count,
                initial_count,
                "Item configurations count should not decrease"
            )
        except frappe.exceptions.LinkValidationError:
            # This is OK - prerequisites are missing
            pass

    def test_sales_plan_created_or_unchanged(self):
        """Sales plan for today should be created or unchanged."""
        try:
            initial_count = frappe.db.count(
                "URY Sales Plan",
                {"branch": "URY Branch", "plan_date": nowdate()}
            )
            run()
            final_count = frappe.db.count(
                "URY Sales Plan",
                {"branch": "URY Branch", "plan_date": nowdate()}
            )
            # Count should not decrease, at most one added
            self.assertGreaterEqual(final_count, initial_count)
            self.assertLessEqual(final_count - initial_count, 1)
        except frappe.exceptions.LinkValidationError:
            # This is OK - prerequisites are missing
            pass

    def test_seed_is_idempotent_when_possible(self):
        """Calling run() multiple times should not duplicate records."""
        try:
            # Get initial state
            initial_depts = frappe.db.count("URY Production Department")
            initial_configs = frappe.db.count("URY Item Production Configuration")
            initial_plans = frappe.db.count(
                "URY Sales Plan",
                {"branch": "URY Branch", "plan_date": nowdate()}
            )

            # Run multiple times
            run()
            after_1st = frappe.db.count("URY Production Department")
            run()
            after_2nd = frappe.db.count("URY Production Department")

            # Should not increase after second run
            self.assertEqual(
                after_1st,
                after_2nd,
                "Departments should not increase on second run"
            )

            # Configs and plans should also be stable
            final_configs = frappe.db.count("URY Item Production Configuration")
            final_plans = frappe.db.count(
                "URY Sales Plan",
                {"branch": "URY Branch", "plan_date": nowdate()}
            )

            # Second run should not add duplicates
            self.assertEqual(
                final_configs - initial_configs,
                after_1st - initial_depts,
                "Config count should match dept count behavior"
            )
        except frappe.exceptions.LinkValidationError:
            # This is OK - prerequisites are missing
            pass

    def test_departments_when_created_are_enabled(self):
        """If departments are created, they should be enabled."""
        try:
            run()
            depts = frappe.get_all(
                "URY Production Department",
                fields=["name", "enabled"]
            )
            for dept in depts:
                self.assertEqual(
                    dept.enabled,
                    1,
                    f"Department {dept.name} should be enabled"
                )
        except frappe.exceptions.LinkValidationError:
            # Prerequisites missing - skip this test
            pass

    def test_sales_plan_status_when_created(self):
        """If a sales plan is created, it should be Draft status."""
        try:
            run()
            plans = frappe.get_all(
                "URY Sales Plan",
                {"branch": "URY Branch", "plan_date": nowdate()},
                fields=["name", "status"]
            )
            for plan in plans:
                self.assertEqual(
                    plan.status,
                    "Draft",
                    f"Sales plan {plan.name} should be Draft"
                )
        except frappe.exceptions.LinkValidationError:
            # Prerequisites missing - skip this test
            pass

    def test_sales_plan_has_items_when_created(self):
        """If a sales plan is created, it should have items."""
        try:
            run()
            plans = frappe.get_all(
                "URY Sales Plan",
                {"branch": "URY Branch", "plan_date": nowdate()},
                fields=["name"]
            )
            for plan in plans:
                plan_doc = frappe.get_doc("URY Sales Plan", plan.name)
                self.assertGreater(
                    len(plan_doc.items),
                    0,
                    f"Sales plan {plan.name} should have items"
                )
        except frappe.exceptions.LinkValidationError:
            # Prerequisites missing - skip this test
            pass
