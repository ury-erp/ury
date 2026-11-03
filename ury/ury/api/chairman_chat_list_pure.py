"""Frappe-free helpers for the owner chat list/rename/delete endpoints (unit-testable)."""

import re

AUTO_TITLE_PREFIX = "Conversation with "  # Huf's auto-generated conversation title
TITLE_MAX = 80
PREVIEW_MAX = 120
LIST_DEFAULT_LIMIT = 40
LIST_MAX_LIMIT = 100

_HINT_TAIL = re.compile(r"\s*\[Language: [^\].]+\. Reply in [^\].]+\.\]\s*$")


def strip_language_hint(text):
	"""Remove the trailing language hint added by with_language_hint (for titles/previews)."""
	return _HINT_TAIL.sub("", text or "").strip()


def clean_title(text, max_len=TITLE_MAX):
	t = strip_language_hint(text).replace("\n", " ").strip()
	return t[:max_len] or "Conversation"


def coerce_list_limit(limit):
	s = str(limit).strip()
	return max(1, min(int(s), LIST_MAX_LIMIT)) if s.isdigit() else LIST_DEFAULT_LIMIT


def clean_rename_title(title):
	"""Collapse whitespace and cap at 80 chars; empty string when nothing is left."""
	return " ".join(str(title or "").split())[:TITLE_MAX]


def conversation_row(r):
	"""Shape one grouped-query row (mapping-like with attribute or key access) for the API."""
	get = (lambda k: r.get(k)) if isinstance(r, dict) else (lambda k: getattr(r, k, None))
	custom = (get("title") or "").strip()
	if custom.startswith(AUTO_TITLE_PREFIX):
		custom = ""
	last_role = get("last_role")
	return {
		"id": get("name"),
		"title": custom[:TITLE_MAX] if custom else clean_title(get("first_user")),
		"preview": strip_language_hint(get("last_content")).replace("\n", " ")[:PREVIEW_MAX],
		"last_role": last_role,
		"pending": last_role == "user",
		"started_by_voice": bool(get("started_by_voice")),
		"last_at": str(get("modified")),
		"created_at": str(get("creation")),
	}
