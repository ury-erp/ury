# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt

"""Coverage for the payment-setup / aggregator APIs in `ury/ury_pos/api.py`
that had zero tests before this file (Track B3, sa-v3-test-hardening):

  - `ensure_payment_mode_accounts` (~line 1733)
  - `getModeOfPayment` (~line 194)
  - `getAggregator` / `getAggregatorItem` / `getAggregatorMOP` (~952-1002)

Real-DB `FrappeTestCase` integration tests using the shared factories
(`ury/ury/tests/factories.py`) where the doctype graph is cheap to build
(Branch + URY User row + POS Profile). `ensure_payment_mode_accounts`'s
permission gate is exercised with a real no-role user via `frappe.set_user`,
matching the module's existing convention
(`test_create_pos_opening_entry_permissions.py`) of proving gates against
the real `frappe.has_permission`, not a mock, wherever that's cheap.

Assumption (per task instructions): the target site has a Company with
setup complete, so `frappe.db.get_value("Company", {}, "name")` resolves to
a real company with at least a Cash account -- `make_pos_profile()` and
`_ensure_mode_of_payment()` both rely on that.
"""

from __future__ import annotations

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.tests.factories import _faker, make_branch
from ury.ury_pos.api import (
	ensure_payment_mode_accounts,
	getAggregator,
	getAggregatorItem,
	getAggregatorMOP,
	getModeOfPayment,
)

MODULE = "ury.ury_pos.api"


def _default_company() -> str:
	company = frappe.db.get_value("Company", {}, "name")
	if not company:
		frappe.throw("No Company found on this site -- test fixture assumption violated")
	return company


def _ensure_test_mode_of_payment(name, company):
	"""Get-or-create a Mode of Payment with a default account for `company`.

	Self-contained (doesn't import `ury.ury.dev_seed.profiles._ensure_mode_of_payment`)
	so this file's fixtures don't depend on dev-seed data existing on the
	target site -- a fresh CI-like bench has neither "Cash" nor "Zomato" as a
	Mode of Payment, and POS Profile.payments / Aggregator Settings.mode_of_payments
	both require the referenced Mode of Payment to already exist (link
	validation), so it must be created here before it's linked.
	"""
	if frappe.db.exists("Mode of Payment", name):
		mop = frappe.get_doc("Mode of Payment", name)
	else:
		mop = frappe.get_doc({"doctype": "Mode of Payment", "mode_of_payment": name, "type": "General"})

	if any(row.company == company for row in mop.get("accounts", [])):
		return mop.name if mop.name else name

	account = frappe.db.get_value("Company", company, "default_cash_account") or frappe.db.get_value(
		"Company", company, "default_bank_account"
	)
	if not account:
		account = frappe.db.get_value("Account", {"company": company, "account_type": "Cash", "is_group": 0}, "name")
	if not account:
		account = frappe.db.get_value("Account", {"company": company, "account_type": "Bank", "is_group": 0}, "name")
	if not account:
		frappe.throw(f"No Cash/Bank account found for company {company} -- test fixture assumption violated")

	mop.append("accounts", {"company": company, "default_account": account})
	if mop.is_new():
		mop.insert(ignore_permissions=True)
	else:
		mop.save(ignore_permissions=True)
	return mop.name


def _make_branch_user(branch_doc, email=None):
	"""Attach a fresh User to `branch_doc` via the custom `user` (URY User) child
	table, so `getBranch()`'s raw SQL join on `tabURY User`/`tabBranch` resolves.
	"""
	email = email or _faker().unique.email()
	if frappe.db.exists("User", email):
		frappe.delete_doc("User", email, force=True, ignore_permissions=True)
	user = frappe.get_doc(
		{
			"doctype": "User",
			"email": email,
			"first_name": _faker().first_name(),
			"send_welcome_email": 0,
			"enabled": 1,
		}
	).insert(ignore_permissions=True)

	branch_doc.append("user", {"user": email})
	branch_doc.save(ignore_permissions=True)
	return user


class TestEnsurePaymentModeAccounts(FrappeTestCase):
	"""`ensure_payment_mode_accounts(modes, company)`."""

	def setUp(self):
		self.company = _default_company()
		self.mode_name = f"Test Mode {frappe.generate_hash(length=8)}"

	def tearDown(self):
		frappe.set_user("Administrator")
		if frappe.db.exists("Mode of Payment", self.mode_name):
			frappe.delete_doc("Mode of Payment", self.mode_name, force=True, ignore_permissions=True)

	def test_happy_path_creates_mode_with_default_account(self):
		result = ensure_payment_mode_accounts([self.mode_name], self.company)

		self.assertEqual(result, [self.mode_name])
		self.assertTrue(frappe.db.exists("Mode of Payment", self.mode_name))
		mop = frappe.get_doc("Mode of Payment", self.mode_name)
		company_rows = [row for row in mop.accounts if row.company == self.company]
		self.assertEqual(len(company_rows), 1)
		self.assertTrue(company_rows[0].default_account)

	def test_idempotent_second_call_creates_no_duplicate_rows(self):
		first = ensure_payment_mode_accounts([self.mode_name], self.company)
		second = ensure_payment_mode_accounts([self.mode_name], self.company)

		self.assertEqual(first, [self.mode_name])
		self.assertEqual(second, [self.mode_name])
		mop = frappe.get_doc("Mode of Payment", self.mode_name)
		company_rows = [row for row in mop.accounts if row.company == self.company]
		# Exactly one company-scoped account row, not two, after calling twice.
		self.assertEqual(len(company_rows), 1)

	def test_missing_modes_returns_empty_list_without_creating_anything(self):
		self.assertEqual(ensure_payment_mode_accounts([], self.company), [])
		self.assertEqual(ensure_payment_mode_accounts(None, self.company), [])
		self.assertFalse(frappe.db.exists("Mode of Payment", self.mode_name))

	def test_missing_company_returns_empty_list(self):
		self.assertEqual(ensure_payment_mode_accounts([self.mode_name], None), [])
		self.assertFalse(frappe.db.exists("Mode of Payment", self.mode_name))

	def test_modes_as_json_string_is_parsed(self):
		result = ensure_payment_mode_accounts(frappe.as_json([self.mode_name]), self.company)
		self.assertEqual(result, [self.mode_name])
		self.assertTrue(frappe.db.exists("Mode of Payment", self.mode_name))

	def test_falsy_entries_in_modes_are_skipped(self):
		result = ensure_payment_mode_accounts([self.mode_name, None, ""], self.company)
		self.assertEqual(result, [self.mode_name])

	def test_permission_denied_for_user_without_role(self):
		email = _faker().unique.email()
		if frappe.db.exists("User", email):
			frappe.delete_doc("User", email, force=True, ignore_permissions=True)
		frappe.get_doc(
			{
				"doctype": "User",
				"email": email,
				"first_name": "NoRole",
				"send_welcome_email": 0,
				"enabled": 1,
			}
		).insert(ignore_permissions=True)

		try:
			frappe.set_user(email)
			with self.assertRaises(frappe.PermissionError):
				ensure_payment_mode_accounts([self.mode_name], self.company)
		finally:
			frappe.set_user("Administrator")
			frappe.delete_doc("User", email, force=True, ignore_permissions=True)

		self.assertFalse(frappe.db.exists("Mode of Payment", self.mode_name))


class TestGetModeOfPayment(FrappeTestCase):
	"""`getModeOfPayment()` -- reads the caller's branch's POS Profile.payments."""

	def setUp(self):
		self.company = _default_company()
		self.branch = make_branch()
		self.user = _make_branch_user(self.branch)

		self.mode_name = f"Test Cash {frappe.generate_hash(length=6)}"
		_ensure_test_mode_of_payment(self.mode_name, self.company)

		warehouse = frappe.db.get_value("Warehouse", {"company": self.company}, "name")
		if not warehouse:
			abbr = frappe.db.get_value("Company", self.company, "abbr")
			warehouse = frappe.get_doc(
				{
					"doctype": "Warehouse",
					"warehouse_name": f"Test Warehouse {frappe.generate_hash(length=6)}",
					"company": self.company,
					"abbr": abbr,
				}
			).insert(ignore_permissions=True, ignore_mandatory=True).name

		# erpnext's POS Profile.validate() requires a cost_center (and is happy
		# to fall back to the company-scoped account/cost-center for
		# write-off rounding if one is set) -- use the company's own default
		# cost center for all three rather than assuming they're unset.
		cost_center = frappe.get_cached_value("Company", self.company, "cost_center")
		if not cost_center:
			cost_center = frappe.db.get_value(
				"Cost Center", {"company": self.company, "is_group": 0}, "name"
			)
		write_off_account = frappe.db.get_value(
			"Account", {"company": self.company, "account_type": "Cash", "is_group": 0}, "name"
		)

		self.profile_name = f"Test POS Profile {frappe.generate_hash(length=6)}"
		self.pos_profile = frappe.get_doc(
			{
				"doctype": "POS Profile",
				"name": self.profile_name,
				"branch": self.branch.name,
				"company": self.company,
				"warehouse": warehouse,
				"currency": "INR",
				"cost_center": cost_center,
				"write_off_account": write_off_account,
				"write_off_cost_center": cost_center,
				"payments": [{"mode_of_payment": self.mode_name, "default": 1}],
				# getPosProfile() resolves the cashier from applicable_for_users.
				"applicable_for_users": [{"user": self.user.name, "default": 1}],
			}
		).insert(ignore_permissions=True, ignore_mandatory=True)

		frappe.set_user(self.user.name)

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.delete_doc("POS Profile", self.profile_name, force=True, ignore_permissions=True)
		frappe.delete_doc("User", self.user.name, force=True, ignore_permissions=True)

	def test_returns_pos_profile_modes_with_zero_opening_amount(self):
		result = getModeOfPayment()

		self.assertEqual(result, [{"mode_of_payment": self.mode_name, "opening_amount": 0.0}])


class TestAggregatorAPIs(FrappeTestCase):
	"""`getAggregator`, `getAggregatorItem`, `getAggregatorMOP`."""

	def setUp(self):
		self.company = _default_company()
		self.branch = make_branch()
		self.user = _make_branch_user(self.branch)

		self.customer = frappe.db.get_value("Customer", {}, "name")
		if not self.customer:
			self.customer = frappe.get_doc(
				{
					"doctype": "Customer",
					"customer_name": _faker().name(),
					"customer_type": "Individual",
					"customer_group": "Individual",
					"territory": "All Territories",
				}
			).insert(ignore_permissions=True, ignore_mandatory=True).name

		self.price_list = frappe.db.get_value("Price List", {"selling": 1}, "name")
		if not self.price_list:
			self.price_list = frappe.get_doc(
				{
					"doctype": "Price List",
					"price_list_name": f"Test Selling {frappe.generate_hash(length=6)}",
					"selling": 1,
					"currency": "INR",
				}
			).insert(ignore_permissions=True, ignore_mandatory=True).name

		self.mop_name = f"Test Zomato {frappe.generate_hash(length=6)}"
		_ensure_test_mode_of_payment(self.mop_name, self.company)

		self.branch.append(
			"custom_aggregator_settings",
			{
				"customer": self.customer,
				"price_list": self.price_list,
				"mode_of_payments": self.mop_name,
			},
		)
		self.branch.save(ignore_permissions=True)

		self.item_code = f"TEST-AGG-ITEM-{frappe.generate_hash(length=6)}"
		frappe.get_doc(
			{
				"doctype": "Item",
				"item_code": self.item_code,
				"item_name": "Aggregator Test Item",
				"item_group": "All Item Groups",
				"stock_uom": "Nos",
				"is_stock_item": 0,
			}
		).insert(ignore_permissions=True, ignore_mandatory=True)

		self.item_price_name = frappe.get_doc(
			{
				"doctype": "Item Price",
				"item_code": self.item_code,
				"price_list": self.price_list,
				"selling": 1,
				"price_list_rate": 199,
			}
		).insert(ignore_permissions=True, ignore_mandatory=True).name

		frappe.set_user(self.user.name)

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.delete_doc("Item Price", self.item_price_name, force=True, ignore_permissions=True)
		frappe.delete_doc("Item", self.item_code, force=True, ignore_permissions=True)
		frappe.delete_doc("User", self.user.name, force=True, ignore_permissions=True)

	def test_get_aggregator_lists_branch_aggregator_customers(self):
		result = getAggregator()

		self.assertEqual([row["customer"] for row in result], [self.customer])

	def test_get_aggregator_item_returns_priced_enabled_items(self):
		result = getAggregatorItem(self.customer)

		matching = [row for row in result if row["item"] == self.item_code]
		self.assertEqual(len(matching), 1)
		self.assertEqual(matching[0]["rate"], 199)
		self.assertEqual(matching[0]["item_name"], "Aggregator Test Item")

	def test_get_aggregator_item_excludes_disabled_items(self):
		frappe.db.set_value("Item", self.item_code, "disabled", 1)

		result = getAggregatorItem(self.customer)

		self.assertNotIn(self.item_code, [row["item"] for row in result])

	def test_get_aggregator_item_unknown_aggregator_returns_empty(self):
		result = getAggregatorItem("Not A Real Aggregator Customer")

		self.assertEqual(result, [])

	def test_get_aggregator_mop_returns_configured_mode(self):
		result = getAggregatorMOP(self.customer)

		self.assertEqual(result, [{"mode_of_payment": self.mop_name, "opening_amount": 0.0}])

	def test_get_aggregator_mop_unknown_aggregator_returns_none_wrapped(self):
		result = getAggregatorMOP("Not A Real Aggregator Customer")

		self.assertEqual(result, [{"mode_of_payment": None, "opening_amount": 0.0}])
