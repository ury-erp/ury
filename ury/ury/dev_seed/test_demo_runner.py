"""Tests for the unified URY demo-data runner.

These tests hit the real database because the runner itself is a data-seeding
script. They assert that the runner completes without errors and that a second
run does not duplicate the bulk of the seeded data.
"""

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.dev_seed.demo_runner import seed_all


class TestDemoRunner(FrappeTestCase):
    def test_seed_all_completes_and_creates_key_records(self):
        """seed_all() should run every module without raising and leave the
        site with the demo records the front-end dashboards/reports expect."""
        result = seed_all()

        self.assertIn("company", result)
        self.assertIn("branch", result)
        self.assertIn("results", result)

        branch = result["branch"]
        pos_profile = result["branch"]  # profiles.py names the profile after the branch

        for module_name, module_result in result["results"].items():
            self.assertTrue(
                module_result.get("ok"),
                f"demo-data module '{module_name}' failed: {module_result.get('error')}",
            )

        # Core demo artefacts that prove the runner worked end-to-end.
        self.assertGreaterEqual(
            frappe.db.count("POS Invoice", {"branch": branch, "docstatus": 1}),
            1,
            "No submitted POS Invoices were seeded for the demo branch",
        )
        self.assertGreaterEqual(
            frappe.db.count("URY KOT", {"docstatus": 1}),
            1,
            "No submitted URY KOTs were seeded",
        )
        self.assertGreaterEqual(
            frappe.db.count("URY Daily P and L", {"branch": branch}),
            1,
            "No URY Daily P and L documents were seeded for the demo branch",
        )
        self.assertTrue(
            frappe.db.exists(
                "POS Opening Entry",
                {"pos_profile": pos_profile, "status": "Open", "docstatus": 1},
            ),
            "No open POS Opening Entry was seeded for the demo POS Profile",
        )

    def test_seed_all_is_idempotent(self):
        """A second run should not blow up and should not duplicate most
        seeded data. Today's invoices are capped at TODAY_ORDER_COUNT, so a
        small increase on the first re-run (when the target has not yet been
        reached) is acceptable; everything else should be stable."""
        from ury.ury.dev_seed.historical_sales import TODAY_ORDER_COUNT

        result1 = seed_all()
        for module_name, module_result in result1["results"].items():
            self.assertTrue(
                module_result.get("ok"),
                f"first run module '{module_name}' failed: {module_result.get('error')}",
            )

        branch = result1["branch"]
        pos1 = frappe.db.count("POS Invoice", {"branch": branch, "docstatus": 1})
        kot1 = frappe.db.count("URY KOT", {"docstatus": 1})
        pnl1 = frappe.db.count("URY Daily P and L", {"branch": branch})

        result2 = seed_all()
        for module_name, module_result in result2["results"].items():
            self.assertTrue(
                module_result.get("ok"),
                f"second run module '{module_name}' failed: {module_result.get('error')}",
            )

        pos2 = frappe.db.count("POS Invoice", {"branch": branch, "docstatus": 1})
        kot2 = frappe.db.count("URY KOT", {"docstatus": 1})
        pnl2 = frappe.db.count("URY Daily P and L", {"branch": branch})

        self.assertGreaterEqual(pos2, pos1)
        self.assertLessEqual(
            pos2 - pos1,
            TODAY_ORDER_COUNT,
            "Second run created more POS Invoices than the daily cap allows",
        )
        self.assertEqual(kot2, kot1, "Second run duplicated URY KOTs")
        self.assertGreaterEqual(pnl2, pnl1)
        self.assertLessEqual(
            pnl2 - pnl1,
            1,
            "Second run created more than one extra Daily P&L (likely today's)",
        )
