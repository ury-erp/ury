"""Guards for the URY desk sidebar (sidebar/ury/ury.json).

Pure file checks, no database: they keep the navigation from regressing silently.
Frappe opens a page in the sidebar that claims it; an item listed twice, a renamed sidebar or a
section without its Overview all fail quietly in the browser, so they are caught here instead.
"""
import glob
import json
import os
import unittest

MODULE = os.path.dirname(os.path.abspath(__file__))  # .../ury/ury/ury (the URY module folder)
APP = os.path.dirname(MODULE)  # .../ury/ury (the app package)
SIDEBAR = os.path.join(MODULE, "sidebar", "ury", "ury.json")

# Frozen on purpose: renaming a section changes users' saved open/closed state, and renaming the
# sidebar itself silently hides its rail tile. Change these only deliberately.
FROZEN_SIDEBAR = "URY"
FROZEN_SECTIONS = [
	"Apps", "Plan", "Operate", "Observe", "Control", "Finance",
	"Purchasing", "Staff & Shifts", "AI Insights", "Reports", "Setup",
]


def _load():
	with open(SIDEBAR) as f:
		return json.load(f)


def _sections(sidebar):
	sections, current = [], None
	for item in sidebar["items"]:
		if item["type"] == "Section Break":
			current = {"label": item["label"], "icon": item.get("icon"), "kids": []}
			sections.append(current)
		elif current is not None:
			current["kids"].append(item)
	return sections


def _ury_names(kind):
	names = set()
	for path in glob.glob(os.path.join(MODULE, kind, "*", "*.json")):
		try:
			with open(path) as f:
				doc = json.load(f)
		except ValueError:
			continue
		if isinstance(doc, dict) and doc.get("name"):
			names.add(doc["name"])
	return names


class TestUrySidebar(unittest.TestCase):
	def setUp(self):
		self.sidebar = _load()
		self.sections = _sections(self.sidebar)

	def test_sidebar_name_is_frozen(self):
		self.assertEqual(self.sidebar["name"], FROZEN_SIDEBAR)

	def test_section_names_and_order_are_frozen(self):
		self.assertEqual([s["label"] for s in self.sections], FROZEN_SECTIONS)

	def test_every_link_is_listed_once(self):
		seen, dupes = set(), []
		for item in self.sidebar["items"]:
			if item["type"] != "Link":
				continue
			key = (item["link_type"], item.get("link_to") or item.get("url"))
			if key in seen:
				dupes.append(key)
			seen.add(key)
		self.assertEqual(dupes, [], f"listed more than once: {dupes}")

	def test_section_icons_are_present_and_unique(self):
		icons = [s["icon"] for s in self.sections]
		self.assertTrue(all(icons), "every section needs an icon")
		self.assertEqual(len(icons), len(set(icons)), f"duplicate section icons: {icons}")

	def test_each_section_opens_with_its_overview(self):
		for section in self.sections:
			if section["label"] == "Apps":
				continue
			first = section["kids"][0]
			self.assertEqual(
				(first["label"], first["link_type"]), ("Overview", "Workspace"),
				f"{section['label']} must start with its Overview workspace row",
			)

	def test_overview_workspaces_exist(self):
		workspaces = _ury_names("workspace")
		for item in self.sidebar["items"]:
			if item["type"] == "Link" and item["link_type"] == "Workspace":
				self.assertIn(item["link_to"], workspaces, item["label"])

	def test_ury_doctypes_exist(self):
		doctypes = _ury_names("doctype")
		for item in self.sidebar["items"]:
			target = item.get("link_to") or ""
			if item["type"] == "Link" and item["link_type"] == "DocType" and target.startswith("URY "):
				self.assertIn(target, doctypes, f"{item['label']} -> {target}")

	def test_launchers_open_in_a_new_tab(self):
		apps = next(s for s in self.sections if s["label"] == "Apps")
		self.assertEqual([k["url"] for k in apps["kids"]], ["/pos", "/mosaic", "/ury"])
		self.assertTrue(all(k["open_in_new_tab"] for k in apps["kids"]))

	def test_dock_has_the_single_ury_tile(self):
		with open(os.path.join(APP, "dock", "ury", "ury.json")) as f:
			dock = json.load(f)
		self.assertEqual([(r["link_type"], r["link_to"]) for r in dock["items"]], [("Sidebar", "URY")])


if __name__ == "__main__":
	unittest.main()
