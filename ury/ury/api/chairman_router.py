# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt
"""Deterministic fast-path router for Chairman chat (EN / HI / AR / ML).

match() maps a short, plain data question onto one of 9 intents (each backed by an existing
chairman_tools function). It returns None whenever it is not sure: no keyword, two intents,
a why / compare / advice / follow-up question, a period clash, or a long text. None means
"hand the question to the LLM", so accuracy never gets worse than the LLM-only path.

answer() calls the tool through a seam (_call_tool) so tests are pure, and composes a short
plain-text reply plus the raw tool result. Cards are added later (cards = []).

Everything here is pure except _call_tool, which imports chairman_tools lazily.
"""

import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date, timedelta

try:  # package import (bench) and plain import (python3 -m unittest from the api dir)
	from ury.ury.api import chairman_router_keywords as kw
except Exception:  # pragma: no cover
	import chairman_router_keywords as kw  # type: ignore

MAX_WORDS = 12
DEFAULT_DAYS = 7
MAX_DAYS = 90


@dataclass(frozen=True)
class Intent:
	name: str
	tool: str
	args: dict = field(default_factory=dict)
	confidence: float = 0.9
	period: str = "default"  # period label, or "default"
	period_n: int = 0  # N for last_n days


# intent -> (tool, kind). kind: "day" (date=), "range" (start_date/end_date), "dayopt" (date= or none)
INTENTS = {
	"sales_day": ("get_day_summary", "day"),
	"mtd_vs_target": ("get_month_to_date", "day"),
	"top_dishes": ("get_top_bottom_dishes", "range"),
	"cancellations": ("get_cancellations", "range"),
	"kitchen_speed": ("get_kitchen_speed", "range"),
	"payment_mix": ("get_order_type_and_payment_mix", "range"),
	"branch_ranking": ("get_branch_ranking", "day"),
	"cashup": ("get_cashup_week", "day"),
	"leakage": ("get_leakage_week", "day"),
}
# sales_day is a weak signal ("top dishes by sales"): any other intent beats it.
WEAK = {"sales_day"}

# ---------------------------------------------------------------- normalize

_ARABIC_MARKS = re.compile("[ؐ-ًؚ-ٰٟۖ-ۭـ]")
_ARABIC_MAP = str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ة": "ه", "ى": "ي", "ؤ": "و", "ئ": "ي"})
_JOINERS = re.compile("[​‌‍⁠﻿]")
_POSSESSIVE = re.compile(r"['’`ʼ]s\b")


def normalize(text):
	"""Casefold, NFKC, strip joiners / Arabic diacritics, non-Latin digits -> ASCII, drop
	punctuation (hyphen -> space, "yesterday's" -> "yesterday"), collapse spaces."""
	s = unicodedata.normalize("NFKC", str(text or "")).casefold()
	s = _JOINERS.sub("", s)
	s = _ARABIC_MARKS.sub("", s).translate(_ARABIC_MAP)
	s = _POSSESSIVE.sub("", s)
	s = re.sub(r"['’`ʼ]", "", s)
	out = []
	for ch in s:
		cat = unicodedata.category(ch)
		if cat == "Nd":
			out.append(str(unicodedata.digit(ch, 0)))
		elif cat[0] in "LM":
			out.append(ch)
		else:
			out.append(" ")
	return " ".join("".join(out).split())


def detect_language(text):
	"""'hi' (Devanagari), 'ar' (Arabic), 'ml' (Malayalam), else 'en' (incl. Hinglish)."""
	counts = {"hi": 0, "ar": 0, "ml": 0}
	for ch in str(text or ""):
		o = ord(ch)
		if 0x0900 <= o <= 0x097F:
			counts["hi"] += 1
		elif 0x0600 <= o <= 0x06FF:
			counts["ar"] += 1
		elif 0x0D00 <= o <= 0x0D7F:
			counts["ml"] += 1
	best = max(counts, key=counts.get)
	return best if counts[best] else "en"


# ---------------------------------------------------------------- keyword matching


def _compile(entries):
	"""-> list of (mode, normalized) with mode 'phrase' | 'prefix' | 'token' | 'sub'."""
	out = []
	for e in entries:
		token_only = e.startswith("=")
		e = e[1:] if token_only else e
		prefix = e.endswith("*")
		n = normalize(e.rstrip("*"))
		if not n:
			continue
		latin = n.isascii()
		if token_only:
			out.append(("token", n))
		elif latin:
			out.append(("prefix" if prefix else "phrase", n))
		else:
			out.append(("sub", n))
	return out


def _compile_langs(by_lang):
	merged = []
	for entries in by_lang.values():
		merged.extend(_compile(entries))
	return sorted(set(merged))


_INTENT_TABLE = {k: _compile_langs(v) for k, v in kw.INTENT_KEYWORDS.items()}
_FALL_TABLE = {k: _compile_langs(v) for k, v in kw.FALLTHROUGH_KEYWORDS.items()}
_PERIOD_TABLE = {k: _compile_langs(v) for k, v in kw.PERIOD_KEYWORDS.items()}
_LAST_N = [re.compile(p) for p in kw.LAST_N_DAYS_PATTERNS]
_WORD_NUMS = {"seven": 7}


def _hit(padded, table):
	for mode, n in table:
		if mode == "sub":
			if n in padded:
				return True
		elif mode == "prefix":
			if f" {n}" in padded:
				return True
		else:  # phrase / token: whole-word match
			if f" {n} " in padded:
				return True
	return False


# ---------------------------------------------------------------- periods


def _mon(d):
	return d - timedelta(days=d.weekday())


def _periods(norm):
	"""-> list of (label, n) found in normalized text (de-duplicated)."""
	padded = f" {norm} "
	found = []
	consumed = norm
	for pat in _LAST_N:
		m = pat.search(consumed)
		if m:
			g = m.group(1)
			n = _WORD_NUMS.get(g) or int(g)
			found.append(("last_n", n))
			consumed = consumed.replace(m.group(0), " ")
			break
	padded = f" {consumed} "
	for label, table in _PERIOD_TABLE.items():
		if _hit(padded, table):
			found.append((label, 0))
	return found


def _span(label, n, today):
	if label == "today":
		return today, today
	if label == "yesterday":
		y = today - timedelta(days=1)
		return y, y
	if label == "this_week":
		return _mon(today), today
	if label == "last_week":
		s = _mon(today) - timedelta(days=7)
		return s, s + timedelta(days=6)
	if label == "last_n":
		n = max(1, min(int(n), MAX_DAYS))
		return today - timedelta(days=n), today - timedelta(days=1)
	if label == "month_to_date":
		first = today.replace(day=1)
		end = today - timedelta(days=1)
		return first, (end if end >= first else today)
	if label == "last_month":
		end = today.replace(day=1) - timedelta(days=1)
		return end.replace(day=1), end
	raise ValueError(label)


def resolve_period(text, today):
	"""-> (start, end, label) for the one period phrase in the text, else None (none or
	conflicting). today is a datetime.date (injected so tests can freeze it)."""
	found = _periods(normalize(text))
	if len(set(found)) != 1:
		return None
	label, n = found[0]
	s, e = _span(label, n, today)
	return s, e, label


# ---------------------------------------------------------------- match


def _top_n(norm):
	m = re.search(r"\btop (\d{1,2})\b", norm)
	return max(1, min(int(m.group(1)), 20)) if m else None


def match(text, today):
	"""Return an Intent, or None to fall through to the LLM."""
	norm = normalize(text)
	if not norm or len(norm.split()) > MAX_WORDS:
		return None
	padded = f" {norm} "
	for table in _FALL_TABLE.values():
		if _hit(padded, table):
			return None
	hits = [name for name, table in _INTENT_TABLE.items() if _hit(padded, table)]
	if not hits:
		return None
	periods = _periods(norm)
	if len(set(periods)) > 1:
		return None
	period = periods[0] if periods else None

	strong = [h for h in hits if h not in WEAK]
	if len(strong) > 1:
		return None
	if strong:
		name = strong[0]
	else:
		name = "sales_day"
		if period and period[0] == "month_to_date":
			name = "mtd_vs_target"
	if name == "mtd_vs_target" and period and period[0] != "month_to_date":
		return None  # e.g. "target last week": no matching tool shape

	tool, kind = INTENTS[name]
	label, n = period if period else ("default", 0)
	args = {}
	if period:
		s, e = _span(label, n, today)
		multi = s != e
		if name == "sales_day":
			if label == "month_to_date":
				tool, args = "get_month_to_date", {"date": e.isoformat()}
				name = "mtd_vs_target"
			elif multi:
				tool, args = "get_sales_range", {"start_date": s.isoformat(), "end_date": e.isoformat()}
			else:
				args = {"date": s.isoformat()}
		elif name == "mtd_vs_target":
			args = {"date": e.isoformat()}
		elif kind == "range":
			args = {"start_date": s.isoformat(), "end_date": e.isoformat()}
		elif name == "branch_ranking":
			if multi:
				return None  # day-only tool
			args = {"date": s.isoformat()}
		else:  # cashup / leakage: 7 days ending on the date
			args = {"date": e.isoformat()}
	elif kind == "range":
		s, e = _span("last_n", DEFAULT_DAYS, today)
		args = {"start_date": s.isoformat(), "end_date": e.isoformat()}
		label, n = "last_n", DEFAULT_DAYS
	if name == "top_dishes":
		top = _top_n(norm)
		if top:
			args["limit"] = top
	return Intent(name, tool, args, 0.9 if period else 0.8, label, n)


# ---------------------------------------------------------------- answer

PERIOD_LABELS = {
	"en": {"default": "yesterday", "yesterday": "yesterday", "today": "today", "this_week": "this week", "last_week": "last week", "month_to_date": "this month so far", "last_month": "last month", "last_n": "the last {n} days"},
	"hi": {"default": "कल", "yesterday": "कल", "today": "आज", "this_week": "इस हफ्ते", "last_week": "पिछले हफ्ते", "month_to_date": "इस महीने अब तक", "last_month": "पिछले महीने", "last_n": "पिछले {n} दिन"},
	"ar": {"default": "أمس", "yesterday": "أمس", "today": "اليوم", "this_week": "هذا الأسبوع", "last_week": "الأسبوع الماضي", "month_to_date": "هذا الشهر حتى الآن", "last_month": "الشهر الماضي", "last_n": "آخر {n} أيام"},
	"ml": {"default": "ഇന്നലെ", "yesterday": "ഇന്നലെ", "today": "ഇന്ന്", "this_week": "ഈ ആഴ്ച", "last_week": "കഴിഞ്ഞ ആഴ്ച", "month_to_date": "ഈ മാസം ഇതുവരെ", "last_month": "കഴിഞ്ഞ മാസം", "last_n": "കഴിഞ്ഞ {n} ദിവസം"},
}

_TITLES = {
	"sales_day": ("Sales", "बिक्री", "المبيعات", "വിൽപന"),
	"mtd_vs_target": ("Month to date", "महीने की बिक्री", "منذ بداية الشهر", "മാസം ഇതുവരെ"),
	"top_dishes": ("Top dishes", "टॉप डिश", "أفضل الأطباق", "ടോപ് ഡിഷുകൾ"),
	"cancellations": ("Cancellations", "कैंसल", "الإلغاءات", "റദ്ദാക്കലുകൾ"),
	"kitchen_speed": ("Kitchen speed", "किचन स्पीड", "سرعة المطبخ", "അടുക്കള വേഗത"),
	"payment_mix": ("Payments", "भुगतान", "المدفوعات", "പേയ്മെന്റ്"),
	"branch_ranking": ("Branches", "ब्रांच", "الفروع", "ബ്രാഞ്ചുകൾ"),
	"cashup": ("Cash-up", "कैश अप", "إغلاق الصندوق", "ക്യാഷ് അപ്പ്"),
	"leakage": ("Leakage", "लीकेज", "التسرب", "ലീക്കേജ്"),
}
_LANGS = ("en", "hi", "ar", "ml")

# TEMPLATES[(intent, lang)] -> f-string style; {title} {period} {facts}
TEMPLATES = {(i, lang): "{title} ({period}): {facts}" for i in INTENTS for lang in _LANGS}
NO_DATA = {
	"en": "No figures found for this period.",
	"hi": "इस अवधि के लिए कोई आंकड़े नहीं मिले।",
	"ar": "لا توجد أرقام لهذه الفترة.",
	"ml": "ഈ കാലയളവിലെ കണക്കുകൾ ലഭ്യമല്ല.",
}


def _txt(x):
	if isinstance(x, dict):
		return str(x.get("text") or x.get("value") or "")
	return "" if x is None else str(x)


def _names(items, key, val=None, n=3):
	parts = []
	for it in (items or [])[:n]:
		if not isinstance(it, dict):
			continue
		label = _txt(it.get(key))
		v = _txt(it.get(val)) if val else ""
		if label:
			parts.append(f"{label} {v}".strip())
	return ", ".join(parts)


def _facts(intent, r):
	"""Short language-neutral fact string from the tool result (numbers and names only)."""
	name = intent.name
	head = _txt(r.get("headline"))
	if name == "sales_day" and "net_sales" in r:  # get_sales_range
		bits = [_txt(r.get("net_sales")), f"{r['orders']} orders" if r.get("orders") is not None else ""]
		return ", ".join(b for b in bits if b)
	if name in ("sales_day", "mtd_vs_target"):
		bits = [_txt(r.get("value")), f"{r['delta_pct']:+.1f}%" if isinstance(r.get("delta_pct"), (int, float)) else ""]
		out = ", ".join(b for b in bits if b)
		return out or head
	if name == "top_dishes":
		return _names(r.get("top"), "dish", "net_sales")
	if name == "cancellations":
		bits = [str(r["count"]) if r.get("count") is not None else "", _txt(r.get("value"))]
		return " / ".join(b for b in bits if b)
	if name == "payment_mix":
		pay = (r.get("payments") or {}).get("series")
		return _names(pay, "label", "value")
	if name == "branch_ranking":
		items = [{"branch": b.get("branch"), "day": b.get("day")} for b in (r.get("branches") or []) if isinstance(b, dict)]
		return _names(items, "branch", "day")
	return head


def _call_tool(tool, kwargs):
	"""Seam: the only DB-touching call. Imports chairman_tools lazily; the tool is the
	guarded, whitelisted function (role check, permissions, sanitising)."""
	from ury.ury.api import chairman_tools

	return chairman_tools.TOOLS_BY_NAME[tool]["func"](**kwargs)


def answer(intent, language="en", caller=None):
	"""-> {"reply", "cards": [], "data", "intent", "tool", "fast_path": True}, or None when the
	tool fails or returns nothing useful (caller then falls through to the LLM)."""
	lang = language if language in _LANGS else "en"
	call = caller or _call_tool
	try:
		result = call(intent.tool, dict(intent.args))
	except Exception:
		return None
	if not isinstance(result, dict) or result.get("status") == "unavailable":
		return None
	facts = _facts(intent, result) or NO_DATA[lang]
	period = PERIOD_LABELS[lang].get(intent.period, PERIOD_LABELS[lang]["default"]).format(n=intent.period_n)
	title = _TITLES[intent.name][_LANGS.index(lang)]
	reply = TEMPLATES[(intent.name, lang)].format(title=title, period=period, facts=facts)
	return {"reply": reply, "cards": [], "data": result, "intent": intent.name, "tool": intent.tool, "fast_path": True}
