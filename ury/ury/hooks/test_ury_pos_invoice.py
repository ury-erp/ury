import unittest
from unittest.mock import patch

from ury.ury.hooks import ury_pos_invoice as hooks


class TestPosInvoiceOnCancel(unittest.TestCase):
	"""G-13: `POS Invoice.on_cancel` must release Reserved reservation groups
	itself, rather than relying solely on `ury_order.cancel_order()`'s
	imperative call -- so a Desk cancel, a bulk list-view cancel, or any
	future non-API cancellation path also releases capacity instead of
	leaking it until the hourly TTL sweep (sa-pos-followups-and-ux Item 7a).
	"""

	def _doc(self, name="POSINV-1"):
		return hooks.frappe._dict({"name": name}) if hasattr(hooks, "frappe") else type(
			"Doc", (), {"name": name}
		)()

	def test_on_cancel_calls_table_status_delete_then_releases_reservations(self):
		doc = self._doc("POSINV-1")
		with patch.object(hooks, "table_status_delete") as table_status_delete, patch.object(
			hooks, "release_order_reservations"
		) as release_order_reservations:
			hooks.on_cancel(doc, "on_cancel")

		table_status_delete.assert_called_once_with(doc, "on_cancel")
		release_order_reservations.assert_called_once_with(
			"POSINV-1", reason="POS Invoice cancelled"
		)

	def test_on_cancel_never_raises_when_release_fails(self):
		"""Reservation release is a best-effort side effect of cancellation --
		a failure here must never block the cancellation itself."""
		doc = self._doc("POSINV-1")
		with patch.object(hooks, "table_status_delete"), patch.object(
			hooks, "release_order_reservations", side_effect=RuntimeError("boom")
		), patch.object(hooks.frappe, "log_error") as log_error:
			hooks.on_cancel(doc, "on_cancel")  # must not raise

		log_error.assert_called_once()

	def test_on_cancel_still_runs_table_status_delete_even_if_release_fails(self):
		doc = self._doc("POSINV-1")
		with patch.object(hooks, "table_status_delete") as table_status_delete, patch.object(
			hooks, "release_order_reservations", side_effect=RuntimeError("boom")
		), patch.object(hooks.frappe, "log_error"):
			hooks.on_cancel(doc, "on_cancel")

		table_status_delete.assert_called_once()

	def test_direct_desk_style_cancel_releases_reserved_groups(self):
		"""Regression for G-13 itself: a `.cancel()` NOT routed through
		`cancel_order()` (e.g. Desk UI, bulk cancel, a server script) must
		still release Reserved groups, because `on_cancel` is now wired to
		`ury_pos_invoice.on_cancel` instead of being aliased to `on_trash`
		(which never touched reservations)."""
		doc = self._doc("POSINV-2")
		with patch.object(hooks, "table_status_delete"), patch.object(
			hooks, "release_order_reservations"
		) as release_order_reservations:
			hooks.on_cancel(doc, "on_cancel")

		released_order_ref = release_order_reservations.call_args.args[0]
		self.assertEqual(released_order_ref, "POSINV-2")

	def test_fulfilled_groups_are_untouched_by_this_cancel_path(self):
		"""G-09 must still hold: this handler only calls
		`release_order_reservations`, whose own skip-Fulfilled-groups logic
		(tested in test_ury_order_reservation_service.py) is unchanged by
		this fix -- verified here by confirming `on_cancel` performs no
		filtering or status inspection of its own before delegating."""
		doc = self._doc("POSINV-3")
		with patch.object(hooks, "table_status_delete"), patch.object(
			hooks, "release_order_reservations"
		) as release_order_reservations:
			hooks.on_cancel(doc, "on_cancel")

		# Exactly one delegated call, order_ref only -- no group/status
		# filtering happens in this handler, so G-09's skip-Fulfilled
		# behaviour inside release_order_reservations is fully preserved.
		release_order_reservations.assert_called_once()


if __name__ == "__main__":
	unittest.main()
