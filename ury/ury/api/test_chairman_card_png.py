# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# Pure unit tests (no Frappe; needs Pillow): python3 -m unittest test_chairman_card_png  (from this directory)

import io
import unittest

try:
	from ury.ury.api import chairman_card_png as p
except ImportError:
	import chairman_card_png as p

from PIL import Image

KPI = {"type": "kpi", "title": "Day sales", "subtitle": "2026-11-02", "kpis": [
	{"label": "Net sales", "value": 34290.0, "fmt": "money", "delta": 0.0009},
	{"label": "Orders", "value": 22.0, "fmt": "int", "delta": -0.05},
	{"label": "Avg", "value": 1558.6, "fmt": "money", "delta": None}]}
BAR = {"type": "bar", "title": "Sales by order type", "subtitle": "x", "fmt": "money",
	"series": [{"label": "Take Away", "value": 443255.0}, {"label": "Dine In", "value": 1540.0}]}
LINE = {"type": "line", "title": "Daily", "subtitle": "x", "fmt": "money",
	"series": [{"label": f"d{i}", "value": v} for i, v in enumerate([5, 9, 3, 12, 7])]}
TABLE = {"type": "table", "title": "Top dishes", "subtitle": "x", "cols": ["Dish", "Sales", "Qty"],
	"rows": [["Shahi Tukda", 19880.0, 71.0], ["Chicken Burger", 11880.0, 54.0]]}
ALL = (KPI, BAR, LINE, TABLE)


class FormatTests(unittest.TestCase):
	def test_indian_grouping(self):
		self.assertEqual(p.fmt_number(1234567), "12,34,567")
		self.assertEqual(p.fmt_number(999), "999")
		self.assertEqual(p.fmt_number(100000), "1,00,000")
		self.assertEqual(p.fmt_value(444795.0, "money"), p._rupee_sign() + "4,44,795")
		self.assertEqual(p.fmt_value(-2500, "money"), "-" + p._rupee_sign() + "2,500")
		self.assertEqual(p.fmt_value(12.5, "pct"), "12.5%")


class RenderTests(unittest.TestCase):
	def test_all_types(self):
		for c in ALL:
			png = p.render(c, today="2026-11-03")
			self.assertEqual(png[:8], b"\x89PNG\r\n\x1a\n")
			self.assertLess(len(png), 1_000_000)
			self.assertEqual(Image.open(io.BytesIO(png)).width, 1080)

	def test_deterministic(self):
		self.assertEqual(p.render(KPI, today="2026-11-03"), p.render(KPI, today="2026-11-03"))

	def test_ai_note_changes_output(self):
		a = p.render(BAR, today="d")
		b = p.render(dict(BAR, ai_composed=True), today="d")
		self.assertNotEqual(a, b)
		self.assertGreater(Image.open(io.BytesIO(b)).height, Image.open(io.BytesIO(a)).height)

	def test_dark_rtl_and_missing_fonts_degrade(self):
		for lang in ("ar", "hi", "ml"):
			c = dict(TABLE, title="مبيعات" if lang == "ar" else "बिक्री" if lang == "hi" else "വിൽപ്പന")
			self.assertTrue(p.render(c, lang=lang, theme="dark"))

	def test_unsupported(self):
		with self.assertRaises(ValueError):
			p.render({"type": "pie"})


if __name__ == "__main__":
	unittest.main()
