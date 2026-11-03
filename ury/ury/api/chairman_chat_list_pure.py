"""Frappe-free helpers for the owner chat list/rename/delete endpoints (unit-testable)."""

import datetime
import re

AUTO_TITLE_PREFIX = "Conversation with "  # Huf's auto-generated conversation title
TITLE_MAX = 80
PREVIEW_MAX = 120
LIST_DEFAULT_LIMIT = 40
LIST_MAX_LIMIT = 100

# Trailing "[Language: ...]" and/or "[Today is ...]" blocks, any order, repeated.
_HINT_TAIL = re.compile(r"(?:\s*\[(?:Language: |Today is )[^\]]*\])+\s*$")


def date_hint(today=None):
	"""Second hint line: the SITE date, so the agent never guesses the year. `today` injectable."""
	if today is None:
		import frappe

		today = frappe.utils.getdate(frappe.utils.nowdate())
	if isinstance(today, datetime.datetime):
		today = today.date()
	elif isinstance(today, str):
		today = datetime.date.fromisoformat(today[:10])
	y = today - datetime.timedelta(days=1)
	return (
		f"[Today is {today:%A} {today.isoformat()}; yesterday was {y:%A} {y.isoformat()}. "
		f"For 'yesterday' use {y.isoformat()} (or leave the date empty); only use {today.isoformat()} for 'today'. "
		"Use exact YYYY-MM-DD dates and never guess the year.]"
	)


def strip_language_hint(text):
	"""Remove the trailing language/date hints added by with_language_hint (for titles/previews)."""
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
