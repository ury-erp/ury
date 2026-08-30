import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api import ury_ai_settings

TEST_NON_MANAGER = "_test_ury_ai_settings_non_manager@example.com"
TEST_MANAGER = "_test_ury_ai_settings_manager@example.com"


class TestURYAISettingsRoundTrip(FrappeTestCase):
    def setUp(self):
        frappe.set_user("Administrator")

    def tearDown(self):
        frappe.set_user("Administrator")

    def test_set_ai_enabled_round_trip(self):
        ury_ai_settings.set_ai_enabled(1)
        self.assertEqual(ury_ai_settings.get_ai_settings(), {"enabled": True})

        ury_ai_settings.set_ai_enabled(0)
        self.assertEqual(ury_ai_settings.get_ai_settings(), {"enabled": False})

    def test_list_ai_providers_never_exposes_raw_api_key(self):
        result = ury_ai_settings.list_ai_providers()
        for row in result.get("providers", []):
            self.assertNotIn("api_key", row)


class TestURYAISettingsUpdateAgentConfig(FrappeTestCase):
    """update_agent_config() must only touch fields explicitly passed. This
    requires an actual HUF Agent record; skip if huf isn't installed here.
    """

    def setUp(self):
        if "huf" not in frappe.get_installed_apps():
            self.skipTest("huf is not installed on this site")
        frappe.set_user("Administrator")

        from ury.ury.api.ury_chat import DEFAULT_URY_HUF_AGENT_NAME

        self.agent_name = DEFAULT_URY_HUF_AGENT_NAME
        if not frappe.db.exists("Agent", self.agent_name):
            self.skipTest("HUF Agent record does not exist on this test site")

        self.original = frappe.get_doc("Agent", self.agent_name).as_dict()

    def tearDown(self):
        frappe.set_user("Administrator")
        if hasattr(self, "original") and frappe.db.exists("Agent", self.agent_name):
            doc = frappe.get_doc("Agent", self.agent_name)
            doc.temperature = self.original.get("temperature")
            doc.top_p = self.original.get("top_p")
            doc.save(ignore_permissions=True)

    def test_update_agent_config_only_changes_passed_fields(self):
        before = frappe.get_doc("Agent", self.agent_name)
        original_top_p = before.top_p

        result = ury_ai_settings.update_agent_config(temperature=0.9)

        self.assertEqual(result["temperature"], 0.9)
        after = frappe.get_doc("Agent", self.agent_name)
        self.assertEqual(after.temperature, 0.9)
        # top_p was not passed, so it must be untouched.
        self.assertEqual(after.top_p, original_top_p)


class TestURYAISettingsPermissions(FrappeTestCase):
    """Every whitelisted function in this module calls require_manager()
    first; a non-manager caller must get frappe.PermissionError.
    """

    def setUp(self):
        frappe.set_user("Administrator")
        self._create_user(TEST_NON_MANAGER, roles=[])
        self._create_user(TEST_MANAGER, roles=["URY Manager"])

    def tearDown(self):
        frappe.set_user("Administrator")
        for user in (TEST_NON_MANAGER, TEST_MANAGER):
            if frappe.db.exists("User", user):
                frappe.delete_doc("User", user, force=True, ignore_permissions=True)

    def _create_user(self, email, roles):
        if frappe.db.exists("User", email):
            frappe.delete_doc("User", email, force=True, ignore_permissions=True)
        user = frappe.get_doc(
            {
                "doctype": "User",
                "email": email,
                "first_name": email.split("@")[0],
                "send_welcome_email": 0,
                "enabled": 1,
            }
        ).insert(ignore_permissions=True)
        for role in roles:
            user.add_roles(role)
        return user

    def test_non_manager_cannot_get_ai_settings(self):
        frappe.set_user(TEST_NON_MANAGER)
        try:
            with self.assertRaises(frappe.PermissionError):
                ury_ai_settings.get_ai_settings()
        finally:
            frappe.set_user("Administrator")

    def test_non_manager_cannot_set_ai_enabled(self):
        frappe.set_user(TEST_NON_MANAGER)
        try:
            with self.assertRaises(frappe.PermissionError):
                ury_ai_settings.set_ai_enabled(1)
        finally:
            frappe.set_user("Administrator")

    def test_non_manager_cannot_get_agent_config(self):
        frappe.set_user(TEST_NON_MANAGER)
        try:
            with self.assertRaises(frappe.PermissionError):
                ury_ai_settings.get_agent_config()
        finally:
            frappe.set_user("Administrator")

    def test_non_manager_cannot_update_agent_config(self):
        frappe.set_user(TEST_NON_MANAGER)
        try:
            with self.assertRaises(frappe.PermissionError):
                ury_ai_settings.update_agent_config(temperature=0.5)
        finally:
            frappe.set_user("Administrator")

    def test_non_manager_cannot_list_ai_providers(self):
        frappe.set_user(TEST_NON_MANAGER)
        try:
            with self.assertRaises(frappe.PermissionError):
                ury_ai_settings.list_ai_providers()
        finally:
            frappe.set_user("Administrator")

    def test_non_manager_cannot_list_ai_models(self):
        frappe.set_user(TEST_NON_MANAGER)
        try:
            with self.assertRaises(frappe.PermissionError):
                ury_ai_settings.list_ai_models("OpenAI")
        finally:
            frappe.set_user("Administrator")

    def test_non_manager_cannot_set_provider_api_key(self):
        frappe.set_user(TEST_NON_MANAGER)
        try:
            with self.assertRaises(frappe.PermissionError):
                ury_ai_settings.set_provider_api_key("OpenAI", "sk-test")
        finally:
            frappe.set_user("Administrator")

    def test_manager_can_get_ai_settings(self):
        frappe.set_user(TEST_MANAGER)
        try:
            result = ury_ai_settings.get_ai_settings()
            self.assertIn("enabled", result)
        finally:
            frappe.set_user("Administrator")
