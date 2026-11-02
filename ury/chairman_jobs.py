"""Scheduled jobs for the Chairman Brief PWA."""

import frappe
from frappe.utils import add_days, now_datetime

# Tag: ury creates chairman chat audio Files with this filename prefix.
AUDIO_PREFIX = "ury-brief-voice-"
AUDIO_EXTENSIONS = (".webm", ".ogg", ".opus", ".mp3", ".m4a", ".wav", ".mp4", ".aac")
DEFAULT_RETENTION_DAYS = 7


def is_chairman_audio(file_name, attached_to_doctype=None, attached_to_name=None):
	"""True only for audio Files carrying the chairman tag (prefix + audio extension)."""
	name = (file_name or "").lower()
	return name.startswith(AUDIO_PREFIX) and name.endswith(AUDIO_EXTENSIONS)


def get_retention_days():
	try:
		days = frappe.db.get_single_value("URY Chairman Settings", "audio_retention_days")
	except Exception:
		days = None
	if days is None or int(days) < 1:
		return DEFAULT_RETENTION_DAYS
	return int(days)


def purge_chairman_audio(retention_days=None):
	"""Daily: delete chairman chat audio Files older than the retention window.

	Candidates are pre-filtered by the filename prefix in SQL and re-checked by
	is_chairman_audio() before each delete, so no untagged File can be removed.
	"""
	days = int(retention_days) if retention_days else get_retention_days()
	cutoff = add_days(now_datetime(), -days)
	rows = frappe.get_all(
		"File",
		filters={"file_name": ["like", f"{AUDIO_PREFIX}%"], "creation": ["<", cutoff], "is_folder": 0},
		fields=["name", "file_name", "attached_to_doctype", "attached_to_name"],
		limit_page_length=0,
	)
	deleted = []
	for r in rows:
		if not is_chairman_audio(r.file_name, r.attached_to_doctype, r.attached_to_name):
			continue
		frappe.delete_doc("File", r.name, ignore_permissions=True, force=True)
		deleted.append(r.name)
	return deleted


def build_snapshots():
	"""Stub: daily chairman snapshot job (not yet implemented)."""
	return None
