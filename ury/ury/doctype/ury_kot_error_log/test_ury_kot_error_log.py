# Copyright (c) 2023, Tridz Technologies Pvt. Ltd. and Contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_kot_validation import get_kot_errors

TEST_CASHIER = "_test_kot_error_cashier@example.com"
BRANCH_A = "_Test KOT Error Branch A"
BRANCH_B = "_Test KOT Error Branch B"
POS_PROFILE = "_Test KOT Error POS Profile"

KOT_A = "_TEST-KOTERR-A"
KOT_B = "_TEST-KOTERR-B"
KOT_LEGACY = "_TEST-KOTERR-LEGACY"


class TestURYKOTErrorLog(FrappeTestCase):
	pass


class TestGetKOTErrors(FrappeTestCase):
	"""Branch scoping of ``get_kot_errors``.

	These tests run under a *real* session for a least-privileged user
	(``URY Cashier`` only, which is the weakest role with read access on
	``URY KOT Error Log``) rather than a mocked session, so that the
	``frappe.get_all`` call inside ``get_kot_errors`` is exercised with real
	permission checks. ``getBranch()`` is likewise not mocked: the cashier is
	registered in the Branch A ``URY User`` child table, so the session branch
	is resolved the same way it is in production.
	"""

	def setUp(self):
		frappe.set_user("Administrator")
		self._create_cashier()
		self._create_branches()
		self._create_pos_profile()
		self._create_error_logs()

	def tearDown(self):
		frappe.set_user("Administrator")
		for kot in (KOT_A, KOT_B, KOT_LEGACY):
			for name in frappe.get_all(
				"URY KOT Error Log", filters={"kot": kot}, pluck="name"
			):
				frappe.delete_doc(
					"URY KOT Error Log", name, force=True, ignore_permissions=True
				)

		if frappe.db.exists("POS Profile", POS_PROFILE):
			frappe.delete_doc(
				"POS Profile", POS_PROFILE, force=True, ignore_permissions=True
			)

		for branch in (BRANCH_A, BRANCH_B):
			if frappe.db.exists("Branch", branch):
				frappe.delete_doc("Branch", branch, force=True, ignore_permissions=True)

		if frappe.db.exists("User", TEST_CASHIER):
			frappe.delete_doc("User", TEST_CASHIER, force=True, ignore_permissions=True)

	# ------------------------------------------------------------------ setup

	def _create_cashier(self):
		"""A real User carrying only the URY Cashier role.

		``URY KOT Error Log`` grants read to System Manager / URY Manager /
		URY Captain / URY Cashier only, and ``get_kot_errors`` queries without
		``ignore_permissions``. Without this provisioning the query would return
		nothing and the "Branch B is not visible" assertions would pass for the
		wrong reason.
		"""
		if frappe.db.exists("User", TEST_CASHIER):
			frappe.delete_doc("User", TEST_CASHIER, force=True, ignore_permissions=True)

		user = frappe.get_doc(
			{
				"doctype": "User",
				"email": TEST_CASHIER,
				"first_name": "Test KOT Error Cashier",
				"send_welcome_email": 0,
				"enabled": 1,
			}
		).insert(ignore_permissions=True)
		user.add_roles("URY Cashier")

		roles = set(frappe.get_roles(TEST_CASHIER))
		self.assertNotIn("System Manager", roles)
		self.assertNotIn("URY Manager", roles)

		# No User Permission records are created for this user, so any branch
		# scoping observed in the assertions below comes from get_kot_errors'
		# own filter rather than from a permission-side restriction.
		self.assertFalse(
			frappe.get_all("User Permission", filters={"user": TEST_CASHIER}, limit=1)
		)

	def _create_branches(self):
		for branch, member in ((BRANCH_A, TEST_CASHIER), (BRANCH_B, "Administrator")):
			if frappe.db.exists("Branch", branch):
				frappe.delete_doc("Branch", branch, force=True, ignore_permissions=True)

			frappe.get_doc(
				{
					"doctype": "Branch",
					"branch": branch,
					"user": [{"user": member}],
				}
			).insert(ignore_permissions=True)

	def _create_pos_profile(self):
		"""Clone an existing POS Profile and re-point it at Branch A.

		POS Profile carries a long tail of mandatory links (company, warehouse,
		cost center, write-off accounts, payment methods). Cloning an existing
		profile is far more robust than reconstructing that graph here.
		"""
		source = frappe.get_all("POS Profile", limit=1, pluck="name")
		if not source:
			self.skipTest("No POS Profile exists on this site to clone from.")

		if frappe.db.exists("POS Profile", POS_PROFILE):
			frappe.delete_doc(
				"POS Profile", POS_PROFILE, force=True, ignore_permissions=True
			)

		profile = frappe.copy_doc(frappe.get_doc("POS Profile", source[0]))
		# Avoid clashing with the source profile's default-per-user validation.
		profile.applicable_for_users = []
		profile.disabled = 1
		profile.branch = BRANCH_A
		profile.insert(ignore_permissions=True, set_name=POS_PROFILE)

		# The branch field is a fetched/custom field, so force it after insert.
		frappe.db.set_value("POS Profile", POS_PROFILE, "branch", BRANCH_A)
		self.assertEqual(
			frappe.db.get_value("POS Profile", POS_PROFILE, "branch"), BRANCH_A
		)

	def _create_error_logs(self):
		rows = (
			(KOT_A, "_TEST-KOTERR-INV-A", BRANCH_A),
			(KOT_B, "_TEST-KOTERR-INV-B", BRANCH_B),
			(KOT_LEGACY, "_TEST-KOTERR-INV-LEGACY", None),
		)
		for kot, invoice, branch in rows:
			frappe.get_doc(
				{
					"doctype": "URY KOT Error Log",
					"kot": kot,
					"invoice": invoice,
					"branch": branch,
					"pos_profile": POS_PROFILE,
				}
			).insert(ignore_permissions=True)

		# The legacy row must genuinely have a NULL/empty branch on disk.
		self.assertFalse(
			frappe.db.get_value("URY KOT Error Log", {"kot": KOT_LEGACY}, "branch")
		)

	def _errors_as_cashier(self):
		frappe.set_user(TEST_CASHIER)
		try:
			return {row["kot"] for row in get_kot_errors(POS_PROFILE)}
		finally:
			frappe.set_user("Administrator")

	# ------------------------------------------------------------------ tests

	def test_cashier_sees_own_branch_rows(self):
		"""Control: the cashier session really can read its own branch's rows."""
		self.assertIn(KOT_A, self._errors_as_cashier())

	def test_branch_a_user_does_not_see_branch_b_rows(self):
		result = self._errors_as_cashier()
		self.assertIn(KOT_A, result)
		self.assertNotIn(KOT_B, result)

	def test_branch_b_row_is_readable_but_filtered_out(self):
		"""The Branch B row is hidden by the branch filter, not by permissions.

		Read directly under the cashier's own session first: if that row is
		visible there but absent from get_kot_errors' output, the exclusion is
		attributable to the branch filter alone.
		"""
		frappe.set_user(TEST_CASHIER)
		try:
			readable = frappe.get_all(
				"URY KOT Error Log", filters={"kot": KOT_B}, pluck="kot"
			)
		finally:
			frappe.set_user("Administrator")

		self.assertEqual(readable, [KOT_B])
		self.assertNotIn(KOT_B, self._errors_as_cashier())

	def test_legacy_null_branch_rows_are_excluded(self):
		frappe.set_user(TEST_CASHIER)
		try:
			readable = frappe.get_all(
				"URY KOT Error Log", filters={"kot": KOT_LEGACY}, pluck="kot"
			)
		finally:
			frappe.set_user("Administrator")

		self.assertEqual(readable, [KOT_LEGACY])
		self.assertNotIn(KOT_LEGACY, self._errors_as_cashier())

	def test_result_rows_expose_expected_fields(self):
		frappe.set_user(TEST_CASHIER)
		try:
			results = get_kot_errors(POS_PROFILE)
		finally:
			frappe.set_user("Administrator")

		self.assertTrue(results, "Expected at least the Branch A row")
		for row in results:
			for field in (
				"kot",
				"invoice",
				"invoice_creation_time",
				"production",
				"date",
				"time",
			):
				self.assertIn(field, row)
