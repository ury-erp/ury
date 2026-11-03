"""Pure unittest tests for ury.ury.desk_islands (no frappe, no site needed)."""

import importlib.util
import os
import re
import sys
import types
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
MODULE_PATH = os.path.join(os.path.dirname(HERE), "desk_islands.py")
SPEC_DIR = "/Users/safwan/Code/URY/frappe_desk_skill/skills/frappe-insights/solutions/ury_restaurant/dashboards"


class FakeDoc(dict):
	def __init__(self, store, data):
		super().__init__()
		self._store = store
		for k, v in data.items():
			if k == "items":
				self["items"] = [FakeDoc(store, i) for i in v]
			else:
				self[k] = v

	def set(self, k, v):
		self[k] = v

	def append(self, k, v):
		self.setdefault(k, []).append(FakeDoc(self._store, v))

	def _key(self):
		d = self["doctype"]
		return (d, self.get("dashboard_name") or self.get("module_name") or self.get("title") or self["name"])

	def insert(self, **kw):
		self._store.docs[self._key()] = self
		self._store.writes += 1
		return self

	def save(self, **kw):
		self._store.docs[self._key()] = self
		self._store.writes += 1
		return self


class FakeStore:
	def __init__(self, insights=True, claim=True, titles=None, dock=True):
		self.docs = {}
		self.writes = 0
		self.insights = insights
		self.claim = claim
		self.errors = []
		titles = [r for r in (titles or [])]
		self.insights_rows = [{"name": f"ins{i}", "title": t} for i, t in enumerate(titles)]
		if dock:
			d = FakeDoc(self, {"doctype": "Dock", "name": "frappe", "items": [
				{"link_type": "Sidebar", "link_to": "Build", "title": "Build", "icon": "code-app-soft"}]})
			self.docs[("Dock", "frappe")] = d

	def install(self):
		store = self
		fr = types.ModuleType("frappe")

		class Meta:
			def has_field(self, f):
				return store.claim if f == "insights_dashboard" else False

		fr.get_installed_apps = lambda: ["frappe", "ury"] + (["insights"] if store.insights else [])
		fr.get_meta = lambda dt: Meta()
		fr.get_all = lambda dt, filters=None, **kw: [
			r["name"] for r in store.insights_rows if r["title"] == filters["title"]
		]
		fr.logger = lambda *a, **k: types.SimpleNamespace(info=lambda m: None, warning=lambda m: None)
		fr.log_error = lambda title=None, message=None: store.errors.append((title, message))

		def exists(dt, name):
			return (dt, name) in store.docs

		def get_doc(arg, name=None):
			if isinstance(arg, dict):
				return FakeDoc(store, arg)
			return store.docs[(arg, name)]

		fr.db = types.SimpleNamespace(exists=exists)
		fr.get_doc = get_doc
		sys.modules["frappe"] = fr
		if store.claim:
			sys.modules["frappe.utils"] = types.ModuleType("frappe.utils")
			sys.modules["frappe.utils.island"] = types.ModuleType("frappe.utils.island")
		else:
			sys.modules.pop("frappe.utils.island", None)
			sys.modules.pop("frappe.utils", None)


def load():
	spec = importlib.util.spec_from_file_location("desk_islands_under_test", MODULE_PATH)
	mod = importlib.util.module_from_spec(spec)
	spec.loader.exec_module(mod)
	return mod


class DeskIslandsTest(unittest.TestCase):
	def setUp(self):
		self._saved = {k: sys.modules.get(k) for k in ("frappe", "frappe.utils", "frappe.utils.island")}
		self.mod = load()
		self.titles = [r["insights_title"] for r in self.mod.DASHBOARDS]

	def tearDown(self):
		for k, v in self._saved.items():
			if v is None:
				sys.modules.pop(k, None)
			else:
				sys.modules[k] = v

	def test_unsupported_without_island_module_v16(self):
		s = FakeStore(claim=False, titles=self.titles)
		s.install()
		self.assertFalse(self.mod.islands_supported())
		out = self.mod.setup()
		self.assertFalse(out["supported"])
		self.assertEqual(s.writes, 0)

	def test_unsupported_without_insights(self):
		s = FakeStore(insights=False, titles=self.titles)
		s.install()
		self.assertFalse(self.mod.islands_supported())
		self.assertEqual(self.mod.setup()["dashboards_created"], [])

	def test_unsupported_without_frappe_importable(self):
		sys.modules.pop("frappe", None)
		sys.modules["frappe"] = None  # import raises ImportError
		self.assertFalse(self.mod.islands_supported())
		self.assertFalse(self.mod.setup()["supported"])

	def test_table_integrity(self):
		rows = self.mod.DASHBOARDS
		self.assertEqual(len(rows), 16)
		for key in ("desk_name", "label", "insights_title"):
			self.assertEqual(len({r[key] for r in rows}), 16, key)
		self.assertTrue(all(r["description"] for r in rows))

	def test_titles_match_spec_files(self):
		if not os.path.isdir(SPEC_DIR):
			self.skipTest("spec dir not present")
		spec_titles = []
		for fn in sorted(os.listdir(SPEC_DIR)):
			if not fn.endswith(".yaml"):
				continue
			with open(os.path.join(SPEC_DIR, fn)) as f:
				m = re.search(r'^dashboards:\s*\n\s*- id: \S+\s*\n\s*title: "([^"]+)"', f.read(), re.M)
			self.assertIsNotNone(m, fn)
			spec_titles.append(m.group(1))
		self.assertEqual(spec_titles, self.titles)

	def test_setup_creates_then_is_idempotent(self):
		s = FakeStore(titles=self.titles)
		s.install()
		first = self.mod.setup()
		self.assertTrue(first["supported"])
		self.assertEqual(len(first["dashboards_created"]), 16)
		self.assertEqual(first["sidebar"], "created")
		self.assertEqual(first["dock"], "created")
		self.assertEqual(len(s.docs[("Sidebar", "URY Analytics")]["items"]), 16)
		dock_items = s.docs[("Dock", "frappe")]["items"]
		self.assertEqual(len(dock_items), 2)
		self.assertEqual(dock_items[-1]["icon"], self.mod.ICON)
		self.assertNotEqual(self.mod.ICON, "chart")
		writes = s.writes
		second = self.mod.setup()
		self.assertEqual(second["dashboards_created"], [])
		self.assertEqual(second["dashboards_updated"], [])
		self.assertEqual((second["sidebar"], second["dock"]), ("unchanged", "unchanged"))
		self.assertEqual(s.writes, writes)
		self.assertEqual(len(s.docs[("Dock", "frappe")]["items"]), 2)

	def test_missing_insights_dashboard_skipped(self):
		s = FakeStore(titles=self.titles[1:])
		s.install()
		out = self.mod.setup()
		self.assertEqual(out["skipped"], ["ury-owner-overview"])
		self.assertEqual(len(s.docs[("Sidebar", "URY Analytics")]["items"]), 15)

	def test_updates_only_changed_fields_and_never_deletes(self):
		s = FakeStore(titles=self.titles)
		s.install()
		self.mod.setup()
		s.docs[("Dashboard", "ury-branch-daily")]["insights_dashboard"] = "stale"
		s.docs[("Sidebar", "URY Analytics")].append("items", {"link_type": "Dashboard", "link_to": "custom"})
		out = self.mod.setup()
		self.assertEqual(out["dashboards_updated"], ["ury-branch-daily"])
		self.assertEqual(len(s.docs[("Sidebar", "URY Analytics")]["items"]), 17)

	def test_after_migrate_never_raises_and_logs_with_title_first(self):
		s = FakeStore(titles=self.titles)
		s.install()

		def boom(*a, **k):
			raise RuntimeError("boom")

		self.mod.setup = boom
		self.mod.after_migrate()
		self.assertEqual(len(s.errors), 1)
		title, message = s.errors[0]
		self.assertIn("desk islands", title)
		self.assertIn("boom", message)

	def test_after_migrate_without_frappe_never_raises(self):
		sys.modules["frappe"] = None
		self.mod.after_migrate()


if __name__ == "__main__":
	unittest.main()
