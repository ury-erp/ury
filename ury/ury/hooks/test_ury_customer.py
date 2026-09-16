"""Tests for `ury_customer.py`'s hook module -- specifically the
branch-scoped multi-tenancy boundary `_get_current_user_branches()` and the
`validate()` hook that consumes it.

Mock-based unit tests (frappe.db.sql / frappe.session.user), matching the
established pattern in this package (`test_ury_pos_closing_entry.py`,
`test_ury_pos_closing_reconciliation.py`): the behaviour under test is the
branch-resolution/scoping control flow, not a real DB round-trip.

Pinned here (this hook has no prior test of its own -- see TRACK.md Phase 4):

  1. Administrator always resolves to `[]` (no branch scoping applied) --
     this is the multi-tenancy escape hatch for back-office data entry, so
     it must never leak into a real branch list.
  2. A user with no `URY User` row anywhere resolves to `[]`.
  3. A user belonging to exactly one branch resolves to only that branch --
     never a different tenant's branch.
  4. A user belonging to multiple branches resolves to exactly those
     branches, not a superset or subset.
  5. The SQL query is user-scoped by parameter (`WHERE a.user = %s`), so a
     query for one user can never be satisfied by another tenant's row --
     asserted both on the call arguments and by varying the mocked return
     rows per user.
  6. `validate()` only throws for the branches that actually resolved for
     the current user and actually have the alert rule enabled -- a branch
     the user does NOT belong to must never appear in the thrown message
     or gate the save, even if that other branch has the rule enabled.
"""

from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.hooks import ury_customer

MODULE = "ury.ury.hooks.ury_customer"


class _FakeCustomer(frappe._dict):
	def __init__(self, *args, is_new=True, changed_fields=None, **kwargs):
		super().__init__(*args, **kwargs)
		self._is_new = is_new
		self._changed_fields = changed_fields or set()

	def is_new(self):
		return self._is_new

	def has_value_changed(self, fieldname):
		return fieldname in self._changed_fields


class TestGetCurrentUserBranches(FrappeTestCase):
	def setUp(self):
		frappe.flags.in_import = False
		frappe.flags.in_migrate = False
		frappe.flags.in_patch = False
		frappe.flags.in_install = False

	def test_administrator_always_returns_empty_list(self):
		with patch(f"{MODULE}.frappe.session") as mock_session, \
			patch(f"{MODULE}.frappe.db.sql") as mock_sql:
			mock_session.user = "Administrator"
			result = ury_customer._get_current_user_branches()
			self.assertEqual(result, [])
			# Administrator short-circuits before any DB query is issued.
			mock_sql.assert_not_called()

	def test_user_with_no_branch_rows_returns_empty_list(self):
		with patch(f"{MODULE}.frappe.session") as mock_session, \
			patch(f"{MODULE}.frappe.db.sql", return_value=[]) as mock_sql:
			mock_session.user = "nobranch@ury.test"
			result = ury_customer._get_current_user_branches()
			self.assertEqual(result, [])
			mock_sql.assert_called_once()

	def test_single_branch_user_returns_only_that_branch(self):
		with patch(f"{MODULE}.frappe.session") as mock_session, \
			patch(
				f"{MODULE}.frappe.db.sql",
				return_value=[{"branch": "Branch A"}],
			) as mock_sql:
			mock_session.user = "single@ury.test"
			result = ury_customer._get_current_user_branches()
			self.assertEqual(result, ["Branch A"])
			# The query must be parameterized by the current session user --
			# never a hardcoded or wrong-tenant identity.
			args, _ = mock_sql.call_args
			self.assertEqual(args[1], "single@ury.test")

	def test_multi_branch_user_returns_exactly_those_branches(self):
		with patch(f"{MODULE}.frappe.session") as mock_session, \
			patch(
				f"{MODULE}.frappe.db.sql",
				return_value=[{"branch": "Branch A"}, {"branch": "Branch B"}],
			):
			mock_session.user = "multi@ury.test"
			result = ury_customer._get_current_user_branches()
			self.assertEqual(result, ["Branch A", "Branch B"])

	def test_different_users_get_different_scoped_results(self):
		"""Simulates two tenants: querying user A's branches must never
		return user B's branch, and vice versa -- the mock's return value is
		keyed off which user was actually passed to the query, so a
		regression that dropped the WHERE clause (returning all branches
		for everyone) would be caught here."""

		def fake_sql(query, user, as_dict=True):
			data = {
				"tenantA@ury.test": [{"branch": "Branch A"}],
				"tenantB@ury.test": [{"branch": "Branch B"}],
			}
			return data.get(user, [])

		with patch(f"{MODULE}.frappe.session") as mock_session, \
			patch(f"{MODULE}.frappe.db.sql", side_effect=fake_sql):
			mock_session.user = "tenantA@ury.test"
			self.assertEqual(ury_customer._get_current_user_branches(), ["Branch A"])

			mock_session.user = "tenantB@ury.test"
			self.assertEqual(ury_customer._get_current_user_branches(), ["Branch B"])

	def test_rows_with_null_branch_are_filtered_out(self):
		with patch(f"{MODULE}.frappe.session") as mock_session, \
			patch(
				f"{MODULE}.frappe.db.sql",
				return_value=[{"branch": "Branch A"}, {"branch": None}],
			):
			mock_session.user = "partial@ury.test"
			result = ury_customer._get_current_user_branches()
			self.assertEqual(result, ["Branch A"])


class TestValidateHookBranchScoping(FrappeTestCase):
	"""validate() must only throw for branches the current user actually
	belongs to, and only when that branch's alert rule is actually
	triggered -- never for a branch that belongs to a different tenant."""

	def setUp(self):
		frappe.flags.in_import = False
		frappe.flags.in_migrate = False
		frappe.flags.in_patch = False
		frappe.flags.in_install = False

	def test_no_branches_resolved_skips_check_silently(self):
		doc = _FakeCustomer({"mobile_number": None}, is_new=True)
		with patch(f"{MODULE}._get_current_user_branches", return_value=[]), \
			patch(f"{MODULE}.get_alert_rule") as mock_rule:
			ury_customer.validate(doc, "validate")
			mock_rule.assert_not_called()

	def test_throws_only_for_own_branch_when_rule_enabled(self):
		doc = _FakeCustomer({"mobile_number": None}, is_new=True)
		with patch(f"{MODULE}._get_current_user_branches", return_value=["Branch A"]), \
			patch(f"{MODULE}.get_alert_rule", return_value=True):
			with self.assertRaises(frappe.ValidationError) as ctx:
				ury_customer.validate(doc, "validate")
			self.assertIn("Branch A", str(ctx.exception))

	def test_does_not_throw_or_mention_other_tenants_branch(self):
		"""User belongs only to Branch A; even though Branch B (a different
		tenant/branch) has the rule enabled, it must never be consulted or
		named -- _get_current_user_branches already scoped this out, so
		validate() only ever iterates the caller's own resolved branches."""
		doc = _FakeCustomer({"mobile_number": None}, is_new=True)

		def fake_rule(rule_name, branch=None):
			return branch == "Branch B"  # only the OTHER tenant's branch triggers

		with patch(f"{MODULE}._get_current_user_branches", return_value=["Branch A"]), \
			patch(f"{MODULE}.get_alert_rule", side_effect=fake_rule):
			# Branch A does not trigger (only B does, and B is never checked).
			ury_customer.validate(doc, "validate")  # must not raise

	def test_existing_customer_untouched_field_never_checked(self):
		doc = _FakeCustomer({"mobile_number": None}, is_new=False, changed_fields=set())
		with patch(f"{MODULE}._get_current_user_branches") as mock_branches:
			ury_customer.validate(doc, "validate")
			mock_branches.assert_not_called()

	def test_customer_with_mobile_number_never_checked(self):
		doc = _FakeCustomer({"mobile_number": "+911234567890"}, is_new=True)
		with patch(f"{MODULE}._get_current_user_branches") as mock_branches:
			ury_customer.validate(doc, "validate")
			mock_branches.assert_not_called()

	def test_bulk_import_flag_skips_check_entirely(self):
		frappe.flags.in_import = True
		doc = _FakeCustomer({"mobile_number": None}, is_new=True)
		with patch(f"{MODULE}._get_current_user_branches") as mock_branches:
			ury_customer.validate(doc, "validate")
			mock_branches.assert_not_called()
