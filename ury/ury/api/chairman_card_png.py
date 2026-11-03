# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
"""Chairman card -> PNG (WhatsApp channel, WP2). Pure: no DB, no Frappe.

render(card, lang="en", theme="light") -> PNG bytes, 1080px wide. Input is a card from
chairman_cards.validate_card (schema v1: kpi, bar, line, table).
"""

import datetime
import io
import os

from PIL import Image, ImageDraw, ImageFont, features

WIDTH = 1080
PAD = 56
FONT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "public", "fonts", "brief")
RTL_LANGS = ("ar",)
AI_NOTE = "Composed by assistant from your data - verify on the dashboard"

THEMES = {
	"light": dict(bg=(255, 255, 255), fg=(24, 29, 38), muted=(107, 114, 128), tile=(244, 246, 249),
		accent=(37, 99, 235), up=(22, 163, 74), down=(220, 38, 38), line=(226, 230, 236), warn=(180, 83, 9)),
	"dark": dict(bg=(17, 20, 26), fg=(238, 241, 245), muted=(150, 158, 170), tile=(30, 35, 44),
		accent=(96, 165, 250), up=(74, 222, 128), down=(248, 113, 113), line=(48, 55, 66), warn=(251, 191, 36)),
}

# script -> candidate file names in FONT_DIR (regular, bold)
SCRIPT_FILES = {
	"latin": ("NotoSans-Regular.ttf", "NotoSans-Bold.ttf"),
	"devanagari": ("NotoSansDevanagari-Regular.ttf", "NotoSansDevanagari-Bold.ttf"),
	"arabic": ("NotoSansArabic-Regular.ttf", "NotoSansArabic-Bold.ttf"),
	"malayalam": ("NotoSansMalayalam-Regular.ttf", "NotoSansMalayalam-Bold.ttf"),
}
FALLBACKS = (
	"/usr/share/fonts/truetype/dejavu/DejaVuSans{b}.ttf",
	"/usr/share/fonts/dejavu/DejaVuSans{b}.ttf",
	"/Library/Fonts/Arial Unicode.ttf",
	"/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
	"/System/Library/Fonts/Supplemental/Arial{c}.ttf",
)
_font_cache = {}


def _script(text):
	for ch in text or "":
		o = ord(ch)
		if 0x0600 <= o <= 0x06FF or 0x0750 <= o <= 0x077F or 0xFB50 <= o <= 0xFDFF or 0xFE70 <= o <= 0xFEFF:
			return "arabic"
		if 0x0900 <= o <= 0x097F:
			return "devanagari"
		if 0x0D00 <= o <= 0x0D7F:
			return "malayalam"
	return "latin"


def _font(script, size, bold=False):
	key = (script, size, bold)
	if key in _font_cache:
		return _font_cache[key]
	engine = ImageFont.Layout.RAQM if features.check("raqm") else ImageFont.Layout.BASIC
	names = SCRIPT_FILES[script]
	cands = [os.path.join(FONT_DIR, names[1 if bold else 0])]
	if script != "latin":  # Latin/digits inside a script string still need a glyph source
		pass
	cands += [p.format(b="-Bold" if bold else "", c=" Bold" if bold else "") for p in FALLBACKS]
	font = None
	for path in cands:
		if os.path.exists(path):
			try:
				font = ImageFont.truetype(path, size, layout_engine=engine)
				break
			except OSError:
				continue
	if font is None:
		font = ImageFont.load_default(size)
	_font_cache[key] = font
	return font


# ---- formatting -------------------------------------------------------------------------

def _group_in(n):
	s = str(int(n))
	if len(s) <= 3:
		return s
	head, tail = s[:-3], s[-3:]
	parts = []
	while len(head) > 2:
		parts.insert(0, head[-2:])
		head = head[:-2]
	if head:
		parts.insert(0, head)
	return ",".join(parts + [tail])


def fmt_number(v, decimals=0):
	"""en-IN grouping: 1234567.5 -> 12,34,568."""
	v = float(v)
	neg = v < 0
	v = abs(v)
	q = round(v, decimals)
	whole = int(q)
	out = _group_in(whole)
	if decimals:
		out += "." + f"{q - whole:.{decimals}f}"[2:]
	return ("-" if neg and q != 0 else "") + out


_rupee = {}


def _rupee_sign():
	"""'₹' when the Latin font has the glyph (Noto Sans does), else 'Rs ' so we never draw a tofu box."""
	if "v" not in _rupee:
		try:
			f = _font("latin", 40, True)
			ok = bytes(f.getmask("\u20b9").tobytes()) != bytes(f.getmask("\U0010fffe").tobytes())
		except Exception:
			ok = False
		_rupee["v"] = "\u20b9" if ok else "Rs "
	return _rupee["v"]


def fmt_value(v, fmt):
	if v is None:
		return "-"
	if fmt == "money":
		s = fmt_number(v, 0 if abs(v) >= 1000 or float(v).is_integer() else 2)
		return ("-" + _rupee_sign() + s[1:]) if s.startswith("-") else _rupee_sign() + s
	if fmt == "pct":
		return fmt_number(v, 0 if float(v).is_integer() else 1) + "%"
	if fmt == "mins":
		return fmt_number(v, 0 if float(v).is_integer() else 1) + " min"
	return fmt_number(v, 0 if float(v).is_integer() else 2)


def fmt_cell(c, col_is_money=False):
	if isinstance(c, (int, float)) and not isinstance(c, bool):
		return fmt_value(c, "money" if col_is_money else "int")
	return str(c)


# ---- drawing helpers --------------------------------------------------------------------

class _Ctx:
	def __init__(self, lang, theme):
		self.rtl = lang in RTL_LANGS
		self.t = THEMES.get(theme, THEMES["light"])
		self.lang = lang

	def width(self, d, text, font):
		return d.textlength(text, font=font, direction="rtl" if self.rtl and _script(text) == "arabic" else None)


def _fit(ctx, d, text, size, max_w, bold=False):
	text = str(text)
	sc = _script(text)
	font = _font(sc, size, bold)
	if ctx.width(d, text, font) <= max_w:
		return text, font
	while len(text) > 1 and ctx.width(d, text + "…", font) > max_w:
		text = text[:-1]
	return text.rstrip() + "…", font


def _text(ctx, d, x0, x1, y, text, size, fill, bold=False, align=None):
	"""Draw within [x0, x1]; align 'l'/'r'/'c'. Default follows direction (RTL -> right)."""
	text, font = _fit(ctx, d, text, size, x1 - x0, bold)
	w = ctx.width(d, text, font)
	align = align or ("r" if ctx.rtl else "l")
	x = x0 if align == "l" else (x1 - w if align == "r" else x0 + (x1 - x0 - w) / 2)
	rtl = ctx.rtl and _script(text) == "arabic"
	d.text((x, y), text, font=font, fill=fill, direction="rtl" if rtl else None)
	return size


def _delta_str(delta):
	if delta is None:
		return None, 0
	pct = delta * 100
	arrow = "▲" if pct > 0 else ("▼" if pct < 0 else "–")
	return f"{arrow} {abs(pct):.1f}%", pct


def _header(ctx, d, card, y):
	t = ctx.t
	_text(ctx, d, PAD, WIDTH - PAD, y, card["title"], 52, t["fg"], bold=True)
	y += 70
	if card.get("subtitle"):
		_text(ctx, d, PAD, WIDTH - PAD, y, card["subtitle"], 30, t["muted"])
		y += 48
	return y + 16


# Each body fn: (ctx, d, card, y) -> new y.  Called twice: measure on a scratch image, then draw.

def _body_kpi(ctx, d, card, y):
	t = ctx.t
	kpis = card["kpis"]
	gap = 24
	tw = (WIDTH - 2 * PAD - gap) // 2
	th = 210
	for i, k in enumerate(kpis):
		col, row = i % 2, i // 2
		x = PAD + col * (tw + gap)
		if ctx.rtl:
			x = WIDTH - PAD - tw - col * (tw + gap)
		ty = y + row * (th + gap)
		d.rounded_rectangle((x, ty, x + tw, ty + th), radius=24, fill=t["tile"])
		_text(ctx, d, x + 28, x + tw - 28, ty + 24, k["label"], 28, t["muted"])
		_text(ctx, d, x + 28, x + tw - 28, ty + 70, fmt_value(k["value"], k["fmt"]), 62, t["fg"], bold=True)
		ds, pct = _delta_str(k.get("delta"))
		if ds:
			color = t["up"] if pct > 0 else (t["down"] if pct < 0 else t["muted"])
			_text(ctx, d, x + 28, x + tw - 28, ty + 152, ds + " vs prior", 28, color, bold=True)
	rows = (len(kpis) + 1) // 2
	return y + rows * th + (rows - 1) * gap + 32


def _body_bar(ctx, d, card, y):
	t = ctx.t
	s = card["series"]
	fmt = card.get("fmt") or "int"
	mx = max((p["value"] for p in s), default=0) or 1
	label_w, val_w = 260, 230
	bar_x0 = PAD + label_w + 16
	bar_x1 = WIDTH - PAD - val_w - 16
	for p in s:
		if ctx.rtl:
			_text(ctx, d, WIDTH - PAD - label_w, WIDTH - PAD, y + 6, p["label"], 30, t["fg"])
			_text(ctx, d, PAD, PAD + val_w, y + 6, fmt_value(p["value"], fmt), 30, t["fg"], bold=True, align="l")
			bx1 = WIDTH - PAD - label_w - 16
			bx0 = PAD + val_w + 16
			w = max(4, int((bx1 - bx0) * max(p["value"], 0) / mx))
			d.rounded_rectangle((bx1 - w, y + 4, bx1, y + 48), radius=10, fill=t["accent"])
		else:
			_text(ctx, d, PAD, PAD + label_w, y + 6, p["label"], 30, t["fg"], align="l")
			w = max(4, int((bar_x1 - bar_x0) * max(p["value"], 0) / mx))
			d.rounded_rectangle((bar_x0, y + 4, bar_x0 + w, y + 48), radius=10, fill=t["accent"])
			_text(ctx, d, WIDTH - PAD - val_w, WIDTH - PAD, y + 6, fmt_value(p["value"], fmt), 30, t["fg"], bold=True, align="r")
		y += 68
	return y + 16


def _body_line(ctx, d, card, y):
	t = ctx.t
	s = card["series"]
	fmt = card.get("fmt") or "int"
	vals = [p["value"] for p in s]
	lo, hi = min(vals), max(vals)
	span = (hi - lo) or 1
	h = 420
	x0, x1 = PAD + 8, WIDTH - PAD - 8
	top, bot = y + 40, y + h - 20
	for f in (0, 0.5, 1):
		gy = bot - (bot - top) * f
		d.line((x0, gy, x1, gy), fill=t["line"], width=2)
	pts = []
	n = len(s)
	for i, v in enumerate(vals):
		fx = i / (n - 1)
		if ctx.rtl:
			fx = 1 - fx
		pts.append((x0 + (x1 - x0) * fx, bot - (bot - top) * (v - lo) / span))
	d.line(pts, fill=t["accent"], width=6, joint="curve")
	for (px, py) in pts:
		d.ellipse((px - 6, py - 6, px + 6, py + 6), fill=t["accent"])
	imax, imin = vals.index(hi), vals.index(lo)
	for idx, tag, up in ((imax, "max", True), (imin, "min", False)):
		px, py = pts[idx]
		txt = f"{fmt_value(vals[idx], fmt)}"
		lw = 220
		lx0 = min(max(px - lw / 2, PAD), WIDTH - PAD - lw)
		_text(ctx, d, lx0, lx0 + lw, py - 44 if up else py + 12, txt, 28, t["up"] if up else t["down"], bold=True, align="c")
	ly = y + h + 4
	first, last = s[0]["label"], s[-1]["label"]
	left, right = (last, first) if ctx.rtl else (first, last)
	_text(ctx, d, PAD, PAD + 300, ly, left, 26, t["muted"], align="l")
	_text(ctx, d, WIDTH - PAD - 300, WIDTH - PAD, ly, right, 26, t["muted"], align="r")
	return ly + 60


def _body_table(ctx, d, card, y):
	t = ctx.t
	cols = card.get("cols") or [""] * len(card["rows"][0])
	n = len(cols)
	avail = WIDTH - 2 * PAD
	first_w = int(avail * (0.46 if n > 1 else 1))
	rest_w = (avail - first_w) // max(n - 1, 1)
	widths = [first_w] + [rest_w] * (n - 1)
	xs = []
	x = PAD
	for w in widths:
		xs.append(x)
		x += w
	if ctx.rtl:
		xs = [WIDTH - PAD - (xx - PAD) - w for xx, w in zip(xs, widths)]
	money_cols = {i for i, c in enumerate(cols) if str(c).lower() in ("sales", "value", "amount", "revenue", "total")}

	def cell(i, text, yy, size, fill, bold=False):
		numeric_col = i > 0
		al = ("l" if ctx.rtl else "r") if numeric_col else None
		_text(ctx, d, xs[i] + 8, xs[i] + widths[i] - 8, yy, text, size, fill, bold=bold, align=al)

	for i, c in enumerate(cols):
		cell(i, c, y, 28, t["muted"], bold=True)
	y += 50
	d.line((PAD, y, WIDTH - PAD, y), fill=t["line"], width=3)
	y += 14
	for ri, r in enumerate(card["rows"]):
		if ri % 2 == 0:
			d.rectangle((PAD, y - 6, WIDTH - PAD, y + 56), fill=t["tile"])
		for i, c in enumerate(r[:n]):
			cell(i, fmt_cell(c, i in money_cols), y, 30, t["fg"], bold=(i == 0 and False))
		y += 68
	return y + 12


BODIES = {"kpi": _body_kpi, "bar": _body_bar, "line": _body_line, "table": _body_table}


def _footer(ctx, d, card, y, today):
	t = ctx.t
	d.line((PAD, y, WIDTH - PAD, y), fill=t["line"], width=2)
	y += 20
	if card.get("ai_composed"):
		_text(ctx, d, PAD, WIDTH - PAD, y, AI_NOTE, 26, t["warn"], bold=True)
		y += 42
	_text(ctx, d, PAD, WIDTH - PAD, y, f"URY · {today}", 26, t["muted"])
	return y + 56


def render(card, lang="en", theme="light", today=None):
	"""Render one validated card to PNG bytes (1080px wide)."""
	if not isinstance(card, dict) or card.get("type") not in BODIES:
		raise ValueError("unsupported card")
	ctx = _Ctx(lang, theme)
	today = today or datetime.date.today().isoformat()
	body = BODIES[card["type"]]
	scratch = ImageDraw.Draw(Image.new("RGB", (WIDTH, 10)))

	def paint(d):
		y = _header(ctx, d, card, PAD)
		y = body(ctx, d, card, y)
		return _footer(ctx, d, card, y + 8, today)

	height = paint(scratch)
	img = Image.new("RGB", (WIDTH, height), ctx.t["bg"])
	paint(ImageDraw.Draw(img))
	buf = io.BytesIO()
	img.save(buf, format="PNG", optimize=True)
	return buf.getvalue()
