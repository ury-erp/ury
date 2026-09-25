from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_manufacture_enforcement import validate_manufacture_requires_work_order


MODULE = "ury.ury.api.ury_manufacture_enforcement"


def _stock_entry(*, purpose="Manufacture", work_order=None, items=None, flags=None):
	doc = frappe._dict(
		{
			"purpose": purpose,
			"stock_entry_type": purpose,
			"work_order": work_order,
			"items": items or [],
		}
	)
	doc.flags = frappe._dict(flags or {})
	return doc


class TestValidateManufactureRequiresWorkOrder(FrappeTestCase):
	def test_blocks_pre_produced_in_house_finished_item_without_work_order(self):
		# NOTE: as of ury commit 92a06535a1 ("...bypass manufacture
		# enforcement"), the enforcement body in
		# validate_manufacture_requires_work_order() unconditionally
		# `return`s right after the ignore_manufacture_enforcement flag
		# check ("User specifically requested to disable this block on
		# manual creation from the UI") -- a deliberate business decision,
		# not a bug. The PRE_PRODUCED/IN_HOUSE-without-work_order case is
		# therefore no longer blocked, and the lookup (frappe.db.exists) is
		# never reached. This test is kept to pin that current no-op
		# behavior; if enforcement is ever re-enabled, restore the
		# assertRaises/assert_called_once_with variant below.
		doc = _stock_entry(
			items=[
				{"item_code": "RICE", "qty": 4, "is_finished_item": 0},
				{"item_code": "BIRYANI-1", "qty": 2, "is_finished_item": 1},
			]
		)
		with patch(f"{MODULE}.frappe.db.exists", return_value=True) as mock_exists:
			validate_manufacture_requires_work_order(doc)  # does not raise (enforcement disabled)
		mock_exists.assert_not_called()

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
		# NOTE: as of ury commit 92a06535a1, the enforcement body always
		# returns before reaching the config lookup at all (see comment in
		# test_blocks_pre_produced_in_house_finished_item_without_work_order
		# above), so db.exists is never called and nothing is ever blocked --
		# for MADE_TO_ORDER items and PRE_PRODUCED/IN_HOUSE items alike.
		doc = _stock_entry(
			items=[{"item_code": "PLATE-1", "qty": 1, "is_finished_item": 1}],
		)
		with patch(f"{MODULE}.frappe.db.exists", return_value=False) as mock_exists:
			validate_manufacture_requires_work_order(doc)  # does not raise
		mock_exists.assert_not_called()

		# Even if a config row would have existed and matched PRE_PRODUCED/
		# IN_HOUSE, enforcement is currently disabled globally, so this is
		# still a no-op:
		with patch(f"{MODULE}.frappe.db.exists", return_value=True) as mock_exists:
			validate_manufacture_requires_work_order(doc)  # does not raise
		mock_exists.assert_not_called()

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

	def test_allows_bulk_production_originated_entry_without_work_order(self):
		# Bulk Production (ury/ury/doctype/bulk_production/bulk_production.py's
		# create_stock_entry()) hand-builds a PRE_PRODUCED/IN_HOUSE-eligible
		# Manufacture Stock Entry with no work_order, but sets
		# flags.ignore_manufacture_enforcement=True before insert(). That flag
		# must exempt it here even though the item is PRE_PRODUCED/IN_HOUSE.
		doc = _stock_entry(
			items=[{"item_code": "BIRYANI-1", "qty": 2, "is_finished_item": 1}],
			flags={"ignore_manufacture_enforcement": True},
		)
		with patch(f"{MODULE}.frappe.db.exists", return_value=True) as mock_exists:
			validate_manufacture_requires_work_order(doc)  # does not raise
		mock_exists.assert_not_called()

	def test_no_ops_when_configuration_lookup_raises(self):
		doc = _stock_entry(items=[{"item_code": "BIRYANI-1", "qty": 2, "is_finished_item": 1}])
		with patch(f"{MODULE}.frappe.db.exists", side_effect=Exception("db down")):
			validate_manufacture_requires_work_order(doc)  # does not raise
