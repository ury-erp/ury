# Copyright (c) 2026, Tridz Technologies Pvt. Ltd. and contributors
# See license.txt

import unittest
from unittest.mock import MagicMock, patch

from ury.patches.v3_32.fix_stock_entry_branch_field_layout import execute
from ury.setup_customizations import get_custom_fields


class TestFixStockEntryBranchFieldLayout(unittest.TestCase):
	def test_stock_entry_custom_fields_definition(self):
		"""Assert setup_customizations defines branch with insert_after: company."""
		fields = get_custom_fields().get("Stock Entry", [])
		branch_fields = [f for f in fields if f.get("fieldname") == "branch"]
		self.assertEqual(len(branch_fields), 1)
		self.assertEqual(branch_fields[0].get("insert_after"), "company")
		self.assertEqual(branch_fields[0].get("fieldtype"), "Link")
		self.assertEqual(branch_fields[0].get("options"), "Branch")

	@patch("ury.patches.v3_32.fix_stock_entry_branch_field_layout.frappe")
	@patch("ury.patches.v3_32.fix_stock_entry_branch_field_layout.create_custom_fields")
	def test_patch_execute_updates_custom_field_and_field_order(self, mock_create, mock_frappe):
		mock_field1 = MagicMock(fieldname="stock_entry_details_tab")
		mock_field2 = MagicMock(fieldname="company")
		mock_field3 = MagicMock(fieldname="naming_series")
		mock_field4 = MagicMock(fieldname="stock_entry_type")
		mock_field5 = MagicMock(fieldname="purpose")
		mock_field6 = MagicMock(fieldname="branch")
		mock_field7 = MagicMock(fieldname="set_posting_time")
		mock_field8 = MagicMock(fieldname="inspection_required")
		mock_meta = MagicMock()
		mock_meta.fields = [
			mock_field1,
			mock_field2,
			mock_field3,
			mock_field4,
			mock_field5,
			mock_field6,
			mock_field7,
			mock_field8,
		]
		mock_frappe.get_meta.return_value = mock_meta
		mock_frappe.db.exists.return_value = True

		execute()

		mock_create.assert_called_once()
		mock_frappe.db.exists.assert_any_call("Custom Field", "Stock Entry-branch")
		mock_frappe.db.set_value.assert_any_call(
			"Custom Field",
			"Stock Entry-branch",
			"insert_after",
			"company",
			update_modified=False,
		)
		mock_frappe.db.exists.assert_any_call("Property Setter", "Stock Entry-main-field_order")
		mock_frappe.clear_cache.assert_called_with(doctype="Stock Entry")
