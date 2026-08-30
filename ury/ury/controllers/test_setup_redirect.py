from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.controllers.setup_redirect import (
	_setup_wizard_target,
	_should_redirect_to_ury_setup,
	extend_bootinfo,
	is_ury_setup_complete,
	on_session_creation,
	website_path_resolver,
)


class TestSetupWizardTarget(FrappeTestCase):
	@patch("ury.ury.controllers.setup_redirect.frappe.db.exists")
	def test_starts_at_step_0_when_no_company(self, mock_exists):
		mock_exists.return_value = False
		self.assertEqual(_setup_wizard_target(), "/ury/setup-wizard/0")

	@patch("ury.ury.controllers.setup_redirect.frappe.db.exists")
	def test_resumes_at_step_1_when_company_exists_without_branch(self, mock_exists):
		mock_exists.side_effect = lambda doctype, filters=None: doctype == "Company"
		self.assertEqual(_setup_wizard_target(), "/ury/setup-wizard/1")

	@patch("ury.ury.controllers.setup_redirect.frappe.db.exists")
	def test_step_0_when_both_company_and_branch_exist(self, mock_exists):
		mock_exists.return_value = True
		self.assertEqual(_setup_wizard_target(), "/ury/setup-wizard/0")


class TestShouldRedirect(FrappeTestCase):
	def setUp(self):
		self.original_user = frappe.session.user

	def tearDown(self):
		frappe.session.user = self.original_user

	@patch("ury.ury.controllers.setup_redirect.is_ury_setup_complete", return_value=False)
	def test_skips_guest(self, _mock_complete):
		frappe.session.user = "Guest"
		self.assertFalse(_should_redirect_to_ury_setup("app"))

	@patch("ury.ury.controllers.setup_redirect.is_ury_setup_complete", return_value=True)
	def test_skips_when_setup_complete(self, _mock_complete):
		frappe.session.user = "Administrator"
		self.assertFalse(_should_redirect_to_ury_setup("app"))

	@patch("ury.ury.controllers.setup_redirect.is_ury_setup_complete", return_value=False)
	def test_redirects_desk_and_landing_paths(self, _mock_complete):
		frappe.session.user = "Administrator"
		for path in ("", "/", "app", "app/setup-wizard", "/app", "desk", "apps", "setup-wizard"):
			self.assertTrue(_should_redirect_to_ury_setup(path), path)

	@patch("ury.ury.controllers.setup_redirect.is_ury_setup_complete", return_value=False)
	def test_skips_wizard_api_and_login_paths(self, _mock_complete):
		frappe.session.user = "Administrator"
		for path in (
			"ury/dashboard",
			"ury/setup-wizard/0",
			"api/method/login",
			"assets/ury/js/setup_redirect.js",
			"files/x.png",
			"private/files/x.png",
			"login",
		):
			self.assertFalse(_should_redirect_to_ury_setup(path), path)


class TestWebsitePathResolver(FrappeTestCase):
	def setUp(self):
		self.original_user = frappe.session.user
		frappe.session.user = "Administrator"
		frappe.local.flags.redirect_location = ""

	def tearDown(self):
		frappe.session.user = self.original_user
		frappe.local.flags.redirect_location = ""

	@patch("frappe.website.path_resolver.resolve_path", return_value="ury")
	@patch("ury.ury.controllers.setup_redirect.is_ury_setup_complete", return_value=True)
	def test_passes_through_when_setup_complete(self, _mock_complete, mock_resolve):
		self.assertEqual(website_path_resolver("app"), "ury")
		mock_resolve.assert_called_once_with("app")

	@patch("frappe.website.path_resolver.resolve_path", return_value="login")
	@patch("ury.ury.controllers.setup_redirect.is_ury_setup_complete", return_value=False)
	def test_passes_through_guest(self, _mock_complete, mock_resolve):
		frappe.session.user = "Guest"
		self.assertEqual(website_path_resolver("app"), "login")
		mock_resolve.assert_called_once_with("app")

	@patch("frappe.website.path_resolver.resolve_path", return_value="ury")
	@patch("ury.ury.controllers.setup_redirect.is_ury_setup_complete", return_value=False)
	def test_passes_through_ury_and_api_paths(self, _mock_complete, mock_resolve):
		self.assertEqual(website_path_resolver("ury/dashboard"), "ury")
		self.assertEqual(website_path_resolver("api/method/ping"), "ury")
		self.assertEqual(mock_resolve.call_count, 2)

	@patch("ury.ury.controllers.setup_redirect._setup_wizard_target", return_value="/ury/setup-wizard/0")
	@patch("ury.ury.controllers.setup_redirect.is_ury_setup_complete", return_value=False)
	def test_redirects_app_with_302(self, _mock_complete, _mock_target):
		with self.assertRaises(frappe.Redirect) as ctx:
			website_path_resolver("app")
		self.assertEqual(ctx.exception.http_status_code, 302)
		self.assertEqual(frappe.local.flags.redirect_location, "/ury/setup-wizard/0")

	@patch("ury.ury.controllers.setup_redirect._setup_wizard_target", return_value="/ury/setup-wizard/0")
	@patch("ury.ury.controllers.setup_redirect.is_ury_setup_complete", return_value=False)
	def test_redirects_app_setup_wizard(self, _mock_complete, _mock_target):
		with self.assertRaises(frappe.Redirect) as ctx:
			website_path_resolver("app/setup-wizard")
		self.assertEqual(ctx.exception.http_status_code, 302)

	@patch("ury.ury.controllers.setup_redirect._setup_wizard_target", return_value="/ury/setup-wizard/0")
	@patch("ury.ury.controllers.setup_redirect.is_ury_setup_complete", return_value=False)
	def test_redirects_empty_path(self, _mock_complete, _mock_target):
		with self.assertRaises(frappe.Redirect) as ctx:
			website_path_resolver("")
		self.assertEqual(ctx.exception.http_status_code, 302)

	@patch("ury.ury.controllers.setup_redirect._setup_wizard_target", return_value="/ury/setup-wizard/1")
	@patch("ury.ury.controllers.setup_redirect.is_ury_setup_complete", return_value=False)
	def test_resumes_at_step_1_when_company_exists(self, _mock_complete, _mock_target):
		with self.assertRaises(frappe.Redirect):
			website_path_resolver("app")
		self.assertEqual(frappe.local.flags.redirect_location, "/ury/setup-wizard/1")


class TestIsUrySetupComplete(FrappeTestCase):
	@patch("ury.ury.controllers.setup_redirect.frappe.db.exists", return_value=True)
	@patch("ury.ury.controllers.setup_redirect.frappe.is_setup_complete", return_value=True)
	def test_complete_when_frappe_setup_and_branch_exist(self, _mock_setup, _mock_exists):
		self.assertTrue(is_ury_setup_complete())

	@patch("ury.ury.controllers.setup_redirect.frappe.db.exists", return_value=False)
	@patch("ury.ury.controllers.setup_redirect.frappe.is_setup_complete", return_value=True)
	def test_incomplete_without_branch(self, _mock_setup, _mock_exists):
		self.assertFalse(is_ury_setup_complete())

	@patch("ury.ury.controllers.setup_redirect.frappe.is_setup_complete", return_value=False)
	def test_incomplete_when_frappe_setup_not_done(self, _mock_setup):
		self.assertFalse(is_ury_setup_complete())

	@patch("ury.ury.controllers.setup_redirect.frappe.is_setup_complete", side_effect=Exception("db down"))
	def test_incomplete_on_setup_check_error(self, _mock_setup):
		self.assertFalse(is_ury_setup_complete())


class TestBootAndSessionHooks(FrappeTestCase):
	@patch("ury.ury.controllers.setup_redirect._setup_wizard_target", return_value="/ury/setup-wizard/0")
	@patch("ury.ury.controllers.setup_redirect.is_ury_setup_complete", return_value=False)
	def test_on_session_creation_sets_home_page(self, _mock_complete, _mock_target):
		on_session_creation()
		self.assertEqual(frappe.local.response.get("home_page"), "/ury/setup-wizard/0")

	@patch("ury.ury.controllers.setup_redirect.is_ury_setup_complete", return_value=True)
	def test_on_session_creation_noop_when_complete(self, _mock_complete):
		frappe.local.response.pop("home_page", None)
		on_session_creation()
		self.assertIsNone(frappe.local.response.get("home_page"))

	@patch("ury.ury.controllers.setup_redirect._setup_wizard_target", return_value="/ury/setup-wizard/1")
	@patch("ury.ury.controllers.setup_redirect.is_ury_setup_complete", return_value=False)
	def test_extend_bootinfo_sets_ury_flag_and_target(self, _mock_complete, _mock_target):
		bootinfo = frappe._dict()
		extend_bootinfo(bootinfo)
		self.assertIs(bootinfo.ury_setup_complete, False)
		self.assertEqual(bootinfo.ury_setup_wizard_target, "/ury/setup-wizard/1")
		self.assertNotIn("setup_complete", bootinfo)

	@patch("ury.ury.controllers.setup_redirect.is_ury_setup_complete", return_value=True)
	def test_extend_bootinfo_complete_does_not_set_target(self, _mock_complete):
		bootinfo = frappe._dict()
		extend_bootinfo(bootinfo)
		self.assertIs(bootinfo.ury_setup_complete, True)
		self.assertNotIn("ury_setup_wizard_target", bootinfo)
