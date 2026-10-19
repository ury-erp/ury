import ast
import inspect
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, get_first_day, getdate, today

from ury.ury.ai_tools import agent_seeding, ury_ops_tools, ury_report_catalog, ury_tools
from ury.ury.ai_tools.ury_tools_registry import ALL_URY_TOOLS

EXPECTED_OPS_FUNCTIONS = {
	"get_org_structure",
	"lookup",
	"get_stock_levels",
	"get_reorder_status",
	"get_material_requests",
	"get_transfers",
	"get_stock_movements",
	"trace_sale_stock_impact",
	"get_recipe",
	"get_production",
	"get_theoretical_vs_actual",
	"get_wastage",
	"get_outlet_pnl",
}

MUTATING_CALL_NAMES = {
	"insert", "save", "submit", "cancel", "delete_doc", "rename_doc", "set_value",
	"bulk_update", "db_set", "add_comment", "delete", "append",
}
HUF_PARAM_TYPES = {"string", "integer", "number", "float", "boolean", "object", "array"}


def _whitelisted(module):
	return {
		name
		for name, obj in vars(module).items()
		if inspect.isfunction(obj) and obj.__module__ == module.__name__ and obj in frappe.whitelisted
	}


class TestURYOpsToolsSurface(FrappeTestCase):
	def test_whitelisted_functions_match_allowlist(self):
		self.assertEqual(_whitelisted(ury_ops_tools), EXPECTED_OPS_FUNCTIONS)

	def test_every_tool_calls_require_manager_and_takes_no_private_args(self):
		for name in EXPECTED_OPS_FUNCTIONS:
			func = getattr(ury_ops_tools, name)
			self.assertIn("require_manager()", inspect.getsource(func), name)
			private = [p for p in inspect.signature(func).parameters if p.startswith("_")]
			self.assertEqual(private, [], f"{name} exposes private params to HTTP callers: {private}")

	def test_modules_contain_no_mutating_calls(self):
		for module in (ury_ops_tools, ury_report_catalog):
			tree = ast.parse(inspect.getsource(module))
			offending = []
			for node in ast.walk(tree):
				if isinstance(node, ast.Call):
					f = node.func
					name = f.attr if isinstance(f, ast.Attribute) else getattr(f, "id", None)
					# list.append on local python lists is fine; only doc.append is a write and
					# neither module holds a Document.
					if name in MUTATING_CALL_NAMES and name != "append":
						offending.append(f"{module.__name__}:{name}@{node.lineno}")
			self.assertEqual(offending, [])


class TestRegistryInSync(FrappeTestCase):
	def test_every_registered_tool_resolves_to_a_whitelisted_function(self):
		names = [t["tool_name"] for t in ALL_URY_TOOLS]
		self.assertEqual(len(names), len(set(names)), "duplicate tool_name")
		for tool in ALL_URY_TOOLS:
			fn = frappe.get_attr(tool["function_path"])
			self.assertIn(fn, frappe.whitelisted, tool["tool_name"])
			params = set(inspect.signature(fn).parameters)
			for p in tool["parameters"]:
				self.assertIn(p["fieldname"], params, f"{tool['tool_name']}.{p['fieldname']} not a function arg")
				self.assertIn(p["type"], HUF_PARAM_TYPES, f"{tool['tool_name']}.{p['fieldname']} type {p['type']}")

	def test_every_whitelisted_tool_function_is_registered(self):
		registered = {t["function_path"].rsplit(".", 1)[1] for t in ALL_URY_TOOLS}
		# get_wastage is reached through the report catalog (wastage-and-damage), not as its own tool.
		missing = (_whitelisted(ury_tools) | _whitelisted(ury_ops_tools)) - registered - {"get_wastage"}
		self.assertEqual(missing, set())


class TestReportCatalog(FrappeTestCase):
	def test_slugs_unique_and_sources_resolve(self):
		slugs = [r["slug"] for r in ury_report_catalog.REPORTS]
		self.assertEqual(len(slugs), len(set(slugs)))
		for r in ury_report_catalog.REPORTS:
			if r["kind"] == "api":
				fn = frappe.get_attr(r["path"])
				params = set(inspect.signature(fn).parameters)
				for f in r["filters"]:
					self.assertIn(f["name"], params, f"{r['slug']}: {f['name']}")
			else:
				self.assertTrue(frappe.db.exists("Report", r["report_name"]), r["report_name"])

	def test_frontend_report_slugs_are_all_in_catalog(self):
		for slug in (
			"today-sales", "daywise-sales", "daywise-invoices", "month-wise-sales", "time-wise-sales",
			"service-wise-sales", "cancelled-invoices", "average-bill-value", "item-wise-sales",
			"item-wise-purchase-history", "customer-data", "daywise-customer-details", "repeated-customers",
			"employee-sales", "employee-commission", "employee-item-wise-sales", "completed-work-orders", "daily-pnl",
		):
			self.assertEqual(ury_report_catalog.resolve_slug(slug), slug)

	def test_resolve_slug_aliases_and_desk_names(self):
		self.assertEqual(ury_report_catalog.resolve_slug("Food Cost and Margin Report"), "food-cost-and-margin")
		self.assertEqual(ury_report_catalog.resolve_slug("revpash_report"), "revpash")
		self.assertIsNone(ury_report_catalog.resolve_slug("nope"))

	def test_resolve_period_presets(self):
		t = getdate(today())
		self.assertEqual(ury_report_catalog.resolve_period("today"), (str(t), str(t)))
		self.assertEqual(ury_report_catalog.resolve_period("last_7_days"), (str(add_days(t, -6)), str(t)))
		self.assertEqual(ury_report_catalog.resolve_period("this-month"), (str(get_first_day(t)), str(t)))
		self.assertEqual(
			ury_report_catalog.resolve_period("2026-09-01..2026-09-30"), ("2026-09-01", "2026-09-30")
		)
		with self.assertRaises(frappe.ValidationError):
			ury_report_catalog.resolve_period("fortnight-ish")

	def test_parse_json_arg_accepts_dict_string_and_empty(self):
		self.assertEqual(ury_report_catalog.parse_json_arg('{"branch": "X"}'), {"branch": "X"})
		self.assertEqual(ury_report_catalog.parse_json_arg({"a": 1}), {"a": 1})
		self.assertEqual(ury_report_catalog.parse_json_arg(""), {})
		with self.assertRaises(frappe.ValidationError):
			ury_report_catalog.parse_json_arg("[1, 2]")

	def test_build_kwargs_applies_period_defaults_and_flags_missing(self):
		report = ury_report_catalog.get_report("daywise-sales")
		kwargs, ignored = ury_report_catalog.build_kwargs(report, {"period": "yesterday", "bogus": 1})
		y = str(add_days(getdate(today()), -1))
		self.assertEqual((kwargs["start_date"], kwargs["end_date"]), (y, y))
		self.assertEqual(ignored, ["bogus"])

		with self.assertRaises(frappe.ValidationError) as ctx:
			ury_report_catalog.build_kwargs(ury_report_catalog.get_report("apc"), {})
		self.assertIn("branch", str(ctx.exception))

	def test_wastage_period_maps_to_from_to(self):
		kwargs, _ = ury_report_catalog.build_kwargs(
			ury_report_catalog.get_report("wastage-and-damage"), {"branch": "B", "period": "2026-09-01..2026-09-30"}
		)
		self.assertEqual((kwargs["from_date"], kwargs["to_date"]), ("2026-09-01", "2026-09-30"))

	def test_compact_truncates_rows_but_not_columns(self):
		data = {"columns": list("abcdef"), "rows": list(range(10))}
		out = ury_report_catalog.compact(data, max_rows=3)
		self.assertEqual(out["columns"], list("abcdef"))
		self.assertEqual(out["rows"][:3], [0, 1, 2])
		self.assertEqual(out["rows"][3], {"_truncated": True, "_shown": 3, "_total_rows": 10})

	def test_get_report_snapshot_accepts_json_string_filters(self):
		with patch("ury.ury.report_api.sales.get_daywise_sales", return_value={"rows": []}) as fn:
			res = ury_tools.get_report_snapshot("daywise-sales", '{"branch": "Main", "period": "today"}')
		fn.assert_called_once()
		self.assertEqual(fn.call_args.kwargs["branch"], "Main")
		self.assertEqual(res["filters"]["start_date"], today())

	def test_compare_periods_reports_numeric_deltas(self):
		results = iter([{"summary": {"total": 150, "n": 3}}, {"summary": {"total": 100, "n": 3}}])
		with patch("ury.ury.report_api.sales.get_daywise_sales", side_effect=lambda **kw: next(results)):
			res = ury_tools.compare_periods("daywise-sales", "this_week", "last_week", {"branch": "Main"})
		self.assertEqual(res["deltas"]["summary.total"]["change"], 50)
		self.assertEqual(res["deltas"]["summary.total"]["change_percent"], 50.0)


class TestAgentInstructionUpgrade(FrappeTestCase):
	def test_upgrades_uncustomised_instructions_only(self):
		seed = agent_seeding._load_seed()

		class Doc(frappe._dict):
			def set(self, key, value):
				self[key] = value

		old_text = "custom operator prompt"
		doc = Doc(instructions=old_text, description="d", starter_prompts=[])
		self.assertFalse(agent_seeding._upgrade_seeded_instructions(doc))
		self.assertEqual(doc.instructions, old_text)

		import hashlib

		with patch.object(
			agent_seeding,
			"_PREVIOUS_SEED_INSTRUCTION_HASHES",
			{hashlib.sha256(old_text.encode()).hexdigest()},
		):
			self.assertTrue(agent_seeding._upgrade_seeded_instructions(doc))
		self.assertEqual(doc.instructions, seed["instructions"])
		self.assertEqual(doc.starter_prompts, seed["starter_prompts"])
