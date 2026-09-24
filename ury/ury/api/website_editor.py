"""Editor-side API for the restaurant website.

Separate from `restaurant_website.py` on purpose: that module answers the
public internet and must never grow a write path a guest could reach. This
one is staff-only, every call goes through the document's own permissions,
and nothing here is whitelisted for guests.
"""

import frappe
from frappe import _
from frappe.utils import cint

from ury.ury.doctype.ury_website.ury_website import (
	CHILD_FIELDS,
	DAYS,
	EDITABLE_FIELDS,
	LAYOUTS,
	MAX_GALLERY_ROWS,
	THEMES,
	draft_key,
	readiness,
)

# Long enough that a manager can leave the tab open over a phone call, short
# enough that an abandoned draft does not sit in the cache all week.
DRAFT_TTL_SECONDS = 60 * 60

DEFAULTS = {
	"language": "ar",
	"theme": "Olive",
	"layout": "Classic",
	"show_menu": 1,
	"show_story": 1,
	"enable_reservations": 0,
	"duration_minutes": 90,
	"lead_minutes": 60,
	"advance_days": 14,
	"max_guests": 8,
}


def _as_dict(payload):
	if isinstance(payload, str):
		payload = frappe.parse_json(payload)
	if not isinstance(payload, dict):
		frappe.throw(_("Invalid website data."))
	return payload


def _doc_state(doc):
	data = {field: doc.get(field) for field in EDITABLE_FIELDS}
	data["name"] = doc.name
	data["published"] = cint(doc.published)
	data["gallery"] = [{"image": row.image, "caption": row.caption or ""} for row in doc.gallery]
	data["hours"] = [
		{"day": row.day, "opens": str(row.opens or ""), "closes": str(row.closes or "")}
		for row in sorted(doc.hours, key=lambda h: DAYS.index(h.day) if h.day in DAYS else 99)
	]
	data["readiness"] = readiness(doc)
	return data


@frappe.whitelist()
def get_editor_state(restaurant=None):
	"""Everything the editor screen needs to render, in one call.

	Returns `website: None` when no page exists yet rather than creating one:
	a record that appears because someone opened a screen is a record nobody
	decided to make, and its slug would be a guess.
	"""
	if not frappe.has_permission("URY Website", "read"):
		frappe.throw(_("Not permitted to manage the restaurant website."), frappe.PermissionError)

	restaurants = frappe.get_list(
		"URY Restaurant", fields=["name", "branch", "active_menu"], order_by="name"
	)
	chosen = restaurant or (restaurants[0].name if restaurants else None)

	name = frappe.db.get_value("URY Website", {"restaurant": chosen}, "name") if chosen else None
	doc = frappe.get_doc("URY Website", name) if name else None
	if doc:
		doc.check_permission("read")

	branch = next((r.branch for r in restaurants if r.name == chosen), None)
	menus = (
		frappe.get_list(
			"URY Menu", filters={"branch": branch, "enabled": 1}, fields=["name"], order_by="name"
		)
		if branch
		else []
	)

	return {
		"website": _doc_state(doc) if doc else None,
		"restaurants": restaurants,
		"restaurant": chosen,
		"menus": [m.name for m in menus],
		"themes": list(THEMES),
		"layouts": list(LAYOUTS),
		"days": list(DAYS),
		"defaults": DEFAULTS,
		"can_write": frappe.has_permission("URY Website", "write"),
		"can_create": frappe.has_permission("URY Website", "create"),
		"max_gallery_rows": MAX_GALLERY_ROWS,
	}


@frappe.whitelist()
def save_website(payload):
	"""Create or update the page from the editor.

	`published` is not in EDITABLE_FIELDS and is not read here, so saving can
	never put a page in front of the public as a side effect — that is
	`set_published`, which says what it does.
	"""
	payload = _as_dict(payload)
	slug = (payload.get("slug") or "").strip()
	name = frappe.db.get_value("URY Website", {"slug": slug}, "name")

	if name:
		doc = frappe.get_doc("URY Website", name)
		doc.check_permission("write")
	else:
		doc = frappe.new_doc("URY Website")
		for field, value in DEFAULTS.items():
			doc.set(field, value)

	for field in EDITABLE_FIELDS:
		if field in payload:
			doc.set(field, payload[field])

	for table, columns in CHILD_FIELDS.items():
		if table not in payload:
			continue
		rows = payload[table]
		if not isinstance(rows, list):
			frappe.throw(_("Invalid {0} data.").format(table))
		doc.set(table, [])
		for row in rows[:MAX_GALLERY_ROWS]:
			if isinstance(row, dict) and any(row.get(column) for column in columns):
				doc.append(table, {column: row.get(column) for column in columns})

	if name:
		doc.save()
	else:
		doc.insert()
	frappe.cache().delete_value(draft_key(doc.slug))
	return _doc_state(doc)


@frappe.whitelist()
def save_preview_draft(slug, payload):
	"""Hold unsaved edits so the preview can show them.

	Nothing is written to the database. This is what makes a live preview
	honest for a page that is already published: the manager sees their
	changes immediately while guests keep seeing the published page, until
	the manager decides to save.
	"""
	payload = _as_dict(payload)
	name = frappe.db.get_value("URY Website", {"slug": str(slug or "")[:80]}, "name")
	if not name:
		frappe.throw(_("Page not found."), frappe.DoesNotExistError)
	frappe.get_doc("URY Website", name).check_permission("write")

	draft = {field: payload[field] for field in EDITABLE_FIELDS if field in payload}
	for table in CHILD_FIELDS:
		if isinstance(payload.get(table), list):
			draft[table] = payload[table][:MAX_GALLERY_ROWS]

	frappe.cache().set_value(draft_key(slug), draft, expires_in_sec=DRAFT_TTL_SECONDS)
	return {"ok": True}


@frappe.whitelist()
def discard_preview_draft(slug):
	"""Throw the unsaved preview away and fall back to what is saved."""
	frappe.cache().delete_value(draft_key(str(slug or "")[:80]))
	return {"ok": True}


@frappe.whitelist()
def set_published(slug, published):
	"""Open the page to the public, or close it.

	Publishing runs the document's own validation first: a page that cannot
	be saved must not be reachable, and a blocking gap in the checklist is
	refused here rather than discovered by a guest.
	"""
	name = frappe.db.get_value("URY Website", {"slug": str(slug or "")[:80]}, "name")
	if not name:
		frappe.throw(_("Page not found."), frappe.DoesNotExistError)

	doc = frappe.get_doc("URY Website", name)
	doc.check_permission("write")
	wanted = cint(published)

	if wanted:
		blocking = [item["key"] for item in readiness(doc) if item["blocking"]]
		if blocking:
			frappe.throw(
				_("Complete these before publishing: {0}").format(", ".join(blocking))
			)

	doc.published = wanted
	doc.save()
	return _doc_state(doc)
