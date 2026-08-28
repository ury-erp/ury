from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

# Captured before any test patches frappe.db.get_value, so drift tests that
# need the real DB lookup (e.g. inside now_datetime()) can still reach it.
_REAL_DB_GET_VALUE = frappe.db.get_value

from ury.ury.api.ury_inventory_projection import (
	get_allocatable_qty,
	project_fg_allocatable,
	project_component_allocatable,
	reconcile_projection,
)


class TestGetAllocatableQty(FrappeTestCase):
	@patch("ury.ury.api.ury_inventory_projection.frappe.db.get_value")
	def test_allocatable_qty_from_bin_projected_qty_zero_reservations(self, mock_get_value):
		# Bin.projected_qty=40 minus a stubbed (always-0) reservation qty.
		mock_get_value.return_value = frappe._dict({"actual_qty": 50, "projected_qty": 40})

		result = get_allocatable_qty("URY-FG-ITEM", "Main - URY", "URY Co")

		self.assertEqual(result["bin_actual_qty"], 50)
		self.assertEqual(result["bin_projected_qty"], 40)
		self.assertEqual(result["ury_reservation_qty"], 0)
		self.assertEqual(result["allocatable_qty"], 40)

	@patch("ury.ury.api.ury_inventory_projection.frappe.db.get_value")
	def test_allocatable_qty_missing_bin_returns_zero(self, mock_get_value):
		mock_get_value.return_value = None

		result = get_allocatable_qty("URY-FG-ITEM", "Main - URY", "URY Co")

		self.assertEqual(result["bin_actual_qty"], 0)
		self.assertEqual(result["bin_projected_qty"], 0)
		self.assertEqual(result["allocatable_qty"], 0)


class TestProjectFgAllocatable(FrappeTestCase):
	@patch("ury.ury.api.ury_inventory_projection.frappe.db.get_value")
	def test_fg_allocatable_matches_bin_projected_qty_minus_reservations(self, mock_get_value):
		mock_get_value.return_value = frappe._dict({"actual_qty": 100, "projected_qty": 80})

		result = project_fg_allocatable("URY-CAKE-001", "FG - Kitchen - URY", "URY Co")

		# Reservation stub returns 0, so fg_allocatable == bin_projected_qty.
		self.assertEqual(result["allocatable_qty"], 80)
		self.assertEqual(result["item_code"], "URY-CAKE-001")
		self.assertEqual(result["warehouse"], "FG - Kitchen - URY")


class TestProjectComponentAllocatable(FrappeTestCase):
	@patch("ury.ury.api.ury_inventory_projection.frappe.db.get_value")
	def test_maps_multiple_components_to_their_own_allocatable_qty(self, mock_get_value):
		bin_rows = {
			"URY-FLOUR": frappe._dict({"actual_qty": 20, "projected_qty": 15}),
			"URY-SUGAR": frappe._dict({"actual_qty": 5, "projected_qty": 5}),
			"URY-EGGS": frappe._dict({"actual_qty": 0, "projected_qty": 0}),
		}

		def fake_get_value(doctype, filters, fieldnames, **kwargs):
			return bin_rows[filters["item_code"]]

		mock_get_value.side_effect = fake_get_value

		result = project_component_allocatable(
			["URY-FLOUR", "URY-SUGAR", "URY-EGGS"], "Component - Kitchen - URY", "URY Co"
		)

		self.assertEqual(set(result.keys()), {"URY-FLOUR", "URY-SUGAR", "URY-EGGS"})
		self.assertEqual(result["URY-FLOUR"]["allocatable_qty"], 15)
		self.assertEqual(result["URY-SUGAR"]["allocatable_qty"], 5)
		self.assertEqual(result["URY-EGGS"]["allocatable_qty"], 0)

	@patch("ury.ury.api.ury_inventory_projection.frappe.db.get_value")
	def test_duplicate_components_are_deduped_and_queried_once(self, mock_get_value):
		mock_get_value.return_value = frappe._dict({"actual_qty": 10, "projected_qty": 10})

		result = project_component_allocatable(
			["URY-FLOUR", "URY-FLOUR"], "Component - Kitchen - URY", "URY Co"
		)

		self.assertEqual(list(result.keys()), ["URY-FLOUR"])
		self.assertEqual(mock_get_value.call_count, 1)


class TestReconcileProjection(FrappeTestCase):
	@patch("ury.ury.api.ury_inventory_projection.frappe.db.get_value")
	def test_no_drift_returns_none(self, mock_get_value):
		mock_get_value.return_value = 25

		result = reconcile_projection("URY-CAKE-001", "FG - Kitchen - URY", "URY Co", cached_qty=25)

		self.assertIsNone(result)

	@patch("ury.ury.api.ury_inventory_projection.frappe.db.get_value")
	def test_drift_detected_when_cached_and_actual_differ(self, mock_get_value):
		# Only stub the Bin lookup; real frappe.db.get_value is still needed
		# internally by now_datetime()/get_system_settings() on the drift path.
		def fake_get_value(doctype, *args, **kwargs):
			if doctype == "Bin":
				return 10
			return _REAL_DB_GET_VALUE(doctype, *args, **kwargs)

		mock_get_value.side_effect = fake_get_value

		result = reconcile_projection("URY-CAKE-001", "FG - Kitchen - URY", "URY Co", cached_qty=25)

		self.assertIsNotNone(result)
		self.assertEqual(result["cached_qty"], 25)
		self.assertEqual(result["actual_qty"], 10)
		self.assertEqual(result["drift"], -15)
		self.assertEqual(result["reason"], "bin_actual_qty_mismatch")
		self.assertIn("as_of", result)

	@patch("ury.ury.api.ury_inventory_projection.frappe.db.get_value")
	def test_missing_bin_treated_as_zero_actual_qty_and_reported_as_drift(self, mock_get_value):
		# No Bin row for this item/warehouse combo -> get_value returns None.
		mock_get_value.return_value = None

		result = reconcile_projection("URY-CAKE-001", "FG - Kitchen - URY", "URY Co", cached_qty=25)

		self.assertIsNotNone(result)
		self.assertEqual(result["actual_qty"], 0)
		self.assertEqual(result["drift"], -25)
		self.assertEqual(result["reason"], "bin_row_missing")

	@patch("ury.ury.api.ury_inventory_projection.frappe.db.get_value")
	def test_missing_bin_with_zero_cached_qty_is_no_drift(self, mock_get_value):
		mock_get_value.return_value = None

		result = reconcile_projection("URY-CAKE-001", "FG - Kitchen - URY", "URY Co", cached_qty=0)

		self.assertIsNone(result)
