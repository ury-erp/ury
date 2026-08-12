import unittest
from unittest.mock import patch, MagicMock
import frappe
from ury.ury_pos.api import merge_bills

class TestMergeBillsSEC07(unittest.TestCase):

    @patch("ury.ury_pos.api.frappe.get_doc")
    @patch("ury.ury_pos.api.frappe.has_permission")
    @patch("ury.ury_pos.api.frappe.db.rollback")
    def test_merge_bills_no_permission_primary(self, mock_rollback, mock_has_permission, mock_get_doc):
        mock_primary = MagicMock()
        mock_secondary = MagicMock()
        mock_get_doc.side_effect = [mock_primary, mock_secondary]
        
        # Primary doc fails permission check
        mock_has_permission.side_effect = lambda doctype, ptype, doc: doc == mock_secondary
        
        with self.assertRaises(frappe.PermissionError):
            merge_bills("INV-01", "INV-02")
            
        mock_rollback.assert_called_once()

    @patch("ury.ury_pos.api.frappe.get_doc")
    @patch("ury.ury_pos.api.frappe.has_permission")
    @patch("ury.ury_pos.api.frappe.db.rollback")
    def test_merge_bills_no_permission_secondary(self, mock_rollback, mock_has_permission, mock_get_doc):
        mock_primary = MagicMock()
        mock_secondary = MagicMock()
        mock_get_doc.side_effect = [mock_primary, mock_secondary]
        
        # Secondary doc fails permission check
        mock_has_permission.side_effect = lambda doctype, ptype, doc: doc == mock_primary
        
        with self.assertRaises(frappe.PermissionError):
            merge_bills("INV-01", "INV-02")
            
        mock_rollback.assert_called_once()

    @patch("ury.ury_pos.api.frappe.get_doc")
    @patch("ury.ury_pos.api.frappe.has_permission")
    @patch("ury.ury_pos.api.frappe.db.rollback")
    @patch("ury.ury_pos.api.frappe.throw")
    @patch("ury.ury_pos.api.frappe.log_error")
    def test_merge_bills_different_branches(self, mock_log_error, mock_throw, mock_rollback, mock_has_permission, mock_get_doc):
        mock_primary = MagicMock()
        mock_primary.branch = "Branch A"
        mock_primary.docstatus = 0
        mock_secondary = MagicMock()
        mock_secondary.branch = "Branch B"
        mock_secondary.docstatus = 0
        mock_get_doc.side_effect = [mock_primary, mock_secondary]
        
        mock_has_permission.return_value = True
        
        # In api.py, frappe.throw is called, which we mock to raise an Exception.
        # But api.py has a generic `except Exception as e:` that swallows it and logs it.
        # So we just verify that frappe.throw was called appropriately.
        mock_throw.side_effect = Exception("Cannot merge bills from different branches.")
        
        merge_bills("INV-01", "INV-02")
        
        mock_throw.assert_called_once_with("Cannot merge bills from different branches.")
        mock_rollback.assert_called_once()

    @patch("ury.ury_pos.api.frappe.get_doc")
    @patch("ury.ury_pos.api.frappe.has_permission")
    @patch("ury.ury_pos.api.frappe.db.set_value")
    @patch("ury.ury_pos.api.frappe.db.commit")
    def test_merge_bills_success(self, mock_commit, mock_set_value, mock_has_permission, mock_get_doc):
        mock_primary = MagicMock()
        mock_primary.name = "INV-01"
        mock_primary.branch = "Branch A"
        mock_primary.docstatus = 0
        mock_primary.custom_merged_pos_invoice = None
        mock_primary.items = [MagicMock(item_code="Item 1")]
        
        mock_secondary = MagicMock()
        mock_secondary.name = "INV-02"
        mock_secondary.branch = "Branch A"
        mock_secondary.docstatus = 0
        mock_secondary.custom_merged_pos_invoice = None
        mock_secondary.items = [MagicMock(item_code="Item 2")]
        
        # When update_merge_details calls frappe.get_doc again
        def get_doc_side_effect(doctype, name):
            if name == "INV-01":
                return mock_primary
            elif name == "INV-02":
                return mock_secondary
            return MagicMock()
            
        mock_get_doc.side_effect = get_doc_side_effect
        mock_has_permission.return_value = True
        
        result = merge_bills("INV-01", "INV-02")
        
        self.assertEqual(result["status"], "success")
        self.assertEqual(result["name"], "INV-01")
        mock_commit.assert_called_once()
        self.assertEqual(mock_set_value.call_count, 2)
        mock_primary.save.assert_called_once_with(ignore_version=True)
        mock_secondary.save.assert_called_once_with(ignore_version=True)

if __name__ == "__main__":
    unittest.main()
