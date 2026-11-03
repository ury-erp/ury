"""Pure unittest tests for ury.ury.api.brief_provider (stubbed frappe/chairman_tools)."""

import importlib.util
import os
import sys
import types
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
MODULE_PATH = os.path.join(os.path.dirname(HERE), "api", "brief_provider.py")

CASES = {
	"day_summary": ("get_day_summary", {"date": "2026-01-02"}),
	"month_to_date": ("get_month_to_date", {"date": "2026-01-02"}),
	"branch_ranking": ("get_branch_ranking", {"date": "2026-01-02"}),
	"leakage_week": ("get_leakage_week", {"date": "2026-01-02"}),
	"cashup_week": ("get_cashup_week", {"date": "2026-01-02"}),
	"sales_range": ("get_sales_range", {"start_date": "2026-01-01", "end_date": "2026-01-07"}),
	"top_bottom_dishes": (
		"get_top_bottom_dishes",
		{"start_date": "2026-01-01", "end_date": "2026-01-07", "limit": 3},
	),
	"order_type_payment_mix": (
		"get_order_type_and_payment_mix",
		{"start_date": "2026-01-01", "end_date": "2026-01-07"},
	),
	"cancellations": ("get_cancellations", {"start_date": "2026-01-01", "end_date": "2026-01-07"}),
	"kitchen_speed": ("get_kitchen_speed", {"start_date": "2026-01-01", "end_date": "2026-01-07"}),
	"ideas_context": ("get_ideas_context", {"start_date": "2026-01-01", "end_date": "2026-01-07"}),
}


class ValidationError(Exception):
	pass


def _load():
	frappe = types.ModuleType("frappe")
	frappe.ValidationError = ValidationError

	def throw(msg, exc=Exception):
		raise exc(msg)

	frappe.throw = throw
	frappe.parse_json = __import__("json").loads
	ct = types.ModuleType("ury.ury.api.chairman_tools")
	ct.sanitize = lambda o: o
	for name, _ in CASES.values():
		setattr(ct, name, mock.Mock(name=name, return_value={"headline": name}))
	pkgs = {}
	for p in ("ury", "ury.ury", "ury.ury.api"):
		pkgs[p] = types.ModuleType(p)
	pkgs["ury.ury.api"].chairman_tools = ct
	mods = {"frappe": frappe, "ury.ury.api.chairman_tools": ct, **pkgs}
	spec = importlib.util.spec_from_file_location("brief_provider_under_test", MODULE_PATH)
	mod = importlib.util.module_from_spec(spec)
	with mock.patch.dict(sys.modules, mods):
		spec.loader.exec_module(mod)
	return mod, ct, mods


class BriefProviderTest(unittest.TestCase):
	def test_each_kind_dispatches(self):
		mod, ct, mods = _load()
		with mock.patch.dict(sys.modules, mods):
			for kind, (fn_name, filters) in CASES.items():
				out = mod.get_brief_data(kind, filters)
				getattr(ct, fn_name).assert_called_once_with(**filters)
				self.assertEqual(out["headline"], fn_name)

	def test_unknown_kind_raises(self):
		mod, _ct, mods = _load()
		with mock.patch.dict(sys.modules, mods):
			with self.assertRaises(ValidationError):
				mod.get_brief_data("nope")

	def test_missing_required_filter_is_validation_error(self):
		mod, ct, mods = _load()
		ct.get_sales_range.side_effect = TypeError("missing end_date")
		with mock.patch.dict(sys.modules, mods):
			with self.assertRaises(ValidationError):
				mod.get_brief_data("sales_range", {"start_date": "2026-01-01"})


if __name__ == "__main__":
	unittest.main()
