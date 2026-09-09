# Copyright (c) 2023, Tridz Technologies Pvt. Ltd. and Contributors
# See license.txt

"""Tests for the disposables-cost addition to cogs_sold()/before_submit().

This module cannot spin up a full bench/DB fixture set here, so it follows
this codebase's own established test convention for this class of logic
(see ury/ury/doctype/ury_order/test_ury_order.py): mock frappe.db.sql /
frappe.db.get_all / frappe.get_doc rather than create real records, and
assert against both the computed values AND the literal SQL text passed to
frappe.db.sql — the latter is what lets these tests catch a broken query
predicate (the exact class of bug an Opus review caught in grillax's own
reference implementation before this port copied it) without a live DB to
execute the query against.
"""

import unittest
from unittest.mock import patch, MagicMock

from ury.ury.doctype.ury_daily_p_and_l.ury_daily_p_and_l import URYDailyPandL


def _make_doc(branch="Test Branch", date="2026-01-01"):
	"""A minimal stand-in for a URYDailyPandL Document instance.

	Avoids frappe.new_doc()/DB access entirely: cogs_sold() only reads
	self.branch/self.date/self.materials_consumed and calls self.append(...)
	for the child tables under test, so a plain object with those attributes
	plus a real .append() (collecting into a dict of lists, mirroring
	Document.append's observable behavior for our purposes) is sufficient
	and keeps these tests independent of a bench.
	"""
	doc = URYDailyPandL.__new__(URYDailyPandL)
	doc.branch = branch
	doc.date = date
	doc.materials_consumed = []
	doc._appended = {}

	def _append(table_field, row):
		doc._appended.setdefault(table_field, []).append(row)
		return row

	doc.append = _append
	return doc


class TestCogsSoldDisposables(unittest.TestCase):
	"""cogs_sold(): disposables costing and the double-count/boundary fixes."""

	def _run(self, sql_rows_by_call, item_price_by_call, electricity_ok=True):
		"""Run cogs_sold() with frappe.db.sql/get_all/get_doc mocked.

		sql_rows_by_call: list of return values, one per frappe.db.sql call,
		in call order (non_pb_item_sales, bom_item_sales, pb_item_sales,
		disposable_items) — matches cogs_sold()'s own call order.
		item_price_by_call: callable(filters) -> list, used for every
		frappe.db.get_all("Item Price", ...) lookup.
		"""
		doc = _make_doc()
		doc.electricity_closing = 10 if electricity_ok else 0
		doc.electricity_opening = 0

		report_settings = MagicMock()
		report_settings.buying_price_list = "Test Buying Price List"
		report_settings.direct_fixed_expenses = []

		sql_calls = []

		def fake_sql(query, params=None, **kwargs):
			sql_calls.append(query)
			idx = len(sql_calls) - 1
			return sql_rows_by_call[idx] if idx < len(sql_rows_by_call) else []

		def fake_get_all(doctype, fields=None, filters=None, **kwargs):
			if doctype == "Item Price":
				return item_price_by_call(filters)
			return []

		with patch("ury.ury.doctype.ury_daily_p_and_l.ury_daily_p_and_l.frappe.get_doc", return_value=report_settings), \
			patch("ury.ury.doctype.ury_daily_p_and_l.ury_daily_p_and_l.frappe.db.sql", side_effect=fake_sql), \
			patch("ury.ury.doctype.ury_daily_p_and_l.ury_daily_p_and_l.frappe.db.get_all", side_effect=fake_get_all):
			doc.cogs_sold()

		return doc, sql_calls

	def test_zero_disposables_regression_baseline(self):
		"""No disposable rows at all: cogs/remarks behave exactly as before
		this change — the new disposables machinery must be a no-op for
		branches that don't use it."""
		doc, _ = self._run(
			sql_rows_by_call=[[], [], [], []],  # non_pb, bom, pb, disposable — all empty
			item_price_by_call=lambda filters: [],
		)
		self.assertEqual(doc.cogs, 0)
		self.assertEqual(doc.disposables_cost, 0)
		self.assertEqual(doc._appended.get("disposables", []), [])
		self.assertEqual(doc.remarks, "")

	def test_disposables_costed_separately_from_cogs(self):
		"""A disposable item with a set buying price lands in `disposables`,
		contributes to disposables_cost, and is NOT double-counted into cogs
		via non_pb_item_sales — this is the exact bug confirmed present in
		grillax's own reference implementation before this port."""
		non_pb_rows = []  # empty: the is_disposable=0 filter must keep the
		                  # disposable item OUT of this bucket even though a
		                  # naive query without that filter would have found it
		disposable_rows = [
			{"Item Group": "Packaging", "Item Code": "BOX-01", "Item Name": "Takeaway Box", "Qty": 3.5}
		]

		def item_price(filters):
			if filters.get("item_code") == "BOX-01":
				return [MagicMock(price_list_rate=2.0)]
			return []

		doc, _ = self._run(
			sql_rows_by_call=[non_pb_rows, [], [], disposable_rows],
			item_price_by_call=item_price,
		)
		self.assertEqual(doc.cogs, 0, "disposable cost must not leak into cogs")
		self.assertAlmostEqual(doc.disposables_cost, 7.0)  # 3.5 * 2.0
		self.assertEqual(len(doc._appended.get("disposables", [])), 1)
		row = doc._appended["disposables"][0]
		self.assertEqual(row["item_code"], "BOX-01")
		self.assertAlmostEqual(row["qty"], 3.5)
		self.assertAlmostEqual(row["amount"], 7.0)

	def test_fractional_disposable_qty_not_truncated(self):
		"""Grillax's reference implementation copied `int(item['Qty'])` from
		the menu-item costing loop into its disposables loop, which truncates
		fractional per-portion packaging ratios (a real pattern, per
		apply_disposable_items multiplying two floats). This port must use
		float(), not int() — a day's total of 3.5 must stay 3.5, not become 3."""
		disposable_rows = [
			{"Item Group": "Packaging", "Item Code": "BOX-01", "Item Name": "Takeaway Box", "Qty": 0.5}
		]

		def item_price(filters):
			return [MagicMock(price_list_rate=4.0)]

		doc, _ = self._run(
			sql_rows_by_call=[[], [], [], disposable_rows],
			item_price_by_call=item_price,
		)
		# int(0.5) == 0 would silently zero this out; float(0.5) must not.
		self.assertAlmostEqual(doc.disposables_cost, 2.0)  # 0.5 * 4.0
		self.assertAlmostEqual(doc._appended["disposables"][0]["qty"], 0.5)

	def test_unset_disposable_item_price_gets_its_own_remark_bucket(self):
		"""A disposable item missing a buying-list Item Price must be
		flagged under its own "DISPOSABLE ITEMS" remarks bucket, not
		silently dropped (the pre-fix behavior) and not merged into the
		generic "ITEMS" bucket used for sellable menu items."""
		disposable_rows = [
			{"Item Group": "Packaging", "Item Code": "NAPKIN-01", "Item Name": "Napkin", "Qty": 10}
		]
		doc, _ = self._run(
			sql_rows_by_call=[[], [], [], disposable_rows],
			item_price_by_call=lambda filters: [],  # no Item Price configured
		)
		self.assertEqual(doc.disposables_cost, 0)
		self.assertEqual(doc._appended.get("disposables", []), [])
		self.assertIn("DISPOSABLE ITEMS", doc.remarks)
		self.assertIn("Napkin", doc.remarks)

	def test_all_four_queries_filter_by_is_disposable(self):
		"""Regression guard for the double-count bug found in grillax's own
		reference (non_pb_item_sales/bom_item_sales had no is_disposable
		filter at all). Every one of the three "sold item" queries must
		exclude disposables, and the disposables query must select only
		disposables — verified against the literal SQL text since these
		tests don't execute against a real DB."""
		doc, sql_calls = self._run(
			sql_rows_by_call=[[], [], [], []],
			item_price_by_call=lambda filters: [],
		)
		self.assertEqual(len(sql_calls), 4, "expected exactly 4 frappe.db.sql calls in cogs_sold()")
		non_pb_sql, bom_sql, pb_sql, disposable_sql = sql_calls

		self.assertIn("b.is_disposable = 0", non_pb_sql)
		self.assertIn("b.is_disposable = 0", bom_sql)
		self.assertIn("b.is_disposable = 0", pb_sql)
		self.assertIn("b.is_disposable = 1", disposable_sql)

	def test_disposables_query_uses_correct_day_boundary_predicate(self):
		"""Grillax's own disposables query predicate is missing the
		`OR rs.hours = 0` arm present on every one of ury's sibling queries
		in this file — since URY Report Settings.hours defaults to 0 for any
		branch not using extended hours, that defect makes the query return
		zero rows for most branches, permanently. This port must copy ury's
		own correct predicate, not grillax's broken one."""
		_, sql_calls = self._run(
			sql_rows_by_call=[[], [], [], []],
			item_price_by_call=lambda filters: [],
		)
		disposable_sql = sql_calls[3]
		self.assertIn(
			"rs.`hours` IS NULL OR rs.`hours` = 0",
			disposable_sql,
			"disposables query must match the sibling queries' day-boundary "
			"predicate (with the OR hours=0 arm), not grillax's defective "
			"version that omits it",
		)


class TestRemarksParserDisposableBucket(unittest.TestCase):
	"""financial.py's remarks parser must recognize the new fourth bucket."""

	def test_parse_missing_price_remarks_handles_disposable_items_bucket(self):
		from ury.ury.report_api.financial import _parse_missing_price_remarks

		remarks = (
			"BUYING PRICE NOT SET<br><br>"
			"ITEMS:-<br>['Some Item']<br><br>"
			"DISPOSABLE ITEMS:-<br>['Napkin']<br><br>"
			"Update the item prices and then submit the document again to "
			"ensure accurate Cost of Goods"
		)
		sections = _parse_missing_price_remarks(remarks)
		labels = {s["label"] for s in sections} if sections else set()
		# _parse_missing_price_remarks() title-cases labels ("DISPOSABLE
		# ITEMS" -> "Disposable Items") -- assert against its actual output
		# shape, not the raw remarks-string casing.
		self.assertIn("Disposable Items", labels)
		disposable_section = next(s for s in sections if s["label"] == "Disposable Items")
		self.assertEqual(disposable_section["items"], ["Napkin"])


if __name__ == "__main__":
	unittest.main()
