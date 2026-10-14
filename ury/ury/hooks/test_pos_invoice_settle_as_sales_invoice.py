"""Unit tests for POS Invoice → Sales Invoice settlement (ERPNext SI naming)."""

import sys
import types
import unittest
from unittest.mock import MagicMock, patch


def _ensure_frappe_stub():
	if "frappe" in sys.modules:
		return sys.modules["frappe"]
	frappe = types.ModuleType("frappe")
	frappe.db = MagicMock()
	frappe.new_doc = MagicMock()
	frappe.throw = MagicMock(side_effect=Exception)
	frappe.flags = MagicMock()
	frappe.delete_doc = MagicMock()
	frappe.rename_doc = MagicMock()
	frappe.get_doc = MagicMock()
	frappe.utils = types.ModuleType("frappe.utils")
	frappe.utils.cint = lambda v: int(v or 0)
	frappe.utils.flt = lambda v: float(v or 0)
	frappe.utils.nowdate = lambda: "2026-10-14"
	frappe.utils.nowtime = lambda: "12:00:00"
	sys.modules["frappe"] = frappe
	sys.modules["frappe.utils"] = frappe.utils
	return frappe


_ensure_frappe_stub()

from ury.ury.hooks.pos_invoice_settle_as_sales_invoice import (  # noqa: E402
	_build_sales_invoice_from_pos,
	profile_uses_sales_invoice_on_payment,
)


class _Meta:
	def __init__(self, fields):
		self._fields = set(fields)

	def has_field(self, name):
		return name in self._fields


class _Child:
	def __init__(self, **kwargs):
		self.__dict__.update(kwargs)
		self.meta = _Meta(list(kwargs.keys()) + ["pos_invoice", "pos_invoice_item"])

	def as_dict(self):
		return {k: v for k, v in self.__dict__.items() if k != "meta"}

	def get(self, key, default=None):
		return getattr(self, key, default)

	def set(self, key, value):
		setattr(self, key, value)


class _Doc:
	def __init__(self, doctype="POS Invoice", **kwargs):
		self.doctype = doctype
		self.__dict__.update(kwargs)
		self.meta = _Meta(
			list(kwargs.keys())
			+ [
				"customer",
				"company",
				"pos_profile",
				"posting_date",
				"posting_time",
				"is_pos",
				"update_stock",
				"is_consolidated",
				"restaurant",
				"branch",
				"restaurant_table",
				"order_type",
				"waiter",
				"cashier",
			]
		)
		self._children = {"items": [], "taxes": [], "payments": []}

	def get(self, key, default=None):
		if key in self._children:
			return self._children[key]
		return getattr(self, key, default)

	def set(self, key, value):
		setattr(self, key, value)

	def append(self, field, values=None):
		row = _Child(**(values or {}))
		row.meta = _Meta(
			list((values or {}).keys())
			+ [
				"item_code",
				"qty",
				"rate",
				"amount",
				"pos_invoice",
				"pos_invoice_item",
				"mode_of_payment",
				"account",
				"tax_amount",
				"account_head",
			]
		)
		self._children.setdefault(field, []).append(row)
		return row


class TestProfileFlag(unittest.TestCase):
	@patch("ury.ury.hooks.pos_invoice_settle_as_sales_invoice.frappe")
	def test_flag_off(self, frappe):
		frappe.db.get_value.return_value = 0
		self.assertFalse(profile_uses_sales_invoice_on_payment("P"))

	@patch("ury.ury.hooks.pos_invoice_settle_as_sales_invoice.frappe")
	def test_flag_on(self, frappe):
		frappe.db.get_value.return_value = 1
		self.assertTrue(profile_uses_sales_invoice_on_payment("P"))

	def test_flag_missing_profile(self):
		self.assertFalse(profile_uses_sales_invoice_on_payment(None))


class TestBuildSalesInvoice(unittest.TestCase):
	@patch("ury.ury.hooks.pos_invoice_settle_as_sales_invoice.frappe")
	def test_no_forced_name_keeps_reservation_link(self, frappe):
		frappe.new_doc.side_effect = lambda dt: _Doc(doctype=dt)

		pos = _Doc(
			name="INV-00042",
			customer="Walk-In",
			company="Cowheel",
			pos_profile="POS-1",
			posting_date="2026-10-14",
			posting_time="12:00:00",
			restaurant="R1",
			branch="B1",
			order_type="Dine In",
		)
		pos._children["items"] = [
			_Child(name="row-1", item_code="ITEM", qty=1, rate=10, amount=10)
		]
		pos._children["payments"] = [_Child(mode_of_payment="Cash", amount=10)]

		si = _build_sales_invoice_from_pos(pos, "INV-00042")

		# Name is assigned by ERPNext on insert — builder must not force INV-*.
		self.assertIsNone(getattr(si, "name", None))
		self.assertEqual(si.customer, "Walk-In")
		self.assertEqual(si.is_pos, 1)
		self.assertEqual(si.update_stock, 1)
		self.assertEqual(si.is_consolidated, 1)
		self.assertEqual(si.get("items")[0].pos_invoice, "INV-00042")
		self.assertEqual(len(si.get("payments")), 1)


if __name__ == "__main__":
	unittest.main()
