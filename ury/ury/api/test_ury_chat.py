"""Unit tests for ury_chat module - HUF chat API proxy layer.

Tests cover:
- Report context formatting
- Agent name retrieval  
- Conversation lifecycle (creation, caching)
- Message sending with context
- Chat history retrieval
- Error handling and graceful degradation
- All external HUF calls are mocked
"""

import frappe
from frappe.tests.utils import FrappeTestCase
from unittest.mock import patch, MagicMock

from ury.ury.api import ury_chat


class TestFormatReportContext(FrappeTestCase):
	"""Test report context formatting for chat messages."""

	def test_empty_dict(self):
		self.assertEqual(ury_chat._format_report_context({}), "")

	def test_none(self):
		self.assertEqual(ury_chat._format_report_context(None), "")

	def test_single_key_value(self):
		result = ury_chat._format_report_context({"report": "Sales"})
		self.assertIn("[report_context]", result)
		self.assertIn("[/report_context]", result)
		self.assertIn("report: Sales", result)

	def test_multiple_key_values(self):
		context = {"report": "Sales", "branch": "Main", "period": "Today"}
		result = ury_chat._format_report_context(context)
		self.assertIn("[report_context]", result)
		self.assertIn("report: Sales", result)
		self.assertIn("branch: Main", result)
		self.assertIn("period: Today", result)


class TestGetAgentName(FrappeTestCase):
	"""Test agent name configuration retrieval."""

	def test_default_name(self):
		result = ury_chat._get_agent_name()
		self.assertEqual(result, ury_chat.DEFAULT_URY_HUF_AGENT_NAME)

	@patch("frappe.conf.get")
	def test_custom_name_from_config(self, mock_conf_get):
		mock_conf_get.return_value = "Custom Agent"
		result = ury_chat._get_agent_name()
		self.assertEqual(result, "Custom Agent")


class TestConversationCacheKey(FrappeTestCase):
	"""Test conversation cache key generation."""

	def setUp(self):
		frappe.set_user("Administrator")

	def test_includes_user(self):
		frappe.set_user("test@example.com")
		key = ury_chat._conversation_cache_key()
		self.assertIn("test@example.com", key)
		self.assertIn(ury_chat._CONVERSATION_CACHE_PREFIX, key)

	def test_key_format(self):
		frappe.set_user("user@example.com")
		key = ury_chat._conversation_cache_key()
		expected = f"{ury_chat._CONVERSATION_CACHE_PREFIX}:user@example.com"
		self.assertEqual(key, expected)


class TestGetOrCreateConversation(FrappeTestCase):
	"""Test conversation creation and retrieval with HUF."""

	@patch("ury.ury.api.ury_chat.require_manager")
	@patch("frappe.get_installed_apps")
	def test_huf_not_installed(self, mock_installed_apps, mock_require_manager):
		mock_installed_apps.return_value = []

		result = ury_chat.get_or_create_conversation()

		self.assertFalse(result["available"])
		self.assertIn("not installed", result["reason"])

	@patch("ury.ury.api.ury_chat.require_manager")
	@patch("ury.ury.api.ury_chat._get_agent_chat_module")
	@patch("frappe.cache")
	@patch("frappe.db.exists")
	@patch("frappe.get_installed_apps")
	def test_agent_does_not_exist(
		self, mock_installed_apps, mock_db_exists, mock_cache, mock_agent_chat, mock_require_manager
	):
		mock_installed_apps.return_value = ["huf"]
		mock_db_exists.return_value = False
		mock_cache_instance = MagicMock()
		mock_cache.return_value = mock_cache_instance
		mock_cache_instance.get_value.return_value = None

		result = ury_chat.get_or_create_conversation()

		self.assertFalse(result["available"])
		self.assertIn("does not exist", result["reason"])

	@patch("ury.ury.api.ury_chat.require_manager")
	@patch("ury.ury.api.ury_chat._get_agent_chat_module")
	@patch("frappe.cache")
	@patch("frappe.db.get_value")
	@patch("frappe.db.exists")
	@patch("frappe.get_installed_apps")
	def test_agent_disabled(
		self,
		mock_installed_apps,
		mock_db_exists,
		mock_db_get_value,
		mock_cache,
		mock_agent_chat,
		mock_require_manager,
	):
		mock_installed_apps.return_value = ["huf"]
		mock_cache_instance = MagicMock()
		mock_cache.return_value = mock_cache_instance
		mock_cache_instance.get_value.return_value = None
		mock_db_exists.return_value = True
		mock_db_get_value.return_value = {"disabled": 1, "provider": "OpenAI", "model": "gpt-4"}

		result = ury_chat.get_or_create_conversation()

		self.assertFalse(result["available"])
		self.assertIn("disabled", result["reason"])

	@patch("ury.ury.api.ury_chat.require_manager")
	@patch("ury.ury.api.ury_chat._get_agent_chat_module")
	@patch("frappe.cache")
	@patch("frappe.db.get_value")
	@patch("frappe.db.exists")
	@patch("frappe.get_installed_apps")
	def test_agent_no_provider(
		self,
		mock_installed_apps,
		mock_db_exists,
		mock_db_get_value,
		mock_cache,
		mock_agent_chat,
		mock_require_manager,
	):
		mock_installed_apps.return_value = ["huf"]
		mock_cache_instance = MagicMock()
		mock_cache.return_value = mock_cache_instance
		mock_cache_instance.get_value.return_value = None
		mock_db_exists.return_value = True
		mock_db_get_value.return_value = {"disabled": 0, "provider": None, "model": None}

		result = ury_chat.get_or_create_conversation()

		self.assertFalse(result["available"])
		self.assertIn("provider/model", result["reason"])

	@patch("ury.ury.api.ury_chat.require_manager")
	@patch("ury.ury.api.ury_chat._get_agent_chat_module")
	@patch("frappe.cache")
	@patch("frappe.db.get_value")
	@patch("frappe.db.exists")
	@patch("frappe.get_installed_apps")
	def test_create_success(
		self,
		mock_installed_apps,
		mock_db_exists,
		mock_db_get_value,
		mock_cache,
		mock_agent_chat,
		mock_require_manager,
	):
		mock_installed_apps.return_value = ["huf"]
		mock_cache_instance = MagicMock()
		mock_cache.return_value = mock_cache_instance
		mock_cache_instance.get_value.return_value = None
		mock_db_exists.return_value = True
		mock_db_get_value.return_value = {"disabled": 0, "provider": "OpenAI", "model": "gpt-4"}
		mock_agent_chat_module = MagicMock()
		mock_agent_chat.return_value = mock_agent_chat_module
		mock_agent_chat_module.create_conversation.return_value = {"conversation_id": "CONV-123"}

		result = ury_chat.get_or_create_conversation()

		self.assertTrue(result["available"])
		self.assertEqual(result["conversation_id"], "CONV-123")
		mock_cache_instance.set_value.assert_called_once()

	@patch("ury.ury.api.ury_chat.require_manager")
	@patch("ury.ury.api.ury_chat._get_agent_chat_module")
	@patch("frappe.cache")
	@patch("frappe.db.get_value")
	@patch("frappe.db.exists")
	@patch("frappe.get_installed_apps")
	def test_create_name_fallback(
		self,
		mock_installed_apps,
		mock_db_exists,
		mock_db_get_value,
		mock_cache,
		mock_agent_chat,
		mock_require_manager,
	):
		"""Should fallback to 'name' key when 'conversation_id' missing."""
		mock_installed_apps.return_value = ["huf"]
		mock_cache_instance = MagicMock()
		mock_cache.return_value = mock_cache_instance
		mock_cache_instance.get_value.return_value = None
		mock_db_exists.return_value = True
		mock_db_get_value.return_value = {"disabled": 0, "provider": "OpenAI", "model": "gpt-4"}
		mock_agent_chat_module = MagicMock()
		mock_agent_chat.return_value = mock_agent_chat_module
		mock_agent_chat_module.create_conversation.return_value = {"name": "CONV-456"}

		result = ury_chat.get_or_create_conversation()

		self.assertTrue(result["available"])
		self.assertEqual(result["conversation_id"], "CONV-456")

	@patch("ury.ury.api.ury_chat.require_manager")
	@patch("ury.ury.api.ury_chat._get_agent_chat_module")
	@patch("frappe.cache")
	@patch("frappe.db.get_value")
	@patch("frappe.db.exists")
	@patch("frappe.get_installed_apps")
	def test_create_string_return(
		self,
		mock_installed_apps,
		mock_db_exists,
		mock_db_get_value,
		mock_cache,
		mock_agent_chat,
		mock_require_manager,
	):
		"""Should handle string response from create_conversation."""
		mock_installed_apps.return_value = ["huf"]
		mock_cache_instance = MagicMock()
		mock_cache.return_value = mock_cache_instance
		mock_cache_instance.get_value.return_value = None
		mock_db_exists.return_value = True
		mock_db_get_value.return_value = {"disabled": 0, "provider": "OpenAI", "model": "gpt-4"}
		mock_agent_chat_module = MagicMock()
		mock_agent_chat.return_value = mock_agent_chat_module
		mock_agent_chat_module.create_conversation.return_value = "CONV-789"

		result = ury_chat.get_or_create_conversation()

		self.assertTrue(result["available"])
		self.assertEqual(result["conversation_id"], "CONV-789")

	@patch("ury.ury.api.ury_chat.require_manager")
	@patch("ury.ury.api.ury_chat._get_agent_chat_module")
	@patch("frappe.cache")
	@patch("frappe.db.get_value")
	@patch("frappe.db.exists")
	@patch("frappe.get_installed_apps")
	def test_create_no_id(
		self,
		mock_installed_apps,
		mock_db_exists,
		mock_db_get_value,
		mock_cache,
		mock_agent_chat,
		mock_require_manager,
	):
		"""Should return unavailable when no id returned."""
		mock_installed_apps.return_value = ["huf"]
		mock_cache_instance = MagicMock()
		mock_cache.return_value = mock_cache_instance
		mock_cache_instance.get_value.return_value = None
		mock_db_exists.return_value = True
		mock_db_get_value.return_value = {"disabled": 0, "provider": "OpenAI", "model": "gpt-4"}
		mock_agent_chat_module = MagicMock()
		mock_agent_chat.return_value = mock_agent_chat_module
		mock_agent_chat_module.create_conversation.return_value = {}

		result = ury_chat.get_or_create_conversation()

		self.assertFalse(result["available"])
		self.assertIn("returned no conversation id", result["reason"])

	@patch("ury.ury.api.ury_chat.require_manager")
	@patch("ury.ury.api.ury_chat._get_agent_chat_module")
	@patch("frappe.cache")
	@patch("frappe.db.get_value")
	@patch("frappe.db.exists")
	@patch("frappe.get_installed_apps")
	def test_cached_valid(
		self,
		mock_installed_apps,
		mock_db_exists,
		mock_cache,
		mock_db_get_value,
		mock_agent_chat,
		mock_require_manager,
	):
		"""Should return cached conversation if it exists in DB."""
		mock_installed_apps.return_value = ["huf"]
		mock_cache_instance = MagicMock()
		mock_cache.return_value = mock_cache_instance
		mock_cache_instance.get_value.return_value = "CACHED-CONV-123"

		def db_exists_side_effect(doctype, name):
			return doctype == "Agent Conversation"

		mock_db_exists.side_effect = db_exists_side_effect

		result = ury_chat.get_or_create_conversation()

		self.assertTrue(result["available"])
		self.assertEqual(result["conversation_id"], "CACHED-CONV-123")
		mock_agent_chat.assert_not_called()

	@patch("frappe.log_error")
	@patch("ury.ury.api.ury_chat.require_manager")
	@patch("ury.ury.api.ury_chat._get_agent_chat_module")
	@patch("frappe.cache")
	@patch("frappe.db.get_value")
	@patch("frappe.db.exists")
	@patch("frappe.get_installed_apps")
	def test_exception_handling(
		self,
		mock_installed_apps,
		mock_db_exists,
		mock_cache,
		mock_db_get_value,
		mock_agent_chat,
		mock_require_manager,
		mock_log_error,
	):
		"""Should catch exceptions and return unavailable."""
		mock_installed_apps.return_value = ["huf"]
		mock_cache_instance = MagicMock()
		mock_cache.return_value = mock_cache_instance
		mock_cache_instance.get_value.return_value = None
		mock_db_exists.return_value = True
		mock_db_get_value.return_value = {"disabled": 0, "provider": "OpenAI", "model": "gpt-4"}
		mock_agent_chat_module = MagicMock()
		mock_agent_chat.return_value = mock_agent_chat_module
		mock_agent_chat_module.create_conversation.side_effect = Exception("HUF API error")

		result = ury_chat.get_or_create_conversation()

		self.assertFalse(result["available"])
		self.assertIn("HUF API error", result["reason"])


class TestSendChatMessage(FrappeTestCase):
	"""Test message sending to HUF conversations."""

	@patch("ury.ury.api.ury_chat.require_manager")
	@patch("frappe.get_installed_apps")
	def test_huf_not_installed(self, mock_installed_apps, mock_require_manager):
		mock_installed_apps.return_value = []

		result = ury_chat.send_chat_message("CONV-123", "Hello")

		self.assertFalse(result["available"])
		self.assertIn("not installed", result["reason"])

	@patch("ury.ury.api.ury_chat.require_manager")
	@patch("ury.ury.api.ury_chat._get_agent_chat_module")
	@patch("frappe.get_installed_apps")
	def test_success_no_context(self, mock_installed_apps, mock_agent_chat, mock_require_manager):
		"""Should send message without context."""
		mock_installed_apps.return_value = ["huf"]
		mock_agent_chat_module = MagicMock()
		mock_agent_chat.return_value = mock_agent_chat_module
		mock_agent_chat_module.send_message_to_conversation.return_value = {"response": "Hello there!"}

		result = ury_chat.send_chat_message("CONV-123", "Hello")

		self.assertTrue(result["available"])
		self.assertIn("response", result)

	@patch("ury.ury.api.ury_chat.require_manager")
	@patch("ury.ury.api.ury_chat._get_agent_chat_module")
	@patch("frappe.get_installed_apps")
	def test_with_dict_context(self, mock_installed_apps, mock_agent_chat, mock_require_manager):
		"""Should include report context in message."""
		mock_installed_apps.return_value = ["huf"]
		mock_agent_chat_module = MagicMock()
		mock_agent_chat.return_value = mock_agent_chat_module
		mock_agent_chat_module.send_message_to_conversation.return_value = {"response": "Understood"}

		report_context = {"report": "Sales", "period": "Today"}
		result = ury_chat.send_chat_message("CONV-123", "Show me data", report_context)

		self.assertTrue(result["available"])
		call_args = mock_agent_chat_module.send_message_to_conversation.call_args
		sent_message = call_args[1]["message"]
		self.assertIn("[report_context]", sent_message)
		self.assertIn("report: Sales", sent_message)
		self.assertIn("Show me data", sent_message)

	@patch("ury.ury.api.ury_chat.require_manager")
	@patch("ury.ury.api.ury_chat._get_agent_chat_module")
	@patch("frappe.get_installed_apps")
	def test_with_json_context(self, mock_installed_apps, mock_agent_chat, mock_require_manager):
		"""Should parse JSON string context."""
		mock_installed_apps.return_value = ["huf"]
		mock_agent_chat_module = MagicMock()
		mock_agent_chat.return_value = mock_agent_chat_module
		mock_agent_chat_module.send_message_to_conversation.return_value = {"response": "Got it"}

		context_json = '{"branch": "Main", "status": "Active"}'
		result = ury_chat.send_chat_message("CONV-123", "Analyze", context_json)

		self.assertTrue(result["available"])
		call_args = mock_agent_chat_module.send_message_to_conversation.call_args
		sent_message = call_args[1]["message"]
		self.assertIn("[report_context]", sent_message)
		self.assertIn("branch: Main", sent_message)

	@patch("frappe.log_error")
	@patch("ury.ury.api.ury_chat.require_manager")
	@patch("ury.ury.api.ury_chat._get_agent_chat_module")
	@patch("frappe.get_installed_apps")
	def test_exception_handling(
		self, mock_installed_apps, mock_agent_chat, mock_require_manager, mock_log_error
	):
		"""Should catch exceptions and return unavailable."""
		mock_installed_apps.return_value = ["huf"]
		mock_agent_chat_module = MagicMock()
		mock_agent_chat.return_value = mock_agent_chat_module
		mock_agent_chat_module.send_message_to_conversation.side_effect = RuntimeError("API timeout")

		result = ury_chat.send_chat_message("CONV-123", "Hello")

		self.assertFalse(result["available"])
		self.assertIn("API timeout", result["reason"])


class TestGetChatHistory(FrappeTestCase):
	"""Test chat history retrieval from HUF."""

	@patch("ury.ury.api.ury_chat.require_manager")
	@patch("frappe.get_installed_apps")
	def test_huf_not_installed(self, mock_installed_apps, mock_require_manager):
		mock_installed_apps.return_value = []

		result = ury_chat.get_chat_history("CONV-123")

		self.assertFalse(result["available"])
		self.assertIn("not installed", result["reason"])

	@patch("ury.ury.api.ury_chat.require_manager")
	@patch("ury.ury.api.ury_chat._get_agent_chat_module")
	@patch("frappe.get_installed_apps")
	def test_default_limit(self, mock_installed_apps, mock_agent_chat, mock_require_manager):
		"""Should get history with default limit (50)."""
		mock_installed_apps.return_value = ["huf"]
		mock_agent_chat_module = MagicMock()
		mock_agent_chat.return_value = mock_agent_chat_module
		mock_history = [
			{"role": "user", "content": "Hello"},
			{"role": "assistant", "content": "Hi there!"},
		]
		mock_agent_chat_module.get_history.return_value = mock_history

		result = ury_chat.get_chat_history("CONV-123")

		self.assertTrue(result["available"])
		self.assertEqual(result["history"], mock_history)
		mock_agent_chat_module.get_history.assert_called_once_with(
			conversation_id="CONV-123", limit=50
		)

	@patch("ury.ury.api.ury_chat.require_manager")
	@patch("ury.ury.api.ury_chat._get_agent_chat_module")
	@patch("frappe.get_installed_apps")
	def test_custom_limit(self, mock_installed_apps, mock_agent_chat, mock_require_manager):
		"""Should respect custom limit parameter."""
		mock_installed_apps.return_value = ["huf"]
		mock_agent_chat_module = MagicMock()
		mock_agent_chat.return_value = mock_agent_chat_module
		mock_history = [{"role": "user", "content": "Ping"}]
		mock_agent_chat_module.get_history.return_value = mock_history

		result = ury_chat.get_chat_history("CONV-123", limit=10)

		self.assertTrue(result["available"])
		mock_agent_chat_module.get_history.assert_called_once_with(
			conversation_id="CONV-123", limit=10
		)

	@patch("ury.ury.api.ury_chat.require_manager")
	@patch("ury.ury.api.ury_chat._get_agent_chat_module")
	@patch("frappe.get_installed_apps")
	def test_string_limit_conversion(self, mock_installed_apps, mock_agent_chat, mock_require_manager):
		"""Should convert string limit to int."""
		mock_installed_apps.return_value = ["huf"]
		mock_agent_chat_module = MagicMock()
		mock_agent_chat.return_value = mock_agent_chat_module
		mock_agent_chat_module.get_history.return_value = []

		result = ury_chat.get_chat_history("CONV-123", limit="25")

		self.assertTrue(result["available"])
		mock_agent_chat_module.get_history.assert_called_once_with(
			conversation_id="CONV-123", limit=25
		)

	@patch("ury.ury.api.ury_chat.require_manager")
	@patch("ury.ury.api.ury_chat._get_agent_chat_module")
	@patch("frappe.get_installed_apps")
	def test_empty_history(self, mock_installed_apps, mock_agent_chat, mock_require_manager):
		"""Should handle empty history."""
		mock_installed_apps.return_value = ["huf"]
		mock_agent_chat_module = MagicMock()
		mock_agent_chat.return_value = mock_agent_chat_module
		mock_agent_chat_module.get_history.return_value = []

		result = ury_chat.get_chat_history("CONV-123")

		self.assertTrue(result["available"])
		self.assertEqual(result["history"], [])

	@patch("frappe.log_error")
	@patch("ury.ury.api.ury_chat.require_manager")
	@patch("ury.ury.api.ury_chat._get_agent_chat_module")
	@patch("frappe.get_installed_apps")
	def test_exception_handling(
		self, mock_installed_apps, mock_agent_chat, mock_require_manager, mock_log_error
	):
		"""Should catch exceptions and return unavailable."""
		mock_installed_apps.return_value = ["huf"]
		mock_agent_chat_module = MagicMock()
		mock_agent_chat.return_value = mock_agent_chat_module
		mock_agent_chat_module.get_history.side_effect = ValueError("Invalid conversation id")

		result = ury_chat.get_chat_history("CONV-INVALID")

		self.assertFalse(result["available"])
		self.assertIn("Invalid conversation id", result["reason"])


class TestHufUnavailableHelper(FrappeTestCase):
	"""Test error handling helper function."""

	@patch("frappe.log_error")
	def test_error_structure(self, mock_log_error):
		"""Should return proper error response and log."""
		reason = "Test error reason"
		result = ury_chat._huf_unavailable(reason)

		self.assertFalse(result["available"])
		self.assertEqual(result["reason"], reason)
		mock_log_error.assert_called_once()

	@patch("frappe.log_error")
	def test_logging(self, mock_log_error):
		"""Should log with correct title."""
		ury_chat._huf_unavailable("Some failure")

		mock_log_error.assert_called_once()
		call_kwargs = mock_log_error.call_args[1]
		self.assertEqual(call_kwargs["title"], "URY HUF chat unavailable")
