"""Pure unittest tests for ury.ury.analytics_access (stubbed frappe; run with python3 -I)."""

import importlib.util
import json
import os
import sys
import types
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
MODULE_PATH = os.path.join(os.path.dirname(HERE), "analytics_access.py")
SPEC_ISLANDS = os.path.join(os.path.dirname(HERE), "desk_islands.py")


class Doc(dict):
	def __init__(self, *a, **k):
		super().__init__(*a, **k)
		self.flags = types.SimpleNamespace(get=lambda k, d=None: getattr(self.flags, k, d))
		self.flags = _Flags()

	def get(self, k, d=None):
		return super().get(k, d)

	def append(self, key, val):
		self.setdefault(key, []).append(types.SimpleNamespace(**val))

	@property
	def name(self):
		return self["name"]


class _Flags:
	def get(self, k, d=None):
		return getattr(self, k, d)


class FakeFrappe(types.ModuleType):
	def __init__(self):
		super().__init__("frappe")
		self.installed = ["frappe", "insights"]
		self.users = {}  # name -> dict(enabled,user_type,roles)
		self.roles = {"Insights User", "URY Owner", "URY Admin", "Accounts Manager"}
		self.dashboards = {}  # title -> (name, workbook)
		self.shares = {}  # (dt,name,user) -> perms dict
		self.perms = {}  # (dt, role) -> dict (Custom DocPerm)
		self.std_perms = set()  # (dt, role) standard read
		self.doctypes = None
		self.defaults = {}
		self.added_perm_calls = []
		self.errors = []
		self.db = self
		self.permissions = types.ModuleType("frappe.permissions")
		self.permissions.add_permission = self._add_permission
		self.permissions.update_permission_property = self._upd
		self.share = types.ModuleType("frappe.share")
		self.share.add_docshare = self._add_docshare

	# frappe API
	def get_installed_apps(self):
		return self.installed

	def clear_cache(self, *a, **k):
		pass

	def log_error(self, *a, **k):
		self.errors.append((a, k))

	def get_all(self, dt, filters=None, fields=None, pluck=None):
		filters = filters or {}
		if dt == "User":
			rows = [n for n, u in self.users.items() if u["enabled"] == 1 and u["user_type"] == "System User"]
			excl = filters.get("name", [None, []])[1]
			return [n for n in rows if n not in excl]
		if dt == "Has Role":
			return [n for n, u in self.users.items() if filters["role"] in u["roles"]]
		if dt == "Insights Dashboard v3":
			t = filters["title"]
			return [{"name": self.dashboards[t][0], "workbook": self.dashboards[t][1]}] if t in self.dashboards else []
		raise AssertionError(dt)

	def get_doc(self, d):
		fk = self

		class _D:
			def insert(self_, ignore_permissions=False):
				fk.users[d["parent"]]["roles"].add(d["role"])

		return _D()

	# frappe.db API
	def exists(self, dt, f=None):
		if dt == "Role":
			return f in self.roles
		if dt == "DocType":
			return self.doctypes is None or f in self.doctypes
		if dt == "Has Role":
			return f["role"] in self.users.get(f["parent"], {"roles": set()})["roles"]
		if dt == "Custom DocPerm":
			if set(f) == {"parent"}:
				return any(k[0] == f["parent"] for k in self.perms) or None
			rec = self.perms.get((f["parent"], f["role"]))
			if rec is None:
				return None
			return all(rec.get(k, 0) == v for k, v in f.items() if k in ("read",)) or None
		if dt == "DocPerm":
			return (f["parent"], f["role"]) in self.std_perms or None
		raise AssertionError(dt)

	def get_value(self, dt, f):
		assert dt == "DocShare"
		return (f["share_doctype"], f["share_name"], f["user"]) in self.shares or None

	def get_default(self, k):
		return self.defaults.get(k)

	def set_default(self, k, v):
		self.defaults[k] = v

	def delete(self, dt, f):
		if dt == "Has Role":
			if f["parent"] in self.users:
				self.users[f["parent"]]["roles"].discard(f["role"])
		elif dt == "DocShare":
			self.shares.pop((f["share_doctype"], f["share_name"], f["user"]), None)
		elif dt == "Custom DocPerm":
			self.perms.pop((f["parent"], f["role"]), None)
		elif dt == "DefaultValue":
			self.defaults.pop(f["defkey"], None)

	def _add_docshare(self, dt, name, user=None, read=1, write=0, submit=0, share=0, flags=None, **k):
		self.shares[(dt, name, user)] = dict(read=read, write=write, submit=submit, share=share)

	def _add_permission(self, dt, role, permlevel=0, ptype=None):
		self.added_perm_calls.append((dt, role, ptype))
		if not any(k[0] == dt for k in self.perms):  # like setup_custom_perms/copy_perms
			for (d, r) in self.std_perms:
				if d == dt:
					self.perms[(d, r)] = {"read": 1}
		self.perms[(dt, role)] = {ptype: 1}

	def _upd(self, dt, role, permlevel, ptype, value=None, **k):
		self.perms[(dt, role)][ptype] = value


_SAVED = {}
_STUBBED = ("frappe", "frappe.permissions", "frappe.share")


def restore_modules():
	"""Put back the real frappe modules (when run inside a bench) so later tests and the runner are unaffected."""
	for name in _STUBBED:
		if name in _SAVED:
			real = _SAVED[name]
			if real is None:
				sys.modules.pop(name, None)
			else:
				sys.modules[name] = real
	_SAVED.clear()


def load():
	for name in _STUBBED:
		_SAVED.setdefault(name, sys.modules.get(name))
	fk = FakeFrappe()
	sys.modules["frappe"] = fk
	sys.modules["frappe.permissions"] = fk.permissions
	sys.modules["frappe.share"] = fk.share
	spec = importlib.util.spec_from_file_location("analytics_access_under_test", MODULE_PATH)
	mod = importlib.util.module_from_spec(spec)
	spec.loader.exec_module(mod)
	return fk, mod


def user(roles, enabled=1, user_type="System User"):
	return {"enabled": enabled, "user_type": user_type, "roles": set(roles)}


class Base(unittest.TestCase):
	def tearDown(self):
		restore_modules()

	def setUp(self):
		self.fk, self.m = load()
		for i, (title, _) in enumerate(self.m.DASHBOARD_ROLES.items()):
			self.fk.dashboards[title] = (f"dash{i}", f"wb{i}")
		u = self.fk.users
		u["chair@x"] = user({"URY Owner"})
		u["mgr@x"] = user({"URY Manager"})
		u["hr@x"] = user({"HR Manager"})
		u["acct@x"] = user({"Accounts Manager"})
		u["cashier@x"] = user({"URY Cashier"})
		u["off@x"] = user({"URY Manager"}, enabled=0)
		u["web@x"] = user({"URY Manager"}, user_type="Website User")
		u["Administrator"] = user({"URY Admin", "URY Owner", "System Manager"})
		u["Guest"] = user({"URY Manager"})
		self.fk.roles |= {"URY Manager", "HR Manager"}


class TestRoles(Base):
	def test_role_mapping(self):
		self.m.apply()
		r = self.fk.users
		for n in ("chair@x", "mgr@x", "hr@x", "acct@x"):
			self.assertIn("Insights User", r[n]["roles"], n)
		self.assertNotIn("Insights User", r["cashier@x"]["roles"])

	def test_never_admin_guest_disabled_website(self):
		self.m.apply()
		for n in ("Administrator", "Guest", "off@x", "web@x"):
			self.assertNotIn("Insights User", self.fk.users[n]["roles"], n)
		for k in self.fk.shares:
			self.assertNotIn(k[2], ("Administrator", "Guest", "off@x", "web@x"))
		self.assertFalse(self.m.is_eligible_user("Administrator"))
		self.assertFalse(self.m.is_eligible_user("Guest"))
		self.assertFalse(self.m.is_eligible_user("w@x", 1, "Website User"))

	def test_noop_without_insights(self):
		self.fk.installed = ["frappe"]
		self.assertEqual(self.m.apply(), {"skipped": True})
		self.assertFalse(self.fk.shares)
		self.assertNotIn("Insights User", self.fk.users["mgr@x"]["roles"])
		d = Doc(name="mgr@x", enabled=1, user_type="System User")
		d.append("roles", {"role": "URY Manager"})
		self.m.on_user_validate(d)
		self.assertEqual(len(d["roles"]), 1)

	def test_missing_insights_role_skips(self):
		self.fk.roles.discard("Insights User")
		self.m.apply()
		self.assertNotIn("Insights User", self.fk.users["mgr@x"]["roles"])


class TestShares(Base):
	def test_matrix(self):
		self.m.apply()
		s = self.fk.shares
		self.assertIn(("Insights Dashboard v3", "dash0", "chair@x"), s)  # DB01 chairman
		self.assertNotIn(("Insights Dashboard v3", "dash0", "mgr@x"), s)  # manager not on Owner
		self.assertNotIn(("Insights Dashboard v3", "dash0", "hr@x"), s)
		titles = list(self.m.DASHBOARD_ROLES)
		finance = titles.index("Margin and cost")
		self.assertIn(("Insights Dashboard v3", f"dash{finance}", "acct@x"), s)
		self.assertNotIn(("Insights Dashboard v3", f"dash{finance}", "mgr@x"), s)
		staff = titles.index("Staff performance")
		# DB08 reads POS Invoice, which HR cannot read: it is shared with managers only
		self.assertNotIn(("Insights Dashboard v3", f"dash{staff}", "hr@x"), s)
		self.assertNotIn(("Insights Workbook", f"wb{staff}", "hr@x"), s)
		self.assertIn(("Insights Dashboard v3", f"dash{staff}", "mgr@x"), s)
		dq = titles.index("Data readiness")
		self.assertIn(("Insights Dashboard v3", f"dash{dq}", "chair@x"), s)
		self.assertIn(("Insights Dashboard v3", f"dash{dq}", "mgr@x"), s)
		self.assertEqual(len(titles), 16)

	def test_obsolete_share_for_hr_is_pruned_but_foreign_shares_are_kept(self):
		titles = list(self.m.DASHBOARD_ROLES)
		staff = titles.index("Staff performance")
		key = ("Insights Dashboard v3", f"dash{staff}", "hr@x")
		self.fk.shares[key] = dict(read=1, write=0, submit=0, share=0)
		foreign = ("Insights Dashboard v3", f"dash{staff}", "someone@x")
		self.fk.shares[foreign] = dict(read=1, write=0, submit=0, share=0)
		self.fk.defaults[self.m.MARKER_KEY] = json.dumps({"roles": [], "shares": [list(key)], "perms": []})
		self.m.apply()
		self.assertNotIn(key, self.fk.shares)  # recorded by this module and no longer wanted: removed
		self.assertIn(foreign, self.fk.shares)  # never recorded: untouched

	def test_read_only(self):
		self.m.apply()
		self.assertTrue(self.fk.shares)
		for p in self.fk.shares.values():
			self.assertEqual((p["read"], p["write"], p["submit"], p["share"]), (1, 0, 0, 0))

	def test_titles_match_desk_islands(self):
		import re

		src = open(SPEC_ISLANDS).read()
		rows = re.findall(r'^\t\("[^"]+", "[^"]+", "([^"]+)",', src, re.M)
		self.assertEqual(sorted(rows), sorted(self.m.DASHBOARD_ROLES))

	def test_existing_share_untouched(self):
		self.fk.shares[("Insights Dashboard v3", "dash0", "chair@x")] = dict(read=1, write=1, submit=0, share=1)
		self.m.apply()
		self.assertEqual(self.fk.shares[("Insights Dashboard v3", "dash0", "chair@x")]["write"], 1)
		self.m.revert()
		self.assertIn(("Insights Dashboard v3", "dash0", "chair@x"), self.fk.shares)


class TestPerms(Base):
	def test_read_only_grants(self):
		self.m.apply()
		rec = self.fk.perms[("POS Invoice", "URY Owner")]
		self.assertEqual(rec["read"], 1)
		for p in ("write", "create", "delete", "submit", "cancel"):
			self.assertEqual(rec.get(p, 0), 0)
		self.assertIn(("URY Yield Check", "URY Admin"), self.fk.perms)
		self.assertIn(("URY Wastage", "Accounts Manager"), self.fk.perms)
		self.assertNotIn(("URY Wastage", "URY Owner") if False else ("POS Invoice", "Accounts Manager"), self.fk.perms)

	def test_existing_read_skipped(self):
		self.fk.std_perms.add(("POS Invoice", "URY Admin"))
		self.m.apply()
		self.assertEqual(self.fk.perms[("POS Invoice", "URY Admin")], {"read": 1})  # copy only, untouched
		self.assertNotIn(["URY Admin", "POS Invoice"], self.m._load_marker()["perms"])

	def test_missing_doctype_skipped(self):
		self.fk.doctypes = {"POS Invoice"}
		self.m.apply()
		self.assertEqual([k for k in self.fk.perms if k[1] == "URY Owner"], [("POS Invoice", "URY Owner")])


class TestIdempotentAndRevert(Base):
	def snapshot(self):
		return (
			{k: sorted(v["roles"]) for k, v in self.fk.users.items()},
			dict(self.fk.shares),
			{k: dict(v) for k, v in self.fk.perms.items()},
		)

	def test_idempotent(self):
		self.m.apply()
		first = self.snapshot()
		marker = self.fk.defaults[self.m.MARKER_KEY]
		calls = len(self.fk.added_perm_calls)
		self.m.apply()
		self.assertEqual(self.snapshot(), first)
		self.assertEqual(self.fk.defaults[self.m.MARKER_KEY], marker)
		self.assertEqual(len(self.fk.added_perm_calls), calls)

	def test_revert_removes_exactly(self):
		self.fk.users["pre@x"] = user({"URY Manager", "Insights User"})
		self.fk.shares[("Insights Dashboard v3", "dash1", "pre@x")] = dict(read=1, write=0, submit=0, share=0)
		self.fk.perms[("URY KOT", "URY Manager")] = {"read": 1}
		before = self.snapshot()
		self.m.apply()
		self.assertNotEqual(self.snapshot(), before)
		self.m.revert()
		self.assertEqual(self.snapshot(), before)
		self.assertNotIn(self.m.MARKER_KEY, self.fk.defaults)
		self.assertIn("Insights User", self.fk.users["pre@x"]["roles"])

	def test_revert_without_marker_is_noop(self):
		before = self.snapshot()
		self.m.revert()
		self.assertEqual(self.snapshot(), before)


class TestUserHooks(Base):
	def make(self, name, roles, **kw):
		d = Doc(name=name, enabled=kw.get("enabled", 1), user_type=kw.get("user_type", "System User"))
		for r in roles:
			d.append("roles", {"role": r})
		return d

	def test_validate_adds_only(self):
		d = self.make("n@x", ["URY Owner"])
		self.m.on_user_validate(d)
		self.assertEqual([r.role for r in d["roles"]], ["URY Owner", "Insights User"])
		self.m.on_user_validate(d)  # idempotent
		self.assertEqual(len(d["roles"]), 2)

	def test_validate_never_removes_or_touches_others(self):
		d = self.make("n@x", ["URY Cashier", "Insights User"])
		self.m.on_user_validate(d)
		self.assertEqual([r.role for r in d["roles"]], ["URY Cashier", "Insights User"])
		for name in ("Administrator", "Guest"):
			d = self.make(name, ["URY Manager"])
			self.m.on_user_validate(d)
			self.assertEqual(len(d["roles"]), 1)
		d = self.make("w@x", ["URY Manager"], user_type="Website User")
		self.m.on_user_validate(d)
		self.assertEqual(len(d["roles"]), 1)
		d = self.make("o@x", ["URY Manager"], enabled=0)
		self.m.on_user_validate(d)
		self.assertEqual(len(d["roles"]), 1)

	def test_update_records_and_shares_then_revert(self):
		self.fk.users["n@x"] = user({"URY Owner", "Insights User"})
		d = self.make("n@x", ["URY Owner"])
		self.m.on_user_validate(d)
		self.m.on_user_update(d)
		self.assertIn(("Insights Dashboard v3", "dash0", "n@x"), self.fk.shares)
		self.m.revert()
		self.assertNotIn("Insights User", self.fk.users["n@x"]["roles"])
		self.assertFalse([k for k in self.fk.shares if k[2] == "n@x"])

	def test_update_skips_admin(self):
		d = self.make("Administrator", ["URY Owner"])
		self.m.on_user_update(d)
		self.assertFalse(self.fk.shares)


if __name__ == "__main__":
	unittest.main()
