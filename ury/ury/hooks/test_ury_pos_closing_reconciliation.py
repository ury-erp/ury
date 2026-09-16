"""Tests for T5 / I-10: session-scoped closing reconciliation.

Mock-based unit tests, matching the established pattern in this package
(`test_ury_sales_invoice_returns.py`, `test_ury_fulfilment_posting_service.py`):
the behaviour under test is the gate's control flow and its messages, not
ERPNext's consolidation machinery.

Pinned here:

  1. Gate ON, everything posted and every reservation group settleable ->
     closing passes.
  2. Gate ON, a missing/stale intent -> closing is BLOCKED, and the message
     names the specific invoice and carries the underlying diagnosis.
  3. Gate ON, a reservation group in an unresolvable state -> blocked, with
     the group and its state named.
  4. Gate OFF -> a complete no-op, asserted by call count: not one query is
     attempted.
  5. Empty `pos_transactions` (a shift with no sales) -> trivial pass.
  6. An unexpected exception inside the reconciliation -> blocked with a
     manager-readable message, never a raw traceback.

PR #386 review follow-up, Item 2 (hook-ordering self-sufficiency):

  7. `_session_invoice_names` self-calls `populate_pos_transactions`, so an
     empty `pos_transactions` with submitted unconsolidated POS Invoices
     still in the period is caught rather than silently passed -- even
     when simulating T5 running BEFORE `ury_pos_closing_entry.validate`
     (i.e. hook order reversed).
  8. A genuinely empty shift (no matching POS Invoices at all) still
     passes, per the existing `_reconcile_session` contract.
  9. Caller-supplied `pos_transactions` is never overwritten by the extra
     `populate_pos_transactions` call.
  10. The literal order of `hooks.py`'s "POS Closing Entry" `validate` list
      is asserted directly, so a future reorder shows up as a red test.
"""

from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_stock_policy import StockPolicy
from ury.ury.hooks.ury_pos_closing_reconciliation import (
	validate_closing_reconciliation,
)

MODULE = "ury.ury.hooks.ury_pos_closing_reconciliation"

POLICY_ON = StockPolicy(True, True, True)
POLICY_OFF = StockPolicy(True, True, False)
POLICY_ALL_OFF = StockPolicy(False, False, False)


def _closing(invoices=(), branch="BR-1", company="Co"):
	return frappe._dict(
		{
			"name": "POS-CLO-1",
			"branch": branch,
			"company": company,
			"pos_profile": "Profile-1",
			"pos_transactions": [frappe._dict({"pos_invoice": n}) for n in invoices],
		}
	)


class TestClosingReconciliation(FrappeTestCase):
	# -- 4. Gate OFF is a complete no-op ---------------------------------

	def test_gate_off_is_a_total_no_op(self):
		doc = _closing(["POSINV-1", "POSINV-2"])
		with patch(
			"ury.ury.api.ury_stock_policy.get_branch_stock_policy",
			return_value=POLICY_OFF,
		), patch(f"{MODULE}.frappe.get_all") as get_all, patch(
			f"{MODULE}.frappe.db.get_value"
		) as get_value, patch(
			f"{MODULE}._reconcile_session"
		) as reconcile:
			validate_closing_reconciliation(doc)

		# Not one query, and the reconciliation body never entered.
		self.assertEqual(reconcile.call_count, 0)
		self.assertEqual(get_all.call_count, 0)
		self.assertEqual(get_value.call_count, 0)

	def test_tier_one_branch_is_a_total_no_op(self):
		doc = _closing(["POSINV-1"])
		with patch(
			"ury.ury.api.ury_stock_policy.get_branch_stock_policy",
			return_value=POLICY_ALL_OFF,
		), patch(f"{MODULE}.frappe.get_all") as get_all, patch(
			f"{MODULE}._reconcile_session"
		) as reconcile:
			validate_closing_reconciliation(doc)
		self.assertEqual(reconcile.call_count, 0)
		self.assertEqual(get_all.call_count, 0)

	# -- 5. Empty shift --------------------------------------------------

	def test_empty_transactions_is_a_trivial_pass(self):
		doc = _closing([])
		with patch(
			"ury.ury.api.ury_stock_policy.get_branch_stock_policy",
			return_value=POLICY_ON,
		), patch(f"{MODULE}.frappe.get_all") as get_all, patch(
			f"{MODULE}._verify_invoice_production"
		) as verify:
			validate_closing_reconciliation(doc)
		# Gate is ON, but with no invoices there is nothing to query.
		self.assertEqual(verify.call_count, 0)
		self.assertEqual(get_all.call_count, 0)

	# -- 1. Clean session passes ----------------------------------------

	def test_clean_session_closes(self):
		doc = _closing(["POSINV-1", "POSINV-2"])
		with patch(
			"ury.ury.api.ury_stock_policy.get_branch_stock_policy",
			return_value=POLICY_ON,
		), patch(f"{MODULE}._verify_invoice_production", return_value=None) as verify, patch(
			f"{MODULE}.frappe.get_all",
			return_value=[
				{
					"reservation_group": "G1",
					"order_ref": "POSINV-1",
					"status": "Fulfilled",
					"top_level_item": "Biryani",
				},
				{
					"reservation_group": "G2",
					"order_ref": "POSINV-2",
					"status": "Reserved",
					"top_level_item": "Juice",
				},
			],
		):
			validate_closing_reconciliation(doc)  # must not raise

		self.assertEqual(verify.call_count, 2)

	# -- 2. Missing / stale intent blocks -------------------------------

	def test_stale_intent_blocks_closing_and_names_the_invoice(self):
		doc = _closing(["POSINV-7"])
		diagnosis = "Production posting for item Biryani on KOT KOT-3 is stale"
		with patch(
			"ury.ury.api.ury_stock_policy.get_branch_stock_policy",
			return_value=POLICY_ON,
		), patch(
			f"{MODULE}._verify_invoice_production",
			return_value="POS Invoice POSINV-7: " + diagnosis,
		), patch(
			f"{MODULE}.frappe.get_all", return_value=[]
		):
			with self.assertRaises(frappe.ValidationError) as ctx:
				validate_closing_reconciliation(doc)

		message = str(ctx.exception)
		self.assertIn("POSINV-7", message)
		self.assertIn("stale", message)

	def test_verification_failure_is_translated_not_swallowed(self):
		"""The real `_verify_invoice_production`, with the G-07 verification
		throwing underneath it, yields an invoice-scoped problem string."""
		from ury.ury.hooks.ury_pos_closing_reconciliation import (
			_verify_invoice_production,
		)

		def _boom(invoice_doc, strict=False):
			frappe.throw("Production posting is missing for item Biryani on KOT KOT-3.")

		with patch(
			f"{MODULE}.frappe.db.get_value",
			return_value={"name": "POSINV-9", "branch": "BR-1", "company": "Co"},
		), patch(
			"ury.ury.api.ury_feature_flags._verify_fulfilment_posted_for_invoice",
			side_effect=_boom,
		) as mock_verify:
			problem = _verify_invoice_production("POSINV-9")

		self.assertIsNotNone(problem)
		self.assertIn("POSINV-9", problem)
		self.assertIn("Production posting is missing", problem)
		# The composition-bug regression: T5 MUST call with strict=True, since
		# it is itself the closing-time enforcement point the till-time gate
		# defers to when closing_reconciliation_enabled is on for the branch
		# T5 only ever runs against. Calling with the default strict=False
		# here would let a not-yet-POSTED intent advisory-pass both gates.
		_, kwargs = mock_verify.call_args
		self.assertTrue(kwargs.get("strict"))

	def test_unreadable_invoice_is_reported_not_crashed(self):
		from ury.ury.hooks.ury_pos_closing_reconciliation import (
			_verify_invoice_production,
		)

		with patch(f"{MODULE}.frappe.db.get_value", return_value=None):
			problem = _verify_invoice_production("POSINV-GONE")

		self.assertIn("POSINV-GONE", problem)

	# -- 3. Unresolvable reservations block -----------------------------

	def test_released_reservation_group_blocks_closing(self):
		doc = _closing(["POSINV-4"])
		with patch(
			"ury.ury.api.ury_stock_policy.get_branch_stock_policy",
			return_value=POLICY_ON,
		), patch(f"{MODULE}._verify_invoice_production", return_value=None), patch(
			f"{MODULE}.frappe.get_all",
			return_value=[
				{
					"reservation_group": "G9",
					"order_ref": "POSINV-4",
					"status": "Released",
					"top_level_item": "Biryani",
				}
			],
		):
			with self.assertRaises(frappe.ValidationError) as ctx:
				validate_closing_reconciliation(doc)

		message = str(ctx.exception)
		self.assertIn("G9", message)
		self.assertIn("Released", message)
		self.assertIn("POSINV-4", message)

	def test_mixed_status_group_blocks_closing(self):
		doc = _closing(["POSINV-5"])
		rows = [
			{
				"reservation_group": "G5",
				"order_ref": "POSINV-5",
				"status": "Reserved",
				"top_level_item": "Biryani",
			},
			{
				"reservation_group": "G5",
				"order_ref": "POSINV-5",
				"status": "Fulfilled",
				"top_level_item": "Biryani",
			},
		]
		with patch(
			"ury.ury.api.ury_stock_policy.get_branch_stock_policy",
			return_value=POLICY_ON,
		), patch(f"{MODULE}._verify_invoice_production", return_value=None), patch(
			f"{MODULE}.frappe.get_all", return_value=rows
		):
			with self.assertRaises(frappe.ValidationError) as ctx:
				validate_closing_reconciliation(doc)

		self.assertIn("G5", str(ctx.exception))

	def test_no_reservations_at_all_is_not_a_problem(self):
		doc = _closing(["POSINV-6"])
		with patch(
			"ury.ury.api.ury_stock_policy.get_branch_stock_policy",
			return_value=POLICY_ON,
		), patch(f"{MODULE}._verify_invoice_production", return_value=None), patch(
			f"{MODULE}.frappe.get_all", return_value=[]
		):
			validate_closing_reconciliation(doc)  # must not raise

	def test_ungrouped_reservation_row_blocks_closing(self):
		doc = _closing(["POSINV-8"])
		with patch(
			"ury.ury.api.ury_stock_policy.get_branch_stock_policy",
			return_value=POLICY_ON,
		), patch(f"{MODULE}._verify_invoice_production", return_value=None), patch(
			f"{MODULE}.frappe.get_all",
			return_value=[
				{
					"reservation_group": None,
					"order_ref": "POSINV-8",
					"status": "Reserved",
					"top_level_item": "Juice",
				}
			],
		):
			with self.assertRaises(frappe.ValidationError) as ctx:
				validate_closing_reconciliation(doc)
		self.assertIn("no reservation group", str(ctx.exception))

	# -- 6. Unexpected failure blocks readably ---------------------------

	def test_unexpected_exception_blocks_with_a_readable_message(self):
		doc = _closing(["POSINV-3"])
		with patch(
			"ury.ury.api.ury_stock_policy.get_branch_stock_policy",
			return_value=POLICY_ON,
		), patch(
			f"{MODULE}._reconcile_session", side_effect=RuntimeError("malformed intent row")
		), patch(
			f"{MODULE}.frappe.log_error"
		) as log_error:
			with self.assertRaises(frappe.ValidationError) as ctx:
				validate_closing_reconciliation(doc)

		message = str(ctx.exception)
		self.assertIn("POS-CLO-1", message)
		self.assertNotIn("Traceback", message)
		self.assertNotIn("malformed intent row", message)
		self.assertEqual(log_error.call_count, 1)

	def test_unresolvable_policy_is_treated_as_gate_off(self):
		doc = _closing(["POSINV-1"], branch=None)
		doc.pos_profile = None
		with patch(f"{MODULE}._reconcile_session") as reconcile:
			validate_closing_reconciliation(doc)
		self.assertEqual(reconcile.call_count, 0)

	# -- 7-10. Item 2 follow-up: hook-ordering self-sufficiency ----------

	def test_empty_transactions_with_unconsolidated_invoices_is_not_a_silent_pass(self):
		"""Simulates T5 running BEFORE `ury_pos_closing_entry.validate` (a
		hypothetical hook reorder): `pos_transactions` is empty even though
		submitted, unconsolidated POS Invoices exist for this session. The
		self-population call is left to run for real (not mocked) -- it
		finds the same invoices via its own query and would normally
		repopulate `pos_transactions` -- but here we mock its own
		`frappe.get_all` to look like no invoices were found either, so the
		fail-open window is exercised: the confirming query in
		`_confirm_genuinely_empty` (mocked to return a row) must catch it
		and route into the system-error throw."""
		doc = _closing([])
		doc.user = "cashier@example.com"
		doc.period_start_date = "2024-01-01 00:00:00"
		doc.period_end_date = "2024-01-01 23:59:59"
		with patch(
			"ury.ury.api.ury_stock_policy.get_branch_stock_policy",
			return_value=POLICY_ON,
		), patch(
			"ury.ury.hooks.ury_pos_closing_entry.frappe.get_all", return_value=[]
		), patch(
			f"{MODULE}.frappe.get_all",
			return_value=[{"name": "POSINV-99", "consolidated_invoice": None}],
		), patch(
			f"{MODULE}.frappe.log_error"
		) as log_error:
			with self.assertRaises(frappe.ValidationError) as ctx:
				validate_closing_reconciliation(doc)

		message = str(ctx.exception)
		self.assertIn("system error", message.lower())
		self.assertEqual(log_error.call_count, 1)
		# Never a silent pass: pos_transactions is still empty and yet we
		# raised, rather than `_reconcile_session` returning [].
		self.assertEqual(doc.pos_transactions, [])

	def test_genuinely_empty_shift_still_passes(self):
		doc = _closing([])
		doc.user = "cashier@example.com"
		doc.period_start_date = "2024-01-01 00:00:00"
		doc.period_end_date = "2024-01-01 23:59:59"
		with patch(
			"ury.ury.api.ury_stock_policy.get_branch_stock_policy",
			return_value=POLICY_ON,
		), patch(
			"ury.ury.hooks.ury_pos_closing_entry.frappe.get_all", return_value=[]
		), patch(
			f"{MODULE}.frappe.get_all", return_value=[]
		):
			validate_closing_reconciliation(doc)  # must not raise

	def test_caller_supplied_pos_transactions_not_overwritten(self):
		"""Regression-fixed: `frappe` is one shared module object, so
		`patch("A.frappe.get_all")` and `patch("B.frappe.get_all")` both
		patch the exact same attribute -- whichever `with` context is
		entered last wins for BOTH call sites, not just its own module's.
		The original version of this test patched both
		`{MODULE}.frappe.get_all` and `ury_pos_closing_entry.frappe.get_all`
		side by side, so `_verify_reservations_resolvable`'s own (real,
		expected) `frappe.get_all` call landed on `entry_get_all` and made
		its `assert_not_called()` fail -- not a bug in `populate_pos_
		transactions`'s guard, which this test's comment already correctly
		describes. Mocking `_verify_reservations_resolvable` directly (the
		same isolation pattern `test_empty_transactions_is_a_trivial_pass`
		already uses for `_verify_invoice_production`) removes the need to
		patch `{MODULE}.frappe.get_all` at all, so only one thing patches
		the shared `frappe.get_all` attribute and `entry_get_all` genuinely
		reflects `ury_pos_closing_entry`'s own call count.
		"""
		doc = _closing(["POSINV-1"])
		with patch(
			"ury.ury.api.ury_stock_policy.get_branch_stock_policy",
			return_value=POLICY_ON,
		), patch(
			f"{MODULE}._verify_invoice_production", return_value=None
		) as verify, patch(
			f"{MODULE}._verify_reservations_resolvable", return_value=[]
		), patch(
			"ury.ury.hooks.ury_pos_closing_entry.frappe.get_all"
		) as entry_get_all:
			validate_closing_reconciliation(doc)  # must not raise

		# populate_pos_transactions's own `:44` guard means it returns before
		# ever issuing its query, because pos_transactions is non-empty --
		# the caller-supplied row is never overwritten.
		entry_get_all.assert_not_called()
		self.assertEqual(len(doc.pos_transactions), 1)
		self.assertEqual(doc.pos_transactions[0].pos_invoice, "POSINV-1")
		self.assertEqual(verify.call_count, 1)

	def test_hook_order_entry_populate_precedes_reconciliation(self):
		"""Documents the current order as defence-in-depth (not a
		correctness requirement, per the extended `hooks.py` comment): a
		future reorder is now caught by fix (a)+(b) above, but this test
		still pins the order so a reorder is visible as a diff, not just a
		latent risk."""
		validate_hooks = frappe.get_hooks("doc_events").get("POS Closing Entry", {}).get(
			"validate", []
		)
		entry_index = validate_hooks.index("ury.ury.hooks.ury_pos_closing_entry.validate")
		reconciliation_index = validate_hooks.index(
			"ury.ury.hooks.ury_pos_closing_reconciliation.validate_closing_reconciliation"
		)
		self.assertLess(entry_index, reconciliation_index)

	def test_gate_off_skips_self_population_too(self):
		"""Acceptance criterion 5: the gate-off no-op must precede ANY new
		work, including the self-population call added for this fix."""
		doc = _closing([])
		doc.user = "cashier@example.com"
		doc.period_start_date = "2024-01-01 00:00:00"
		doc.period_end_date = "2024-01-01 23:59:59"
		with patch(
			"ury.ury.api.ury_stock_policy.get_branch_stock_policy",
			return_value=POLICY_OFF,
		), patch(
			"ury.ury.hooks.ury_pos_closing_entry.frappe.get_all"
		) as entry_get_all, patch(
			f"{MODULE}.frappe.get_all"
		) as recon_get_all:
			validate_closing_reconciliation(doc)

		entry_get_all.assert_not_called()
		recon_get_all.assert_not_called()
