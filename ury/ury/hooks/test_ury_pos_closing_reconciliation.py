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
	drain_session_postings,
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

		def _boom(invoice_doc, strict=False, retry=True):
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
		# Item 3: T5 must call with retry=False too, so `validate` performs
		# zero document writes -- the drain pass in `before_validate` is now
		# the only place that write happens.
		self.assertFalse(kwargs.get("retry"))

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
		doc = _closing(["POSINV-1"])
		with patch(
			"ury.ury.api.ury_stock_policy.get_branch_stock_policy",
			return_value=POLICY_ON,
		), patch(
			f"{MODULE}._verify_invoice_production", return_value=None
		) as verify, patch(
			f"{MODULE}.frappe.get_all", return_value=[]
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


class TestDrainSessionPostings(FrappeTestCase):
	"""Item 3: `POS Closing Entry.before_validate` drain pass.

	This is the ONLY place in the closing flow allowed to write documents
	(call `process_posting_intent`). `validate_closing_reconciliation`
	itself must remain provably write-free -- see `test_ury_feature_flags`'s
	`retry=False` tests and `test_verification_failure_is_translated_not_swallowed`
	above, which pin T5's call as `strict=True, retry=False`.
	"""

	def test_gate_off_is_a_total_no_op(self):
		doc = _closing(["POSINV-1"])
		with patch(
			"ury.ury.api.ury_stock_policy.get_branch_stock_policy",
			return_value=POLICY_OFF,
		), patch(f"{MODULE}.frappe.get_all") as get_all, patch(
			f"{MODULE}.frappe.db.get_value"
		) as get_value:
			drain_session_postings(doc)

		self.assertEqual(get_all.call_count, 0)
		self.assertEqual(get_value.call_count, 0)

	def test_drain_attempts_a_retrying_verify_for_every_session_invoice(self):
		doc = _closing(["POSINV-1", "POSINV-2"])
		with patch(
			"ury.ury.api.ury_stock_policy.get_branch_stock_policy",
			return_value=POLICY_ON,
		), patch(
			f"{MODULE}.frappe.db.get_value",
			side_effect=lambda dt, name, fields, as_dict=True: frappe._dict(
				{"name": name, "branch": "BR-1", "company": "Co"}
			),
		), patch(
			"ury.ury.api.ury_feature_flags._verify_fulfilment_posted_for_invoice"
		) as mock_verify:
			drain_session_postings(doc)

		self.assertEqual(mock_verify.call_count, 2)
		for call in mock_verify.call_args_list:
			_, kwargs = call
			# Opportunistic self-heal, not the enforcement point: must
			# attempt the write (retry=True) and must never itself be the
			# thing that decides the shift can't close (strict=False, and
			# any resulting exception is swallowed -- see the next test).
			self.assertFalse(kwargs.get("strict"))
			self.assertTrue(kwargs.get("retry"))

	def test_drain_never_raises_and_continues_past_a_failing_invoice(self):
		doc = _closing(["POSINV-BAD", "POSINV-OK"])

		def boom_then_ok(invoice_doc, strict=False, retry=True):
			if invoice_doc.name == "POSINV-BAD":
				frappe.throw("still not posted")
			return None

		with patch(
			"ury.ury.api.ury_stock_policy.get_branch_stock_policy",
			return_value=POLICY_ON,
		), patch(
			f"{MODULE}.frappe.db.get_value",
			side_effect=lambda dt, name, fields, as_dict=True: frappe._dict(
				{"name": name, "branch": "BR-1", "company": "Co"}
			),
		), patch(
			"ury.ury.api.ury_feature_flags._verify_fulfilment_posted_for_invoice",
			side_effect=boom_then_ok,
		) as mock_verify:
			drain_session_postings(doc)  # must not raise

		self.assertEqual(mock_verify.call_count, 2)

	def test_drain_skips_unreadable_invoice(self):
		doc = _closing(["POSINV-GONE"])
		with patch(
			"ury.ury.api.ury_stock_policy.get_branch_stock_policy",
			return_value=POLICY_ON,
		), patch(f"{MODULE}.frappe.db.get_value", return_value=None), patch(
			"ury.ury.api.ury_feature_flags._verify_fulfilment_posted_for_invoice"
		) as mock_verify:
			drain_session_postings(doc)  # must not raise

		mock_verify.assert_not_called()

	def test_self_heal_end_to_end_drain_then_validate_passes(self):
		"""Acceptance criterion 2: a closing entry with one PENDING intent for
		an otherwise-clean shift posts the Stock Entry in `before_validate`
		and then passes `validate_closing_reconciliation` (retry=False,
		re-reading only)."""
		doc = _closing(["POSINV-1"])
		state = {"status": "PENDING"}

		def fake_process_posting_intent(name):
			state["status"] = "POSTED"

		def get_all(doctype, **kwargs):
			if doctype == "URY KOT":
				return [frappe._dict({"name": "KOT-001"})]
			if doctype == "URY KOT Item Execution":
				return [
					frappe._dict(
						{
							"name": "EXEC-1",
							"kot_item": "KOTITEM-1",
							"state": "READY",
							"idempotency_key": "rev-1",
							"branch": "BR-1",
							"company": "Co",
						}
					)
				]
			if doctype == "URY Fulfilment Posting Intent":
				return [
					frappe._dict(
						{
							"name": "INTENT-1",
							"status": state["status"],
							"accepted_revision": "rev-1",
							"accepted_qty": 1,
						}
					)
				]
			# Reservations lookup inside `validate_closing_reconciliation`.
			return []

		with patch(
			"ury.ury.api.ury_stock_policy.get_branch_stock_policy",
			return_value=POLICY_ON,
		), patch(
			f"{MODULE}.frappe.db.get_value",
			side_effect=lambda dt, name, fields=None, as_dict=True: frappe._dict(
				{"name": name, "branch": "BR-1", "company": "Co"}
			),
		), patch(
			"ury.ury.api.ury_feature_flags.frappe.get_all", side_effect=get_all
		), patch(
			"ury.ury.api.ury_feature_flags.frappe.db.get_value",
			return_value=frappe._dict({"item": "BURGER", "quantity": 1}),
		), patch(
			"ury.ury.api.ury_feature_flags._is_made_to_order", return_value=True
		), patch(
			"ury.ury.api.ury_fulfilment_posting_service.process_posting_intent",
			side_effect=fake_process_posting_intent,
		):
			# `frappe.get_all` is one shared module attribute across both
			# `ury_feature_flags` and `ury_pos_closing_reconciliation` (same
			# `frappe` module object) -- `get_all` above already returns []
			# for anything that isn't KOT/execution/intent, which covers
			# `_verify_reservations_resolvable`'s reservation-group query too.
			# Simulate hook order: before_validate runs first, then validate.
			drain_session_postings(doc)
			self.assertEqual(state["status"], "POSTED")

			validate_closing_reconciliation(doc)  # must not raise

	def test_genuinely_stuck_intent_still_blocks_after_drain(self):
		"""Acceptance criterion 4: if the drain pass's retry genuinely can't
		post (e.g. a real failure, not just lag), T5's strict=True,
		retry=False call still blocks -- it does not get to retry again and
		does not silently pass."""
		doc = _closing(["POSINV-1"])

		def get_all(doctype, **kwargs):
			if doctype == "URY KOT":
				return [frappe._dict({"name": "KOT-001"})]
			if doctype == "URY KOT Item Execution":
				return [
					frappe._dict(
						{
							"name": "EXEC-1",
							"kot_item": "KOTITEM-1",
							"state": "READY",
							"idempotency_key": "rev-1",
							"branch": "BR-1",
							"company": "Co",
						}
					)
				]
			if doctype == "URY Fulfilment Posting Intent":
				# Never transitions to POSTED, no matter how many times the
				# drain retried it.
				return [
					frappe._dict(
						{
							"name": "INTENT-1",
							"status": "FAILED",
							"accepted_revision": "rev-1",
							"accepted_qty": 1,
						}
					)
				]
			return []

		with patch(
			"ury.ury.api.ury_stock_policy.get_branch_stock_policy",
			return_value=POLICY_ON,
		), patch(
			f"{MODULE}.frappe.db.get_value",
			side_effect=lambda dt, name, fields=None, as_dict=True: frappe._dict(
				{"name": name, "branch": "BR-1", "company": "Co"}
			),
		), patch(
			"ury.ury.api.ury_feature_flags.frappe.get_all", side_effect=get_all
		), patch(
			"ury.ury.api.ury_feature_flags.frappe.db.get_value",
			return_value=frappe._dict({"item": "BURGER", "quantity": 1}),
		), patch(
			"ury.ury.api.ury_feature_flags._is_made_to_order", return_value=True
		), patch(
			"ury.ury.api.ury_fulfilment_posting_service.process_posting_intent"
		):
			with self.assertRaises(frappe.ValidationError):
				validate_closing_reconciliation(doc)

	def test_repeated_drain_does_not_retry_an_already_posted_intent(self):
		"""Acceptance criterion 5: once an intent is POSTED, a later drain
		pass (a second save cycle) must not call `process_posting_intent`
		for it again."""
		doc = _closing(["POSINV-1"])

		def get_all(doctype, **kwargs):
			if doctype == "URY KOT":
				return [frappe._dict({"name": "KOT-001"})]
			if doctype == "URY KOT Item Execution":
				return [
					frappe._dict(
						{
							"name": "EXEC-1",
							"kot_item": "KOTITEM-1",
							"state": "READY",
							"idempotency_key": "rev-1",
							"branch": "BR-1",
							"company": "Co",
						}
					)
				]
			if doctype == "URY Fulfilment Posting Intent":
				return [
					frappe._dict(
						{
							"name": "INTENT-1",
							"status": "POSTED",
							"accepted_revision": "rev-1",
							"accepted_qty": 1,
						}
					)
				]
			return []

		with patch(
			"ury.ury.api.ury_stock_policy.get_branch_stock_policy",
			return_value=POLICY_ON,
		), patch(
			f"{MODULE}.frappe.db.get_value",
			side_effect=lambda dt, name, fields=None, as_dict=True: frappe._dict(
				{"name": name, "branch": "BR-1", "company": "Co"}
			),
		), patch(
			"ury.ury.api.ury_feature_flags.frappe.get_all", side_effect=get_all
		), patch(
			"ury.ury.api.ury_feature_flags.frappe.db.get_value",
			return_value=frappe._dict({"item": "BURGER", "quantity": 1}),
		), patch(
			"ury.ury.api.ury_feature_flags._is_made_to_order", return_value=True
		), patch(
			"ury.ury.api.ury_fulfilment_posting_service.process_posting_intent"
		) as mock_process:
			# Three save cycles: draft save, draft save again, submit.
			drain_session_postings(doc)
			drain_session_postings(doc)
			drain_session_postings(doc)

		mock_process.assert_not_called()
