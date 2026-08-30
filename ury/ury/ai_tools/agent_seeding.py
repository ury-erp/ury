"""Seeds and self-heals the HUF "Agent" record backing the URY dashboard
chat widget (see `ury.ury.api.ury_chat`, which reads the agent name via
`URY_HUF_AGENT_CONF_KEY` / `DEFAULT_URY_HUF_AGENT_NAME`).

This module mirrors the pattern used by HUF's own
`huf.ai.app_seeding.hub_orchestrator` for HUF's "Hub Orchestrator" agent,
but is owned entirely by `ury` and only ever touches the single
"URY Dashboard Assistant" Agent record:

- `create_ury_dashboard_agent()` creates the Agent (idempotent — if it
  already exists, it self-heals provider/model and attached tools instead).
- `provision_ury_agent()` fills in a provider/model on an existing agent
  that doesn't have one yet (e.g. once an operator adds an API key to an
  AI Provider after initial seeding).
- `after_migrate()` / `on_ai_provider_update()` are the hook entry points;
  both are no-ops when `huf` is not installed, since `ury` must keep
  working with `huf` absent.

We deliberately do NOT import huf's underscore-prefixed helpers
(`_provider_has_key`, `_find_keyed_provider`, `_default_model_for_provider`)
from `hub_orchestrator` — those are private internals of a different app and
importing them would be a fragile cross-app coupling. Small local copies are
kept below instead.
"""

from contextlib import contextmanager
from pathlib import Path

import frappe

from ury.ury.api.ury_chat import DEFAULT_URY_HUF_AGENT_NAME

# Same preferred-model ordering HUF's hub_orchestrator uses when a provider
# has multiple chat-capable models and no explicit default is configured.
PREFERRED_MODELS = [
	"gemini-3.5-flash-lite",
	"gemini-3.1-flash-lite",
	"gemini-3.5-flash",
	"gpt-4o-mini",
	"claude-haiku-4.5",
	"claude-sonnet-4.5",
	"openai/gpt-4o-mini",
	"google/gemini-3.5-flash",
	"sonar",
	"command-a-03-2025",
]
_NON_CHAT_MARKERS = ("embedding", "whisper", "dall-e", "gpt-image", "tts", "image", "alternate")

# The 6 read-only tools this agent should have attached (kept in sync with
# ury.ury.ai_tools.ury_tools_registry.ALL_URY_TOOLS, which is the source of
# truth for the tool set).
_URY_TOOL_NAMES = None


def _get_ury_tool_names():
	"""Lazily read tool names from the tools registry so this module always
	tracks whatever tools are actually registered, rather than a hardcoded
	copy that could drift out of sync."""
	global _URY_TOOL_NAMES
	if _URY_TOOL_NAMES is None:
		from ury.ury.ai_tools.ury_tools_registry import ALL_URY_TOOLS

		_URY_TOOL_NAMES = [entry["tool_name"] for entry in ALL_URY_TOOLS]
	return _URY_TOOL_NAMES


# ---------------------------------------------------------------------------
# Small local copies of hub_orchestrator's provider/model resolution helpers.
# ---------------------------------------------------------------------------


def _provider_has_key(provider_name):
	if not provider_name or not frappe.db.exists("AI Provider", provider_name):
		return False
	try:
		return bool(frappe.get_doc("AI Provider", provider_name).get_password("api_key"))
	except frappe.ValidationError:
		return False


def _find_keyed_provider():
	for name in frappe.get_all("AI Provider", pluck="name", order_by="creation asc"):
		if _provider_has_key(name):
			return name
	return None


def _default_model_for_provider(provider_name):
	models = frappe.get_all(
		"AI Model", filters={"provider": provider_name}, pluck="name", order_by="creation asc"
	)
	if not models:
		return None
	for preferred in PREFERRED_MODELS:
		if preferred in models:
			return preferred
	for model in models:
		if not any(marker in model.lower() for marker in _NON_CHAT_MARKERS):
			return model
	return None


def _fallback_provider_model():
	if frappe.db.exists("AI Provider", "OpenAI") and frappe.db.exists("AI Model", "gpt-4o-mini"):
		return "OpenAI", "gpt-4o-mini"
	providers = frappe.get_all("AI Provider", pluck="name", order_by="creation asc", limit=1)
	if providers:
		model = _default_model_for_provider(providers[0])
		if model:
			return providers[0], model
	return None, None


def _resolve_default_provider_model(preferred_provider=None):
	"""Resolution order:

	1. HUF "Agent Settings" singleton default_provider + default_model, if
	   both are set — an operator-set global default takes priority over
	   any automatic scan.
	2. A keyed AI Provider (has an api_key) with a sensible chat model,
	   mirroring hub_orchestrator's own scan. `preferred_provider`, when
	   given and itself keyed, is tried first (mirrors hub's
	   `provider_doc` parameter to `provision_hub_orchestrator`).
	3. The same OpenAI/gpt-4o-mini-or-first-provider placeholder
	   hub_orchestrator falls back to, meant to be seeded disabled.

	Returns (provider_name_or_None, model_name_or_None, reason_str).
	"""
	default_provider = frappe.db.get_single_value("Agent Settings", "default_provider")
	default_model = frappe.db.get_single_value("Agent Settings", "default_model")
	if default_provider and default_model:
		return default_provider, default_model, "resolved via: Agent Settings defaults"

	if preferred_provider and _provider_has_key(preferred_provider):
		model = _default_model_for_provider(preferred_provider)
		if model:
			return preferred_provider, model, "resolved via: preferred keyed provider"

	keyed_provider = _find_keyed_provider()
	if keyed_provider:
		model = _default_model_for_provider(keyed_provider)
		if model:
			return keyed_provider, model, "resolved via: keyed provider scan"

	provider, model = _fallback_provider_model()
	if provider and model:
		return provider, model, "resolved via: fallback placeholder (seeded disabled)"

	return None, None, "resolved via: nothing available"


def _load_seed():
	seed_path = (
		Path(frappe.get_app_path("ury")) / "ury" / "ai_tools" / "agent_seeds" / "ury_dashboard_assistant.json"
	)
	return frappe.parse_json(seed_path.read_text())


def _attach_ury_tools(agent_doc):
	"""Append agent_tool rows for every URY tool that has a matching
	"Agent Tool Function" record, skipping ones already attached. Returns
	whether anything was added."""
	existing = {row.tool for row in agent_doc.get("agent_tool", [])}
	added = False
	for tool_name in _get_ury_tool_names():
		if tool_name in existing:
			continue
		if not frappe.db.exists("Agent Tool Function", tool_name):
			continue
		agent_doc.append("agent_tool", {"tool": tool_name})
		added = True
	return added


@contextmanager
def _seeding_flag():
	previous = getattr(frappe.flags, "in_seeding", None)
	frappe.flags.in_seeding = True
	try:
		yield
	finally:
		frappe.flags.in_seeding = previous


def create_ury_dashboard_agent():
	"""Idempotently create the "URY Dashboard Assistant" Agent record. If it
	already exists, self-heal its provider/model and attached tools instead
	of recreating it. Returns True if the agent was newly created."""
	agent_name = DEFAULT_URY_HUF_AGENT_NAME

	if frappe.db.exists("Agent", agent_name):
		provision_ury_agent()
		agent_doc = frappe.get_doc("Agent", agent_name)
		if _attach_ury_tools(agent_doc):
			with _seeding_flag():
				agent_doc.save(ignore_permissions=True)
		return False

	seed = _load_seed()
	doc = frappe.get_doc({"doctype": "Agent", **seed})

	provider, model, reason = _resolve_default_provider_model()
	is_placeholder = reason.startswith("resolved via: fallback placeholder")
	if not (provider and model):
		# _resolve_default_provider_model() reported nothing available at
		# all (not even a placeholder) -- fall back directly so the record
		# is still saveable with a valid Link, same as the placeholder path.
		provider, model = _fallback_provider_model()
		is_placeholder = True
	doc.provider = provider
	doc.model = model
	doc.disabled = 1 if is_placeholder else 0

	doc.source_app = "ury"
	doc.source_file = "ury/ai_tools/agent_seeds/ury_dashboard_assistant.json"

	_attach_ury_tools(doc)

	frappe.logger("ury").info(f"URY Agent seeding: creating '{agent_name}' ({reason})")

	with _seeding_flag():
		if not doc.provider or not doc.model:
			# No AI Provider/Model records exist at all yet — insert a
			# disabled placeholder anyway so the record exists for an
			# operator to complete later, matching hub_orchestrator's
			# last-resort approach.
			frappe.flags.ignore_mandatory = True
			try:
				doc.insert(ignore_permissions=True)
			finally:
				frappe.flags.ignore_mandatory = False
		else:
			doc.insert(ignore_permissions=True)

	return True


def provision_ury_agent(provider_doc=None):
	"""Fill in provider/model on the existing "URY Dashboard Assistant"
	Agent if it doesn't already have a usable one. No-op (returns False) if
	the agent doesn't exist yet, or already has both a provider and a
	model set (deliberately not requiring the provider to be keyed, since
	Agent Settings defaults may intentionally point at a keyless local
	LLM)."""
	agent_name = DEFAULT_URY_HUF_AGENT_NAME
	if not frappe.db.exists("Agent", agent_name):
		return False

	agent_doc = frappe.get_doc("Agent", agent_name)
	if agent_doc.provider and agent_doc.model and not agent_doc.disabled:
		# Already has a usable (enabled) provider/model — e.g. manually
		# configured via the settings UI, or an Agent Settings default
		# pointing at a keyless local LLM. A still-disabled placeholder
		# (provider/model set but disabled=1) falls through so it can be
		# promoted once a real key shows up.
		return False

	preferred_provider = provider_doc.name if provider_doc else None
	provider, model, reason = _resolve_default_provider_model(preferred_provider=preferred_provider)
	is_placeholder = reason.startswith("resolved via: fallback placeholder")
	if not (provider and model) or is_placeholder:
		return False

	agent_doc.provider = provider
	agent_doc.model = model
	agent_doc.disabled = 0

	frappe.logger("ury").info(f"URY Agent seeding: provisioning '{agent_name}' ({reason})")

	with _seeding_flag():
		agent_doc.save(ignore_permissions=True)

	return True


def after_migrate():
	"""Hook entry point (wired in `ury/hooks.py`). No-op when huf isn't
	installed on this site; never raises, so a seeding failure never breaks
	the rest of `bench migrate`."""
	if "huf" not in frappe.get_installed_apps():
		return
	try:
		create_ury_dashboard_agent()
	except Exception:
		frappe.log_error(title="URY Agent seeding failed")


def on_ai_provider_update(doc, method=None):
	"""Hook entry point (wired in `ury/hooks.py`'s doc_events for
	"AI Provider"). No-op when huf isn't installed; never raises."""
	if "huf" not in frappe.get_installed_apps():
		return
	try:
		provision_ury_agent(provider_doc=doc)
	except Exception:
		frappe.log_error(title="URY Agent seeding failed")
