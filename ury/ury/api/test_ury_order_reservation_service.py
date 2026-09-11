import json
import unittest
from unittest.mock import patch

import frappe

from ury.ury.api import ury_order_reservation_service as service


class TestOrderReservationLineIsolation(unittest.TestCase):
	def test_resolve_production_context_uses_existing_config_reader(self):
		context = {"production_policy": "MADE_TO_ORDER", "department": "Hot Line"}

		with patch.object(service, "_resolve_production_config", return_value=context) as resolve_config:
			result = service.resolve_production_context("ITEM-1", "BR-1", "COMP-1")

		self.assertIs(result, context)
		resolve_config.assert_called_once_with("ITEM-1", "BR-1", "COMP-1")

	def test_same_item_distinct_lines_do_not_collapse(self):
		previous = [
			{"item": "ITEM-1", "qty": 1, "comment": "no onion"},
			{"item": "ITEM-1", "qty": 1, "comment": "extra spicy"},
		]
		accepted = [
			{"item": "ITEM-1", "qty": 2, "comment": "no onion"},
			{"item": "ITEM-1", "qty": 1, "comment": "extra spicy"},
		]

		context = service.frappe._dict({"name": "UIPC-1", "department": "Hot Line"})
		with patch.object(service, "_reconcile_line") as reconcile_line, patch.object(
			service, "resolve_production_context", return_value=context
		), patch.object(
			service, "get_item_availability", return_value={"sellable": True, "reason_code": "AVAILABLE"}
		):
			service.reconcile_order_reservations(
				"INV-1", previous, accepted, "BR-1", "COMP-1", "user@example.com"
			)

		reconcile_line.assert_called_once()
		order_ref, line_key, line, previous_qty, branch, company, actor = reconcile_line.call_args.args
		self.assertEqual(order_ref, "INV-1")
		self.assertIn("no onion", line_key)
		self.assertEqual(line["item_code"], "ITEM-1")
		self.assertEqual(line["qty"], 2.0)
		self.assertEqual(previous_qty, 1.0)
		self.assertEqual(branch, "BR-1")
		self.assertEqual(company, "COMP-1")
		self.assertEqual(actor, "user@example.com")

	def test_active_groups_only_returns_matching_line_key(self):
		rows = [
			{
				"reservation_group": "GROUP-CHANGED",
				"audit_log": json.dumps(
					[
						{
							"event": "create",
							"frozen_context": {"reservation_line_key": "ctx:ITEM-1:changed:1"},
						}
					]
				),
			},
			{
				"reservation_group": "GROUP-OTHER",
				"audit_log": json.dumps(
					[
						{
							"event": "create",
							"frozen_context": {"reservation_line_key": "ctx:ITEM-1:other:1"},
						}
					]
				),
			},
		]

		with patch.object(service.frappe, "get_all", return_value=rows) as get_all:
			result = service._active_groups(
				"INV-1", "ITEM-1", reservation_line_key="ctx:ITEM-1:changed:1"
			)

		self.assertEqual(result, ["GROUP-CHANGED"])
		get_all.assert_called_once()
		self.assertEqual(get_all.call_args.kwargs["filters"]["top_level_item"], "ITEM-1")

	def test_changed_line_releases_only_its_matching_group_before_recreate(self):
		context = service.frappe._dict(
			{
				"name": "UIPC-1",
				"production_policy": "MADE_TO_ORDER",
				"production_unit": "Kitchen",
				"department": "Hot Line",
				"warehouse": "WH-FG",
			}
		)
		line = {
			"item_code": "ITEM-1",
			"qty": 3,
			"source_line_ref": "POS-LINE-1",
			"source_context": {"comment": "no onion"},
		}

		with patch.object(service, "resolve_production_context", return_value=context), patch.object(
			service, "_active_groups", return_value=["GROUP-LINE-1"]
		) as active_groups, patch.object(service, "release_reservation") as release_reservation, patch.object(
			service, "create_reservation", return_value={"reservation_group": "GROUP-NEW"}
		) as create_reservation, patch.object(
			service, "get_item_availability", return_value={"sellable": True, "reason_code": "AVAILABLE"}
		) as get_item_availability:
			result = service._reconcile_line(
				"INV-1", "ref:ITEM-1:POS-LINE-1", line, 0, "BR-1", "COMP-1", "user@example.com"
			)

		self.assertEqual(result, {"reservation_group": "GROUP-NEW"})
		get_item_availability.assert_called_once_with(
			item_code="ITEM-1", branch="BR-1", company="COMP-1", department="Hot Line"
		)
		active_groups.assert_called_once_with(
			"INV-1", "ITEM-1", reservation_line_key="ref:ITEM-1:POS-LINE-1"
		)
		release_reservation.assert_called_once_with(
			"GROUP-LINE-1", reason="Order acceptance line quantity reconciliation"
		)
		create_reservation.assert_called_once()
		self.assertEqual(
			create_reservation.call_args.kwargs["frozen_context"]["reservation_line_key"],
			"ref:ITEM-1:POS-LINE-1",
		)

	def test_not_sellable_item_is_rejected_before_reservation(self):
		"""D1: a line the availability engine marks not-sellable must be
		rejected at reservation time, and must not release/recreate any
		reservation group."""
		context = service.frappe._dict(
			{
				"name": "UIPC-1",
				"production_policy": "MADE_TO_ORDER",
				"production_unit": "Kitchen",
				"department": "Hot Line",
				"warehouse": "WH-FG",
			}
		)
		line = {
			"item_code": "ITEM-1",
			"qty": 3,
			"source_line_ref": "POS-LINE-1",
			"source_context": {},
		}

		with patch.object(service, "resolve_production_context", return_value=context), patch.object(
			service, "_active_groups"
		) as active_groups, patch.object(service, "release_reservation") as release_reservation, patch.object(
			service, "create_reservation"
		) as create_reservation, patch.object(
			service,
			"get_item_availability",
			return_value={"sellable": False, "reason_code": "PLAN_EXHAUSTED"},
		) as get_item_availability:
			with self.assertRaises(frappe.ValidationError):
				service._reconcile_line(
					"INV-1", "ref:ITEM-1:POS-LINE-1", line, 0, "BR-1", "COMP-1", "user@example.com"
				)

		get_item_availability.assert_called_once_with(
			item_code="ITEM-1", branch="BR-1", company="COMP-1", department="Hot Line"
		)
		active_groups.assert_not_called()
		release_reservation.assert_not_called()
		create_reservation.assert_not_called()

	def test_line_removal_is_not_gated_by_availability(self):
		"""Reducing/removing a line (requested qty <= 0) must still be able
		to release an existing reservation even if the item has since become
		not-sellable -- only a net increase should be availability-gated."""
		context = service.frappe._dict(
			{
				"name": "UIPC-1",
				"production_policy": "MADE_TO_ORDER",
				"production_unit": "Kitchen",
				"department": "Hot Line",
				"warehouse": "WH-FG",
			}
		)
		line = {
			"item_code": "ITEM-1",
			"qty": 0,
			"source_line_ref": "POS-LINE-1",
			"source_context": {},
		}

		with patch.object(service, "resolve_production_context", return_value=context), patch.object(
			service, "_active_groups", return_value=["GROUP-LINE-1"]
		), patch.object(service, "release_reservation") as release_reservation, patch.object(
			service, "create_reservation"
		) as create_reservation, patch.object(
			service, "get_item_availability"
		) as get_item_availability:
			result = service._reconcile_line(
				"INV-1", "ref:ITEM-1:POS-LINE-1", line, 5, "BR-1", "COMP-1", "user@example.com"
			)

		self.assertIsNone(result)
		get_item_availability.assert_not_called()
		release_reservation.assert_called_once_with(
			"GROUP-LINE-1", reason="Order acceptance line quantity reconciliation"
		)
		create_reservation.assert_not_called()

	def test_partial_decrease_of_unsellable_item_is_not_gated(self):
		"""B-3 regression: reducing a line's qty (but not to zero) on an item
		that has since become unsellable must NOT be blocked -- only a net
		INCREASE (accepted_qty > previous_qty) may be gated by availability.
		`requested_qty` is the line's new absolute qty, not a delta, so gating
		on `requested_qty > 0` alone (the pre-fix bug) would wrongly block
		this 5 -> 2 edit."""
		context = service.frappe._dict(
			{
				"name": "UIPC-1",
				"production_policy": "MADE_TO_ORDER",
				"production_unit": "Kitchen",
				"department": "Hot Line",
				"warehouse": "WH-FG",
			}
		)
		line = {
			"item_code": "ITEM-1",
			"qty": 2,
			"source_line_ref": "POS-LINE-1",
			"source_context": {},
		}

		with patch.object(service, "resolve_production_context", return_value=context), patch.object(
			service, "_active_groups", return_value=["GROUP-LINE-1"]
		), patch.object(service, "release_reservation") as release_reservation, patch.object(
			service, "create_reservation", return_value={"reservation_group": "GROUP-NEW"}
		) as create_reservation, patch.object(
			service,
			"get_item_availability",
			return_value={"sellable": False, "reason_code": "FG_OUT_OF_STOCK"},
		) as get_item_availability:
			result = service._reconcile_line(
				"INV-1", "ref:ITEM-1:POS-LINE-1", line, 5, "BR-1", "COMP-1", "user@example.com"
			)

		self.assertEqual(result, {"reservation_group": "GROUP-NEW"})
		get_item_availability.assert_not_called()
		release_reservation.assert_called_once_with(
			"GROUP-LINE-1", reason="Order acceptance line quantity reconciliation"
		)
		create_reservation.assert_called_once()


class TestReconcileOrderReservationsPreflight(unittest.TestCase):
	"""B-4 regression: a rejected line in a multi-line sync must abort before
	ANY line's reservation state is mutated -- not mid-loop after earlier
	lines have already been released/recreated."""

	def test_one_unavailable_line_aborts_before_any_reservation_mutation(self):
		previous = [
			{"item": "ITEM-OK", "qty": 1, "comment": ""},
			{"item": "ITEM-BAD", "qty": 1, "comment": ""},
		]
		accepted = [
			{"item": "ITEM-OK", "qty": 2, "comment": ""},
			{"item": "ITEM-BAD", "qty": 2, "comment": ""},
		]

		context = service.frappe._dict({"name": "UIPC-1", "department": "Hot Line"})

		def fake_availability(item_code, branch, company, department):
			if item_code == "ITEM-BAD":
				return {"sellable": False, "reason_code": "FG_OUT_OF_STOCK"}
			return {"sellable": True, "reason_code": "AVAILABLE"}

		with patch.object(
			service, "resolve_production_context", return_value=context
		), patch.object(
			service, "get_item_availability", side_effect=fake_availability
		), patch.object(
			service, "_reconcile_line"
		) as reconcile_line:
			with self.assertRaises(frappe.ValidationError):
				service.reconcile_order_reservations(
					"INV-1", previous, accepted, "BR-1", "COMP-1", "user@example.com"
				)

		# Neither line's reservation state may have been touched -- the
		# whole batch is pre-flighted before any mutation begins.
		reconcile_line.assert_not_called()

	def test_mixed_increase_and_decrease_both_apply_when_all_sellable(self):
		previous = [
			{"item": "ITEM-A", "qty": 1, "comment": ""},
			{"item": "ITEM-B", "qty": 5, "comment": ""},
		]
		accepted = [
			{"item": "ITEM-A", "qty": 2, "comment": ""},  # increase -- gated
			{"item": "ITEM-B", "qty": 2, "comment": ""},  # decrease -- never gated
		]

		context = service.frappe._dict({"name": "UIPC-1", "department": "Hot Line"})

		with patch.object(
			service, "resolve_production_context", return_value=context
		), patch.object(
			service, "get_item_availability", return_value={"sellable": True, "reason_code": "AVAILABLE"}
		) as get_item_availability, patch.object(
			service, "_reconcile_line"
		) as reconcile_line:
			service.reconcile_order_reservations(
				"INV-1", previous, accepted, "BR-1", "COMP-1", "user@example.com"
			)

		# Pre-flight only checks the net-increase line (ITEM-A), not the
		# decreasing one (ITEM-B).
		get_item_availability.assert_called_once_with(
			item_code="ITEM-A", branch="BR-1", company="COMP-1", department="Hot Line"
		)
		self.assertEqual(reconcile_line.call_count, 2)


class TestReleaseOrderReservations(unittest.TestCase):
	"""release_order_reservations() -- used by cancel_order() so cancellation
	does not leak reserved capacity (sa-post-373-review-fixes Blocker 3)."""

	def test_releases_every_distinct_active_group_for_the_order(self):
		rows = [
			service.frappe._dict({"reservation_group": "GRP-1"}),
			service.frappe._dict({"reservation_group": "GRP-1"}),
			service.frappe._dict({"reservation_group": "GRP-2"}),
		]
		with patch.object(service.frappe, "get_all", return_value=rows) as get_all, patch.object(
			service, "release_reservation"
		) as release_reservation:
			result = service.release_order_reservations("INV-1", reason="Order cancelled")

		get_all.assert_called_once_with(
			service.RESERVATION_DOCTYPE,
			filters={"order_ref": "INV-1", "status": service.RESERVED},
			fields=["reservation_group"],
		)
		self.assertEqual(release_reservation.call_count, 2)
		release_reservation.assert_any_call("GRP-1", reason="Order cancelled")
		release_reservation.assert_any_call("GRP-2", reason="Order cancelled")
		self.assertEqual(result, ["GRP-1", "GRP-2"])

	def test_no_active_reservations_is_a_no_op(self):
		with patch.object(service.frappe, "get_all", return_value=[]) as get_all, patch.object(
			service, "release_reservation"
		) as release_reservation:
			result = service.release_order_reservations("INV-1")

		get_all.assert_called_once()
		release_reservation.assert_not_called()
		self.assertEqual(result, [])

	def test_no_order_ref_is_a_no_op(self):
		with patch.object(service.frappe, "get_all") as get_all, patch.object(
			service, "release_reservation"
		) as release_reservation:
			result = service.release_order_reservations(None)

		get_all.assert_not_called()
		release_reservation.assert_not_called()
		self.assertEqual(result, [])

	def test_calling_again_after_already_released_does_not_double_decrement(self):
		"""Idempotency: the second call must not re-invoke release_reservation
		(and therefore must not re-apply its committed_qty decrement) once
		every reservation for the order is already out of Reserved status --
		this is the guard `apply_commit_delta`'s FOR UPDATE mutation relies on
		to never fire twice for the same release event."""
		rows = [service.frappe._dict({"reservation_group": "GRP-1"})]
		with patch.object(service.frappe, "get_all", side_effect=[rows, []]), patch.object(
			service, "release_reservation"
		) as release_reservation:
			first = service.release_order_reservations("INV-1")
			second = service.release_order_reservations("INV-1")

		self.assertEqual(first, ["GRP-1"])
		self.assertEqual(second, [])
		release_reservation.assert_called_once_with("GRP-1", reason=None)


class TestPlanExhaustedEnforcementMode(unittest.TestCase):
	"""_check_line_availability()'s Hard/Soft/Alert branching on PLAN_EXHAUSTED."""

	def _availability(self, reason_code):
		return {"sellable": False, "reason_code": reason_code}

	def test_hard_mode_returns_rejection(self):
		context = {"department": "Hot Line"}
		with patch.object(
			service, "get_item_availability", return_value=self._availability("PLAN_EXHAUSTED")
		), patch.object(service, "resolve_plan_enforcement_mode", return_value="Hard") as resolve_mode, patch.object(
			service, "_notify_plan_exceeded"
		) as notify:
			result = service._check_line_availability("ITEM-1", "BR-1", "COMP-1", context)

		self.assertEqual(result, {"item_code": "ITEM-1", "reason_code": "PLAN_EXHAUSTED"})
		resolve_mode.assert_called_once_with("ITEM-1", "BR-1", "COMP-1", department="Hot Line")
		notify.assert_not_called()

	def test_soft_mode_allows_through_with_no_notification(self):
		context = {"department": "Hot Line"}
		with patch.object(
			service, "get_item_availability", return_value=self._availability("PLAN_EXHAUSTED")
		), patch.object(service, "resolve_plan_enforcement_mode", return_value="Soft"), patch.object(
			service, "_notify_plan_exceeded"
		) as notify:
			result = service._check_line_availability("ITEM-1", "BR-1", "COMP-1", context)

		self.assertIsNone(result)
		notify.assert_not_called()

	def test_alert_mode_allows_through_and_fires_notification(self):
		context = {"department": "Hot Line"}
		with patch.object(
			service, "get_item_availability", return_value=self._availability("PLAN_EXHAUSTED")
		), patch.object(service, "resolve_plan_enforcement_mode", return_value="Alert"), patch.object(
			service, "_notify_plan_exceeded"
		) as notify:
			result = service._check_line_availability("ITEM-1", "BR-1", "COMP-1", context)

		self.assertIsNone(result)
		notify.assert_called_once_with("ITEM-1", "BR-1", "COMP-1", "Hot Line")

	def test_non_plan_exhausted_reason_is_unaffected_by_enforcement_mode(self):
		context = {"department": "Hot Line"}
		with patch.object(
			service, "get_item_availability", return_value=self._availability("NO_ACTIVE_PLAN")
		), patch.object(service, "resolve_plan_enforcement_mode") as resolve_mode:
			result = service._check_line_availability("ITEM-1", "BR-1", "COMP-1", context)

		self.assertEqual(result, {"item_code": "ITEM-1", "reason_code": "NO_ACTIVE_PLAN"})
		resolve_mode.assert_not_called()

	def test_alert_notification_resolves_branch_scoped_recipients_and_dedupes(self):
		users_pm = [service.frappe._dict({"name": "pm@example.com"})]
		users_mgr = [service.frappe._dict({"name": "pm@example.com"}), service.frappe._dict({"name": "mgr@example.com"})]

		def fake_get_users_with_role(role, branch=None):
			self.assertEqual(branch, "BR-1")
			if role == "Production Manager":
				return users_pm
			return users_mgr

		with patch.object(service, "get_users_with_role", side_effect=fake_get_users_with_role), patch.object(
			service, "create_system_notification"
		) as create_notification:
			service._notify_plan_exceeded("ITEM-1", "BR-1", "COMP-1", "Hot Line")

		# pm@example.com appears in both role lookups but must only be
		# notified once (dedupe by user across the two role scans).
		notified_users = {call.args[1] for call in create_notification.call_args_list}
		self.assertEqual(notified_users, {"pm@example.com", "mgr@example.com"})
		self.assertEqual(create_notification.call_count, 2)
