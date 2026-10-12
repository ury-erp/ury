#!/usr/bin/env python3
"""
Audit URY frontend locale files.

For each app it reports:
  * keys used in source via t('...') but missing from the base locale
  * keys present in the base locale but never used (dead strings)
  * per-language coverage against the base locale
  * interpolation-placeholder mismatches between a translation and its base
    string (a dropped {{amount}} silently shows the wrong total)

Usage:
    python scripts/i18n_audit.py [app ...]      # default: all apps with i18n
    python scripts/i18n_audit.py --strict       # exit 1 on missing/mismatch
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APPS = ["pos", "frontend", "self-order", "urypos", "mosaic"]
BASE_LANG = "en"

# t('a.b.c') / t("a.b.c") — only literal keys can be checked statically.
KEY_RE = re.compile(r"""(?<![\w$])\$?t\(\s*['"]([a-zA-Z0-9_.]+)['"]""")
PLACEHOLDER_RE = re.compile(r"\{\{(\w+)\}\}")

# Intl.PluralRules categories that stand for one exact number, so a language
# may write the number as a word instead of interpolating it.
SELF_COUNTING_PLURALS = {"zero", "one", "two"}

# --- unkeyed-literal detection -------------------------------------------
# Comparing ar.json against en.json only proves the *keyed* strings are
# translated. It says nothing about UI text that was never keyed at all, which
# is the failure this check exists to catch.
#
# JSX/Vue text node, and the attributes that render visible text.
JSX_TEXT_RE = re.compile(r">\s*([A-Z][A-Za-z0-9 ,&'\.\?\!:/-]{2,60}?)\s*<")
DISPLAY_ATTR_RE = re.compile(r'\b(?:placeholder|aria-label|title)="([A-Z][^"{}<>]{2,60})"')

# Not user-visible text, or must stay verbatim:
#   Promise/Record/... -> TypeScript generics caught by the text-node regex
#   brand + product names, ERPNext record names the admin must match in Frappe
IGNORE_LITERALS = {
    "Promise", "Record", "Partial", "Array", "Smart", "Restro", "HUF",
    "Standard Buying", "Standard Selling", "Standard Rate",
    "Wholesale Price List", "Vendor Cost Basis",
}


def find_unkeyed(src_dir):
    """Visible string literals that never went through t()."""
    hits = {}
    for pattern in ("*.tsx", "*.jsx", "*.vue"):
        for path in src_dir.rglob(pattern):
            text = path.read_text()
            # only the template half of a .vue file renders markup
            if path.suffix == ".vue":
                m = re.search(r"<template>(.*)</template>", text, re.S)
                text = m.group(1) if m else ""
            found = set()
            for m in JSX_TEXT_RE.finditer(text):
                lit = m.group(1).strip()
                if lit in IGNORE_LITERALS or not re.search(r"[a-z]", lit):
                    continue
                found.add(lit)
            for m in DISPLAY_ATTR_RE.finditer(text):
                lit = m.group(1).strip()
                if lit in IGNORE_LITERALS:
                    continue
                found.add(lit)
            if found:
                hits[str(path)] = sorted(found)
    return hits


def flatten(obj, prefix=""):
    out = {}
    for key, value in obj.items():
        name = f"{prefix}.{key}" if prefix else key
        if isinstance(value, dict):
            out.update(flatten(value, name))
        else:
            out[name] = value
    return out


def audit_app(app: str) -> int:
    locales_dir = ROOT / app / "src" / "i18n" / "locales"
    src_dir = ROOT / app / "src"
    base_file = locales_dir / f"{BASE_LANG}.json"
    if not base_file.exists():
        print(f"  (no locales — skipped)")
        return 0

    base = flatten(json.loads(base_file.read_text()))
    base_keys = {k for k in base if not k.startswith("_meta")}

    used = set()
    for pattern in ("*.ts", "*.tsx", "*.js", "*.jsx", "*.vue"):
        for path in src_dir.rglob(pattern):
            used |= set(KEY_RE.findall(path.read_text()))

    problems = 0

    missing = sorted(used - base_keys)
    if missing:
        problems += len(missing)
        print(f"  MISSING from {BASE_LANG}.json ({len(missing)}):")
        for key in missing:
            print(f"    - {key}")

    # Dynamic keys (`t(\`reports.items.${id}\`)`) can't be seen statically, so
    # unused keys are reported but never fail the build.
    unused = sorted(base_keys - used)
    if unused:
        print(f"  possibly unused ({len(unused)}) — check for dynamic keys before deleting")

    unkeyed = find_unkeyed(src_dir)
    if unkeyed:
        count = sum(len(v) for v in unkeyed.values())
        problems += count
        print(f"  UNKEYED literals ({count}) — visible text that never reaches t():")
        for path, literals in sorted(unkeyed.items()):
            print(f"    {path}")
            for lit in literals:
                print(f"      {lit!r}")

    for locale_file in sorted(locales_dir.glob("*.json")):
        lang = locale_file.stem
        if lang == BASE_LANG:
            continue
        data = flatten(json.loads(locale_file.read_text()))
        keys = {k for k in data if not k.startswith("_meta")}
        covered = len(base_keys & keys)
        pct = 100.0 * covered / len(base_keys) if base_keys else 100.0
        gap = sorted(base_keys - keys)
        print(f"  {lang}: {covered}/{len(base_keys)} ({pct:.1f}%)")
        if gap:
            problems += len(gap)
            for key in gap[:10]:
                print(f"    untranslated: {key}")
            if len(gap) > 10:
                print(f"    ... and {len(gap) - 10} more")

        for key in sorted(base_keys & keys):
            want = set(PLACEHOLDER_RE.findall(str(base[key])))
            got = set(PLACEHOLDER_RE.findall(str(data[key])))
            # A plural form that names its own number needs no placeholder:
            # Arabic "صنفان" *is* two, and English "1 item" spells the one out.
            # Only the open-ended categories must carry the count through.
            if key.rsplit(".", 1)[-1] in SELF_COUNTING_PLURALS and got < want:
                continue
            if want != got:
                problems += 1
                print(f"    PLACEHOLDER MISMATCH {key}: {sorted(want)} -> {sorted(got)}")

    return problems


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    strict = "--strict" in sys.argv
    total = 0
    for app in args or APPS:
        print(f"\n=== {app} ===")
        total += audit_app(app)
    print(f"\n{total} problem(s)")
    return 1 if (strict and total) else 0


if __name__ == "__main__":
    raise SystemExit(main())
