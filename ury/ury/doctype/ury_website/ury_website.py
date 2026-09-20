import re
from urllib.parse import unquote, urlsplit

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, get_time


DAYS = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")


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
		if self.language not in ("ar", "en") or self.theme not in ("Olive", "Terracotta", "Midnight"):
			frappe.throw(_("Choose a valid language and theme."))
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
