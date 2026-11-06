"""End to end: sale and return, close the shift, reopen it, close it again.

Uses ERPNext's own POS test helpers on a site prepared by `before_tests`.
"""

import frappe
from frappe.utils import flt

from erpnext.accounts.doctype.mode_of_payment.test_mode_of_payment import (
	set_default_account_for_mode_of_payment,
)
from erpnext.accounts.doctype.pos_closing_entry.pos_closing_entry import (
	make_closing_entry_from_opening,
)
from erpnext.accounts.doctype.pos_closing_entry.test_pos_closing_entry import init_user_and_profile
from erpnext.accounts.doctype.pos_invoice.pos_invoice import make_sales_return
from erpnext.accounts.doctype.pos_invoice.test_pos_invoice import create_pos_invoice
from erpnext.tests.utils import ERPNextTestSuite

from ury.ury.tests.factories import make_branch


def make_restaurant(branch):
	existing = frappe.db.get_value("URY Restaurant", {"branch": branch})
	if existing:
		return existing
	restaurant = frappe.get_doc(
		{
			"doctype": "URY Restaurant",
			"__newname": "Merge Log Test Restaurant",
			"company": "_Test Company",
			"branch": branch,
			"invoice_series_prefix": "MLT-",
		}
	)
	restaurant.insert(ignore_permissions=True, ignore_mandatory=True, ignore_links=True)
	return restaurant.name


def open_shift(pos_profile, user, branch):
	entry = frappe.new_doc("POS Opening Entry")
	entry.pos_profile = pos_profile.name
	entry.user = user
	entry.company = pos_profile.company
	entry.branch = branch
	entry.restaurant = make_restaurant(branch)
	entry.period_start_date = frappe.utils.get_datetime()
	entry.set("balance_details", [{"mode_of_payment": d.mode_of_payment} for d in pos_profile.payments])
	entry.flags.ignore_links = True
	entry.submit()
	return entry


class TestPOSCloseReopenReclose(ERPNextTestSuite):
	def setUp(self):
		set_default_account_for_mode_of_payment(
			frappe.get_doc("Mode of Payment", "Bank Draft"), "_Test Company", "_Test Bank - _TC"
		)
		frappe.db.set_single_value("POS Settings", "invoice_type", "POS Invoice")
		frappe.db.set_single_value("Selling Settings", "validate_selling_price", 0)
		self.user, self.pos_profile = init_user_and_profile()
		self.branch = make_branch(branch="Merge Log Test Branch").name
		self.opening = open_shift(self.pos_profile, self.user.name, self.branch)

	def _sell_and_return(self):
		sale = create_pos_invoice(rate=300, do_not_submit=1)
		sale.append("payments", {"mode_of_payment": "Cash", "account": "Cash - _TC", "amount": 300})
		sale.save()
		sale.submit()

		other = create_pos_invoice(customer="_Test Customer 2", rate=500, do_not_submit=1)
		other.append("payments", {"mode_of_payment": "Cash", "account": "Cash - _TC", "amount": 500})
		other.save()
		other.submit()

		refund = make_sales_return(sale.name)
		refund.set("payments", [])
		refund.append("payments", {"mode_of_payment": "Cash", "account": "Cash - _TC", "amount": -300})
		refund.paid_amount = -300
		refund.submit()
		return sale, other, refund

	def _close(self):
		closing = make_closing_entry_from_opening(self.opening)
		closing.insert().submit()
		return closing

	def test_return_is_linked_to_credit_note_and_reopen_cancels_it(self):
		sale, other, refund = self._sell_and_return()
		closing = self._close()

		refund.load_from_db()
		credit_note = frappe.get_doc("Sales Invoice", refund.consolidated_invoice)
		self.assertEqual(credit_note.is_return, 1)
		sale.load_from_db()
		self.assertNotEqual(sale.consolidated_invoice, refund.consolidated_invoice)

		merge_logs = frappe.get_all(
			"POS Invoice Merge Log",
			filters={"pos_closing_entry": closing.name},
			fields=["name", "consolidated_invoice", "consolidated_credit_note"],
		)
		self.assertIn(credit_note.name, [m.consolidated_credit_note for m in merge_logs])

		closing.reload()
		closing.cancel()
		credit_note.reload()
		self.assertEqual(credit_note.docstatus, 2, "reopening must cancel the credit note")
		refund.load_from_db()
		self.assertFalse(refund.consolidated_invoice)

	def test_reclose_posts_the_return_once(self):
		sale, other, refund = self._sell_and_return()
		first = self._close()
		first.reload()
		first.cancel()

		self._close()
		refund.load_from_db()
		live_credit_notes = frappe.get_all(
			"Sales Invoice",
			filters={"is_return": 1, "is_consolidated": 1, "docstatus": 1, "company": "_Test Company"},
			fields=["name", "grand_total"],
		)
		self.assertEqual([c.name for c in live_credit_notes], [refund.consolidated_invoice])
		self.assertEqual(flt(live_credit_notes[0].grand_total), -300)
