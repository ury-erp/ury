# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt
#
# sa-comprehensive-test-strategy, Phase 2 — session-token-based customer
# endpoints of `ury/ury/api/self_ordering.py`:
#
#   get_ordering_context / get_customer_menu / get_customer_product /
#   get_order_status
#
# Why this file is an INTEGRATION test (real records) rather than the mocked
# `unittest.TestCase` style of the sibling `test_self_ordering.py`:
#
# every one of these four functions is gated by `_resolve_session()`, whose
# whole security value lives in real DB state — a sha256 token-hash lookup
# filtered on `status == "Active"`, an `expires_at` comparison that FLIPS the
# stored row to "Expired" on read, and a sliding-window `expires_at` rewrite
# on every successful call. Mocking `frappe.db.get_value`/`frappe.get_doc`
# around that turns the gate into a tautology: you end up asserting that a
# MagicMock returned what you told it to. A previous round of this track
# explicitly deferred these four functions for exactly that reason ("need a
# simulated verified URY Ordering Session"). This file builds the real thing.
#
# How a session is really established (read off the module source):
#   1. `get_ordering_context(token=...)` verifies an HMAC-signed QR token
#      (`_verify_qr_token`) or a device credential (`_resolve_device`), then
#   2. `_open_session()` mints `frappe.generate_hash(length=64)` as the RAW
#      token, persists ONLY `sha256(raw).hexdigest()` as `token_hash` on a
#      new `URY Ordering Session` (status "Active", `expires_at = now +
#      profile.session_idle_timeout_minutes`), commits, and returns the raw
#      token to the client.
#   There is no separate "verified" flag: a session is verified iff a row
#   exists whose `token_hash` matches AND `status == "Active"` AND
#   `expires_at` is in the future. That tri-state IS the verification state.
#
# So the happy-path sessions here are minted by driving the REAL entry point
# (`get_ordering_context` with a real `generate_qr_token()` token) — no
# shortcut. The *negative* states (already-Expired, Closed, past-`expires_at`)
# are produced by inserting/updating a session row directly at that state via
# the frappe API, because the only supported way to reach them through the
# public API is to wait out a wall-clock idle timeout, which a test cannot do.
# That is a deliberate, narrow shortcut on the CLOCK, not on the auth check:
# the token hashing, the status filter and the expiry comparison under test
# all still run for real against a real row.

import base64
import hashlib

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_to_date, now_datetime

from ury.ury.api.self_ordering import (
	_sign,
	generate_qr_token,
	get_customer_menu,
	get_customer_product,
	get_order_status,
	get_ordering_context,
)
from ury.ury.tests.factories import make_branch, make_customer, make_item, make_pos_profile


def _forge_qr_token(profile, table):
	"""Build a correctly-signed QR token for (profile, table) using the
	profile's own secret — used to test the *server-side* branch-membership
	check independently of `generate_qr_token()`'s own caller-side one."""
	secret = frappe.db.get_value("URY Self Ordering Profile", profile, "qr_signing_secret")
	payload = f"{profile}|{table or 'PICKUP'}"
	raw = f"{payload}|{_sign(payload, secret)}"
	return base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")


class SelfOrderingSessionFixtures(FrappeTestCase):
	"""Two complete, independent self-ordering restaurants (branch A and
	branch B) so cross-branch/cross-table token misuse can be tested for
	real rather than asserted against a mock."""

	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		frappe.set_user("Administrator")
		cls.company = frappe.db.get_value("Company", {}, "name")
		cls.cost_center = frappe.db.get_value(
			"Cost Center", {"company": cls.company, "is_group": 0}, "name"
		)
		cls.mode_of_payment = (
			"Cash" if frappe.db.exists("Mode of Payment", "Cash")
			else frappe.db.get_value("Mode of Payment", {}, "name")
		)

		cls.a = cls._make_restaurant("SelfOrdA")
		cls.b = cls._make_restaurant("SelfOrdB")

	@classmethod
	def _make_restaurant(cls, tag):
		"""One branch + room + menu(+1 item) + restaurant + table + self
		ordering profile. Returns a dict of the created names."""
		branch = make_branch(branch=f"{tag} Branch").name

		room = frappe.db.get_value("URY Room", {"branch": branch}, "name")
		if not room:
			room = frappe.get_doc({
				"doctype": "URY Room",
				"name": f"{tag} Room",
				"branch": branch,
				"room_type": "AC",
			}).insert(ignore_permissions=True, ignore_mandatory=True).name

		item = make_item(
			item_code=f"{tag}-DISH",
			item_name=f"{tag} Dish",
			description=f"{tag} dish description",
			image=f"/files/{tag}.png",
			is_stock_item=0,
		)

		price_list = f"{tag} Price List"
		if not frappe.db.exists("Price List", price_list):
			frappe.get_doc({
				"doctype": "Price List",
				"price_list_name": price_list,
				"selling": 1,
				"enabled": 1,
				"currency": "INR",
			}).insert(ignore_permissions=True, ignore_mandatory=True)

		menu_name = f"{tag} Menu"
		if not frappe.db.exists("URY Menu", menu_name):
			frappe.get_doc({
				"doctype": "URY Menu",
				"name": menu_name,
				"enabled": 1,
				"branch": branch,
				"price_list": price_list,
				"items": [{
					"item": item.name,
					"item_name": item.item_name,
					"rate": 120,
				}],
			}).insert(ignore_permissions=True, ignore_mandatory=True)

		restaurant = f"{tag} Restaurant"
		if not frappe.db.exists("URY Restaurant", restaurant):
			frappe.get_doc({
				"doctype": "URY Restaurant",
				"name": restaurant,
				"company": cls.company,
				"invoice_series_prefix": tag.upper(),
				"branch": branch,
				"default_room": room,
				"active_menu": menu_name,
			}).insert(ignore_permissions=True, ignore_mandatory=True)

		table = f"{tag} Table 1"
		if not frappe.db.exists("URY Table", table):
			frappe.get_doc({
				"doctype": "URY Table",
				"name": table,
				"restaurant": restaurant,
				"restaurant_room": room,
				"branch": branch,
				"no_of_seats": 4,
			}).insert(ignore_permissions=True, ignore_mandatory=True)

		# ERPNext's POS Profile.validate() requires at least one payment
		# method — the factory's `ignore_mandatory` does not bypass validate().
		pos_profile = make_pos_profile(
			name=f"{tag} POS Profile",
			company=cls.company,
			payments=[{"mode_of_payment": cls.mode_of_payment, "default": 1}],
			cost_center=cls.cost_center,
		).name
		customer = make_customer(customer_name=f"{tag} Walkin").name

		profile = f"{tag} Ordering Profile"
		if not frappe.db.exists("URY Self Ordering Profile", profile):
			frappe.get_doc({
				"doctype": "URY Self Ordering Profile",
				"name": profile,
				"profile_name": profile,
				"restaurant": restaurant,
				"branch": branch,
				"pos_profile": pos_profile,
				"default_customer": customer,
				"enabled": 1,
				"enable_qr_table_ordering": 1,
				"enable_qr_pickup_ordering": 1,
				"enable_product_detail_page": 1,
				"show_item_images": 1,
				"show_item_descriptions": 1,
				"enable_request_bill": 1,
				"session_idle_timeout_minutes": 30,
				"qr_signing_secret": f"{tag}-signing-secret",
			}).insert(ignore_permissions=True, ignore_mandatory=True)

		return {
			"branch": branch, "room": room, "item": item.name, "menu": menu_name,
			"restaurant": restaurant, "table": table, "profile": profile,
			"pos_profile": pos_profile, "customer": customer, "price_list": price_list,
		}

	# -- session helpers ---------------------------------------------------

	def open_real_session(self, ctx=None, table=True):
		"""Mint a session the way a real customer does: a real staff-issued
		QR token -> get_ordering_context(). Returns (raw_session_token,
		context_dict)."""
		ctx = ctx or self.a
		token = generate_qr_token(ctx["profile"], ctx["table"] if table else None)
		response = get_ordering_context(token=token)
		return response["session"], response

	def session_doc(self, raw_token):
		token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
		name = frappe.db.get_value("URY Ordering Session", {"token_hash": token_hash}, "name")
		self.assertIsNotNone(name, "no URY Ordering Session row for this token")
		return frappe.get_doc("URY Ordering Session", name)

	def insert_session_at_state(self, ctx=None, status="Active", expires_in_minutes=30, table=True, invoice=None):
		"""Insert a session row directly at a given verification state.

		Used only for states unreachable through the public API inside a
		test's lifetime (already-Expired / Closed / past `expires_at`); the
		row is otherwise byte-identical in shape to what `_open_session()`
		writes, including the sha256-of-raw token hash.
		"""
		ctx = ctx or self.a
		raw = frappe.generate_hash(length=64)
		doc = frappe.get_doc({
			"doctype": "URY Ordering Session",
			"ordering_profile": ctx["profile"],
			"source": "QR Table" if table else "QR Pickup",
			"table": ctx["table"] if table else None,
			"token_hash": hashlib.sha256(raw.encode()).hexdigest(),
			"status": status,
			"opened_at": now_datetime(),
			"expires_at": add_to_date(now_datetime(), minutes=expires_in_minutes),
			"last_activity": now_datetime(),
			"invoice": invoice,
		}).insert(ignore_permissions=True)
		return raw, doc


# ---------------------------------------------------------------------------
# get_ordering_context — the function that CREATES the session
# ---------------------------------------------------------------------------

class TestGetOrderingContext(SelfOrderingSessionFixtures):
	def test_qr_table_token_opens_a_real_active_session(self):
		token = generate_qr_token(self.a["profile"], self.a["table"])
		response = get_ordering_context(token=token)

		self.assertTrue(response["session"])
		self.assertEqual(response["source"], "QR Table")
		self.assertEqual(response["table"], self.a["table"])
		self.assertEqual(response["restaurant"], self.a["restaurant"])
		self.assertEqual(response["company"], frappe.db.get_value("Branch", self.a["branch"], "company"))
		self.assertEqual(response["layout"], "Mobile")
		self.assertEqual(response["session_idle_timeout_minutes"], 30)

		# The raw token is never persisted — only its sha256.
		session = self.session_doc(response["session"])
		self.assertEqual(session.status, "Active")
		self.assertEqual(session.source, "QR Table")
		self.assertEqual(session.table, self.a["table"])
		self.assertEqual(session.ordering_profile, self.a["profile"])
		self.assertIsNone(session.invoice)
		self.assertNotEqual(session.token_hash, response["session"])
		self.assertEqual(
			session.token_hash,
			hashlib.sha256(response["session"].encode()).hexdigest(),
		)
		self.assertGreater(session.expires_at, now_datetime())

	def test_capabilities_reflect_profile_flags(self):
		_, response = self.open_real_session()
		caps = response["capabilities"]
		self.assertTrue(caps["product_detail_enabled"])
		self.assertTrue(caps["show_item_images"])
		self.assertTrue(caps["show_item_descriptions"])
		# enable_request_bill is on AND this is a table session
		self.assertTrue(caps["request_bill_enabled"])
		# defaults that are off on the profile doctype
		self.assertFalse(caps["customer_payment_enabled"])
		self.assertFalse(caps["payment_link_enabled"])

	def test_pickup_token_opens_a_tableless_session(self):
		token = generate_qr_token(self.a["profile"], None)
		response = get_ordering_context(token=token)

		self.assertEqual(response["source"], "QR Pickup")
		self.assertIsNone(response["table"])
		# request_bill_enabled is AND-ed with `bool(table)` -> False for pickup
		self.assertFalse(response["capabilities"]["request_bill_enabled"])

		session = self.session_doc(response["session"])
		self.assertEqual(session.source, "QR Pickup")
		self.assertFalse(session.table)

	def test_no_token_and_no_device_credentials_rejected(self):
		with self.assertRaises(frappe.PermissionError):
			get_ordering_context()

	def test_device_id_without_credential_rejected(self):
		# Only `device_id AND device_credential` takes the device branch;
		# a half-supplied pair must fall through to the same rejection.
		with self.assertRaises(frappe.PermissionError):
			get_ordering_context(device_id="kiosk-1")

	def test_garbage_token_rejected(self):
		with self.assertRaises(frappe.PermissionError):
			get_ordering_context(token="not-a-real-token")

	def test_tampered_signature_rejected(self):
		token = generate_qr_token(self.a["profile"], self.a["table"])
		raw = base64.urlsafe_b64decode((token + "=" * (-len(token) % 4)).encode()).decode()
		payload, _signature = raw.rsplit("|", 1)
		forged = base64.urlsafe_b64encode(
			f"{payload}|{'0' * 64}".encode()
		).decode().rstrip("=")
		with self.assertRaises(frappe.PermissionError):
			get_ordering_context(token=forged)

	def test_token_signed_with_another_restaurants_secret_rejected(self):
		"""Cross-restaurant misuse: branch B's secret cannot authorize a
		branch A profile/table pair."""
		payload = f"{self.a['profile']}|{self.a['table']}"
		b_secret = frappe.db.get_value("URY Self Ordering Profile", self.b["profile"], "qr_signing_secret")
		forged = base64.urlsafe_b64encode(
			f"{payload}|{_sign(payload, b_secret)}".encode()
		).decode().rstrip("=")
		with self.assertRaises(frappe.PermissionError):
			get_ordering_context(token=forged)

	def test_cross_branch_table_token_rejected(self):
		"""A *correctly signed* profile-A token naming branch B's table must
		still be rejected by `_verify_qr_token`'s own branch-membership
		re-check — the defense that does not depend on whoever minted it."""
		forged = _forge_qr_token(self.a["profile"], self.b["table"])
		with self.assertRaises(frappe.ValidationError):
			get_ordering_context(token=forged)

	def test_nonexistent_table_token_rejected(self):
		forged = _forge_qr_token(self.a["profile"], "No Such Table 999")
		with self.assertRaises(frappe.ValidationError):
			get_ordering_context(token=forged)

	def test_disabled_profile_rejected(self):
		token = generate_qr_token(self.a["profile"], self.a["table"])
		frappe.db.set_value("URY Self Ordering Profile", self.a["profile"], "enabled", 0)
		try:
			with self.assertRaises(frappe.ValidationError):
				get_ordering_context(token=token)
		finally:
			frappe.db.set_value("URY Self Ordering Profile", self.a["profile"], "enabled", 1)

	def test_table_ordering_disabled_rejects_table_token(self):
		token = generate_qr_token(self.a["profile"], self.a["table"])
		frappe.db.set_value("URY Self Ordering Profile", self.a["profile"], "enable_qr_table_ordering", 0)
		try:
			with self.assertRaises(frappe.ValidationError):
				get_ordering_context(token=token)
		finally:
			frappe.db.set_value("URY Self Ordering Profile", self.a["profile"], "enable_qr_table_ordering", 1)

	def test_pickup_ordering_disabled_rejects_pickup_token(self):
		token = generate_qr_token(self.a["profile"], None)
		frappe.db.set_value("URY Self Ordering Profile", self.a["profile"], "enable_qr_pickup_ordering", 0)
		try:
			with self.assertRaises(frappe.ValidationError):
				get_ordering_context(token=token)
		finally:
			frappe.db.set_value("URY Self Ordering Profile", self.a["profile"], "enable_qr_pickup_ordering", 1)

	def test_each_scan_opens_a_distinct_session(self):
		first, _ = self.open_real_session()
		second, _ = self.open_real_session()
		self.assertNotEqual(first, second)
		self.assertNotEqual(self.session_doc(first).name, self.session_doc(second).name)


# ---------------------------------------------------------------------------
# The shared `_resolve_session()` gate, exercised through every endpoint
# ---------------------------------------------------------------------------

class TestSessionGate(SelfOrderingSessionFixtures):
	ENDPOINTS = (get_customer_menu, get_order_status)

	def test_missing_session_token_rejected_on_every_endpoint(self):
		for fn in self.ENDPOINTS:
			with self.subTest(endpoint=fn.__name__):
				with self.assertRaises(frappe.PermissionError):
					fn(None)
		with self.assertRaises(frappe.PermissionError):
			get_customer_product(None, self.a["item"])

	def test_unknown_session_token_rejected_on_every_endpoint(self):
		bogus = frappe.generate_hash(length=64)
		for fn in self.ENDPOINTS:
			with self.subTest(endpoint=fn.__name__):
				with self.assertRaises(frappe.PermissionError):
					fn(bogus)
		with self.assertRaises(frappe.PermissionError):
			get_customer_product(bogus, self.a["item"])

	def test_token_hash_is_not_accepted_as_the_token(self):
		"""Handing back the STORED hash must not authenticate — the lookup
		hashes whatever it is given, so only the raw pre-image works."""
		raw, _response = self.open_real_session()
		stored_hash = hashlib.sha256(raw.encode()).hexdigest()
		with self.assertRaises(frappe.PermissionError):
			get_order_status(stored_hash)

	def test_expired_status_session_rejected(self):
		raw, _doc = self.insert_session_at_state(status="Expired")
		with self.assertRaises(frappe.PermissionError):
			get_order_status(raw)

	def test_closed_status_session_rejected(self):
		raw, _doc = self.insert_session_at_state(status="Closed")
		with self.assertRaises(frappe.PermissionError):
			get_order_status(raw)

	def test_past_expiry_session_rejected_and_flipped_to_expired(self):
		"""An Active row whose `expires_at` has passed is rejected AND the
		stored row is durably marked Expired, so it can never be replayed."""
		raw, doc = self.insert_session_at_state(status="Active", expires_in_minutes=-5)
		self.assertEqual(doc.status, "Active")

		with self.assertRaises(frappe.PermissionError):
			get_order_status(raw)

		self.assertEqual(
			frappe.db.get_value("URY Ordering Session", doc.name, "status"), "Expired"
		)
		# and it stays rejected on a retry, now via the status filter
		with self.assertRaises(frappe.PermissionError):
			get_order_status(raw)

	def test_successful_call_slides_the_expiry_window(self):
		raw, _doc = self.insert_session_at_state(status="Active", expires_in_minutes=1)
		before = frappe.db.get_value("URY Ordering Session", self.session_doc(raw).name, "expires_at")

		get_order_status(raw)

		after = frappe.db.get_value("URY Ordering Session", self.session_doc(raw).name, "expires_at")
		self.assertGreater(after, before)
		# extended to the profile's configured idle timeout, not the old value
		self.assertGreater(after, add_to_date(now_datetime(), minutes=25))


# ---------------------------------------------------------------------------
# get_customer_menu
# ---------------------------------------------------------------------------

class TestGetCustomerMenu(SelfOrderingSessionFixtures):
	def test_table_session_returns_its_own_branch_menu(self):
		raw, _response = self.open_real_session(self.a)
		menu = get_customer_menu(raw)

		self.assertEqual(menu["name"], self.a["menu"])
		codes = {row["item"] for row in menu["items"]}
		self.assertIn(self.a["item"], codes)
		self.assertNotIn(self.b["item"], codes)

	def test_cross_branch_session_cannot_see_the_other_branchs_menu(self):
		"""Branch B's session token must resolve to branch B's menu — a
		session is scoped by the profile recorded on the session row, never
		by anything the caller supplies."""
		raw_b, _response = self.open_real_session(self.b)
		menu = get_customer_menu(raw_b)

		self.assertEqual(menu["name"], self.b["menu"])
		codes = {row["item"] for row in menu["items"]}
		self.assertIn(self.b["item"], codes)
		self.assertNotIn(self.a["item"], codes)

	def test_pickup_session_also_resolves_a_menu(self):
		raw, response = self.open_real_session(self.a, table=False)
		self.assertIsNone(response["table"])
		menu = get_customer_menu(raw)
		self.assertEqual(menu["name"], self.a["menu"])

	def test_menu_rows_carry_only_customer_safe_fields(self):
		raw, _response = self.open_real_session()
		row = next(r for r in get_customer_menu(raw)["items"] if r["item"] == self.a["item"])
		self.assertEqual(
			set(row),
			{"item", "item_name", "rate", "special_dish", "disabled", "item_image", "course", "course_label"},
		)

	def test_expired_session_cannot_read_the_menu(self):
		raw, _doc = self.insert_session_at_state(status="Active", expires_in_minutes=-1)
		with self.assertRaises(frappe.PermissionError):
			get_customer_menu(raw)

	def test_guest_user_is_restored_after_the_elevated_block(self):
		"""`_elevated()` must never leak Administrator into the caller's
		session — the whole module's trust model depends on that."""
		raw, _response = self.open_real_session()
		frappe.set_user("Guest")
		try:
			get_customer_menu(raw)
			self.assertEqual(frappe.session.user, "Guest")
		finally:
			frappe.set_user("Administrator")


# ---------------------------------------------------------------------------
# get_customer_product
# ---------------------------------------------------------------------------

class TestGetCustomerProduct(SelfOrderingSessionFixtures):
	def test_on_menu_item_returned_with_metadata(self):
		raw, _response = self.open_real_session()
		product = get_customer_product(raw, self.a["item"])

		self.assertEqual(product["item_code"], self.a["item"])
		self.assertEqual(product["item_name"], frappe.db.get_value("Item", self.a["item"], "item_name"))
		self.assertEqual(product["description"], frappe.db.get_value("Item", self.a["item"], "description"))
		self.assertEqual(product["image"], frappe.db.get_value("Item", self.a["item"], "image"))
		self.assertEqual(product["variants"], [])
		self.assertEqual(product["addons"], [])

	def test_description_and_image_suppressed_when_profile_hides_them(self):
		raw, _response = self.open_real_session()
		frappe.db.set_value(
			"URY Self Ordering Profile", self.a["profile"],
			{"show_item_descriptions": 0, "show_item_images": 0},
		)
		try:
			product = get_customer_product(raw, self.a["item"])
			self.assertIsNone(product["description"])
			self.assertIsNone(product["image"])
			# the item itself is still resolvable, only the fields are gated
			self.assertEqual(product["item_code"], self.a["item"])
		finally:
			frappe.db.set_value(
				"URY Self Ordering Profile", self.a["profile"],
				{"show_item_descriptions": 1, "show_item_images": 1},
			)

	def test_item_not_on_this_menu_rejected(self):
		"""U12: a guest session must not be able to read metadata for an
		arbitrary Item that simply exists in the system."""
		off_menu = make_item(item_code="SELFORD-OFF-MENU", item_name="Off Menu", is_stock_item=0).name
		raw, _response = self.open_real_session()
		with self.assertRaises(frappe.DoesNotExistError):
			get_customer_product(raw, off_menu)

	def test_other_branchs_item_rejected_for_this_session(self):
		"""Cross-branch read attempt: branch B's real, on-a-menu item is
		still off THIS session's menu and must be refused."""
		raw, _response = self.open_real_session(self.a)
		with self.assertRaises(frappe.DoesNotExistError):
			get_customer_product(raw, self.b["item"])

	def test_nonexistent_item_code_rejected(self):
		raw, _response = self.open_real_session()
		with self.assertRaises(frappe.DoesNotExistError):
			get_customer_product(raw, "NO-SUCH-ITEM-CODE")

	def test_expired_session_cannot_read_a_product(self):
		raw, _doc = self.insert_session_at_state(status="Active", expires_in_minutes=-1)
		with self.assertRaises(frappe.PermissionError):
			get_customer_product(raw, self.a["item"])


# ---------------------------------------------------------------------------
# get_order_status
# ---------------------------------------------------------------------------

class TestGetOrderStatus(SelfOrderingSessionFixtures):
	def _make_invoice(self, ctx, **overrides):
		"""A minimal real POS Invoice row.

		`get_order_status()` reads exactly two fields off it
		(`docstatus`, `invoice_printed`) via `frappe.db.get_value` — it never
		runs ERPNext's invoice logic — so the fixture deliberately skips
		ERPNext's full POS Invoice validate()/before_save chain
		(`flags.ignore_validate`), which would otherwise demand a configured
		payment mode, tax template, warehouse stock and an open POS Opening
		Entry that have nothing to do with the behaviour under test.
		"""
		invoice = frappe.get_doc({
			"doctype": "POS Invoice",
			"naming_series": "ACC-PSINV-.YYYY.-",
			"company": self.company,
			"customer": ctx["customer"],
			"pos_profile": ctx["pos_profile"],
			"items": [{"item_code": ctx["item"], "qty": 1, "rate": 120}],
			**overrides,
		})
		invoice.flags.ignore_validate = True
		invoice.flags.ignore_mandatory = True
		invoice.insert(ignore_permissions=True, ignore_mandatory=True, ignore_links=True)
		return invoice

	def test_session_without_invoice_reports_no_order(self):
		raw, _response = self.open_real_session()
		status = get_order_status(raw)

		self.assertEqual(status["session_status"], "Active")
		self.assertIsNone(status["invoice"])
		# the invoice-dependent keys are only present once there IS an order
		self.assertNotIn("billed", status)
		self.assertNotIn("submitted", status)
		self.assertNotIn("open_requests", status)

	def test_session_with_unbilled_invoice(self):
		invoice = self._make_invoice(self.a)
		raw, _doc = self.insert_session_at_state(invoice=invoice.name)

		status = get_order_status(raw)
		self.assertEqual(status["session_status"], "Active")
		self.assertEqual(status["invoice"], invoice.name)
		self.assertFalse(status["billed"])
		self.assertFalse(status["submitted"])
		self.assertEqual(status["open_requests"], [])

	def test_billed_flag_follows_invoice_printed(self):
		invoice = self._make_invoice(self.a)
		raw, _doc = self.insert_session_at_state(invoice=invoice.name)
		frappe.db.set_value("POS Invoice", invoice.name, "invoice_printed", 1)

		status = get_order_status(raw)
		self.assertTrue(status["billed"])
		self.assertFalse(status["submitted"])

	def test_open_service_requests_are_surfaced_and_resolved_ones_are_not(self):
		invoice = self._make_invoice(self.a)
		raw, session = self.insert_session_at_state(invoice=invoice.name)

		open_req = frappe.get_doc({
			"doctype": "URY Service Request",
			"request_type": "Bill",
			"table": self.a["table"],
			"invoice": invoice.name,
			"session": session.name,
			"status": "Open",
			"requested_at": now_datetime(),
		}).insert(ignore_permissions=True)
		resolved_req = frappe.get_doc({
			"doctype": "URY Service Request",
			"request_type": "Assistance",
			"table": self.a["table"],
			"invoice": invoice.name,
			"session": session.name,
			"status": "Resolved",
			"requested_at": now_datetime(),
		}).insert(ignore_permissions=True)

		status = get_order_status(raw)
		names = {r["name"] for r in status["open_requests"]}
		self.assertIn(open_req.name, names)
		self.assertNotIn(resolved_req.name, names)
		self.assertEqual(
			{r["request_type"] for r in status["open_requests"] if r["name"] == open_req.name},
			{"Bill"},
		)

	def test_status_does_not_leak_another_sessions_order(self):
		"""Two live sessions on the same profile: each sees only the invoice
		recorded on its OWN session row."""
		invoice = self._make_invoice(self.a)
		raw_with, _s1 = self.insert_session_at_state(invoice=invoice.name)
		raw_without, _s2 = self.insert_session_at_state()

		self.assertEqual(get_order_status(raw_with)["invoice"], invoice.name)
		self.assertIsNone(get_order_status(raw_without)["invoice"])

	def test_expired_session_cannot_read_status(self):
		raw, _doc = self.insert_session_at_state(status="Active", expires_in_minutes=-1)
		with self.assertRaises(frappe.PermissionError):
			get_order_status(raw)
