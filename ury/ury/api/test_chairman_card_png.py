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


import os

PROOF = os.environ.get("CARD_PNG_PROOF_DIR", "")
KPI_T = {"type": "kpi", "title": "Day sales", "subtitle": "2026-11-02", "kpis": [
	{"label": "Net sales", "value": 34290.0, "fmt": "money", "delta": 0.125, "trend": "up", "tone": "good"},
	{"label": "Cancellations", "value": 7.0, "fmt": "int", "delta": 0.4, "trend": "up", "tone": "bad"},
	{"label": "Orders", "value": 22.0, "fmt": "int", "delta": 0.001, "trend": "flat", "tone": "neutral"},
	{"label": "Avg ticket", "value": 1558.6, "fmt": "money", "delta": -0.05, "trend": "down", "tone": "neutral"}]}
DASH = {"v": 2, "type": "dashboard", "title": "Weekend trading review for the Koramangala branch",
	"subtitle": "Sales, cancellations and the daily trend for the last week", "subtext": "Branch: Koramangala",
	"footnote": "Daily trend panel was composed by the assistant from your data; verify on the dashboard.",
	"ai_composed": True, "panels": [
		{"card": KPI_T, "id": "c1", "composed": False, "span": 2, "caption": "Cancellations are up 40% on last week."},
		{"card": LINE, "id": "c2", "composed": True, "span": 2, "title": "Daily sales", "subtitle": "Last five days"},
		{"card": BAR, "id": "c3", "composed": False, "span": 2, "caption": "Take Away dominates the mix."}]}


class FormatTests(unittest.TestCase):
	def test_indian_grouping(self):
		self.assertEqual(p.fmt_number(1234567), "12,34,567")
		self.assertEqual(p.fmt_number(999), "999")
		self.assertEqual(p.fmt_number(100000), "1,00,000")
		self.assertEqual(p.fmt_value(444795.0, "money"), p._rupee_sign() + "4,44,795")
		self.assertEqual(p.fmt_value(-2500, "money"), "-" + p._rupee_sign() + "2,500")
		self.assertEqual(p.fmt_value(12.5, "pct"), "12.5%")


class _Fake:
	def __init__(self, rupee, notdef=b"BOX"):
		self.r, self.n = rupee, notdef

	def getmask(self, text):
		r, n = self.r, self.n

		class M:
			def tobytes(self_):
				return r if text == "\u20b9" else n
		return M()


class RupeeProbeTests(unittest.TestCase):
	def test_glyph_vs_notdef(self):
		self.assertTrue(p._has_rupee(_Fake(b"RUPEE")))
		self.assertFalse(p._has_rupee(_Fake(b"BOX")))  # same as notdef
		self.assertFalse(p._has_rupee(_Fake(b"\x00\x00")))  # blank

	def test_one_form_per_card(self):
		good, bad = _Fake(b"R"), _Fake(b"BOX")
		self.assertEqual(p.rupee_form([good, good]), "\u20b9")
		self.assertEqual(p.rupee_form([good, bad]), "Rs ")
		self.assertEqual(p.rupee_form([]), "Rs ")

	def test_load_font_prefers_glyph(self):
		import unittest.mock as m
		fonts = {"/a": _Fake(b"BOX"), "/b": _Fake(b"R")}
		with m.patch.object(p.os.path, "exists", return_value=True), \
				m.patch.object(p.ImageFont, "truetype", side_effect=lambda path, *a, **k: fonts[path]):
			self.assertIs(p._load_font(["/a", "/b"], 10, None, need_rupee=True), fonts["/b"])
			self.assertIs(p._load_font(["/a", "/b"], 10, None), fonts["/a"])
			fonts["/b"] = _Fake(b"BOX")
			self.assertIs(p._load_font(["/a", "/b"], 10, None, need_rupee=True), fonts["/a"])  # none has it


class MeaningTests(unittest.TestCase):
	def test_duplicate_kpi_label_and_good_direction(self):
		one = {"type": "kpi", "title": "Net sales", "subtitle": "x", "kpis": [KPI["kpis"][0]]}
		other = dict(one, title="Sales")
		self.assertNotEqual(p.render(one, today="d"), p.render(other, today="d"))
		a = p.render(LINE, today="d")
		self.assertNotEqual(a, p.render(dict(LINE, good_direction="down"), today="d"))
		self.assertEqual(a, p.render(dict(LINE, good_direction="up"), today="d"))
		self.assertEqual(p.render(BAR, today="d"), p.render(dict(BAR, good_direction=None), today="d"))
		self.assertNotEqual(p.render(BAR, today="d"), p.render(dict(BAR, good_direction="up"), today="d"))


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

	def test_hsl_to_rgb(self):
		self.assertEqual(p.hsl_to_rgb("0 0% 100%"), (255, 255, 255))
		self.assertEqual(p.hsl_to_rgb("0 100% 50%"), (255, 0, 0))
		self.assertEqual(p.THEMES["light"]["up"], p.hsl_to_rgb("154.8 70.4% 27.8%"))

	def test_kpi_trend_tone(self):
		png = p.render(KPI_T, today="2026-11-03")
		self.assertEqual(png, p.render(KPI_T, today="2026-11-03"))
		plain = dict(KPI_T, kpis=[dict(k, trend=None, tone=None, delta=None) for k in KPI_T["kpis"]])
		self.assertNotEqual(png, p.render(plain, today="2026-11-03"))
		if PROOF:
			open(os.path.join(PROOF, "kpi_trend_en.png"), "wb").write(png)

	def test_dashboard(self):
		png = p.render(DASH, today="2026-11-03")
		self.assertLess(len(png), 1_500_000)
		im = Image.open(io.BytesIO(png))
		self.assertEqual(im.width, 1080)
		self.assertLessEqual(im.height, p.MAX_HEIGHT)
		self.assertEqual(png, p.render(DASH, today="2026-11-03"))
		if PROOF:
			open(os.path.join(PROOF, "dashboard_en.png"), "wb").write(png)

	def test_dashboard_dark_rtl_and_height_cap(self):
		self.assertTrue(p.render(DASH, lang="ar", theme="dark", today="d"))
		tall = dict(DASH, panels=[DASH["panels"][1]] * 12)
		with self.assertRaises(ValueError):
			p.render(tall, today="d")
		with self.assertRaises(ValueError):
			p.render(dict(DASH, panels=[]), today="d")

	def test_unsupported(self):
		with self.assertRaises(ValueError):
			p.render({"type": "pie"})


if __name__ == "__main__":
	unittest.main()
