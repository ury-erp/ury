# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt
#
# Pure: reproduces how Huf flattens the seeded Agent Function Params into a JSON schema.

import unittest

try:
	from ury.ury.api import test_chairman_tools as _tt  # noqa: F401  (installs the frappe stub if needed)
	from ury.ury.api import chairman_seed as seed
except ImportError:
	import test_chairman_tools as _tt  # noqa: F401
	import chairman_seed as seed


def huf_schema(rows):
	"""Mirror of agent_tool_function.py param loop for a non-registry (custom) function_path."""
	props = {}
	for p in rows:
		obj = {"type": "number" if p["type"] == "float" else p["type"], "description": p["description"]}
		if p["type"] == "array":
			obj["items"] = {"type": "string"}  # array_items_schema: non-registry path => strings
		if p["type"] == "string" and p.get("options"):
			obj["enum"] = p["options"].split("\n")
		props[p["fieldname"]] = obj
	return props


class TestSeedParams(unittest.TestCase):
	def _tool(self, name):
		return next(t for t in seed.TOOLS if t["name"] == name)

	def test_compose_card_enums_survive(self):
		props = huf_schema(seed.param_rows(self._tool("compose_card")))
		self.assertEqual(props["type"]["enum"], ["kpi", "bar", "line"])
		self.assertEqual(props["fmt"]["enum"], ["money", "int", "pct", "mins"])
		self.assertEqual(props["values"]["items"], {"type": "string"})
		self.assertNotIn("rows", props)

	def test_compose_dashboard_params(self):
		props = huf_schema(seed.param_rows(self._tool("compose_dashboard")))
		self.assertEqual(props["columns"]["enum"], ["1", "2"])
		self.assertEqual(props["card_ids"]["items"], {"type": "string"})
		self.assertEqual(props["captions"]["items"], {"type": "string"})
		rows = {r["fieldname"]: r for r in seed.param_rows(self._tool("compose_dashboard"))}
		self.assertEqual((rows["title"]["required"], rows["card_ids"]["required"], rows["columns"]["required"]), (1, 1, 0))
		self.assertIn("compose_dashboard", seed.INSTRUCTIONS)

	def test_show_card_tool_enum(self):
		props = huf_schema(seed.param_rows(self._tool("show_card")))
		self.assertIn("get_day_summary", props["tool"]["enum"])
		self.assertNotIn("show_card", props["tool"]["enum"])

	def test_required_and_no_options_on_plain_strings(self):
		rows = {r["fieldname"]: r for r in seed.param_rows(self._tool("compose_card"))}
		self.assertEqual(rows["type"]["required"], 1)
		self.assertEqual(rows["title"]["required"], 1)
		self.assertNotIn("options", rows["title"])


if __name__ == "__main__":
	unittest.main()
