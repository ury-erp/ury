"""Administrator is an owner for URY Brief by default; write the explicit site default once."""

import frappe
from frappe.installer import update_site_config

KEY = "ury_brief_allow_administrator"


AGENT = "URY Chairman Assistant"


def ensure_default():
	"""Idempotent. Administrator is an owner by default (site config written once); and once the Huf
	seed has created the agent, point the chat setting at it so a fresh install works without manual steps."""
	if frappe.conf.get(KEY) is None:
		update_site_config(KEY, 1)
	try:
		if frappe.db.exists("Agent", AGENT) and not frappe.db.get_single_value("URY Chairman Settings", "chat_agent"):
			frappe.db.set_single_value("URY Chairman Settings", "chat_agent", AGENT)
	except Exception:
		frappe.log_error(title="URY Brief: could not set chat agent")
	_fill_empty_settings()


# Safe defaults, applied only when the field is empty. voice_call_enabled is deliberately NOT set (stays off).
SETTINGS_DEFAULTS = {
	"call_model": "models/gemini-3.8-live",
	"call_voice": "Puck",
	"call_max_seconds": 300,
	"call_daily_minutes_per_user": 30,
	"audio_retention_days": 7,
}


def _fill_empty_settings():
	try:
		for field, value in SETTINGS_DEFAULTS.items():
			if not frappe.db.get_single_value("URY Chairman Settings", field):
				frappe.db.set_single_value("URY Chairman Settings", field, value)
	except Exception:
		frappe.log_error(title="URY Brief: could not set default settings")
