"""Site-less regressions for the dashboard guards and wizard-status shim."""

import importlib.util
import unittest
from pathlib import Path
from types import ModuleType
from unittest.mock import MagicMock, patch

import frappe
from ury.api import dashboard as public_dashboard
from ury.ury.api import dashboard


def throw(message, exception=frappe.ValidationError):
    raise exception(message)


class ModuleRecordsCases:
    def setUp(self):
        self.framework = MagicMock()
        self.framework.PermissionError = frappe.PermissionError
        self.framework.throw.side_effect = throw
        self.framework.session.user = "reader@example.com"
        self.framework.db.exists.return_value = True
        self.framework.get_meta.return_value.has_field.side_effect = lambda field: field == "branch"
        self.framework.get_all.side_effect = self.read_unrestricted_rows
        self.framework.get_list.side_effect = self.read_permitted_rows
        self.enterContext(patch.object(self.module, "frappe", self.framework))
        self.read_allowed = True
        self.rows = [frappe._dict(name="Visible", branch="Allowed", secret="private")]

    def read_unrestricted_rows(self, doctype, *, filters, fields):
        if doctype == "Has Role":
            return [frappe._dict(role="URY Cashier")]
        rows = [row for row in self.rows if all(row.get(key) == value for key, value in filters.items())]
        return [frappe._dict(row) for row in rows]

    def read_permitted_rows(self, doctype, *, filters, fields, limit_page_length):
        if not self.read_allowed:
            raise frappe.PermissionError("Not permitted")
        rows = [row for row in self.rows if row.branch == "Allowed"]
        rows = [row for row in rows if all(row.get(key) == value for key, value in filters.items())]
        rows = rows[:limit_page_length]
        if fields == ["*"]:
            return rows
        return [frappe._dict({field: row.get(field) for field in fields}) for row in rows]

    def test_role_without_doctype_read_permission_is_refused(self):
        self.read_allowed = False
        with self.assertRaises(frappe.PermissionError):
            self.module.get_module_records("URY Table")

    def test_role_with_native_read_permission_is_allowed(self):
        self.assertEqual(self.module.get_module_records("URY Table"), self.rows)

    def test_disallowed_doctype_is_refused_even_for_administrator(self):
        self.framework.session.user = "Administrator"
        with self.assertRaises(frappe.PermissionError):
            self.module.get_module_records("Account")

    def test_exact_nine_dashboard_doctypes_remain_available(self):
        for doctype in (
            "Branch", "URY Room", "URY Table", "URY Menu", "URY Menu Course",
            "Item", "Item Group", "URY Production Unit", "User",
        ):
            with self.subTest(doctype=doctype):
                self.assertEqual(len(self.module.get_module_records(doctype)), 1)

    def test_user_permissions_filter_rows_without_explicit_branch(self):
        self.rows.append(frappe._dict(name="Hidden", branch="Forbidden", secret="private"))
        self.assertEqual(
            [row.name for row in self.module.get_module_records("URY Table")], ["Visible"]
        )

    def test_user_rows_expose_only_the_guard_fields_not_roles_or_secrets(self):
        self.rows = [frappe._dict(
            name="reader@example.com", branch="Allowed", full_name="Reader", enabled=1,
            user_type="System User", api_key="secret", reset_password_key="secret",
        )]
        self.assertEqual(self.module.get_module_records("User"), [{
            "name": "reader@example.com", "full_name": "Reader", "enabled": 1,
            "user_type": "System User",
        }])

    def test_results_are_bounded_to_500_rows(self):
        self.rows = [frappe._dict(name=f"Table {i}", branch="Allowed") for i in range(501)]
        self.assertEqual(len(self.module.get_module_records("URY Table")), 500)

    def test_branch_filter_and_all_preserve_the_guard_contract(self):
        self.assertEqual(self.module.get_module_records("URY Table", branch="Other"), [])
        for branch in (None, "", "all", "Allowed"):
            with self.subTest(branch=branch):
                self.assertEqual(self.module.get_module_records("URY Table", branch=branch), self.rows)

    def test_doctype_without_branch_field_is_not_filtered(self):
        self.framework.get_meta.return_value.has_field.return_value = False
        self.framework.get_meta.return_value.has_field.side_effect = None
        self.assertEqual(self.module.get_module_records("Item", branch="Other"), self.rows)


class TestPublicModuleRecords(ModuleRecordsCases, unittest.TestCase):
    module = public_dashboard


class TestNestedModuleRecords(ModuleRecordsCases, unittest.TestCase):
    module = dashboard


class TestWizardStatus(unittest.TestCase):
    def load_organization(self, *, country_loader=False):
        # Model the supported v16 setup module: load_languages and setup_complete exist,
        # but load_country does not. Import the real URY source, not a rewritten fixture.
        setup = ModuleType("frappe.desk.page.setup_wizard.setup_wizard")
        setup.load_languages = lambda: ["English"]
        setup.setup_complete = MagicMock()
        if country_loader:
            setup.load_country = lambda: ""
        self.enterContext(patch.dict("sys.modules", {setup.__name__: setup}))
        source = Path(dashboard.__file__).parent / "minimal" / "setup_organization.py"
        spec = importlib.util.spec_from_file_location("ury_guard_wizard_under_test", source)
        module = importlib.util.module_from_spec(spec)
        try:
            spec.loader.exec_module(module)
        except ImportError as error:
            if "load_country" not in str(error):
                raise
            self.fail(f"Wizard status must be callable without Frappe's removed load_country: {error}")
        self.framework = MagicMock()
        self.framework.PermissionError = frappe.PermissionError
        self.framework.throw.side_effect = throw
        self.framework.session.user = "reader@example.com"
        self.enterContext(patch.object(module, "frappe", self.framework))
        return module

    def test_status_works_without_load_country_for_all_setup_states(self):
        module = self.load_organization()
        for company, branch, expected in (
            (None, None, {"step1_complete": False, "step2_complete": False}),
            ("Company", None, {"step1_complete": True, "step2_complete": False}),
            (None, "Branch", {"step1_complete": False, "step2_complete": True}),
            ("Company", "Branch", {"step1_complete": True, "step2_complete": True}),
        ):
            with self.subTest(company=company, branch=branch):
                self.framework.db.exists.side_effect = lambda doctype, filters: (
                    company if doctype == "Company" else branch
                )
                self.assertEqual(module.get_wizard_status(), expected)

    def test_status_refuses_guest_with_the_shims_permission_error(self):
        module = self.load_organization(country_loader=True)
        self.framework.session.user = "Guest"
        try:
            module.get_wizard_status()
        except Exception as error:
            self.assertIsInstance(error, frappe.PermissionError)
        else:
            self.fail("Guest wizard status calls must raise PermissionError")
        self.framework.db.exists.assert_not_called()

    def test_setup_defaults_use_configured_country_without_load_country(self):
        module = self.load_organization()
        for country, expected in (("Uganda", "Uganda"), (None, "India")):
            with self.subTest(country=country):
                self.framework.db.get_single_value.return_value = country
                self.assertEqual(module.get_setup_defaults()["detected_country"], expected)


if __name__ == "__main__":
    unittest.main()
