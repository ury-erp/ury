# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt
#
# PureTests: plain unittest, no Frappe site needed (frappe is stubbed if not
# importable). SiteTests: needs a bench site with the seeded demo data.

import sys
import types
import unittest
from datetime import date


def _stub_frappe():
	try:
		import frappe  # noqa: F401

		return
	except ImportError:
		pass
	f = types.ModuleType("frappe")
	f._ = lambda s: s
	f.whitelist = lambda *a, **k: (lambda fn: fn)
	f.PermissionError = type("PermissionError", (Exception,), {})
	f.ValidationError = type("ValidationError", (Exception,), {})
	u = types.ModuleType("frappe.utils")
	u.getdate = lambda d: d
	u.now_datetime = lambda: None
	u.nowdate = lambda: date(2026, 11, 2)
	def _throw(msg, exc=Exception):
		raise exc(msg)

	f.throw = _throw
	f.utils = u
	sys.modules["frappe"] = f
	sys.modules["frappe.utils"] = u


_stub_frappe()

try:
	from frappe.tests import IntegrationTestCase
except ImportError:  # pure-only environment

	class IntegrationTestCase(unittest.TestCase):
		pass


try:
	from ury.ury.api import chairman as c  # noqa: E402
except ImportError:
	import chairman as c  # noqa: E402  (pure run from this dir)


class PureTests(unittest.TestCase):
	def test_formatter_boundaries(self):
		self.assertEqual(c.format_inr_compact(999), "₹999")
		self.assertEqual(c.format_inr_compact(1000), "₹1K")
		self.assertEqual(c.format_inr_compact(99999), "₹1L")
		self.assertEqual(c.format_inr_compact(100000), "₹1L")
		self.assertEqual(c.format_inr_compact(9999999), "₹1Cr")
		self.assertEqual(c.format_inr_compact(10000000), "₹1Cr")

	def test_formatter_other_currencies_use_international_units(self):
		# INR keeps K/L/Cr; every other currency uses K/M/B and its own symbol (code when the doc has none).
		self.assertEqual(c.format_inr_compact(1500, "INR"), "₹1.5K")
		self.assertEqual(c.format_inr_compact(999999, "USD").endswith("1M"), True)
		self.assertTrue(c.format_inr_compact(2500000, "AED").endswith("2.5M"))
		self.assertTrue(c.format_inr_compact(-3200000000, "AED").startswith("-"))
		self.assertEqual(c.format_inr_compact(1500, "SAR"), "SAR 1.5K")
		self.assertEqual(c.locale_for("INR"), "en-IN")
		self.assertEqual(c.locale_for("SAR"), "en")

	def test_formatter_rounding_and_dot_zero(self):
		self.assertEqual(c.format_inr_compact(120000), "₹1.2L")
		self.assertEqual(c.format_inr_compact(1500), "₹1.5K")
		self.assertEqual(c.format_inr_compact(2000000), "₹20L")
		self.assertEqual(c.format_inr_compact(12340000), "₹1.2Cr")
		self.assertEqual(c.format_inr_compact(0), "₹0")
		self.assertEqual(c.format_inr_compact(None), "₹0")

	def test_formatter_half_up(self):
		self.assertEqual(c.format_inr_compact(125000), "₹1.3L")
		self.assertEqual(c.format_inr_compact(1250), "₹1.3K")
		self.assertEqual(c.format_inr_compact(12500000), "₹1.3Cr")
		self.assertEqual(c.format_inr_compact(-125000), "-₹1.3L")

	def test_roles_and_label(self):
		self.assertEqual(c.ALLOWED_ROLES, {"URY Owner"})
		self.assertFalse(c.ALLOW_ADMINISTRATOR_FOR_TESTS)
		self.assertEqual(c.COMPARE_LABEL, "vs same day last week")

	def test_branch_scope_helpers(self):
		perms = {"Branch": [{"doc": "A"}]}
		self.assertEqual(c.allowed_from_perms(perms, "Branch"), ["A"])
		self.assertEqual(c.intersect_scope(["A"], {"A", "B"}), ["A"])
		self.assertEqual(c.intersect_scope(["B"], {"A"}), [])
		self.assertIsNone(c.allowed_from_perms({}, "Branch"))

	def test_formatter_negative(self):
		self.assertEqual(c.format_inr_compact(-1500), "-₹1.5K")
		self.assertEqual(c.format_inr_compact(-50), "-₹50")

	def test_headline_up_down_flat(self):
		d = date(2026, 10, 21)  # Wednesday
		self.assertEqual(c.yesterday_headline(120000, 111000, 0.081, d), "Yesterday ₹1.2L, up 8.1% vs same day last week")
		self.assertEqual(c.yesterday_headline(90000, 100000, -0.1, d), "Yesterday ₹90K, down 10% vs same day last week")
		self.assertEqual(c.yesterday_headline(100500, 100000, 0.005, d), "Yesterday ₹1L, flat vs same day last week")

	def test_headline_empty(self):
		d = date(2026, 10, 21)
		self.assertEqual(c.yesterday_headline(0, 0, None, d), "No sales recorded for 2026-10-21")

	def test_delta_null_when_compare_zero(self):
		self.assertIsNone(c.compute_delta(100, 0))
		self.assertIsNone(c.compute_delta(0, 0))
		self.assertAlmostEqual(c.compute_delta(110, 100), 0.1)

	def test_tone_thresholds(self):
		self.assertEqual(c.tone_for(0.02), "good")
		self.assertEqual(c.tone_for(0.0199), "neutral")
		self.assertEqual(c.tone_for(-0.02), "bad")
		self.assertEqual(c.tone_for(-0.0199), "neutral")
		self.assertEqual(c.tone_for(None), "neutral")

	def test_window_math(self):
		w = c.window_dates(date(2026, 10, 21))
		self.assertEqual(len(w), 7)
		self.assertEqual(w[0], date(2026, 10, 15))
		self.assertEqual(w[-1], date(2026, 10, 21))
		w2 = c.window_dates(date(2026, 3, 3))
		self.assertEqual(w2[0], date(2026, 2, 25))

	def test_spark_series_fills_zero_days(self):
		w = c.window_dates(date(2026, 10, 21))
		s = c.spark_series(w, {date(2026, 10, 21): 5.555})
		self.assertEqual(len(s), 7)
		self.assertEqual(s[0], {"label": "2026-10-15", "value": 0})
		self.assertEqual(s[-1]["value"], round(5.555, 2))

	def test_top_share_percent_rounding(self):
		series = [{"label": "Dine In", "value": 41.4}, {"label": "Delivery", "value": 58.6 - 17.2}]
		self.assertEqual(c.share_pct(41.4, 100), 41)
		self.assertEqual(c.share_pct(41.5, 100), round(41.5))
		self.assertEqual(c.share_pct(1, 0), 0)
		self.assertEqual(
			c.top_share_headline([{"label": "Dine In", "value": 41}, {"label": "X", "value": 59 - 18}], "{0} leads with {1}% of the week"),
			"Dine In leads with 50% of the week",
		)

	def test_top_share_headline_empty(self):
		self.assertEqual(c.top_share_headline([], "{0} {1}"), "No sales recorded")

	def test_sorting_channels_and_unspecified(self):
		rows = [
			{"order_type": "Take Away", "total": 10},
			{"order_type": None, "total": 30},
			{"order_type": "", "total": 5},
			{"order_type": "Dine In", "total": 20},
		]
		s = c.aggregate_series(rows, "order_type", "total")
		self.assertEqual([r["label"] for r in s], ["Unspecified", "Dine In", "Take Away"])
		self.assertEqual(s[0]["value"], 35)

	def test_payment_sorting_and_tie_break(self):
		rows = [
			{"mode_of_payment": "UPI", "total": 50},
			{"mode_of_payment": "Cash", "total": 50},
			{"mode_of_payment": "Card", "total": 70.456},
		]
		s = c.aggregate_series(rows, "mode_of_payment", "total")
		self.assertEqual([r["label"] for r in s], ["Card", "Cash", "UPI"])
		self.assertEqual(s[0]["value"], 70.46)
		self.assertEqual(c.total_of(s), 170.46)

	def test_data_quality_rule(self):
		self.assertEqual(c.data_quality_for(7, 0, 1000), "ok")
		self.assertEqual(c.data_quality_for(6, 0, 1000), "partial")
		self.assertEqual(c.data_quality_for(7, 100, 1000), "ok")  # exactly 10%
		self.assertEqual(c.data_quality_for(7, 101, 1000), "partial")
		self.assertEqual(c.data_quality_for(7, 0, 0), "ok")

	def test_formatter_promotes_after_rounding(self):
		self.assertEqual(c.format_inr_compact(99949), "₹99.9K")
		self.assertEqual(c.format_inr_compact(99950), "₹1L")
		self.assertEqual(c.format_inr_compact(999999), "₹10L")
		self.assertEqual(c.format_inr_compact(9999999), "₹1Cr")
		self.assertEqual(c.format_inr_compact(999.96), "₹1K")
		self.assertEqual(c.format_inr_compact(-99999), "-₹1L")

	def test_pct_text_one_function(self):
		self.assertEqual(c.pct_text(0.125), "12")
		self.assertEqual(c.pct_text(0.0849), "8.5")
		self.assertEqual(c.pct_text(0.05), "5")
		self.assertEqual(c.pct_text(-0.0999), "10")
		self.assertEqual(c.pct_text(0.5), "50")

	def test_headline_matches_chip_label(self):
		d = date(2026, 10, 21)
		delta = c.compute_delta(108.5, 100)
		h = c.yesterday_headline(108.5, 100, delta, d)
		self.assertIn("up " + c.pct_text(delta) + "%", h)
		self.assertIn("8.5%", h)

	def test_net_revenue_nets_returns(self):
		inv = [
			{"net_total": 100, "is_return": 0},
			{"net_total": 50, "is_return": 0},
			{"net_total": -30, "is_return": 1},
		]
		self.assertEqual(c.net_revenue(inv), (120, 2))
		self.assertEqual(c.net_revenue([]), (0, 0))

	def test_cash_adjustment_prefers_cash_mode(self):
		rows = [{"mode_of_payment": "Cash", "total": 100}, {"mode_of_payment": "Petty Cash", "total": 500}]
		types = {"Cash": "Cash", "Petty Cash": "Cash"}
		out = c.apply_cash_adjustment(rows, types, 20)
		self.assertEqual(out[0]["total"], 80)
		self.assertEqual(out[1]["total"], 500)
		self.assertEqual(rows[0]["total"], 100)  # input untouched

	def test_cash_adjustment_largest_cash_type(self):
		rows = [{"mode_of_payment": "A", "total": 10}, {"mode_of_payment": "B", "total": 90}, {"mode_of_payment": "UPI", "total": 99}]
		out = c.apply_cash_adjustment(rows, {"A": "Cash", "B": "Cash", "UPI": "Bank"}, 5)
		self.assertEqual([r["total"] for r in out], [10, 85, 99])

	def test_cash_adjustment_noop_cases(self):
		rows = [{"mode_of_payment": "UPI", "total": 10}]
		self.assertEqual(c.apply_cash_adjustment(rows, {"UPI": "Bank"}, 5), rows)
		self.assertEqual(c.apply_cash_adjustment(rows, {"UPI": "Cash"}, 0), rows)
		self.assertEqual(c.apply_cash_adjustment([], {}, 5), [])

	def test_date_clamp(self):
		today = date(2026, 11, 2)
		self.assertTrue(c.date_in_range(today, today))
		self.assertFalse(c.date_in_range(date(2026, 11, 3), today))
		self.assertTrue(c.date_in_range(date(2025, 9, 28), today))  # today-400
		self.assertFalse(c.date_in_range(date(2025, 9, 27), today))

	def test_parse_date_default_and_bounds(self):
		from datetime import timedelta

		self.assertEqual(c._parse_date(None), c._today() - timedelta(days=1))
		with self.assertRaises(c.frappe.ValidationError):
			c._parse_date(c._today() + timedelta(days=1))

	def test_allowed_from_perms(self):
		perms = {"Company": [{"doc": "B"}, {"doc": "A"}, {"doc": "A"}]}
		self.assertEqual(c.allowed_from_perms(perms, "Company"), ["A", "B"])
		self.assertIsNone(c.allowed_from_perms(perms, "Branch"))
		self.assertIsNone(c.allowed_from_perms({}, "Company"))

	def test_scope_intersection(self):
		self.assertEqual(c.intersect_scope(None, {"b", "a"}), ["a", "b"])
		self.assertEqual(c.intersect_scope(["a", "z"], {"a", "b"}), ["a"])
		self.assertEqual(c.intersect_scope(["z"], {"a", "b"}), [])

	def test_currency_single(self):
		self.assertEqual(c.currency_info({"X": "AED", "Y": "AED"}, ["X", "Y"]), ("AED", False))

	def test_currency_mixed_flag(self):
		self.assertEqual(c.currency_info({"X": "AED", "Y": "INR"}, ["X", "Y"]), ("INR", True))

	def test_currency_none_defaults(self):
		self.assertEqual(c.currency_info({}, []), ("INR", False))
		self.assertEqual(c.currency_info({"X": None}, ["X"]), ("INR", False))


class FeaturesTests(unittest.TestCase):
	"""compute_features / order_slides: pure, frappe calls patched."""

	def _run(self, installed, values):
		from unittest import mock

		fr = sys.modules["frappe"]
		with (
			mock.patch.object(fr, "get_installed_apps", lambda: installed, create=True),
			mock.patch.object(fr, "db", types.SimpleNamespace(get_single_value=lambda dt, f: values.get(f)), create=True),
		):
			return c.compute_features()

	def test_flag_off_when_huf_missing(self):
		from unittest import mock

		mod = types.ModuleType("ury.ury.api.chairman_call")
		mod.call_capabilities = lambda: {"available": True}
		with mock.patch.dict(sys.modules, {"ury.ury.api.chairman_call": mod}):
			import ury.ury.api as pkg

			with mock.patch.object(pkg, "chairman_call", mod, create=True):
				self.assertEqual(self._run(["frappe", "ury"], {"chat_agent": "A", "voice_call_enabled": 1}), {"huf": False, "voice_call": True})

	def test_flag_off_without_agent(self):
		self.assertFalse(self._run(["frappe", "huf"], {"chat_agent": "", "voice_call_enabled": 0})["huf"])

	def test_flag_on(self):
		self.assertEqual(self._run(["frappe", "huf"], {"chat_agent": "A", "voice_call_enabled": 0}), {"huf": True, "voice_call": False})

	def test_voice_call_requires_capabilities_available(self):
		from unittest import mock

		mod = types.ModuleType("ury.ury.api.chairman_call")
		for avail, want in ((True, True), (False, False)):
			mod.call_capabilities = lambda a=avail: {"available": a}
			with mock.patch.dict(sys.modules, {"ury.ury.api.chairman_call": mod}):
				import ury.ury.api as pkg

				with mock.patch.object(pkg, "chairman_call", mod, create=True):
					self.assertEqual(self._run(["frappe", "ury"], {"voice_call_enabled": 1})["voice_call"], want)

	def test_voice_call_capabilities_error_means_off(self):
		from unittest import mock

		mod = types.ModuleType("ury.ury.api.chairman_call")
		mod.call_capabilities = mock.Mock(side_effect=RuntimeError("x"))
		with mock.patch.dict(sys.modules, {"ury.ury.api.chairman_call": mod}):
			import ury.ury.api as pkg

			with mock.patch.object(pkg, "chairman_call", mod, create=True):
				self.assertFalse(self._run(["frappe", "ury"], {"voice_call_enabled": 1})["voice_call"])

	def test_never_raises(self):
		from unittest import mock

		fr = sys.modules["frappe"]
		boom = types.SimpleNamespace(get_single_value=mock.Mock(side_effect=RuntimeError("x")))
		with mock.patch.object(fr, "db", boom, create=True):
			self.assertEqual(c.compute_features(), {"huf": False, "voice_call": False})

	def test_deck_order(self):
		ids = ["cashup", "yesterday", "zzz", "leakage", "mtd_target", "channel_mix", "payment_mix"]
		self.assertEqual([s["id"] for s in c.order_slides([{"id": i} for i in ids])],
			["yesterday", "mtd_target", "channel_mix", "payment_mix", "leakage", "cashup", "zzz"])


class SiteTests(IntegrationTestCase):
	"""NEEDS A BENCH SITE with seeded demo data (2026-10-21 in range). Run via bench run-tests."""

	PINNED = "2026-10-21"

	def setUp(self):
		self._orig_admin = c.ALLOW_ADMINISTRATOR_FOR_TESTS
		c.ALLOW_ADMINISTRATOR_FOR_TESTS = True  # explicit test hook; off in production

	def tearDown(self):
		c.ALLOW_ADMINISTRATOR_FOR_TESTS = self._orig_admin

	def test_shape(self):
		import frappe

		from ury.ury.api.chairman import get_brief

		b = get_brief(self.PINNED)
		self.assertEqual(b["schema_version"], 1)
		self.assertEqual(b["date"], self.PINNED)
		self.assertEqual(b["currency"], "INR")
		self.assertEqual([s["id"] for s in b["slides"]], list(c.DECK_ORDER))
		self.assertEqual(set(b["features"]), {"huf", "voice_call"})
		for s in b["slides"]:
			for k in ("title", "headline", "value", "compare", "delta_pct", "tone", "chart", "drill", "data_quality"):
				self.assertIn(k, s)
			self.assertIn(s["tone"], ("good", "bad", "neutral"))
		self.assertEqual(len(b["slides"][0]["chart"]["series"]), 7)
		self.assertIn("orders", b["slides"][0])

	def test_slide1_matches_direct_sql(self):
		import frappe

		from ury.ury.api.chairman import get_brief

		direct = frappe.db.sql(
			"SELECT COALESCE(SUM(net_total),0) FROM `tabPOS Invoice` "
			"WHERE docstatus=1 AND posting_date=%s",  # includes returns (negative net_total)
			(self.PINNED,),
		)[0][0]
		b = get_brief(self.PINNED)
		self.assertAlmostEqual(b["slides"][0]["value"], float(direct), places=2)

	def test_payment_mix_cash_nets_change(self):
		import frappe

		from ury.ury.api.chairman import get_brief

		b = get_brief(self.PINNED)
		end = frappe.utils.getdate(self.PINNED)
		start = end - frappe.utils.datetime.timedelta(days=6)
		amt = frappe.db.sql(
			"SELECT COALESCE(SUM(s.amount),0) FROM `tabSales Invoice Payment` s JOIN `tabPOS Invoice` p ON s.parent=p.name "
			"WHERE s.parenttype='POS Invoice' AND s.mode_of_payment='Cash' AND p.docstatus=1 AND p.posting_date BETWEEN %s AND %s",
			(start, end),
		)[0][0]
		chg = frappe.db.sql(
			"SELECT COALESCE(SUM(change_amount),0) FROM `tabPOS Invoice` WHERE docstatus=1 AND posting_date BETWEEN %s AND %s",
			(start, end),
		)[0][0]
		cash = {r["label"]: r["value"] for r in next(x for x in b["slides"] if x["id"] == "payment_mix")["chart"]["series"]}.get("Cash", 0)
		self.assertAlmostEqual(cash, float(amt) - float(chg), places=2)
		self.assertEqual(next(x for x in b["slides"] if x["id"] == "payment_mix")["basis"], "payments_received")

	def test_invalid_date_and_permission(self):
		import frappe

		from ury.ury.api.chairman import get_brief

		with self.assertRaises(frappe.ValidationError):
			get_brief("not-a-date")

	def test_administrator_denied_without_hook(self):
		import frappe

		c.ALLOW_ADMINISTRATOR_FOR_TESTS = False
		frappe.conf.ury_brief_allow_administrator = 0  # site opted out
		try:
			frappe.set_user("Administrator")
			with self.assertRaises(frappe.PermissionError):
				c.get_brief(self.PINNED)
		finally:
			frappe.conf.pop("ury_brief_allow_administrator", None)

	def test_administrator_allowed_by_default(self):
		import frappe

		c.ALLOW_ADMINISTRATOR_FOR_TESTS = False
		frappe.conf.pop("ury_brief_allow_administrator", None)
		self.assertTrue(c.administrator_allowed())
		frappe.conf.ury_brief_allow_administrator = 0
		try:
			self.assertFalse(c.administrator_allowed())
		finally:
			frappe.conf.pop("ury_brief_allow_administrator", None)

	def test_branch_user_permission_scoping(self):
		"""User A (restricted to branch A) never sees branch B; unrestricted sees both."""
		import frappe

		rows = frappe.db.sql(
			"SELECT branch, COUNT(*) FROM `tabPOS Invoice` WHERE docstatus=1 AND branch IS NOT NULL "
			"AND branch != '' GROUP BY branch ORDER BY COUNT(*) DESC LIMIT 2"
		)
		if len(rows) < 2:
			self.skipTest("need POS invoices in at least two branches")
		branch_a, branch_b = rows[0][0], rows[1][0]
		email = "chairman.scope.test@example.com"
		if not frappe.db.exists("User", email):
			frappe.get_doc(
				{"doctype": "User", "email": email, "first_name": "Scope", "send_welcome_email": 0}
			).insert(ignore_permissions=True)
		user = frappe.get_doc("User", email)
		user.add_roles("URY Owner")
		for perm in frappe.get_all("User Permission", filters={"user": email, "allow": "Branch"}, pluck="name"):
			frappe.delete_doc("User Permission", perm, force=True, ignore_permissions=True)
		frappe.get_doc(
			{"doctype": "User Permission", "user": email, "allow": "Branch", "for_value": branch_a}
		).insert(ignore_permissions=True)
		frappe.clear_cache(user=email)
		c.ALLOW_ADMINISTRATOR_FOR_TESTS = False
		try:
			frappe.set_user(email)
			b = c.get_brief(self.PINNED)
			self.assertEqual(b["scope"]["branches"], [branch_a])
			self.assertNotIn(branch_b, b["scope"]["branches"])
			# Slide 1 equals SQL restricted to branch A only
			start = frappe.utils.getdate(self.PINNED)
			direct = frappe.db.sql(
				"SELECT COALESCE(SUM(net_total),0) FROM `tabPOS Invoice` "
				"WHERE docstatus=1 AND posting_date=%s AND branch=%s",
				(start, branch_a),
			)[0][0]
			self.assertAlmostEqual(b["slides"][0]["value"], float(direct), places=2)
		finally:
			frappe.set_user("Administrator")
			frappe.db.rollback()


if __name__ == "__main__":
	unittest.main()
