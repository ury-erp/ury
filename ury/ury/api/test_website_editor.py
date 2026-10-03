"""Run with unittest: no Frappe test hooks, fixtures, or committed website records."""
import unittest
from unittest.mock import MagicMock, patch

import frappe

from ury.ury.api import website_editor as editor
from ury.ury.doctype.ury_website import ury_website as model


# The whitelist decorator wraps the function in Frappe's argument-type
# validation, which reads request flags that only exist inside a site. These
# tests are about the logic, so they call through the wrapper.
set_published = getattr(editor.set_published, "__wrapped__", editor.set_published)


def reject(message, *args, **kwargs):
	raise ValueError(message)


def page(**overrides):
	values = dict(
		name="smart-choice", slug="smart-choice", published=0, restaurant="Smart Choice",
		restaurant_name="Smart Choice", hero_title="Smart Choice", address="Baghdad",
		phone="07700000000", show_menu=0, show_story=0, enable_reservations=0,
		menu=None, logo=None, hero_image=None, hero_description="", story="",
		seo_description="", map_url=None, gallery=[], hours=[],
	)
	values.update(overrides)
	return frappe._dict(values)


class TestDraftOverlay(unittest.TestCase):
	"""A draft feeds a preview, so it forgives what a save would refuse."""

	def test_applies_known_fields_only(self):
		doc = MagicMock()
		doc.set = MagicMock()
		model.apply_draft(doc, {"hero_title": "New", "published": 1, "not_a_field": "x"})

		written = {call.args[0] for call in doc.set.call_args_list}
		self.assertIn("hero_title", written)
		self.assertNotIn("published", written)
		self.assertNotIn("not_a_field", written)

	def test_ignores_a_non_dict_draft(self):
		doc = MagicMock()
		self.assertIs(model.apply_draft(doc, "junk"), doc)
		doc.set.assert_not_called()

	def test_skips_an_hours_row_still_being_typed(self):
		doc = frappe._dict(hours=[], set=lambda key, value: None, append=None)
		appended = []
		doc.append = lambda table, row: appended.append(row)
		doc.set = lambda table, value: None

		model.apply_draft(doc, {"hours": [
			{"day": "Monday", "opens": "", "closes": ""},
			{"day": "Tuesday", "opens": "10:00", "closes": "23:00"},
			{"day": "Wednesday", "opens": "nonsense", "closes": "23:00"},
		]})

		self.assertEqual([row["day"] for row in appended], ["Tuesday"])

	def test_caps_the_number_of_rows(self):
		doc = frappe._dict()
		appended = []
		doc.append = lambda table, row: appended.append(row)
		doc.set = lambda table, value: None

		model.apply_draft(doc, {"gallery": [{"image": f"/files/{n}.jpg"} for n in range(100)]})

		self.assertEqual(len(appended), model.MAX_GALLERY_ROWS)

	def test_draft_is_keyed_per_user_and_page(self):
		with patch.object(model.frappe, "session", frappe._dict(user="one@example.com")):
			mine = model.draft_key("smart-choice")
		with patch.object(model.frappe, "session", frappe._dict(user="two@example.com")):
			theirs = model.draft_key("smart-choice")

		self.assertNotEqual(mine, theirs)
		self.assertNotEqual(model.draft_key("a", user="u"), model.draft_key("b", user="u"))


class TestReadiness(unittest.TestCase):
	def setUp(self):
		# `frappe.db` is a werkzeug local and unbound without a site, so the
		# whole object is replaced rather than one attribute of it.
		self.db = patch.object(model.frappe, "db", MagicMock(get_value=MagicMock(return_value=None)))
		self.db.start()
		self.addCleanup(self.db.stop)

	def keys(self, doc, blocking=None):
		return [
			item["key"] for item in model.readiness(doc)
			if blocking is None or item["blocking"] is blocking
		]

	def test_a_complete_page_has_nothing_blocking(self):
		self.assertEqual(self.keys(page(), blocking=True), [])

	def test_missing_contact_details_block_publishing(self):
		self.assertIn("phone", self.keys(page(phone=""), blocking=True))
		self.assertIn("address", self.keys(page(address="  "), blocking=True))

	def test_hours_block_only_when_reservations_are_on(self):
		self.assertNotIn("hours", self.keys(page(hours=[]), blocking=True))
		self.assertIn("hours", self.keys(page(hours=[], enable_reservations=1), blocking=True))

	def test_a_shown_menu_must_resolve_to_one(self):
		self.assertIn("menu", self.keys(page(show_menu=1, menu=None), blocking=True))
		self.assertNotIn("menu", self.keys(page(show_menu=1, menu="Default Menu"), blocking=True))

	def test_polish_is_advised_not_blocking(self):
		advised = self.keys(page(), blocking=False)
		self.assertIn("logo", advised)
		self.assertIn("gallery", advised)
		self.assertNotIn("logo", self.keys(page(), blocking=True))


class TestPublishing(unittest.TestCase):
	def setUp(self):
		self.throw = patch.object(editor.frappe, "throw", side_effect=reject)
		self.throw.start()
		self.addCleanup(self.throw.stop)
		self.translate = patch.object(editor, "_", side_effect=lambda value: value)
		self.translate.start()
		self.addCleanup(self.translate.stop)

	def publish(self, doc, wanted=1):
		with patch.object(editor.frappe, "db", MagicMock(get_value=MagicMock(return_value="smart-choice"))), \
			patch.object(editor.frappe, "get_doc", return_value=doc), \
			patch.object(editor, "readiness", return_value=[
				{"key": "phone", "blocking": True} if not doc.phone else {"key": "logo", "blocking": False}
			]):
			return set_published("smart-choice", wanted)

	def test_refuses_to_publish_with_a_blocking_gap(self):
		doc = MagicMock(phone="")
		with self.assertRaises(ValueError):
			self.publish(doc)
		doc.save.assert_not_called()

	def test_unpublishing_is_never_blocked_by_the_checklist(self):
		doc = MagicMock(phone="")
		doc.gallery, doc.hours = [], []
		with patch.object(editor, "_doc_state", return_value={}):
			self.publish(doc, wanted=0)
		self.assertEqual(doc.published, 0)
		doc.save.assert_called_once()

	def test_a_missing_page_is_not_found(self):
		with patch.object(editor.frappe, "db", MagicMock(get_value=MagicMock(return_value=None))):
			with self.assertRaises(ValueError):
				set_published("nope", 1)


class TestSavePayload(unittest.TestCase):
	def test_published_cannot_be_set_by_a_save(self):
		self.assertNotIn("published", model.EDITABLE_FIELDS)

	def test_a_draft_cannot_carry_published_either(self):
		payload = {"published": 1, "hero_title": "New"}
		draft = {field: payload[field] for field in model.EDITABLE_FIELDS if field in payload}
		self.assertEqual(draft, {"hero_title": "New"})


if __name__ == "__main__":
	unittest.main()
