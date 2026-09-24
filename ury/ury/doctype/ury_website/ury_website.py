import re
from urllib.parse import unquote, urlsplit

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, get_time


DAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
THEMES = ("Olive", "Terracotta", "Midnight")
LAYOUTS = ("Classic", "Centered", "Editorial")


def public_url(value, image=False):
	"""Only allow public uploads or HTTPS URLs, including in legacy saved data."""
	value = (value or "").strip()
	if not value or any(ord(c) < 32 for c in value) or "\\" in value:
		return ""
	try:
		parsed = urlsplit(value)
	except ValueError:
		return ""
	decoded = unquote(parsed.path)
	if "\\" in decoded or any(ord(c) < 32 for c in decoded):
		return ""
	if image and value.startswith(("/files/", "/assets/")) and ".." not in decoded:
		return value
	if parsed.scheme == "https" and parsed.netloc and not parsed.username:
		return value
	return ""


class URYWebsite(Document):
	def validate(self):
		if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", self.slug or "") or len(self.slug) > 80:
			frappe.throw(_("Use lowercase letters, numbers and single hyphens for the page address."))
		if not (self.restaurant_name or "").strip():
			frappe.throw(_("A display name is required."))
		if self.language not in ("ar", "en") or self.theme not in THEMES:
			frappe.throw(_("Choose a valid language and theme."))
		if (self.layout or "Classic") not in LAYOUTS:
			frappe.throw(_("Choose a valid layout."))
		for field, low, high in (("duration_minutes", 30, 240), ("lead_minutes", 0, 1440),
								 ("advance_days", 1, 90), ("max_guests", 1, 50)):
			if not low <= cint(self.get(field)) <= high:
				frappe.throw(_("{0} must be between {1} and {2}.").format(field, low, high))
		for field in ("logo", "hero_image", "story_image", "map_url", "instagram_url"):
			if self.get(field) and not public_url(self.get(field), image=field not in ("map_url", "instagram_url")):
				frappe.throw(_("Use a public image upload or a valid HTTPS link for {0}.").format(field))
		for row in self.gallery:
			if not public_url(row.image, image=True):
				frappe.throw(_("Gallery images must be public uploads or HTTPS links."))
		seen = set()
		for row in self.hours:
			if row.day not in DAYS or row.day in seen:
				frappe.throw(_("Provide opening hours only once per day."))
			seen.add(row.day)
			if row.opens is None or row.closes is None or get_time(row.opens) == get_time(row.closes):
				frappe.throw(_("Opening and closing times must be different."))
		if self.enable_reservations and not self.hours:
			frappe.throw(_("Set opening hours before accepting reservations."))
		branch = frappe.db.get_value("URY Restaurant", self.restaurant, "branch")
		if self.menu and frappe.db.get_value("URY Menu", self.menu, "branch") != branch:
			frappe.throw(_("The public menu must belong to the restaurant's branch."))


# Fields the editor in the management app is allowed to write. Anything else —
# `published` above all — is changed through its own call, so a draft payload
# can never publish a page as a side effect of typing in a text box.
EDITABLE_FIELDS = (
	"slug", "restaurant", "restaurant_name", "language", "theme", "layout",
	"logo", "hero_image", "eyebrow", "hero_title", "hero_description",
	"show_story", "story_title", "story", "story_image",
	"show_menu", "menu", "menu_note",
	"address", "phone", "map_url", "instagram_url",
	"enable_reservations", "duration_minutes", "lead_minutes", "advance_days",
	"max_guests", "booking_note", "privacy_note", "seo_title", "seo_description",
)

CHILD_FIELDS = {"gallery": ("image", "caption"), "hours": ("day", "opens", "closes")}

# A gallery of a hundred images is not a gallery, and a draft that large is a
# mistake or an attack on the cache rather than a page someone is editing.
MAX_GALLERY_ROWS = 24


def draft_key(slug, user=None):
	"""Where one editor's unsaved preview lives.

	Keyed by user as well as page: two managers editing the same restaurant
	must each preview their own work, not overwrite each other's.
	"""
	return f"ury_website_draft:{user or frappe.session.user}:{slug}"


def apply_draft(doc, draft):
	"""Overlay unsaved editor values onto an in-memory document.

	Deliberately forgiving: this feeds a preview, not a save. A half-typed
	time or a field the editor does not know about is skipped rather than
	thrown, because the person is still typing and an error page is not a
	useful answer to "what will this look like?". Everything that reaches the
	rendered page still goes through the same escaping and `public_url`
	filtering as saved content.
	"""
	if not isinstance(draft, dict):
		return doc

	for field in EDITABLE_FIELDS:
		if field in draft:
			doc.set(field, draft[field])

	for table, columns in CHILD_FIELDS.items():
		if table not in draft:
			continue
		rows = draft[table]
		if not isinstance(rows, list):
			continue
		doc.set(table, [])
		for row in rows[:MAX_GALLERY_ROWS]:
			if not isinstance(row, dict):
				continue
			try:
				if table == "hours":
					# A day with no times yet is a row the editor is still
					# filling in, not a day the restaurant is open for zero
					# minutes. Leaving it out keeps the preview honest.
					if not row.get("opens") or not row.get("closes"):
						continue
					get_time(row["opens"]), get_time(row["closes"])
				doc.append(table, {column: row.get(column) for column in columns})
			except Exception:
				continue

	return doc


def readiness(doc):
	"""What is missing before this page is fit for the public.

	Two severities, and the difference matters: `blocking` is what the page
	cannot honestly go live without, while `advised` is what makes it good.
	Mixing them into one list of warnings is how a checklist gets ignored.
	"""
	items = []

	def add(key, ok, blocking):
		if not ok:
			items.append({"key": key, "blocking": blocking})

	add("restaurant_name", (doc.restaurant_name or "").strip(), True)
	add("hero_title", (doc.hero_title or "").strip(), True)
	add("address", (doc.address or "").strip(), True)
	add("phone", (doc.phone or "").strip(), True)
	add("hours", bool(doc.hours), bool(doc.enable_reservations))
	add("menu", not doc.show_menu or bool(doc.menu or frappe.db.get_value(
		"URY Restaurant", doc.restaurant, "active_menu")), True)

	add("logo", bool(doc.logo), False)
	add("hero_image", bool(doc.hero_image), False)
	add("hero_description", (doc.hero_description or "").strip(), False)
	add("story", not doc.show_story or (doc.story or "").strip(), False)
	add("gallery", len(doc.gallery) >= 3, False)
	add("seo_description", (doc.seo_description or "").strip(), False)
	add("map_url", bool(doc.map_url), False)

	return items
