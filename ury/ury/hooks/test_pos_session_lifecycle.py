# Copyright (c) 2026, Tridz Technologies Pvt. Ltd and Contributors
# See license.txt
"""Regression tests for POS session bugs found in end-to-end testing on v16:

- cancel_order failed on every draft order
- captain-taken orders were left out of the cashier's POS closing
- the POS closing entry consolidated no invoices
- a POS session opened on an earlier day was not reported as needing a close
"""

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.doctype.ury_order import ury_order
from ury.ury.hooks import ury_pos_closing_entry
from ury.ury_pos import api

ORDER = "ury.ury.doctype.ury_order.ury_order"
CLOSING = "ury.ury.hooks.ury_pos_closing_entry"


class TestCancelDraftOrder(FrappeTestCase):
	@patch(f"{ORDER}.frappe.db.sql")
	@patch(f"{ORDER}.frappe.db.set_value")
	@patch(f"{ORDER}.cancel_kot")
	@patch(f"{ORDER}.release_merge_cluster_tables")
	@patch(f"{ORDER}.frappe.has_permission", return_value=True)
	@patch(f"{ORDER}.frappe.get_doc")
	def test_draft_is_cancelled_without_document_cancel(self, get_doc, _perm, release, _kot, set_value, _sql):
		invoice = MagicMock(docstatus=0, restaurant_table="T1", branch="B")
		get_doc.return_value = invoice
		frappe.set_user("Administrator")
		ury_order.cancel_order("INV-1", "test")

		invoice.cancel.assert_not_called()
		release.assert_called_once_with("T1")
		set_value.assert_any_call("POS Invoice", "INV-1", "docstatus", 2)

	@patch(f"{ORDER}.cancel_kot")
	@patch(f"{ORDER}.frappe.has_permission", return_value=True)
	@patch(f"{ORDER}.frappe.get_doc")
	def test_submitted_is_cancelled_once(self, get_doc, _perm, _kot):
		invoice = MagicMock(docstatus=1, restaurant_table=None, branch="B")
		get_doc.return_value = invoice
		frappe.set_user("Administrator")
		ury_order.cancel_order("INV-1", "test")

		invoice.cancel.assert_called_once()


class TestInvoiceOwner(FrappeTestCase):
	def test_owner_becomes_cashier(self):
		invoice = MagicMock(cashier="cashier@x", owner="captain@x")
		ury_order._assign_owner_to_cashier(invoice)
		invoice.db_set.assert_called_once_with("owner", "cashier@x", update_modified=False)

	def test_no_cashier_leaves_owner(self):
		invoice = MagicMock(cashier=None, owner="captain@x")
		ury_order._assign_owner_to_cashier(invoice)
		invoice.db_set.assert_not_called()


class FakeClosing(SimpleNamespace):
	def get(self, key, default=None):
		return getattr(self, key, default)

	def append(self, table, row):
		getattr(self, table).append(row)


def _closing(**kw):
	meta = MagicMock()
	meta.has_field.side_effect = lambda f: f in ("pos_invoices", "sales_invoices")
	return FakeClosing(
		meta=meta, docstatus=1, pos_invoices=[], sales_invoices=[], period_start_date="s",
		period_end_date="e", pos_profile="P", user="cashier@x", grand_total=0, net_total=0, total_quantity=0, **kw
	)


class TestFillClosingInvoices(FrappeTestCase):
	ROWS = [
		frappe._dict(doctype="POS Invoice", name="INV-1", posting_date="d", grand_total=100, net_total=90, total_qty=2, customer="C"),
		frappe._dict(doctype="POS Invoice", name="INV-2", posting_date="d", grand_total=50, net_total=45, total_qty=1, customer="C"),
	]

	@patch(f"{CLOSING}.get_closing_invoice_rows")
	def test_empty_closing_gets_invoices_and_totals(self, rows):
		rows.return_value = self.ROWS
		doc = _closing()
		ury_pos_closing_entry.fill_closing_invoices(doc)

		rows.assert_called_once_with("s", "e", "P", "cashier@x")
		self.assertEqual([r["pos_invoice"] for r in doc.pos_invoices], ["INV-1", "INV-2"])
		self.assertEqual((doc.grand_total, doc.net_total, doc.total_quantity), (150, 135, 3))

	@patch(f"{CLOSING}.get_closing_invoice_rows")
	def test_closing_with_invoices_is_left_alone(self, rows):
		doc = _closing()
		doc.pos_invoices.append({"pos_invoice": "INV-9"})
		ury_pos_closing_entry.fill_closing_invoices(doc)
		rows.assert_not_called()

	@patch(f"{CLOSING}.get_closing_invoice_rows")
	def test_draft_is_left_alone(self, rows):
		doc = _closing()
		doc.docstatus = 0
		ury_pos_closing_entry.fill_closing_invoices(doc)
		rows.assert_not_called()


class TestValidatePosClose(FrappeTestCase):
	@patch("ury.ury_pos.api.frappe.db.get_value", return_value=0)
	@patch("ury.ury_pos.api.frappe.db.exists")
	def test_session_from_earlier_day_fails_without_daily_close(self, exists, _get_value):
		exists.return_value = "POS-OPE-1"
		self.assertEqual(api.validate_pos_close("P"), "Failed")
		filters = exists.call_args[0][1]
		self.assertEqual(filters["period_start_date"][0], "<")

	@patch("ury.ury_pos.api.frappe.db.get_value", return_value=0)
	@patch("ury.ury_pos.api.frappe.db.exists", return_value=None)
	def test_current_session_passes(self, _exists, _get_value):
		self.assertEqual(api.validate_pos_close("P"), "Success")
