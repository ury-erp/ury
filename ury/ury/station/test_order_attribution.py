"""An order taken after station sign-in belongs to that waiter.

Unlike the other tests this needs a working restaurant on the site: a
Branch, a POS Profile with an open POS session, a free table and a menu.
It is skipped where there is none. It writes a real order and then removes
it, so run it on a test site, never on production.
"""

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.station import eligibility
from ury.ury.station import test_utils as utils
from ury.ury.station.test_utils import Browser
from ury.ury.station.waiter import create_waiter

SYNC_ORDER = "ury.ury.doctype.ury_order.ury_order.sync_order"


def find_restaurant():
	"""A POS Profile with an open session, plus a free table and one menu item."""
	for profile in frappe.get_all("POS Profile", filters={"disabled": 0}, fields=["name", "branch"]):
		if not profile.branch or not eligibility.open_pos_session(profile.name):
			continue
		room = frappe.db.get_value("URY Room", {"branch": profile.branch}, "name")
		table = room and frappe.db.get_value(
			"URY Table", {"restaurant_room": room, "occupied": 0, "is_take_away": 0}, "name"
		)
		menu = frappe.db.get_value("URY Menu", {"branch": profile.branch, "enabled": 1}, "name")
		item = menu and frappe.db.get_value(
			"URY Menu Item", {"parent": menu, "disabled": 0}, ["item", "item_name", "rate"], as_dict=True
		)
		if table and item:
			return frappe._dict(profile=profile.name, branch=profile.branch, room=room, table=table, item=item)
	return None


class TestOrderAttribution(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		utils.run_jobs_inline(self)
		utils.cleanup()
		self.restaurant = find_restaurant()
		if not self.restaurant:
			self.skipTest("Needs a POS Profile with an open POS session, a free table and a menu")

		utils.make_station()
		self.addCleanup(utils.restore_settings, utils.stored_settings())
		frappe.db.set_single_value("URY Station Settings", "waiter_email_domain", utils.EMAIL_DOMAIN)
		frappe.clear_document_cache("URY Station Settings", "URY Station Settings")
		self.cashier_row = self.profile_users()[0]
		self.invoices = []
		self.addCleanup(self.remove_test_data)

	def profile_users(self):
		return frappe.get_all(
			"POS Profile User", filters={"parent": self.restaurant.profile}, pluck="user", order_by="idx"
		)

	def remove_test_data(self):
		frappe.set_user("Administrator")
		for invoice in self.invoices:
			for kot in frappe.get_all("URY KOT", filters={"invoice": invoice}, pluck="name"):
				frappe.db.delete("URY KOT Items", {"parent": kot})
				frappe.db.delete("URY KOT", {"name": kot})
			frappe.delete_doc("POS Invoice", invoice, force=True, ignore_permissions=True)
		frappe.db.set_value("URY Table", self.restaurant.table, "occupied", 0, update_modified=False)
		utils.cleanup()

	def test_order_after_station_sign_in_has_that_waiter(self):
		pin = utils.new_pin()
		waiter = create_waiter("Order Tester", pin, self.restaurant.branch, self.restaurant.profile)["user"]

		# Creating the waiter left the cashier as the first POS Profile row.
		self.assertEqual(self.profile_users()[0], self.cashier_row)
		self.assertEqual(self.profile_users()[-1], waiter)

		browser = Browser()
		self.assertTrue(browser.sign_in(pin)["ok"])
		self.assertEqual(browser.logged_user(), waiter)

		item = self.restaurant.item
		status, invoice = browser.call(
			SYNC_ORDER,
			items=[{"item": item.item, "item_name": item.item_name, "rate": item.rate, "qty": 1}],
			table=self.restaurant.table,
			room=self.restaurant.room,
			order_type="Dine In",
			pos_profile=self.restaurant.profile,
			no_of_pax=2,
			mode_of_payment="Cash",
			last_invoice=None,
			invoice=None,
			# What a tampered client might send: the server must ignore these.
			waiter="someone.else@example.com",
			cashier="someone.else@example.com",
			owner="someone.else@example.com",
		)
		self.assertEqual(status, 200, invoice)
		self.assertTrue(invoice and invoice.get("name"), invoice)
		self.invoices.append(invoice["name"])

		saved = frappe.db.get_value("POS Invoice", invoice["name"], ["waiter", "cashier"], as_dict=True)
		self.assertEqual(saved.waiter, waiter)
		self.assertEqual(saved.cashier, self.cashier_row)
