"""Whitelisted API layer for URY managers to configure the AI assistant
(PR: AI Reports Dashboard settings surface).

`ury` has no hard dependency on `huf`: the dashboard must keep working when
`huf` is not installed on the site. Every function that touches HUF records
therefore checks `"huf" in frappe.get_installed_apps()` first. Read-style
endpoints (get_agent_config, list_ai_providers, list_ai_models) degrade
gracefully and return `{"available": False, ...}` rather than raising.
Mutation endpoints (update_agent_config, set_provider_api_key) frappe.throw
instead, since there is nothing meaningful to mutate when HUF isn't there.

Provider API keys are never read back or logged anywhere in this module --
only whether a key is set (a boolean) is ever exposed.
"""

import frappe
from frappe import _

from ury.ury.api.ury_chat import _get_agent_name
from ury.ury.report_api.utils import require_manager


def _huf_installed():
	return "huf" in frappe.get_installed_apps()


def _coerce_bool(value):
	if isinstance(value, str):
		return value.strip().lower() in {"1", "true", "yes", "on"}
	return bool(value)


@frappe.whitelist(methods=["GET"])
def get_ai_settings():
	require_manager()
	return {"enabled": bool(frappe.db.get_single_value("URY AI Settings", "enabled"))}


@frappe.whitelist(methods=["POST"])
def set_ai_enabled(enabled):
	require_manager()
	doc = frappe.get_single("URY AI Settings")
	doc.enabled = 1 if _coerce_bool(enabled) else 0
	doc.save(ignore_permissions=True)
	return {"enabled": bool(doc.enabled)}


@frappe.whitelist(methods=["GET"])
def get_agent_config():
	require_manager()

	if not _huf_installed():
		return {"available": False, "reason": "huf app is not installed on this site"}

	agent_name = _get_agent_name()
	if not frappe.db.exists("Agent", agent_name):
		return {"available": False, "reason": f"HUF Agent {agent_name!r} does not exist"}

	doc = frappe.get_doc("Agent", agent_name)
	return {
		"available": True,
		"agent_name": doc.name,
		"provider": doc.provider,
		"model": doc.model,
		"temperature": doc.temperature,
		"top_p": doc.top_p,
		"enable_prompt_caching": bool(doc.enable_prompt_caching),
		"disabled": bool(doc.disabled),
	}


@frappe.whitelist(methods=["POST"])
def update_agent_config(provider=None, model=None, temperature=None, top_p=None, enable_prompt_caching=None):
	require_manager()

	if not _huf_installed():
		frappe.throw(_("HUF is not installed on this site"))

	agent_name = _get_agent_name()
	if not frappe.db.exists("Agent", agent_name):
		frappe.throw(
			_(
				"HUF Agent {0} does not exist yet. Wait for the next bench migrate "
				"(agent seeding may not have run) before configuring it."
			).format(frappe.bold(agent_name))
		)

	doc = frappe.get_doc("Agent", agent_name)

	# Treat an empty string the same as "not provided" -- the frontend's
	# provider/model selects reset to '' while their options are (re)loading,
	# and blindly writing that through breaks Agent.validate() (a blank
	# model trips HUF's own prompt-caching check with a confusing 417).
	if provider:
		doc.provider = provider
	if model:
		doc.model = model
	if temperature is not None:
		doc.temperature = float(temperature)
	if top_p is not None:
		doc.top_p = float(top_p)
	if enable_prompt_caching is not None:
		doc.enable_prompt_caching = 1 if _coerce_bool(enable_prompt_caching) else 0

	doc.save(ignore_permissions=True)

	return {
		"available": True,
		"agent_name": doc.name,
		"provider": doc.provider,
		"model": doc.model,
		"temperature": doc.temperature,
		"top_p": doc.top_p,
		"enable_prompt_caching": bool(doc.enable_prompt_caching),
		"disabled": bool(doc.disabled),
	}


@frappe.whitelist(methods=["GET"])
def list_ai_providers():
	require_manager()

	if not _huf_installed():
		return {"available": False, "providers": []}

	# Deliberately does not check whether a key is already set: that would
	# mean one get_password() call per provider on every settings-page load,
	# for a status the settings UI no longer needs (setting a key is just a
	# name + a value, not a checklist against HUF's full provider catalog).
	rows = frappe.get_all(
		"AI Provider",
		fields=["name", "provider_brand"],
		order_by="provider_brand asc",
	)

	return {"available": True, "providers": rows}


@frappe.whitelist(methods=["GET"])
def list_ai_models(provider):
	require_manager()

	if not _huf_installed():
		return {"available": False, "models": []}

	models = frappe.get_all("AI Model", filters={"provider": provider}, pluck="name", order_by="creation asc")
	return {"available": True, "models": models}


@frappe.whitelist(methods=["POST"])
def set_provider_api_key(provider, api_key):
	require_manager()

	if not _huf_installed():
		frappe.throw(_("HUF is not installed on this site"))

	if not api_key or not api_key.strip():
		frappe.throw(_("API key cannot be empty"))

	if not frappe.db.exists("AI Provider", provider):
		frappe.throw(_("AI Provider {0} does not exist").format(frappe.bold(provider)))

	doc = frappe.get_doc("AI Provider", provider)
	doc.api_key = api_key.strip()
	doc.save(ignore_permissions=True)

	return {"success": True}
