# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
"""Chairman card -> PNG (WhatsApp channel, WP2). Pure: no DB, no Frappe.

render(card, lang="en", theme="light") -> PNG bytes, 1080px wide. Input is a card from
chairman_cards.validate_card (schema v1: kpi, bar, line, table) or
a v2 dashboard card (stacked panels, one column). render_panel() returns a PIL image for one v1 card.
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
AI_NOTES = {
	"hi": "सहायक ने आपके डेटा से बनाया - डैशबोर्ड पर जाँचें",
	"ar": "أنشأه المساعد من بياناتك - تحقق منه في لوحة المعلومات",
	"ml": "അസിസ്റ്റന്റ് നിങ്ങളുടെ ഡാറ്റയിൽ നിന്ന് തയ്യാറാക്കിയത് - ഡാഷ്ബോർഡിൽ പരിശോധിക്കുക",
}
VS_PRIOR = {"en": "vs prior", "hi": "पिछले से", "ar": "عن السابق", "ml": "മുൻപ്"}

def hsl_to_rgb(spec):
	"""'341.5 75.3% 38.0%' (design-token channel string) -> (r, g, b) ints."""
	h, sat, lig = (float(x.strip().rstrip("%")) for x in str(spec).split())
	h, sat, lig = (h % 360) / 360.0, sat / 100.0, lig / 100.0
	q = lig * (1 + sat) if lig < 0.5 else lig + sat - lig * sat
	p = 2 * lig - q

	def chan(t):
		t %= 1.0
		v = p + (q - p) * 6 * t if t < 1 / 6 else q if t < 0.5 else p + (q - p) * (2 / 3 - t) * 6 if t < 2 / 3 else p
		return int(round(v * 255))

	return chan(h + 1 / 3), chan(h), chan(h - 1 / 3)


# URY design tokens (ury-design/dist/tokens.css), hsl channel strings.
_TOKENS = {
	"light": dict(bg="60.0 11.1% 98.2%", fg="240.0 7.1% 5.5%", muted="216.0 5.2% 38.0%", tile="60.0 4.8% 95.9%",
		accent="341.5 75.3% 38.0%", up="154.8 70.4% 27.8%", down="4.4 65.9% 44.9%", line="60.0 4.5% 91.4%"),
	"dark": dict(bg="222.2 84% 4.9%", fg="210 40% 98%", muted="215 20.2% 65.1%", tile="222.2 45% 13%",
		accent="342 78% 58%", up="142 69% 48%", down="0 62.8% 30.6%", line="217.2 32.6% 17.5%"),
}
THEMES = {k: {n: hsl_to_rgb(v) for n, v in d.items()} for k, d in _TOKENS.items()}
THEMES["light"]["warn"] = (180, 83, 9)
THEMES["dark"]["warn"] = (251, 191, 36)

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


def _mask_bytes(mask):
	"""Bytes of a font mask; newer Pillow returns a bare ImagingCore without tobytes()."""
	if hasattr(mask, "tobytes"):
		return bytes(mask.tobytes())
	return bytes(Image.Image()._new(mask).tobytes())


def _has_rupee(font):
	"""True when `font` draws a real rupee glyph: its rendering must differ from the font's own missing-glyph
	(notdef) box and must not be blank. Works for any object with getmask (injectable in tests)."""
	try:
		rupee = _mask_bytes(font.getmask("\u20b9"))
		notdef = _mask_bytes(font.getmask("\U0010fffe"))
		return bool(rupee.strip(b"\x00")) and rupee != notdef
	except Exception:
		return False


def _glob_fonts(bold):
	"""Extra candidates found on the system (DejaVu, Noto Sans, Liberation), regular or bold."""
	import glob
	pats = ["DejaVuSans{b}.ttf", "NotoSans-{w}.ttf", "LiberationSans-{w}.ttf"]
	out = []
	for root in ("/usr/share/fonts", "/usr/local/share/fonts", "/Library/Fonts"):
		for pat in pats:
			name = pat.format(b="-Bold" if bold else "", w="Bold" if bold else "Regular")
			out += sorted(glob.glob(os.path.join(root, "**", name), recursive=True))
	try:
		import PIL
		out += sorted(glob.glob(os.path.join(os.path.dirname(PIL.__file__), "**", "*.ttf"), recursive=True))
	except Exception:
		pass
	return out


def _candidates(script, bold):
	names = SCRIPT_FILES[script]
	cands = [os.path.join(FONT_DIR, names[1 if bold else 0])]
	cands += [p.format(b="-Bold" if bold else "", c=" Bold" if bold else "") for p in FALLBACKS]
	cands += _glob_fonts(bold)
	seen = set()
	return [c for c in cands if not (c in seen or seen.add(c))]


def _load_font(cands, size, engine, need_rupee=False):
	"""First loadable candidate; with need_rupee, the first one that has the rupee glyph (else the first loadable)."""
	first = None
	for path in cands:
		if not os.path.exists(path):
			continue
		try:
			font = ImageFont.truetype(path, size, layout_engine=engine)
		except OSError:
			continue
		if first is None:
			first = font
		if not need_rupee or _has_rupee(font):
			return font
	return first


def _font(script, size, bold=False):
	key = (script, size, bold)
	if key in _font_cache:
		return _font_cache[key]
	engine = ImageFont.Layout.RAQM if features.check("raqm") else ImageFont.Layout.BASIC
	# Latin carries digits and the rupee sign, so prefer a face that has the glyph (regular and bold alike).
	font = _load_font(_candidates(script, bold), size, engine, need_rupee=(script == "latin"))
	if font is None:
		font = ImageFont.load_default(size)
	_font_cache[key] = font
	return font


# ---- formatting -------------------------------------------------------------------------

_rupee = {}


def rupee_form(fonts):
	"""'\u20b9' only if EVERY font in `fonts` has the glyph, else 'Rs ' - one decision shared by a whole card."""
	fonts = list(fonts)
	return "\u20b9" if fonts and all(_has_rupee(f) for f in fonts) else "Rs "


def _currency():
	"""Site currency for the card (INR only when none is configured)."""
	try:
		from ury.ury.api import chairman

		return chairman.scope_currency() or chairman.site_currency()  # memoised per request
	except Exception:
		return "INR"


def _rupee_sign():
	"""Money prefix for all money on a card. Non-INR sites use the currency symbol/code; INR probes the
	Latin regular and bold faces actually used (sizes 28-62) for the rupee glyph, else 'Rs '."""
	cur = _currency()
	if cur != "INR":
		from ury.ury.api import chairman

		return chairman.currency_symbol(cur)
	if "v" not in _rupee:
		try:
			_rupee["v"] = rupee_form(_font("latin", sz, b) for sz in (28, 30, 62) for b in (False, True))
		except Exception:
			_rupee["v"] = "Rs "
	return _rupee["v"]


def _group_in(n):
	"""Indian digit grouping of a non-negative integer string: 1234567 -> 12,34,567."""
	if len(n) <= 3:
		return n
	head, tail = n[:-3], n[-3:]
	parts = []
	while len(head) > 2:
		parts.insert(0, head[-2:])
		head = head[:-2]
	if head:
		parts.insert(0, head)
	return ",".join(parts) + "," + tail


def fmt_number(v, decimals=0):
	neg = v < 0
	s = "%.*f" % (decimals, abs(v))
	whole, _, frac = s.partition(".")
	if _currency() == "INR":
		out = _group_in(whole)
	else:
		out = f"{int(whole):,}"
	out += "." + frac if frac else ""
	return "-" + out if neg else out


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
		self.title = None  # effective title of the card/panel being drawn (for duplicate-label suppression)

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
	return f"{abs(pct):.1f}%", pct


def _arrow(d, cx, cy, kind, fill, r=14):
	"""Trend arrow as a shape (no font glyph): up/down triangle or flat bar."""
	if kind == "up":
		d.polygon([(cx, cy - r), (cx + r, cy + r * 0.7), (cx - r, cy + r * 0.7)], fill=fill)
	elif kind == "down":
		d.polygon([(cx, cy + r), (cx + r, cy - r * 0.7), (cx - r, cy - r * 0.7)], fill=fill)
	else:
		d.rounded_rectangle((cx - r, cy - 4, cx + r, cy + 4), radius=4, fill=fill)


def _tone_color(t, tone):
	return t["up"] if tone == "good" else t["down"] if tone == "bad" else t["fg"]


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
		dup = len(kpis) == 1 and (k["label"] or "").strip().lower() == (ctx.title or "").strip().lower()
		if not dup:  # a lone tile whose label repeats the card/panel title would print it twice
			_text(ctx, d, x + 28, x + tw - 28, ty + 24, k["label"], 28, t["muted"])
		_text(ctx, d, x + 28, x + tw - 28, ty + (50 if dup else 70), fmt_value(k["value"], k["fmt"]), 62, t["fg"], bold=True)
		ds, pct = _delta_str(k.get("delta"))
		trend = k.get("trend") or (None if ds is None else "up" if pct > 0 else "down" if pct < 0 else "flat")
		if ds or trend:
			color = _tone_color(t, k.get("tone"))
			ry = ty + 152
			if trend:
				ax = x + tw - 28 - 14 if ctx.rtl else x + 28 + 14
				_arrow(d, ax, ry + 17, trend, color)
			if ds:
				tx0, tx1 = (x + 28, x + tw - 28 - 40) if ctx.rtl else (x + 28 + 40, x + tw - 28)
				_text(ctx, d, tx0, tx1, ry, ds + " " + VS_PRIOR.get(ctx.lang, VS_PRIOR["en"]), 28, color, bold=True)
	rows = (len(kpis) + 1) // 2
	return y + rows * th + (rows - 1) * gap + 32


def _body_bar(ctx, d, card, y):
	t = ctx.t
	s = card["series"]
	fmt = card.get("fmt") or "int"
	mx = max((p["value"] for p in s), default=0) or 1
	label_w, val_w = 260, 230
	# colour by meaning only when the card sets good_direction explicitly (best bar green, worst red);
	# otherwise every bar stays primary crimson.
	gd = card.get("good_direction")
	vs = [p["value"] for p in s]
	best, worst = (max(vs), min(vs)) if gd == "up" else (min(vs), max(vs))
	bar_x0 = PAD + label_w + 16
	bar_x1 = WIDTH - PAD - val_w - 16
	for p in s:
		fillc = t["accent"]
		if gd in ("up", "down") and len(s) > 1 and best != worst:
			fillc = t["up"] if p["value"] == best else t["down"] if p["value"] == worst else t["accent"]
		if ctx.rtl:
			_text(ctx, d, WIDTH - PAD - label_w, WIDTH - PAD, y + 6, p["label"], 30, t["fg"])
			_text(ctx, d, PAD, PAD + val_w, y + 6, fmt_value(p["value"], fmt), 30, t["fg"], bold=True, align="l")
			bx1 = WIDTH - PAD - label_w - 16
			bx0 = PAD + val_w + 16
			w = max(4, int((bx1 - bx0) * max(p["value"], 0) / mx))
			d.rounded_rectangle((bx1 - w, y + 4, bx1, y + 48), radius=10, fill=fillc)
		else:
			_text(ctx, d, PAD, PAD + label_w, y + 6, p["label"], 30, t["fg"], align="l")
			w = max(4, int((bar_x1 - bar_x0) * max(p["value"], 0) / mx))
			d.rounded_rectangle((bar_x0, y + 4, bar_x0 + w, y + 48), radius=10, fill=fillc)
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
	h = 440
	x0, x1 = PAD + 8, WIDTH - PAD - 8
	# plot is inset 56px top and bottom so the peak label (above its point) and the trough label (below its
	# point) stay inside the plot and never reach the x-axis labels drawn under it, even at the first/last point.
	top, bot = y + 56, y + h - 56
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
	# peak/trough labels coloured by meaning: good_direction "up" (default) -> peak green, trough red; "down" reversed
	good_up = card.get("good_direction") != "down"
	for idx, up in ((imax, True), (imin, False)):
		px, py = pts[idx]
		txt = fmt_value(vals[idx], fmt)
		lw = 220
		lx0 = min(max(px - lw / 2, PAD), WIDTH - PAD - lw)
		col = t["up"] if up == good_up else t["down"]
		_text(ctx, d, lx0, lx0 + lw, py - 44 if up else py + 12, txt, 28, col, bold=True, align="c")
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
		_text(ctx, d, PAD, WIDTH - PAD, y, AI_NOTES.get(ctx.lang, AI_NOTE), 26, t["warn"], bold=True)
		y += 42
	_text(ctx, d, PAD, WIDTH - PAD, y, f"URY · {today}", 26, t["muted"])
	return y + 56


def _wrap(ctx, d, text, size, max_w, max_lines, bold=False):
	"""Greedy word wrap to at most max_lines; overflow is shown with an ellipsis, never dropped silently."""
	text = " ".join(str(text).split())
	if not text:
		return []
	font = _font(_script(text), size, bold)
	lines, cur = [], ""
	for w in text.split(" "):
		trial = (cur + " " + w).strip()
		if ctx.width(d, trial, font) <= max_w:
			cur = trial
			continue
		if cur:
			lines.append(cur)
		cur = w
		while ctx.width(d, cur, font) > max_w and len(cur) > 1:  # unbroken long token: split by chars
			cut = len(cur) - 1
			while cut > 1 and ctx.width(d, cur[:cut], font) > max_w:
				cut -= 1
			lines.append(cur[:cut])
			cur = cur[cut:]
	lines.append(cur)
	if len(lines) > max_lines:
		lines = lines[:max_lines]
		lines[-1] = lines[-1] + " " + "…"  # _text ellipsises the final line to fit
	return lines


def _para(ctx, d, y, text, size, fill, max_lines, bold=False, line_h=None):
	line_h = line_h or int(size * 1.35)
	for ln in _wrap(ctx, d, text, size, WIDTH - 2 * PAD, max_lines, bold):
		_text(ctx, d, PAD, WIDTH - PAD, y, ln, size, fill, bold=bold)
		y += line_h
	return y


def _paint_card(ctx, d, card, today):
	ctx.title = card["title"]
	y = _header(ctx, d, card, PAD)
	y = BODIES[card["type"]](ctx, d, card, y)
	return _footer(ctx, d, card, y + 8, today)


def _image(ctx, paint):
	height = paint(ImageDraw.Draw(Image.new("RGB", (WIDTH, 10))))  # measure pass
	img = Image.new("RGB", (WIDTH, height), ctx.t["bg"])
	paint(ImageDraw.Draw(img))
	return img


def render_panel(card, lang="en", theme="light", today=None):
	"""Render one validated v1 card to a PIL image (1080px wide)."""
	if not isinstance(card, dict) or card.get("type") not in BODIES:
		raise ValueError("unsupported card")
	ctx = _Ctx(lang, theme)
	today = today or datetime.date.today().isoformat()
	return _image(ctx, lambda d: _paint_card(ctx, d, card, today))


MAX_HEIGHT = 4000


def _paint_dashboard(ctx, d, dash, today):
	t = ctx.t
	y = PAD
	y = _para(ctx, d, y, dash["title"], 48, t["fg"], 2, bold=True, line_h=60) + 4
	if dash.get("subtitle"):
		y = _para(ctx, d, y, dash["subtitle"], 30, t["muted"], 2) + 2
	if dash.get("subtext"):
		y = _para(ctx, d, y, dash["subtext"], 24, t["muted"], 2) + 2
	y += 16
	for p in dash["panels"]:
		card = p["card"]
		d.line((PAD, y, WIDTH - PAD, y), fill=t["line"], width=2)
		y += 28
		ctx.title = p.get("title") or card["title"]
		y = _para(ctx, d, y, ctx.title, 38, t["fg"], 2, bold=True, line_h=48)
		sub = p.get("subtitle") or card.get("subtitle")
		if sub and sub.strip().lower() != ctx.title.strip().lower():
			y = _para(ctx, d, y, sub, 26, t["muted"], 2, line_h=36)
		y += 14
		y = BODIES[card["type"]](ctx, d, card, y)
		if p.get("caption"):
			y = _para(ctx, d, y, p["caption"], 28, t["fg"], 3, line_h=38)
		if p.get("composed"):
			y += 4
			_text(ctx, d, PAD, WIDTH - PAD, y, AI_NOTES.get(ctx.lang, AI_NOTE), 24, t["warn"], bold=True)
			y += 38
		y += 20
	d.line((PAD, y, WIDTH - PAD, y), fill=t["line"], width=2)
	y += 20
	if dash.get("footnote"):
		y = _para(ctx, d, y, dash["footnote"], 24, t["muted"], 3, line_h=34) + 6
	_text(ctx, d, PAD, WIDTH - PAD, y, f"URY \u00b7 {today}", 26, t["muted"])
	return y + 56


def _render_dashboard(dash, lang, theme, today):
	panels = dash.get("panels")
	if not isinstance(panels, list) or not panels:
		raise ValueError("dashboard has no panels")
	for p in panels:
		if not isinstance(p, dict) or not isinstance(p.get("card"), dict) or p["card"].get("type") not in BODIES:
			raise ValueError("unsupported panel card")
	ctx = _Ctx(lang, theme)
	height = _paint_dashboard(ctx, ImageDraw.Draw(Image.new("RGB", (WIDTH, 10))), dash, today)
	if height > MAX_HEIGHT:
		raise ValueError("dashboard renders %dpx tall; the maximum is %dpx" % (height, MAX_HEIGHT))
	return _image(ctx, lambda d: _paint_dashboard(ctx, d, dash, today))


def render(card, lang="en", theme="light", today=None):
	"""Render one validated card (v1 or v2 dashboard) to PNG bytes (1080px wide)."""
	today = today or datetime.date.today().isoformat()
	if isinstance(card, dict) and card.get("type") == "dashboard":
		img = _render_dashboard(card, lang, theme, today)
	else:
		img = render_panel(card, lang, theme, today)
	buf = io.BytesIO()
	img.save(buf, format="PNG", optimize=True)
	return buf.getvalue()
