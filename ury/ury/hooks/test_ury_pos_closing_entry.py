"""Tests for `populate_pos_transactions` (item-4-cashier-owner-regression).

Mock-based unit tests, matching the established pattern in this package
(`test_ury_pos_closing_reconciliation.py`): the behaviour under test is the
selection/filter control flow, not ERPNext's invoice/closing-entry
machinery.

Pinned here:

  1. An invoice whose owner == doc.user is included.
  2. An invoice whose owner != doc.user (even if some other field, like a
     multi-cashier profile's `cashier`, equals doc.user) is excluded --
     and this must not raise/hard-fail, since core's `get_all` filter now
     enforces owner == doc.user at the query level, so such a row is never
     even returned to iterate over.
  3. An already-consolidated invoice is excluded.
  4. An invoice outside the period window is excluded.
"""

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.hooks.ury_pos_closing_entry import populate_pos_transactions

MODULE = "ury.ury.hooks.ury_pos_closing_entry"


class _FakeClosingEntry(frappe._dict):
	"""frappe._dict plus the `append`/`get` behaviour real Documents give
	child tables, since `populate_pos_transactions` calls `doc.append(...)`
	directly on the closing entry."""

	def append(self, fieldname, value):
		self.setdefault(fieldname, [])
		self[fieldname].append(value)
		return value


def _closing_entry(user="cashier@ury.test", pos_profile="Profile-1"):
	return _FakeClosingEntry(
		{
			"name": "POS-CLO-1",
			"user": user,
			"pos_profile": pos_profile,
			"period_start_date": "2026-09-01 00:00:00",
			"period_end_date": "2026-09-01 23:59:59",
			"pos_transactions": [],
		}
	)


def _invoice(name, owner, posting_date="2026-09-01", posting_time="12:00:00", consolidated_invoice=None):
	return frappe._dict(
		{
			"name": name,
			"owner": owner,
			"posting_date": posting_date,
			"posting_time": posting_time,
			"customer": "Customer-1",
			"grand_total": 100,
			"net_total": 100,
			"total_qty": 1,
			"consolidated_invoice": consolidated_invoice,
		}
	)


class TestPopulatePosTransactions(FrappeTestCase):
	def _run(self, doc, get_all_return):
		with patch(f"{MODULE}.frappe.get_all", return_value=get_all_return) as get_all:
			populate_pos_transactions(doc, "validate")
		return get_all

	# -- 1. owner == doc.user is included --------------------------------

	def test_invoice_with_matching_owner_is_included(self):
		doc = _closing_entry(user="cashier@ury.test")
		get_all = self._run(doc, [_invoice("POSINV-1", owner="cashier@ury.test")])

		# Selection filter itself now guarantees owner == doc.user.
		_, kwargs = get_all.call_args
		self.assertEqual(kwargs["filters"]["owner"], "cashier@ury.test")
		self.assertNotIn("cashier", kwargs["filters"])

		self.assertEqual(len(doc.pos_transactions), 1)
		self.assertEqual(doc.pos_transactions[0]["pos_invoice"], "POSINV-1")

	# -- 2. owner != doc.user is excluded, without raising ---------------

	def test_invoice_with_different_owner_is_excluded_not_raised(self):
		"""Simulates the regression: an invoice whose custom `cashier` field
		equals doc.user but whose real `owner` (creator) does not. Because
		selection is now by `owner` at the frappe.get_all() level, such a
		row is simply never returned -- so the mocked get_all here returns
		no matching invoice, and the function must complete cleanly with an
		empty pos_transactions (no exception, no dropped-row logging)."""
		doc = _closing_entry(user="closer@ury.test")
		self._run(doc, [])  # owner filter excludes the waiter's invoice upstream

		self.assertEqual(doc.pos_transactions, [])

	def test_populate_never_raises_for_mismatched_ownership(self):
		doc = _closing_entry(user="closer@ury.test")
		try:
			self._run(doc, [])
		except Exception as exc:  # pragma: no cover - defensive
			self.fail(f"populate_pos_transactions raised unexpectedly: {exc}")

	# -- 3. already-consolidated invoice is excluded ----------------------

	def test_already_consolidated_invoice_is_excluded(self):
		doc = _closing_entry(user="cashier@ury.test")
		self._run(
			doc,
			[_invoice("POSINV-2", owner="cashier@ury.test", consolidated_invoice="SINV-1")],
		)
		self.assertEqual(doc.pos_transactions, [])

	# -- 4. invoice outside the period window is excluded ------------------

	def test_invoice_outside_period_window_is_excluded(self):
		doc = _closing_entry(user="cashier@ury.test")
		doc.period_start_date = "2026-09-01 00:00:00"
		doc.period_end_date = "2026-09-01 23:59:59"
		self._run(
			doc,
			[
				_invoice(
					"POSINV-3",
					owner="cashier@ury.test",
					posting_date="2026-09-02",
					posting_time="09:00:00",
				)
			],
		)
		self.assertEqual(doc.pos_transactions, [])

	# -- pos_transactions already populated: never overwritten ------------

	def test_existing_pos_transactions_is_not_overwritten(self):
		doc = _closing_entry(user="cashier@ury.test")
		doc.pos_transactions = [{"pos_invoice": "PRESET-1"}]
		with patch(f"{MODULE}.frappe.get_all") as get_all:
			populate_pos_transactions(doc, "validate")
		self.assertEqual(get_all.call_count, 0)
		self.assertEqual(doc.pos_transactions, [{"pos_invoice": "PRESET-1"}])
