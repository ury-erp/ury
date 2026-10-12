"""The dashboard's purchases: list filters, the bill form's checks, payments and cancelling."""

from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, nowdate

from ury.ury.api import purchases

MOD = "ury.ury.api.purchases"


class TestPurchaseList(FrappeTestCase):

	def _call(self, **kwargs):
		with patch(f"{MOD}.frappe.has_permission", return_value=True), \
			 patch(f"{MOD}._branch_company", side_effect=lambda b: "C1" if b and b != "all" else None), \
			 patch(f"{MOD}.frappe.get_list") as get_list:
			get_list.side_effect = [[frappe._dict(count=0, amount=0, outstanding=0)], []]
			result = purchases.get_purchases(**kwargs)
		totals_call, rows_call = get_list.call_args_list
		return result, totals_call.kwargs, rows_call.kwargs

	def test_an_unknown_page_size_falls_back_to_twenty(self):
		result, _, rows = self._call(page_size=999)
		self.assertEqual(result["page_size"], 20)
		self.assertEqual(rows["page_length"], 20)

	def test_pages_are_offset_by_page_size(self):
		_, _, rows = self._call(page=2, page_size=50)
		self.assertEqual(rows["start"], 50)

	def test_cancelled_bills_are_hidden_unless_asked_for(self):
		_, totals, _ = self._call()
		self.assertIn(["Purchase Invoice", "docstatus", "!=", 2], totals["filters"])
		_, totals, _ = self._call(status="Cancelled")
		self.assertIn(["Purchase Invoice", "docstatus", "=", 2], totals["filters"])

	def test_unpaid_covers_overdue_and_partly_paid(self):
		_, totals, _ = self._call(status="Unpaid")
		self.assertIn(
			["Purchase Invoice", "status", "in", ["Unpaid", "Overdue", "Partly Paid"]], totals["filters"]
		)

	def test_a_branch_narrows_to_its_company(self):
		_, totals, _ = self._call(branch="B1")
		self.assertIn(["Purchase Invoice", "company", "=", "C1"], totals["filters"])
		_, totals, _ = self._call(branch="all")
		self.assertFalse(any(f[1] == "company" for f in totals["filters"]))

	def test_search_looks_in_number_supplier_and_bill_no(self):
		_, totals, _ = self._call(search=" 77 ")
		self.assertEqual({f[1] for f in totals["or_filters"]}, {"name", "supplier_name", "bill_no"})
		self.assertTrue(all(f[3] == "%77%" for f in totals["or_filters"]))


class TestPayableAccount(FrappeTestCase):

	def _account(self, account_type):
		with patch(f"{MOD}.frappe.db.get_value") as get_value:
			get_value.side_effect = ["ACC", account_type]
			return purchases._payable_account("Mode", "C1")

	def test_cash_and_bank_accounts_can_pay_a_supplier(self):
		self.assertEqual(self._account("Cash"), "ACC")
		self.assertEqual(self._account("Bank"), "ACC")

	def test_a_receivable_account_cannot(self):
		# A POS "credit" mode posts to Debtors; paying a supplier from it fails
		# at submit, so it must not be offered at all.
		self.assertIsNone(self._account("Receivable"))


class TestPurchaseForm(FrappeTestCase):

	def _fill(self, **data):
		base = {
			"supplier": "S1",
			"warehouse": "W1",
			"posting_date": nowdate(),
			"items": [{"item_code": "I1", "qty": 1, "rate": 10}],
		}
		base.update(data)
		doc = MagicMock()
		doc.company = "C1"
		doc.is_new.return_value = True

		def get_value(doctype, name, fields=None, *args, **kwargs):
			if doctype == "Warehouse":
				return frappe._dict(company="C1", is_group=0, disabled=0)
			return None

		with patch(f"{MOD}.frappe.db.exists", side_effect=lambda dt, name=None: name not in ("NOPE",)), \
			 patch(f"{MOD}.frappe.db.get_value", side_effect=get_value), \
			 patch(f"{MOD}.frappe.get_cached_value", return_value="Nos"):
			purchases._fill(doc, frappe._dict(base))
		return doc

	def assertRefused(self, message, **data):
		with self.assertRaises(frappe.ValidationError) as ctx:
			self._fill(**data)
		self.assertIn(message, str(ctx.exception))

	def test_a_complete_bill_receives_stock_into_the_warehouse(self):
		doc = self._fill()
		self.assertEqual(doc.update_stock, 1)
		self.assertEqual(doc.set_warehouse, "W1")
		self.assertEqual(doc.is_paid, 0)

	def test_a_supplier_is_required(self):
		self.assertRefused("Choose a supplier", supplier="")

	def test_an_unknown_supplier_is_refused(self):
		self.assertRefused("Choose a supplier", supplier="NOPE")

	def test_at_least_one_item_is_required(self):
		self.assertRefused("Add at least one item", items=[])

	def test_a_warehouse_is_required(self):
		self.assertRefused("Choose the warehouse", warehouse="")

	def test_a_future_date_is_refused(self):
		self.assertRefused("cannot be in the future", posting_date=add_days(nowdate(), 1))

	def test_a_due_date_before_the_purchase_is_refused(self):
		self.assertRefused("due date cannot be before", due_date=add_days(nowdate(), -1))

	def test_zero_quantity_is_refused(self):
		self.assertRefused("quantity must be greater than zero", items=[{"item_code": "I1", "qty": 0, "rate": 5}])

	def test_a_negative_price_is_refused(self):
		self.assertRefused("price cannot be negative", items=[{"item_code": "I1", "qty": 1, "rate": -5}])

	def test_a_negative_discount_is_refused(self):
		self.assertRefused("Discount cannot be negative", discount_amount=-1)

	def test_paying_now_needs_a_mode_of_payment(self):
		self.assertRefused("Choose how the supplier was paid", pay_now=1)

	def test_the_typed_price_wins_over_the_price_list(self):
		doc = MagicMock()
		doc.company = "C1"
		row = frappe._dict(rate=0, price_list_rate=99)
		doc.items = [row]
		with patch(f"{MOD}.frappe.db.exists", return_value=True), \
			 patch(f"{MOD}.frappe.db.get_value", return_value=frappe._dict(company="C1", is_group=0, disabled=0)), \
			 patch(f"{MOD}.frappe.get_cached_value", return_value="Nos"):
			purchases._fill(doc, frappe._dict(
				supplier="S1", warehouse="W1", posting_date=nowdate(),
				items=[{"item_code": "I1", "qty": 2, "rate": 7}],
			))
		self.assertEqual(row.rate, 7)
		self.assertEqual(row.price_list_rate, 0)


class TestPurchaseActions(FrappeTestCase):

	def _doc(self, **values):
		doc = MagicMock()
		doc.name = "PINV-T"
		doc.docstatus = values.get("docstatus", 1)
		doc.is_return = values.get("is_return", 0)
		doc.outstanding_amount = values.get("outstanding_amount", 100)
		doc.company = "C1"
		doc.currency = "IQD"
		return doc

	def test_a_paid_purchase_cannot_be_cancelled_until_its_payments_are(self):
		doc = self._doc()
		with patch(f"{MOD}.frappe.get_doc", return_value=doc), \
			 patch(f"{MOD}.frappe.get_all", return_value=["PAY-1"]):
			with self.assertRaises(frappe.ValidationError) as ctx:
				purchases.cancel_purchase("PINV-T")
		self.assertIn("PAY-1", str(ctx.exception))
		doc.cancel.assert_not_called()

	def test_a_draft_cannot_be_cancelled(self):
		doc = self._doc(docstatus=0)
		with patch(f"{MOD}.frappe.get_doc", return_value=doc):
			with self.assertRaises(frappe.ValidationError):
				purchases.cancel_purchase("PINV-T")

	def test_a_submitted_purchase_cannot_be_deleted(self):
		doc = self._doc(docstatus=1)
		with patch(f"{MOD}.frappe.get_doc", return_value=doc), \
			 patch(f"{MOD}.frappe.delete_doc") as delete_doc:
			with self.assertRaises(frappe.ValidationError):
				purchases.delete_purchase("PINV-T")
		delete_doc.assert_not_called()

	def _pay(self, doc, amount):
		with patch(f"{MOD}.frappe.get_doc", return_value=doc), \
			 patch(f"{MOD}.frappe.has_permission", return_value=True), \
			 patch(f"{MOD}.frappe.get_precision", return_value=2), \
			 patch("erpnext.accounts.doctype.payment_entry.payment_entry.get_payment_entry") as get_pe:
			purchases.record_payment("PINV-T", "Cash", amount)
		return get_pe

	def test_paying_more_than_is_owed_is_refused(self):
		with self.assertRaises(frappe.ValidationError):
			self._pay(self._doc(outstanding_amount=100), 150)

	def test_a_fully_paid_purchase_cannot_be_paid_again(self):
		with self.assertRaises(frappe.ValidationError):
			self._pay(self._doc(outstanding_amount=0), 10)

	def test_a_draft_cannot_be_paid(self):
		with self.assertRaises(frappe.ValidationError):
			self._pay(self._doc(docstatus=0), 10)
