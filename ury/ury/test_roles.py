"""Tests for ury.ury.roles and the endpoints that rely on it."""

from types import SimpleNamespace

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury import roles

DOMAIN = "roles-test.invalid"


def make_user(name, *role_names):
	email = f"{name}@{DOMAIN}"
	if frappe.db.exists("User", email):
		frappe.delete_doc("User", email, force=True, ignore_permissions=True)
	return frappe.get_doc(
		{
			"doctype": "User",
			"email": email,
			"first_name": name,
			"send_welcome_email": 0,
			"roles": [{"role": r} for r in role_names],
		}
	).insert(ignore_permissions=True).name


def profile(billing=(), transfer=(), restricted=()):
	rows = lambda names: [SimpleNamespace(role=n) for n in names]  # noqa: E731
	return frappe._dict(
		role_allowed_for_billing=rows(billing),
		transfer_role_permissions=rows(transfer),
		role_restricted_for_table_order=rows(restricted),
	)


class RolesTestCase(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		previous = frappe.in_test
		frappe.in_test = True  # run user jobs inline instead of queueing them
		self.addCleanup(setattr, frappe, "in_test", previous)
		self.addCleanup(self.cleanup)

	def cleanup(self):
		frappe.set_user("Administrator")
		for email in frappe.get_all("User", filters={"email": ["like", f"%@{DOMAIN}"]}, pluck="name"):
			frappe.delete_doc("User", email, force=True, ignore_permissions=True)
		frappe.db.commit()


class TestLevels(RolesTestCase):
	def test_levels_nest(self):
		self.assertEqual(roles.level(["URY Captain"]), roles.WAITER)
		self.assertEqual(roles.level(["URY Captain", "URY Cashier"]), roles.CASHIER)
		self.assertEqual(roles.level(["URY Manager"]), roles.MANAGER)
		self.assertEqual(roles.level(["URY Admin"]), roles.ADMIN)
		self.assertEqual(roles.level(["System Manager"]), roles.ADMIN)
		self.assertEqual(roles.level(["Sales User"]), 0)

	def test_cashier_and_above_bill_whatever_the_profile_says(self):
		empty = profile()
		self.assertFalse(roles.can_bill(["URY Captain"], empty))
		self.assertTrue(roles.can_bill(["URY Cashier"], empty))
		self.assertTrue(roles.can_bill(["URY Manager"], empty))
		self.assertTrue(roles.can_bill(["URY Admin"], empty))

	def test_profile_tables_only_grant_extra(self):
		self.assertTrue(roles.can_bill(["URY Captain"], profile(billing=["URY Captain"])))
		self.assertTrue(roles.can_manage_tables(["URY Captain"], profile(transfer=["URY Captain"])))
		# A manager is not demoted by being left out of the profile's lists.
		self.assertTrue(roles.can_manage_tables(["URY Manager"], profile(transfer=["URY Admin"])))

	def test_table_order_restriction_still_restricts(self):
		self.assertTrue(roles.is_restricted_from_table_orders(["URY Cashier"], profile(restricted=["URY Cashier"])))

	def test_capabilities_for_each_level(self):
		waiter = roles.pos_capabilities(profile(), make_user("waiter", "URY Captain"))
		cashier = roles.pos_capabilities(profile(), make_user("cashier", "URY Cashier"))
		manager = roles.pos_capabilities(profile(), make_user("manager", "URY Manager"))

		self.assertEqual(waiter["role_label"], "Waiter")
		self.assertFalse(waiter["canSettlePayment"])
		self.assertFalse(waiter["canOpenPOS"])
		self.assertTrue(cashier["canSettlePayment"])
		self.assertTrue(cashier["canOpenPOS"])
		self.assertTrue(cashier["cancelNeedsApproval"])
		self.assertTrue(manager["canTransferCaptain"])
		self.assertFalse(manager["cancelNeedsApproval"])
		self.assertTrue(manager["isManager"])


class TestWhoMayGiveRoles(RolesTestCase):
	def test_assignable_roles(self):
		self.assertEqual(roles.assignable_roles(make_user("waiter", "URY Captain")), [])
		self.assertEqual(roles.assignable_roles(make_user("cashier", "URY Cashier")), [])
		self.assertNotIn("URY Admin", roles.assignable_roles(make_user("manager", "URY Manager")))
		self.assertIn("URY Admin", roles.assignable_roles(make_user("admin", "URY Admin")))
		for user in ("Administrator",):
			self.assertNotIn("System Manager", roles.assignable_roles(user))

	def test_waiter_cannot_create_a_system_manager_through_setup(self):
		from ury.ury.api.minimal.business_setup import create_setup_user

		frappe.set_user(make_user("waiter", "URY Captain"))
		with self.assertRaises(frappe.PermissionError):
			create_setup_user(f"evil@{DOMAIN}", "Evil", "Evil-123456!x", "System Manager")
		frappe.set_user("Administrator")
		self.assertFalse(frappe.db.exists("User", f"evil@{DOMAIN}"))

	def test_manager_cannot_give_admin_roles_through_setup(self):
		from ury.ury.api.minimal.business_setup import create_setup_user

		frappe.set_user(make_user("manager", "URY Manager"))
		for role in ("System Manager", "URY Admin"):
			with self.assertRaises(frappe.PermissionError, msg=role):
				create_setup_user(f"x-{role[:3].lower()}@{DOMAIN}", "X", None, role)
		self.assertEqual(create_setup_user(f"newcash@{DOMAIN}", "C", None, "URY Cashier")["status"], "created")

	def test_only_an_admin_runs_the_restaurant_setup(self):
		from ury.ury.api.minimal.business_setup import submit_configure_data, update_business_setup

		frappe.set_user(make_user("manager", "URY Manager"))
		with self.assertRaises(frappe.PermissionError):
			submit_configure_data({})
		frappe.set_user(make_user("cashier", "URY Cashier"))
		with self.assertRaises(frappe.PermissionError):
			update_business_setup()


class TestStaffEndpoint(RolesTestCase):
	def test_manager_creates_a_cashier_with_the_role_kept(self):
		from ury.ury.api.staff import save_staff_user

		frappe.set_user(make_user("manager", "URY Manager"))
		result = save_staff_user(f"newcashier@{DOMAIN}", "New", "URY Cashier")
		frappe.set_user("Administrator")
		self.assertIn("URY Cashier", frappe.get_roles(result["name"]))

	def test_changing_a_role_replaces_only_the_ury_role(self):
		from ury.ury.api.staff import save_staff_user

		user = make_user("mixed", "URY Captain", "Sales User")
		frappe.set_user(make_user("manager", "URY Manager"))
		save_staff_user(None, "Mixed", "URY Cashier", name=user)
		frappe.set_user("Administrator")
		user_roles = frappe.get_roles(user)
		self.assertIn("URY Cashier", user_roles)
		self.assertNotIn("URY Captain", user_roles)
		self.assertIn("Sales User", user_roles)

	def test_manager_cannot_give_system_manager_or_touch_an_admin(self):
		from ury.ury.api.staff import save_staff_user

		admin = make_user("admin", "URY Admin")
		frappe.set_user(make_user("manager", "URY Manager"))
		with self.assertRaises(frappe.PermissionError):
			save_staff_user(f"boss@{DOMAIN}", "Boss", "System Manager")
		with self.assertRaises(frappe.PermissionError):
			save_staff_user(None, "Demoted", "URY Captain", name=admin)

	def test_cashier_cannot_manage_staff(self):
		from ury.ury.api.staff import save_staff_user

		frappe.set_user(make_user("cashier", "URY Cashier"))
		with self.assertRaises(frappe.PermissionError):
			save_staff_user(f"friend@{DOMAIN}", "Friend", "URY Captain")


class TestDeskAccess(RolesTestCase):
	def test_waiter_and_cashier_have_no_desk_but_managers_do(self):
		self.assertEqual(frappe.db.get_value("Role", "URY Captain", "desk_access"), 0)
		self.assertEqual(frappe.db.get_value("Role", "URY Cashier", "desk_access"), 0)
		self.assertEqual(frappe.db.get_value("Role", "URY Manager", "desk_access"), 1)
		self.assertEqual(frappe.db.get_value("Role", "URY Admin", "desk_access"), 1)

		self.assertEqual(frappe.db.get_value("User", make_user("cashier", "URY Cashier"), "user_type"), "Website User")
		self.assertEqual(frappe.db.get_value("User", make_user("manager", "URY Manager"), "user_type"), "System User")
		# Another Desk role keeps Desk access.
		self.assertEqual(
			frappe.db.get_value("User", make_user("accountant", "URY Cashier", "Accounts User"), "user_type"),
			"System User",
		)
