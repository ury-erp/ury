from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_manufacture_enforcement import validate_manufacture_requires_work_order


MODULE = "ury.ury.api.ury_manufacture_enforcement"


def _stock_entry(*, purpose="Manufacture", work_order=None, items=None):
	return frappe._dict(
		{
			"purpose": purpose,
			"stock_entry_type": purpose,
			"work_order": work_order,
			"items": items or [],
		}
	)


class TestValidateManufactureRequiresWorkOrder(FrappeTestCase):
	def test_blocks_pre_produced_in_house_finished_item_without_work_order(self):
		doc = _stock_entry(
			items=[
				{"item_code": "RICE", "qty": 4, "is_finished_item": 0},
				{"item_code": "BIRYANI-1", "qty": 2, "is_finished_item": 1},
			]
		)
		with patch(f"{MODULE}.frappe.db.exists", return_value=True) as mock_exists:
			with self.assertRaises(frappe.ValidationError):
				validate_manufacture_requires_work_order(doc)
		mock_exists.assert_called_once_with(
			"URY Item Production Configuration",
			{
				"item": "BIRYANI-1",
				"active": 1,
				"production_policy": "PRE_PRODUCED",
				"sourcing_mode": "IN_HOUSE",
			},
		)

	def test_allows_pre_produced_in_house_finished_item_with_work_order(self):
		doc = _stock_entry(
			work_order="WO-1",
			items=[
				{"item_code": "RICE", "qty": 4, "is_finished_item": 0},
				{"item_code": "BIRYANI-1", "qty": 2, "is_finished_item": 1},
			],
		)
		with patch(f"{MODULE}.frappe.db.exists") as mock_exists:
			validate_manufacture_requires_work_order(doc)  # does not raise
		mock_exists.assert_not_called()

	def test_never_blocks_made_to_order_finished_item_regardless_of_work_order(self):
		doc = _stock_entry(
			items=[{"item_code": "PLATE-1", "qty": 1, "is_finished_item": 1}],
		)
		with patch(f"{MODULE}.frappe.db.exists", return_value=False) as mock_exists:
			validate_manufacture_requires_work_order(doc)  # does not raise
		mock_exists.assert_called_once()

		# Even if a config row happened to exist but is not PRE_PRODUCED/IN_HOUSE
		# (e.g. MADE_TO_ORDER), db.exists (filtered on those exact values) would
		# return False and the entry is never blocked -- exercised directly:
		with patch(f"{MODULE}.frappe.db.exists", return_value=True):
			with self.assertRaises(frappe.ValidationError):
				validate_manufacture_requires_work_order(doc)
		# (this second call demonstrates enforcement only fires when the
		# PRE_PRODUCED/IN_HOUSE-filtered exists() check is True)

	def test_ignores_non_manufacture_stock_entries(self):
		doc = _stock_entry(
			purpose="Material Receipt",
			items=[{"item_code": "BIRYANI-1", "qty": 2, "is_finished_item": 1}],
		)
		with patch(f"{MODULE}.frappe.db.exists") as mock_exists:
			validate_manufacture_requires_work_order(doc)  # does not raise
		mock_exists.assert_not_called()

	def test_ignores_non_finished_item_rows(self):
		doc = _stock_entry(items=[{"item_code": "RICE", "qty": 4, "is_finished_item": 0}])
		with patch(f"{MODULE}.frappe.db.exists") as mock_exists:
			validate_manufacture_requires_work_order(doc)  # does not raise
		mock_exists.assert_not_called()

	def test_no_ops_when_configuration_lookup_raises(self):
		doc = _stock_entry(items=[{"item_code": "BIRYANI-1", "qty": 2, "is_finished_item": 1}])
		with patch(f"{MODULE}.frappe.db.exists", side_effect=Exception("db down")):
			validate_manufacture_requires_work_order(doc)  # does not raise
