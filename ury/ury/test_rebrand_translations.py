"""Every URY doctype and role is shown under its Smart Restro name.

The stored names keep the URY prefix (they are table names and link values in
every site's data); users see them through translations/en.csv and ar.csv.
A new "URY ..." doctype without a row in both files would surface the old name.
"""

import csv
import json
from pathlib import Path

from frappe.tests.utils import FrappeTestCase

APP = Path(__file__).resolve().parents[1]
ROLES = ("URY Manager", "URY Cashier", "URY Captain", "URY Admin", "URY Waiter")


def _translations(lang):
	with open(APP / "translations" / f"{lang}.csv", encoding="utf-8") as f:
		return {row[0]: row[1] for row in csv.reader(f) if row}


def _ury_doctypes():
	for path in (APP / "ury" / "doctype").glob("ury_*/ury_*.json"):
		if path.stem == path.parent.name:
			yield json.loads(path.read_text(encoding="utf-8"))["name"]


class TestRebrandTranslations(FrappeTestCase):
	def test_every_ury_name_is_translated(self):
		names = {*_ury_doctypes(), *ROLES, "URY"}
		self.assertGreater(len(names), 50)
		for lang in ("en", "ar"):
			table = _translations(lang)
			with self.subTest(lang=lang):
				self.assertEqual(sorted(n for n in names if n not in table), [])

	def test_no_display_name_mentions_ury(self):
		for lang in ("en", "ar"):
			for source, shown in _translations(lang).items():
				if source.startswith("URY"):
					self.assertNotIn("URY", shown.upper(), f"{lang}: {source}")
