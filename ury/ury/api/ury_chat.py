"""Thin whitelisted proxy layer over HUF's chat API (PR-B, item 4/5's backend
half — see PLAN.md and HUF_API_NOTES.md).

`ury` has no hard dependency on `huf`: the dashboard must keep working when
`huf` is not installed on the site. Every function here therefore:

- checks `"huf" in frappe.get_installed_apps()` before doing anything else,
- imports `huf.ai.agent_chat` lazily, inside the function body (not at module
  import time — importing `huf` at module load would break every site
  that doesn't have the app installed at all), and
- catches any failure (ImportError, missing Agent record, etc.) and returns
  `{"available": False, "reason": "..."}` rather than raising, so a HUF
  outage or missing install never turns into a 500 for the dashboard.

The HUF Agent record itself (title configured via `ury_huf_agent_name`) is
expected to already exist — creating/administering that Agent is an
operational setup step, not something this module does.
"""

import frappe

from ury.ury.report_api.utils import require_manager

# Name/title of the HUF Agent record the URY dashboard talks to. Configurable
# via site_config so different environments can point at differently-named
# Agent records without a code change; defaults to the name used in PLAN.md.
URY_HUF_AGENT_CONF_KEY = "ury_huf_agent_name"
DEFAULT_URY_HUF_AGENT_NAME = "URY Dashboard Assistant"

# frappe.cache() key under which we stash "this session's conversation id
# for this user", so repeated calls reuse the same Agent Conversation instead
# of creating a new one per chat message.
_CONVERSATION_CACHE_PREFIX = "ury_huf_conversation"


def _huf_unavailable(reason):
	frappe.log_error(title="URY HUF chat unavailable", message=reason)
	return {"available": False, "reason": reason}


def _get_agent_chat_module():
	"""Lazily import huf.ai.agent_chat. Returns the module, or raises
	ImportError/AttributeError if huf isn't installed or doesn't expose the
	expected API (both are caught by callers)."""
	import huf.ai.agent_chat as agent_chat

	return agent_chat


def _get_agent_name():
	return frappe.conf.get(URY_HUF_AGENT_CONF_KEY) or DEFAULT_URY_HUF_AGENT_NAME


def _conversation_cache_key():
	return f"{_CONVERSATION_CACHE_PREFIX}:{frappe.session.user}"


def _format_report_context(report_context):
	"""HUF's chat API has no dedicated structured-context parameter on
	`send_message_to_conversation`/`new_conversation` (only a free-form
	`message` string plus an unrelated `project` link) — see
	HUF_API_NOTES.md. Pragmatic fallback: prepend a clearly-delimited
	context block to the message text so the agent still knows what report
	the user is looking at. Revisit if HUF grows a real structured-context
	param."""
	if not report_context:
		return ""

	lines = "\n".join(f"{key}: {value}" for key, value in report_context.items())
	return f"[report_context]\n{lines}\n[/report_context]\n\n"


@frappe.whitelist(methods=["GET", "POST"])
def get_or_create_conversation(report_context=None):
	"""Return an existing (cached) or newly-created HUF Agent Conversation id
	for the current user + the URY Dashboard Assistant agent.

	Returns `{"available": True, "conversation_id": ...}` on success, or
	`{"available": False, "reason": ...}` if HUF is not installed, the Agent
	record does not exist, or anything else goes wrong.
	"""
	require_manager()

	if "huf" not in frappe.get_installed_apps():
		return _huf_unavailable("huf app is not installed on this site")

	cache_key = _conversation_cache_key()
	cached_id = frappe.cache().get_value(cache_key)
	if cached_id:
		return {"available": True, "conversation_id": cached_id}

	try:
		agent_chat = _get_agent_chat_module()
		agent_name = _get_agent_name()

		if not frappe.db.exists("Agent", agent_name):
			return _huf_unavailable(f"HUF Agent {agent_name!r} does not exist")

		agent_doc = frappe.db.get_value(
			"Agent", agent_name, ["disabled", "provider", "model"], as_dict=True
		)
		if agent_doc.disabled:
			return _huf_unavailable(f"HUF Agent {agent_name!r} is disabled")
		if not (agent_doc.provider and agent_doc.model):
			return _huf_unavailable(f"HUF Agent {agent_name!r} has no provider/model configured")

		conversation = agent_chat.create_conversation(agent=agent_name, channel="Chat")
		conversation_id = (
			conversation.get("name") if isinstance(conversation, dict) else conversation
		)

		frappe.cache().set_value(cache_key, conversation_id, expires_in_sec=3600)
		return {"available": True, "conversation_id": conversation_id}
	except Exception:
		return _huf_unavailable(frappe.get_traceback())


@frappe.whitelist(methods=["POST"])
def send_chat_message(conversation_id, message, report_context=None):
	"""Forward `message` to the given HUF Agent Conversation, optionally
	prefixing it with a delimited report_context block (see
	`_format_report_context`) so HUF is aware of what report the user is
	currently viewing.
	"""
	require_manager()

	if "huf" not in frappe.get_installed_apps():
		return _huf_unavailable("huf app is not installed on this site")

	if isinstance(report_context, str):
		report_context = frappe.parse_json(report_context)

	try:
		agent_chat = _get_agent_chat_module()

		full_message = _format_report_context(report_context) + message

		response = agent_chat.send_message_to_conversation(
			conversation_id=conversation_id,
			message=full_message,
		)
		return {"available": True, "response": response}
	except Exception:
		return _huf_unavailable(frappe.get_traceback())


@frappe.whitelist(methods=["GET"])
def get_chat_history(conversation_id, limit=50):
	"""Thin wrapper over `huf.ai.agent_chat.get_history`."""
	require_manager()

	if "huf" not in frappe.get_installed_apps():
		return _huf_unavailable("huf app is not installed on this site")

	try:
		agent_chat = _get_agent_chat_module()
		history = agent_chat.get_history(conversation_id=conversation_id, limit=int(limit))
		return {"available": True, "history": history}
	except Exception:
		return _huf_unavailable(frappe.get_traceback())
