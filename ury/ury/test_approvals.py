"""Tests for manager approval (ury.ury.approvals).

TestApprovalRules runs on any site with URY. TestApprovalInOrders needs a
working restaurant (open POS session, free table, menu) and writes real
orders that it removes again; run it on a test site only.
"""

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury import approvals
from ury.ury.station.test_utils import new_pin

DOMAIN = "approval-test.invalid"


def make_user(name, *role_names):
	email = f"{name}@{DOMAIN}"
	drop_user(email)
	return frappe.get_doc(
		{"doctype": "User", "email": email, "first_name": name, "send_welcome_email": 0,
		 "roles": [{"role": r} for r in role_names]}
	).insert(ignore_permissions=True).name


def drop_user(email):
	for doctype in ("URY Manager PIN", "URY Waiter PIN"):
		if frappe.db.exists(doctype, email):
			frappe.delete_doc(doctype, email, force=True, ignore_permissions=True)
	frappe.db.delete("URY Order Approval Log", {"requested_by": email})
	frappe.db.delete("URY Order Approval Log", {"approved_by": email})
	for child in ("URY User", "POS Profile User"):
		frappe.db.delete(child, {"user": email})
	if frappe.db.exists("User", email):
		frappe.delete_doc("User", email, force=True, ignore_permissions=True)


def set_manager_pin(user, pin):
	return frappe.get_doc({"doctype": "URY Manager PIN", "user": user, "enabled": 1, "new_pin": pin}).insert()


class ApprovalTestCase(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		previous = frappe.in_test
		frappe.in_test = True  # run user jobs inline instead of queueing them
		self.addCleanup(setattr, frappe, "in_test", previous)
		self.cleanup()
		self.addCleanup(self.cleanup)
		self.manager = make_user("manager", "URY Manager")
		self.manager_pin = new_pin()
		set_manager_pin(self.manager, self.manager_pin)
		self.cashier = make_user("cashier", "URY Cashier")

	def cleanup(self):
		frappe.set_user("Administrator")
		for email in frappe.get_all("User", filters={"email": ["like", f"%@{DOMAIN}"]}, pluck="name"):
			frappe.cache.delete_value(approvals._wrong_pin_key(email))
			frappe.cache.delete_value(approvals._lock_key(email))
			drop_user(email)
		frappe.db.commit()

	def logs(self):
		return frappe.get_all(
			"URY Order Approval Log",
			filters={"requested_by": ["like", f"%@{DOMAIN}"]},
			fields=["action", "requested_by", "approved_by", "reason"],
		)


class TestApprovalRules(ApprovalTestCase):
	def test_cashier_needs_a_manager_pin(self):
		frappe.set_user(self.cashier)
		with self.assertRaises(approvals.ApprovalRequired):
			approvals.approve(approvals.CANCEL_ORDER, None, reason="wrong table")

		approver = approvals.approve(approvals.CANCEL_ORDER, None, reason="wrong table", approval_pin=self.manager_pin)

		self.assertEqual(approver, self.manager)
		frappe.set_user("Administrator")
		self.assertEqual(
			[(l.action, l.requested_by, l.approved_by, l.reason) for l in self.logs()],
			[(approvals.CANCEL_ORDER, self.cashier, self.manager, "wrong table")],
		)

	def test_manager_approves_their_own_action(self):
		frappe.set_user(self.manager)
		self.assertEqual(approvals.approve(approvals.CANCEL_ORDER, None, reason="x"), self.manager)

	def test_wrong_pins_lock_the_requester_out(self):
		frappe.set_user(self.cashier)
		wrong = new_pin()
		for attempt in range(approvals.MAX_WRONG_PINS - 1):
			with self.assertRaises(approvals.ApprovalRequired) as ctx:
				approvals.approve(approvals.CANCEL_ORDER, None, approval_pin=wrong)
			self.assertIn("tries left", str(ctx.exception))
		with self.assertRaises(approvals.ApprovalRequired) as ctx:
			approvals.approve(approvals.CANCEL_ORDER, None, approval_pin=wrong)
		self.assertIn("Too many", str(ctx.exception))
		# Locked: even the right PIN is refused for now.
		with self.assertRaises(approvals.ApprovalRequired):
			approvals.approve(approvals.CANCEL_ORDER, None, approval_pin=self.manager_pin)

	def test_a_waiter_sign_in_pin_cannot_approve(self):
		waiter = make_user("waiter", "URY Captain")
		waiter_pin = new_pin()
		frappe.get_doc({"doctype": "URY Waiter PIN", "user": waiter, "enabled": 1, "new_pin": waiter_pin}).insert()
		frappe.set_user(self.cashier)
		with self.assertRaises(approvals.ApprovalRequired):
			approvals.approve(approvals.CANCEL_ORDER, None, approval_pin=waiter_pin)

	def test_a_demoted_manager_can_no_longer_approve(self):
		frappe.get_doc("User", self.manager).remove_roles("URY Manager")
		frappe.set_user(self.cashier)
		with self.assertRaises(approvals.ApprovalRequired):
			approvals.approve(approvals.CANCEL_ORDER, None, approval_pin=self.manager_pin)

	def test_approval_and_sign_in_pins_never_collide(self):
		waiter = make_user("waiter", "URY Captain")
		with self.assertRaises(frappe.ValidationError):
			frappe.get_doc({"doctype": "URY Waiter PIN", "user": waiter, "enabled": 1, "new_pin": self.manager_pin}).insert()

	def test_only_managers_have_approval_pins(self):
		with self.assertRaises(frappe.ValidationError):
			set_manager_pin(self.cashier, new_pin())

	def test_a_manager_sets_only_their_own_pin(self):
		other = make_user("other", "URY Manager")
		frappe.set_user(self.manager)
		with self.assertRaises(frappe.PermissionError):
			set_manager_pin(other, new_pin())

	def test_pin_is_never_stored(self):
		row = frappe.db.get_value("URY Manager PIN", self.manager, ["new_pin", "pin_hash"], as_dict=True)
		self.assertFalse(row.new_pin)
		self.assertNotIn(self.manager_pin, row.pin_hash)


class TestApprovalInOrders(ApprovalTestCase):
	"""cancel_order and sync_order on a real restaurant."""

	def setUp(self):
		super().setUp()
		from ury.ury.station.test_order_attribution import find_restaurant

		self.restaurant = find_restaurant()
		if not self.restaurant:
			self.skipTest("Needs a POS Profile with an open POS session, a free table and a menu")
		for user in (self.cashier, self.manager):
			for doctype, field in (("Branch", "user"), ("POS Profile", "applicable_for_users")):
				doc = frappe.get_doc(doctype, self.restaurant.branch if doctype == "Branch" else self.restaurant.profile)
				doc.append(field, {"user": user})
				doc.save(ignore_permissions=True)
		self.invoices = []
		self.addCleanup(self.remove_orders)

	def remove_orders(self):
		frappe.set_user("Administrator")
		for invoice in self.invoices:
			for kot in frappe.get_all("URY KOT", filters={"invoice": invoice}, pluck="name"):
				frappe.db.delete("URY KOT Items", {"parent": kot})
				frappe.db.delete("URY KOT", {"name": kot})
			frappe.db.delete("POS Invoice Item", {"parent": invoice})
			frappe.db.delete("POS Invoice", {"name": invoice})
		frappe.db.set_value("URY Table", self.restaurant.table, "occupied", 0, update_modified=False)
		frappe.db.commit()

	def sync(self, qty, invoice=None, **extra):
		from ury.ury.doctype.ury_order.ury_order import sync_order

		item = self.restaurant.item
		result = sync_order(
			items=[{"item": item.item, "item_name": item.item_name, "rate": item.rate, "qty": qty}],
			cashier=self.cashier, owner=self.cashier, mode_of_payment="Cash", no_of_pax=1,
			last_invoice=invoice, waiter=frappe.session.user, pos_profile=self.restaurant.profile,
			table=self.restaurant.table, room=self.restaurant.room, invoice=invoice, order_type="Dine In",
			**extra,
		)
		if invoice is None:
			self.invoices.append(result["name"])
		return result

	def test_cashier_cancels_only_with_a_manager_pin(self):
		from ury.ury.doctype.ury_order.ury_order import cancel_order

		frappe.set_user(self.cashier)
		invoice = self.sync(1)["name"]
		with self.assertRaises(approvals.ApprovalRequired):
			cancel_order(invoice, "customer left")
		self.assertEqual(frappe.db.get_value("POS Invoice", invoice, "docstatus"), 0)

		cancel_order(invoice, "customer left", approval_pin=self.manager_pin)
		self.assertEqual(frappe.db.get_value("POS Invoice", invoice, "docstatus"), 2)
		log = frappe.get_all("URY Order Approval Log", filters={"invoice": invoice}, fields=["approved_by", "action"])
		self.assertEqual([(l.action, l.approved_by) for l in log], [(approvals.CANCEL_ORDER, self.manager)])

	def test_removing_sent_items_needs_approval_but_adding_does_not(self):
		frappe.set_user(self.cashier)
		order = self.sync(2)
		invoice = order["name"]
		self.sync(3, invoice=invoice, last_modified_time=str(frappe.db.get_value("POS Invoice", invoice, "modified")))

		modified = str(frappe.db.get_value("POS Invoice", invoice, "modified"))
		with self.assertRaises(approvals.ApprovalRequired):
			self.sync(1, invoice=invoice, last_modified_time=modified)

		self.sync(1, invoice=invoice, last_modified_time=modified, approval_pin=self.manager_pin, approval_reason="spilled")
		self.assertEqual(frappe.db.get_value("POS Invoice Item", {"parent": invoice}, "qty"), 1)
		log = frappe.get_all("URY Order Approval Log", filters={"invoice": invoice}, fields=["approved_by", "action", "reason"])
		self.assertEqual(
			[(l.action, l.approved_by, l.reason) for l in log], [(approvals.REMOVE_SENT_ITEMS, self.manager, "spilled")]
		)
