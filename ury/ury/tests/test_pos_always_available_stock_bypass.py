# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt
"""Integration tests for the POS "Always Available" stock bypass.

Coverage target (class override ``ury.ury.class_overrides.pos_invoice.CustomPOSInvoice``):

1. An Item with an ACTIVE ``URY Item Production Configuration`` whose
   ``availability_mode`` is "Always Available" for the invoice's branch can be
   sold on a POS Invoice even with ZERO stock in the POS warehouse -- payment
   and submission succeed without any stock validation error.
2. A standard Item (no matching "Always Available" configuration) with ZERO
   stock still hits ERPNext's standard gate and strictly throws
   ``Row #1: Item ... has no stock in warehouse ...`` on submit.

These are real-DB integration tests (``FrappeTestCase``), same convention as
``ury_pos/test_e2e_p0_p1_flow.py``: a real Branch, Warehouse, POS Profile and
open POS Opening Entry are created up front, because ERPNext refuses to even
validate a POS Invoice without an open entry for the profile today.

NOTE: this module deliberately exercises ONLY the POS Invoice payment /
submission gate. POS Closing Entry is intentionally untouched -- standard
ERPNext handles closing.
"""

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.tests.factories import make_branch, make_customer, make_item

TEST_BRANCH = "_Test POS Stock Bypass Branch"
TEST_ROOM = "_Test POS Stock Bypass Room"
TEST_RESTAURANT = "_Test POS Stock Bypass Restaurant"
TEST_POS_PROFILE = "_Test POS Stock Bypass Profile"
TEST_MENU = "_Test POS Stock Bypass Menu"
TEST_WAREHOUSE = "POS Stock Bypass Test"  # warehouse_name; company abbrev gets appended
TEST_AA_ITEM = "_Test AA Bypass Item"
TEST_STD_ITEM = "_Test Std Bypass Item"
TEST_CUSTOMER = "_Test POS Stock Bypass Customer"
MODE_OF_PAYMENT = "Cash"
ITEM_RATE = 100.0


class TestPOSAlwaysAvailableStockBypass(FrappeTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		frappe.set_user("Administrator")
		cls.company = frappe.db.get_value("Company", {}, "name")
		cls.currency = frappe.db.get_value("Company", cls.company, "default_currency")
		cls.branch = make_branch(branch=TEST_BRANCH)
		cls.warehouse = cls._make_warehouse()
		cls._make_room_and_restaurant()
		cls.price_list = cls._make_price_list()
		cls.customer = cls._make_customer()
		cls.aa_item = cls._make_item(TEST_AA_ITEM)
		cls.std_item = cls._make_item(TEST_STD_ITEM)
		cls._make_item_price(cls.aa_item)
		cls._make_item_price(cls.std_item)
		cls._make_ipc(cls.aa_item)
		cls._make_menu()
		cls.pos_profile = cls._make_pos_profile()
		cls._make_pos_opening_entry()

	@classmethod
	def tearDownClass(cls):
		frappe.set_user("Administrator")
		cls._cleanup()
		super().tearDownClass()

	# -- fixtures -------------------------------------------------------------

	@classmethod
	def _make_warehouse(cls):
		name = f"{TEST_WAREHOUSE} - {frappe.db.get_value('Company', cls.company, 'abbr')}"
		if frappe.db.exists("Warehouse", name):
			return frappe.get_doc("Warehouse", name)
		return frappe.get_doc(
			{
				"doctype": "Warehouse",
				"warehouse_name": TEST_WAREHOUSE,
				"company": cls.company,
			}
		).insert(ignore_permissions=True)

	@classmethod
	def _make_room_and_restaurant(cls):
		if not frappe.db.exists("URY Room", TEST_ROOM):
			frappe.get_doc(
				{"doctype": "URY Room", "name": TEST_ROOM, "branch": cls.branch.name}
			).insert(ignore_permissions=True)

		if not frappe.db.exists("URY Restaurant", TEST_RESTAURANT):
			frappe.get_doc(
				{
					"doctype": "URY Restaurant",
					"name": TEST_RESTAURANT,
					"company": cls.company,
					"invoice_series_prefix": "BYPS",
					"branch": cls.branch.name,
					"default_room": TEST_ROOM,
				}
			).insert(ignore_permissions=True)

	@classmethod
	def _make_price_list(cls):
		"""A DEDICATED selling price list in the company currency.

		Never reuses an arbitrary existing price list: ``_make_menu`` stamps a
		``restaurant_menu`` link onto it, which would mutate a production price
		list.
		"""
		existing = frappe.db.get_value("Price List", "_Test POS Stock Bypass PL", "name")
		if existing:
			return existing

		pl = frappe.get_doc(
			{
				"doctype": "Price List",
				"price_list_name": "_Test POS Stock Bypass PL",
				"selling": 1,
				"currency": cls.currency,
				"enabled": 1,
			}
		)
		pl.insert(ignore_permissions=True)
		return pl.name

	@classmethod
	def _make_menu(cls):
		"""URY Menu -> Price List chain for this branch.

		The POS Profile carries a restaurant (POS Opening Entry's mandatory
		`restaurant` fetch_from's it, fetch_if_empty=0), which flows onto the
		POS Invoice, which makes ury's `validate_price_list` hook rewrite
		`selling_price_list` from the restaurant's `active_menu`. Wiring a real
		menu + `restaurant_menu`-linked price list keeps that resolution
		deterministic instead of letting it match an arbitrary null-menu price
		list.
		"""
		if not frappe.db.exists("URY Menu", TEST_MENU):
			frappe.get_doc(
				{
					"doctype": "URY Menu",
					"name": TEST_MENU,
					"branch": cls.branch.name,
					"price_list": cls.price_list,
					"items": [{"item": TEST_AA_ITEM, "rate": ITEM_RATE}],
				}
			).insert(ignore_permissions=True)

		if not frappe.db.get_value("Price List", cls.price_list, "restaurant_menu"):
			frappe.db.set_value("Price List", cls.price_list, "restaurant_menu", TEST_MENU)

		frappe.db.set_value("URY Restaurant", TEST_RESTAURANT, "active_menu", TEST_MENU)

	@classmethod
	def _resolve_account(cls, account_type, name_like):
		return (
			frappe.db.get_value(
				"Account", {"company": cls.company, "account_type": account_type, "is_group": 0}
			)
			or frappe.db.get_value(
				"Account", {"company": cls.company, "name": ["like", name_like], "is_group": 0}
			)
		)

	@classmethod
	def _make_pos_profile(cls):
		if frappe.db.exists("POS Profile", TEST_POS_PROFILE):
			frappe.delete_doc("POS Profile", TEST_POS_PROFILE, ignore_permissions=True, force=1)

		profile = frappe.get_doc(
			{
				"doctype": "POS Profile",
				"name": TEST_POS_PROFILE,
				"company": cls.company,
				"currency": cls.currency,
				"warehouse": cls.warehouse.name,
				"cost_center": frappe.db.get_value(
					"Cost Center", {"company": cls.company, "is_group": 0}, "name"
				),
				"income_account": cls._resolve_account("Income Account", "Sales%"),
				"expense_account": cls._resolve_account("Cost of Goods Sold", "%Expense%"),
				"write_off_account": cls._resolve_account("Write Off", "%Write Off%"),
				"write_off_cost_center": frappe.db.get_value(
					"Cost Center", {"company": cls.company, "is_group": 0}, "name"
				),
				"selling_price_list": cls.price_list,
				"branch": cls.branch.name,
				"restaurant": TEST_RESTAURANT,
			}
		)
		profile.append("payments", {"mode_of_payment": MODE_OF_PAYMENT, "default": 1})
		profile.insert(ignore_permissions=True)
		return profile

	@classmethod
	def _make_customer(cls):
		if frappe.db.exists("Customer", TEST_CUSTOMER):
			return frappe.get_doc("Customer", TEST_CUSTOMER)
		return make_customer(customer_name=TEST_CUSTOMER)

	@classmethod
	def _make_item(cls, item_code):
		return make_item(item_code=item_code, item_name=item_code, is_stock_item=1)

	@classmethod
	def _make_item_price(cls, item):
		if frappe.db.exists(
			"Item Price", {"item_code": item.item_code, "price_list": cls.price_list}
		):
			return
		frappe.get_doc(
			{
				"doctype": "Item Price",
				"item_code": item.item_code,
				"price_list": cls.price_list,
				"uom": item.stock_uom,
				"price_list_rate": ITEM_RATE,
				"currency": cls.currency,
			}
		).insert(ignore_permissions=True)

	@classmethod
	def _make_ipc(cls, item):
		"""Active 'Always Available' production configuration for the branch."""
		name = f"UIPC-{item.item_code}-{cls.branch.name}"
		if frappe.db.exists("URY Item Production Configuration", name):
			return frappe.get_doc("URY Item Production Configuration", name)
		return frappe.get_doc(
			{
				"doctype": "URY Item Production Configuration",
				"item": item.item_code,
				"branch": cls.branch.name,
				"availability_mode": "Always Available",
				"active": 1,
			}
		).insert(ignore_permissions=True)

	@classmethod
	def _make_pos_opening_entry(cls):
		entry = frappe.new_doc("POS Opening Entry")
		entry.pos_profile = TEST_POS_PROFILE
		entry.user = "Administrator"
		entry.company = cls.company
		entry.period_start_date = frappe.utils.now_datetime()
		# Mandatory custom fields (fixtures/custom_field.json), normally
		# auto-populated by the desk form's fetch_from wiring.
		entry.branch = cls.branch.name
		entry.restaurant = TEST_RESTAURANT
		entry.set(
			"balance_details",
			[{"mode_of_payment": row.mode_of_payment} for row in cls.pos_profile.payments],
		)
		entry.insert(ignore_permissions=True)
		entry.submit()
		return entry

	@classmethod
	def _cleanup(cls):
		for invoice in frappe.get_all(
			"POS Invoice", filters={"pos_profile": TEST_POS_PROFILE}, pluck="name"
		):
			doc = frappe.get_doc("POS Invoice", invoice)
			if doc.docstatus == 1:
				doc.cancel()
			frappe.delete_doc("POS Invoice", invoice, ignore_permissions=True, force=1)

		for name in frappe.get_all(
			"POS Opening Entry", filters={"pos_profile": TEST_POS_PROFILE}, pluck="name"
		):
			doc = frappe.get_doc("POS Opening Entry", name)
			if doc.docstatus == 1:
				doc.cancel()
			frappe.delete_doc("POS Opening Entry", name, ignore_permissions=True, force=1)

		if frappe.db.exists("POS Profile", TEST_POS_PROFILE):
			frappe.delete_doc("POS Profile", TEST_POS_PROFILE, ignore_permissions=True, force=1)

		frappe.db.commit()

	# -- helpers --------------------------------------------------------------

	def _make_pos_invoice(self, item_code):
		inv = frappe.new_doc("POS Invoice")
		inv.pos_profile = TEST_POS_PROFILE
		inv.company = self.company
		inv.customer = TEST_CUSTOMER
		inv.is_pos = 1
		inv.update_stock = 0
		inv.posting_date = frappe.utils.nowdate()
		inv.append(
			"items",
			{
				"item_code": item_code,
				"qty": 1,
				"rate": ITEM_RATE,
				"warehouse": self.warehouse.name,
			},
		)
		inv.append(
			"payments",
			{"mode_of_payment": MODE_OF_PAYMENT, "amount": ITEM_RATE},
		)
		return inv

	# -- tests ----------------------------------------------------------------

	def test_always_available_item_with_zero_stock_submits(self):
		"""availability_mode == 'Always Available' bypasses the POS stock gate:
		payment + submission succeed with zero stock in the POS warehouse."""
		inv = self._make_pos_invoice(TEST_AA_ITEM)
		inv.save(ignore_permissions=True)
		inv.submit()

		self.assertEqual(inv.docstatus, 1)
		self.assertEqual(inv.paid_amount, ITEM_RATE)

	def test_standard_item_with_zero_stock_still_throws(self):
		"""No 'Always Available' configuration -> ERPNext's standard gate must
		still strictly reject the sale with the stock error on submit."""
		inv = self._make_pos_invoice(TEST_STD_ITEM)
		inv.save(ignore_permissions=True)

		self.assertEqual(inv.docstatus, 0)

		with self.assertRaises(frappe.ValidationError) as cm:
			inv.submit()

		message = str(cm.exception)
		# frappe.bold() wraps item/warehouse in <strong> tags.
		self.assertIn("Row #1: Item", message)
		self.assertIn(TEST_STD_ITEM, message)
		self.assertIn("has no stock in warehouse", message)
