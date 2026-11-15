"""Shift handover: several cashiers in a day, one after another on one till.

Needs a working restaurant (POS Profile with today's session open, a free
table and a menu). It closes and opens real POS sessions and consolidates
real invoices, so run it on a test site only. Afterwards the till is open
again for the cashier who had it open before.
"""

import json

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import now_datetime, nowdate, nowtime

from ury.ury import pos_session

DOMAIN = "handover-test.invalid"


def add_staff(name, role, restaurant):
	email = f"{name}@{DOMAIN}"
	if not frappe.db.exists("User", email):
		frappe.get_doc(
			{"doctype": "User", "email": email, "first_name": name, "send_welcome_email": 0, "roles": [{"role": role}]}
		).insert(ignore_permissions=True)
	for doctype, docname, field in (
		("Branch", restaurant.branch, "user"),
		("POS Profile", restaurant.profile, "applicable_for_users"),
	):
		doc = frappe.get_doc(doctype, docname)
		if not any(row.user == email for row in doc.get(field)):
			doc.append(field, {"user": email})
			doc.save(ignore_permissions=True)
	return email


def close_shift(session, closed_by):
	"""What the POS closing dialog does, as `closed_by`, for `session`'s cashier."""
	frappe.set_user(closed_by)
	opening = frappe.get_doc("POS Opening Entry", session.name)
	closing = frappe.get_doc(
		{
			"doctype": "POS Closing Entry",
			"pos_profile": opening.pos_profile,
			"pos_opening_entry": opening.name,
			"user": opening.user,
			"company": opening.company,
			"period_start_date": opening.period_start_date,
			"period_end_date": str(now_datetime()),
			"posting_date": nowdate(),
			"posting_time": nowtime(),
			"payment_reconciliation": [
				{"mode_of_payment": b.mode_of_payment, "opening_amount": b.opening_amount, "expected_amount": 0,
				 "closing_amount": 0, "difference": 0}
				for b in opening.balance_details
			],
		}
	).insert()
	closing = frappe.get_doc("POS Closing Entry", closing.name)
	closing.docstatus = 1
	closing.save()
	frappe.set_user("Administrator")
	return frappe.get_doc("POS Closing Entry", closing.name)


def open_shift(cashier, restaurant):
	from ury.ury_pos.api import create_pos_opening_entry

	frappe.set_user(cashier)
	modes = frappe.get_all("POS Payment Method", filters={"parent": restaurant.profile}, pluck="mode_of_payment")
	entry = create_pos_opening_entry(
		restaurant.profile,
		frappe.db.get_value("POS Profile", restaurant.profile, "company"),
		json.dumps([{"mode_of_payment": m, "opening_amount": 0} for m in modes]),
	)
	frappe.set_user("Administrator")
	return entry["name"]


class TestShiftHandover(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		previous = frappe.in_test
		frappe.in_test = True
		self.addCleanup(setattr, frappe, "in_test", previous)

		from ury.ury.station.test_order_attribution import find_restaurant

		self.restaurant = find_restaurant()
		if not self.restaurant:
			self.skipTest("Needs a POS Profile with today's session open, a free table and a menu")
		self.first_session = pos_session.open_session(self.restaurant.profile)
		self.cashier_a = self.first_session.user
		self.cashier_b = add_staff("cashier.b", "URY Cashier", self.restaurant)
		self.manager = add_staff("manager", "URY Manager", self.restaurant)
		self.addCleanup(self.restore_till)

	def restore_till(self):
		"""Leave the till open for the cashier who had it before the test."""
		frappe.set_user("Administrator")
		session = pos_session.open_session(self.restaurant.profile)
		if session and session.user != self.cashier_a:
			close_shift(session, self.manager)
			session = None
		if not session:
			open_shift(self.cashier_a, self.restaurant)
		frappe.db.set_value("URY Table", self.restaurant.table, "occupied", 0, update_modified=False)
		frappe.db.commit()

	def take_away(self, as_user):
		from ury.ury.doctype.ury_order.ury_order import sync_order

		frappe.set_user(as_user)
		item = self.restaurant.item
		order = sync_order(
			items=[{"item": item.item, "item_name": item.item_name, "rate": item.rate, "qty": 1}],
			cashier=None, owner=None, mode_of_payment="Cash", no_of_pax=1, last_invoice=None, waiter=as_user,
			pos_profile=self.restaurant.profile, invoice=None, order_type="Take Away",
		)
		frappe.set_user("Administrator")
		return order["name"]

	def pay(self, invoice, as_user):
		from ury.ury.api.ury_print import qz_print_update
		from ury.ury.doctype.ury_order.ury_order import make_invoice

		frappe.set_user(as_user)
		qz_print_update(invoice)
		total = frappe.db.get_value("POS Invoice", invoice, "rounded_total") or frappe.db.get_value(
			"POS Invoice", invoice, "grand_total"
		)
		make_invoice(
			customer=frappe.db.get_value("POS Invoice", invoice, "customer"),
			payments=[{"mode_of_payment": "Cash", "amount": total}],
			cashier=None, pos_profile=self.restaurant.profile, owner=None, invoice=invoice,
		)
		frappe.set_user("Administrator")

	def test_two_cashiers_one_after_another(self):
		left_open = self.take_away(self.cashier_a)  # taken in A's shift, paid in B's
		paid_by_a = self.take_away(self.cashier_a)
		self.pay(paid_by_a, self.cashier_a)
		self.assertEqual(frappe.db.get_value("POS Invoice", left_open, "cashier"), self.cashier_a)

		# B cannot open while A's shift is open, and is told why.
		with self.assertRaises(frappe.ValidationError) as refused:
			open_shift(self.cashier_b, self.restaurant)
		self.assertIn("still open", str(refused.exception))

		closing_a = close_shift(self.first_session, self.cashier_a)
		self.assertEqual({row.pos_invoice for row in closing_a.pos_invoices}, {paid_by_a})

		session_b = open_shift(self.cashier_b, self.restaurant)
		self.pay(left_open, self.cashier_b)
		self.assertEqual(frappe.db.get_value("POS Invoice", left_open, "cashier"), self.cashier_b)
		self.assertEqual(frappe.db.get_value("POS Invoice", left_open, "owner"), self.cashier_b)

		# B has gone home: a manager closes B's shift for B.
		closing_b = close_shift(frappe._dict(name=session_b), self.manager)
		self.assertEqual(closing_b.user, self.cashier_b)
		self.assertEqual({row.pos_invoice for row in closing_b.pos_invoices}, {left_open})
		self.assertTrue(frappe.db.get_value("POS Invoice", left_open, "consolidated_invoice"))

	def test_explains_the_one_day_rule(self):
		message = pos_session.explain_error(
			frappe.ValidationError("POS Opening Entry - POS-OPE-1 is outdated. Please close the POS")
		)
		self.assertIn("earlier day", message)
		self.assertIsNone(pos_session.explain_error(frappe.ValidationError("something else")))
