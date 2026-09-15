"""Tests for the unified URY demo-data runner.

These tests hit the real database because the runner itself is a data-seeding
script. They assert that the runner completes without errors and that a second
run does not duplicate the bulk of the seeded data.
"""

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.dev_seed.demo_runner import seed_all


class TestDemoRunner(FrappeTestCase):
    def setUp(self):
        """seed_all() -> _resolve_branch() requires at least one real Branch
        record to already exist on the site -- a fresh site (e.g. via
        setup_complete(), which creates a default Company but never a
        Branch, a separate optional doctype) has none, so seed_all() throws
        "No Branch found on this site" before this test's own assertions
        ever run. Seed the minimum needed directly rather than relying on
        the site already having one."""
        company = frappe.db.get_value("Company", {}, "name")
        if not company:
            self.skipTest("No Company found on this site -- cannot set up this test's Branch fixture.")
        # Prefer a Branch already linked to the resolved Company, but fall
        # back to ANY existing Branch -- exactly what demo_runner's own
        # _resolve_branch() does. Filtering on {"company": company} alone is
        # wrong on a site with more than one Company (a CI test site always
        # has at least frappe/erpnext's "_Test Company" plus whatever
        # sibling test modules created): the unordered single-row Company
        # lookup above can return a different Company than the one this
        # test's own Branch was created under on a previous run, the
        # filtered lookup then finds nothing, and the insert below dies with
        # DuplicateEntryError on "Demo Branch" before any assertion runs.
        branch_name = frappe.db.get_value("Branch", {"company": company}, "name")
        if not branch_name:
            branch_name = frappe.db.get_value("Branch", {}, "name")
        if not branch_name:
            branch_doc = frappe.get_doc({
                "doctype": "Branch",
                "branch": "Demo Branch",
                "company": company,
            })
            # ury's custom "user" child table on Branch is marked mandatory.
            # A real row (not just ignore_mandatory on this one insert) is
            # needed because demo_runner's own operations.seed() later
            # re-fetches and re-saves this Branch doc (to add aggregator
            # settings), which re-validates mandatory fields for real --
            # Administrator always exists, so it's a safe assignee here.
            branch_doc.append("user", {"user": "Administrator"})
            branch_doc.insert(ignore_permissions=True)
            frappe.db.commit()
        else:
            # A Branch created by an earlier (e.g. pre-fix) test run may
            # already exist without a "user" row -- this test's data
            # persists across runs (seed_all() commits real records, it
            # isn't wrapped in the usual per-test rollback), so check for
            # this every time rather than only on first creation.
            branch_doc = frappe.get_doc("Branch", branch_name)
            if not branch_doc.get("user"):
                branch_doc.append("user", {"user": "Administrator"})
                branch_doc.save(ignore_permissions=True)
                frappe.db.commit()

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
