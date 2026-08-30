import frappe
from frappe.tests.utils import FrappeTestCase
from unittest.mock import patch

from ury.ury.ai_tools import agent_seeding
from ury.ury.api.ury_chat import DEFAULT_URY_HUF_AGENT_NAME


class TestAgentSeedingHuf(FrappeTestCase):
    """Exercises the doctype-touching seeding paths. These require `huf`'s
    "Agent" / "Agent Tool Function" doctypes to actually be installed on the
    test site; if huf isn't installed here, skip rather than fail.
    """

    def setUp(self):
        if "huf" not in frappe.get_installed_apps():
            self.skipTest("huf is not installed on this site")
        frappe.set_user("Administrator")
        if frappe.db.exists("Agent", DEFAULT_URY_HUF_AGENT_NAME):
            frappe.delete_doc(
                "Agent", DEFAULT_URY_HUF_AGENT_NAME, force=True, ignore_permissions=True
            )

    def tearDown(self):
        if "huf" not in frappe.get_installed_apps():
            return
        frappe.set_user("Administrator")
        if frappe.db.exists("Agent", DEFAULT_URY_HUF_AGENT_NAME):
            frappe.delete_doc(
                "Agent", DEFAULT_URY_HUF_AGENT_NAME, force=True, ignore_permissions=True
            )

    def test_create_ury_dashboard_agent_is_idempotent(self):
        created_first = agent_seeding.create_ury_dashboard_agent()
        self.assertTrue(created_first)
        self.assertTrue(frappe.db.exists("Agent", DEFAULT_URY_HUF_AGENT_NAME))

        # Second call must not raise and must not create a duplicate record.
        created_second = agent_seeding.create_ury_dashboard_agent()
        self.assertFalse(created_second)

        count = frappe.db.count("Agent", {"name": DEFAULT_URY_HUF_AGENT_NAME})
        self.assertEqual(count, 1)

    @patch("ury.ury.ai_tools.agent_seeding._resolve_default_provider_model")
    @patch("ury.ury.ai_tools.agent_seeding._fallback_provider_model")
    def test_seeds_disabled_with_valid_provider_when_nothing_configured(
        self, mock_fallback, mock_resolve
    ):
        # No AI Provider has a key and no Agent Settings defaults are set --
        # _resolve_default_provider_model would report nothing available,
        # but the fallback-placeholder path must still supply SOME
        # provider/model so the record is saveable and not left invalid.
        # Use real, pre-existing AI Provider/AI Model records as the
        # "fallback placeholder" so the Agent's link fields are still
        # valid -- what's under test is that create_ury_dashboard_agent()
        # actually calls the fallback and lands the record disabled, not
        # whether arbitrary strings pass link validation.
        mock_resolve.return_value = (None, None, "resolved via: nothing available")
        mock_fallback.return_value = ("OpenAI", "gpt-4o-mini")

        agent_seeding.create_ury_dashboard_agent()

        doc = frappe.get_doc("Agent", DEFAULT_URY_HUF_AGENT_NAME)
        self.assertEqual(doc.disabled, 1)
        self.assertIsNotNone(doc.provider)
        self.assertIsNotNone(doc.model)
        self.assertEqual(doc.provider, "OpenAI")
        self.assertEqual(doc.model, "gpt-4o-mini")

    def test_attach_ury_tools_does_not_duplicate_rows(self):
        agent_seeding.create_ury_dashboard_agent()
        doc = frappe.get_doc("Agent", DEFAULT_URY_HUF_AGENT_NAME)
        first_count = len(doc.get("agent_tool", []))

        # Calling the attach helper again on the same (already-fully
        # attached) doc must be a no-op: no new rows appended.
        added = agent_seeding._attach_ury_tools(doc)
        self.assertFalse(added)
        self.assertEqual(len(doc.get("agent_tool", [])), first_count)

        # Calling create_ury_dashboard_agent() again (self-heal path) must
        # also not duplicate rows.
        agent_seeding.create_ury_dashboard_agent()
        doc_again = frappe.get_doc("Agent", DEFAULT_URY_HUF_AGENT_NAME)
        self.assertEqual(len(doc_again.get("agent_tool", [])), first_count)
        tools = [row.tool for row in doc_again.get("agent_tool", [])]
        self.assertEqual(len(tools), len(set(tools)))


class TestAgentSeedingHufNotInstalledGuard(FrappeTestCase):
    """Tests the guard clause itself (`"huf" not in
    frappe.get_installed_apps()`) by mocking frappe.get_installed_apps() to
    simulate huf being absent, regardless of what's actually installed on
    this test site.
    """

    @patch("ury.ury.ai_tools.agent_seeding.frappe.get_installed_apps")
    def test_after_migrate_returns_early_without_huf(self, mock_installed_apps):
        mock_installed_apps.return_value = ["frappe", "ury"]
        with patch("ury.ury.ai_tools.agent_seeding.create_ury_dashboard_agent") as mock_create:
            agent_seeding.after_migrate()
            mock_create.assert_not_called()

    @patch("ury.ury.ai_tools.agent_seeding.frappe.get_installed_apps")
    def test_on_ai_provider_update_returns_early_without_huf(self, mock_installed_apps):
        mock_installed_apps.return_value = ["frappe", "ury"]
        fake_doc = frappe._dict({"name": "_Test Provider"})
        with patch("ury.ury.ai_tools.agent_seeding.provision_ury_agent") as mock_provision:
            agent_seeding.on_ai_provider_update(fake_doc)
            mock_provision.assert_not_called()
