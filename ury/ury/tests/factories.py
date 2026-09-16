# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt

"""Faker-based test-data factories (sa-comprehensive-test-strategy, Phase 8).

Phase 2's financial write-path tests need `frappe.tests.IntegrationTestCase`
tests with real fixture records and a real DB round-trip (mocked
`frappe.db.sql`/`get_all` is the wrong tool there -- see TRACK.md's
"Test-writing convention" note). Those tests, and several existing
`FrappeTestCase` files, currently hand-roll the same handful of records
(Branch, Customer, Item, POS Profile, User) inline with ad hoc
`frappe.get_doc({...}).insert()` calls scattered across files -- verified by
`grep -rn '"doctype": "Branch"' ury/` returning 8 separate hand-rolled call
sites before this module existed.

`Faker` is already pulled in transitively by `frappe[test]` (hypothesis /
coverage / Faker / freezegun -- see `.github/workflows/test.yml`'s "Install
frappe[test] extras" step) but, per a repo-wide
`grep -rln 'import faker|from faker'` (zero hits before this file), it was
never actually imported anywhere in `ury`. These builders are the first real
usage.

Each `make_*` function is idempotent w.r.t. its unique key (name/email/item
code) where the underlying doctype allows a natural lookup, and takes
`**overrides` so callers can pin values a specific test asserts on (e.g. the
insight tests need real branch names, not fully-random ones) while
delegating everything else to Faker so tests stop hand-rolling filler
values.

Usage:

    from ury.ury.tests.factories import make_branch, make_customer, make_item, make_pos_profile

    branch = make_branch(branch="Test Branch")
    customer = make_customer()
    item = make_item(item_group="Products")
"""

from __future__ import annotations

import frappe

try:
	from faker import Faker
except ImportError:  # pragma: no cover - only missing if frappe[test] wasn't installed
	Faker = None

_fake = Faker() if Faker is not None else None


def _faker():
	if _fake is None:
		raise RuntimeError(
			"Faker is not installed. Install test extras first: "
			"pip install -e 'apps/frappe[test]' (see .github/workflows/test.yml)."
		)
	return _fake


def make_branch(**overrides) -> "frappe.Document":
	"""Get-or-create a Branch record.

	Branch has no fixture records on a fresh test site (only created by the
	setup wizard, which CI's/local test bootstrap does not run for every
	doctype -- see `ury/install.py`'s `before_tests`). Several existing test
	files (`test_ury_insight.py`, `test_ury_sales_plan.py`,
	`test_ury_production_department.py`, ...) each reimplement this same
	"insert if missing, ignore_mandatory for the custom `user` child table"
	pattern; this factory replaces that duplication.
	"""
	branch_name = overrides.pop("branch", None) or _faker().city()
	if frappe.db.exists("Branch", branch_name):
		return frappe.get_doc("Branch", branch_name)

	doc = frappe.get_doc({
		"doctype": "Branch",
		"branch": branch_name,
		**overrides,
	})
	# ury's custom "user" child table on Branch is mandatory, but most
	# callers don't care about branch-user assignment -- same trade-off the
	# hand-rolled call sites already made.
	doc.flags.ignore_mandatory = True
	doc.insert(ignore_permissions=True)
	return doc


def make_customer(**overrides) -> "frappe.Document":
	"""Get-or-create a Customer record with Faker-generated identity fields.

	`ury_customer.py`'s `validate()` hook only fires on
	`has_value_changed("mobile_number")` (see TRACK.md's Phase 0 note on this
	hook), so a factory-created Customer with a stable mobile number across
	calls in the same test is safe against that hook by construction.
	"""
	customer_name = overrides.pop("customer_name", None) or _faker().name()
	if frappe.db.exists("Customer", customer_name):
		return frappe.get_doc("Customer", customer_name)

	fields = {
		"doctype": "Customer",
		"customer_name": customer_name,
		"customer_type": "Individual",
		"customer_group": overrides.pop("customer_group", None) or "Individual",
		"territory": overrides.pop("territory", None) or "All Territories",
		"mobile_no": overrides.pop("mobile_no", None) or _faker().numerify("9#########"),
	}
	fields.update(overrides)
	doc = frappe.get_doc(fields)
	doc.insert(ignore_permissions=True, ignore_mandatory=True)
	return doc


def make_item(**overrides) -> "frappe.Document":
	"""Get-or-create a stock Item record with a Faker-generated name/code."""
	item_code = overrides.pop("item_code", None) or f"TEST-ITEM-{_faker().unique.random_number(digits=6)}"
	if frappe.db.exists("Item", item_code):
		return frappe.get_doc("Item", item_code)

	fields = {
		"doctype": "Item",
		"item_code": item_code,
		"item_name": overrides.pop("item_name", None) or _faker().word().title(),
		"item_group": overrides.pop("item_group", None) or "All Item Groups",
		"stock_uom": overrides.pop("stock_uom", None) or "Nos",
		"is_stock_item": overrides.pop("is_stock_item", 1),
	}
	fields.update(overrides)
	doc = frappe.get_doc(fields)
	doc.insert(ignore_permissions=True, ignore_mandatory=True)
	return doc


def make_pos_profile(**overrides) -> "frappe.Document":
	"""Get-or-create a POS Profile, defaulting to a factory-made Branch/Company.

	POS Profile is the entry point for financial write-path tests
	(`sub_pos_closing`, order/invoice creation) per TRACK.md's Phase 2
	convention split -- those need real fixture records, not mocks.
	"""
	profile_name = overrides.pop("name", None) or f"Test POS Profile {_faker().unique.random_number(digits=5)}"
	if frappe.db.exists("POS Profile", profile_name):
		return frappe.get_doc("POS Profile", profile_name)

	company = overrides.pop("company", None) or (
		frappe.db.get_value("Company", {}, "name") or "_Test Company"
	)
	warehouse = overrides.pop("warehouse", None) or frappe.db.get_value(
		"Warehouse", {"company": company}, "name"
	)

	fields = {
		"doctype": "POS Profile",
		"name": profile_name,
		"company": company,
		"warehouse": warehouse,
		"currency": overrides.pop("currency", None) or "INR",
	}
	fields.update(overrides)
	doc = frappe.get_doc(fields)
	doc.insert(ignore_permissions=True, ignore_mandatory=True)
	return doc


def make_user(email: str | None = None, roles: list[str] | None = None, **overrides) -> "frappe.Document":
	"""Get-or-recreate a test User with the given roles.

	Mirrors the `_create_test_user` helper duplicated in
	`test_ury_insight.py` and similar files: delete-then-recreate so a test's
	role list is authoritative each run, rather than accumulating roles
	across test runs on a long-lived site.
	"""
	email = email or _faker().unique.email()
	if frappe.db.exists("User", email):
		frappe.delete_doc("User", email, force=True, ignore_permissions=True)

	fields = {
		"doctype": "User",
		"email": email,
		"first_name": overrides.pop("first_name", None) or _faker().first_name(),
		"send_welcome_email": 0,
		"enabled": 1,
	}
	fields.update(overrides)
	user = frappe.get_doc(fields).insert(ignore_permissions=True)
	for role in roles or []:
		user.add_roles(role)
	return user
