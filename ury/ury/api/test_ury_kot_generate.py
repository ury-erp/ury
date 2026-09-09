"""Tests for ury_kot_generate.

Tests cover the KOT generation workflow including item processing,
KOT document creation, cancellation, and array comparison utilities.
"""

import json
from unittest.mock import MagicMock, patch

import frappe
from frappe.tests.utils import FrappeTestCase

from ury.ury.api.ury_kot_generate import (
    load_json,
    create_order_items,
    create_kot_doc,
    get_all_production_item_groups,
    process_items_for_kot,
    process_items_for_cancel_kot,
    create_cancel_kot_doc,
    compare_two_array,
    get_removed_items,
)

MODULE = "ury.ury.api.ury_kot_generate"


class TestLoadJson(FrappeTestCase):
    """Tests for load_json utility function."""

    def test_load_json_from_string(self):
        """Test loading JSON from a string."""
        json_string = '{"key": "value", "number": 42}'
        result = load_json(json_string)
        self.assertEqual(result, {"key": "value", "number": 42})

    def test_load_json_returns_dict_as_is(self):
        """Test that a dict is returned unchanged."""
        data = {"key": "value"}
        result = load_json(data)
        self.assertEqual(result, data)
        self.assertIs(result, data)

    def test_load_json_with_list_string(self):
        """Test loading JSON array from string."""
        json_string = '[{"item": "A"}, {"item": "B"}]'
        result = load_json(json_string)
        self.assertEqual(result, [{"item": "A"}, {"item": "B"}])

    def test_load_json_with_empty_dict(self):
        """Test loading empty dict."""
        result = load_json({})
        self.assertEqual(result, {})


class TestCreateOrderItems(FrappeTestCase):
    """Tests for create_order_items function."""

    def test_create_order_items_basic(self):
        """Test creating order items from input items."""
        items = [
            {
                "item": "ITEM-001",
                "item_code": "ITEM-001",
                "qty": 2,
                "item_name": "Biryani",
                "comment": "Extra spicy",
            }
        ]
        result = create_order_items(items)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["item_code"], "ITEM-001")
        self.assertEqual(result[0]["qty"], 2)
        self.assertEqual(result[0]["item_name"], "Biryani")
        self.assertEqual(result[0]["comments"], "Extra spicy")

    def test_create_order_items_fallback_to_item_code(self):
        """Test fallback to item_code when item field is missing."""
        items = [{"item_code": "ITEM-002", "qty": 1, "item_name": "Pizza"}]
        result = create_order_items(items)
        self.assertEqual(result[0]["item_code"], "ITEM-002")

    def test_create_order_items_empty_comments(self):
        """Test handling items with no comments."""
        items = [{"item": "ITEM-003", "qty": 1, "item_name": "Samosa"}]
        result = create_order_items(items)
        self.assertEqual(result[0]["comments"], "")

    def test_create_order_items_multiple_items(self):
        """Test creating multiple order items."""
        items = [
            {"item": "ITEM-001", "qty": 2, "item_name": "Biryani"},
            {"item": "ITEM-002", "qty": 1, "item_name": "Pizza"},
        ]
        result = create_order_items(items)
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]["item_code"], "ITEM-001")
        self.assertEqual(result[1]["item_code"], "ITEM-002")


class TestCompareArrays(FrappeTestCase):
    """Tests for compare_two_array function."""

    def test_compare_arrays_identical(self):
        """Test comparing identical arrays returns empty."""
        array1 = [
            {"item_code": "ITEM-001", "qty": 2, "item_name": "Biryani"},
        ]
        array2 = [
            {"item_code": "ITEM-001", "qty": 2, "item_name": "Biryani"},
        ]
        result = compare_two_array(array1, array2)
        self.assertEqual(result, [])

    def test_compare_arrays_with_quantity_difference(self):
        """Test array comparison with quantity changes."""
        array1 = [
            {"item_code": "ITEM-001", "qty": 3, "item_name": "Biryani"},
        ]
        array2 = [
            {"item_code": "ITEM-001", "qty": 1, "item_name": "Biryani"},
        ]
        result = compare_two_array(array1, array2)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["item_code"], "ITEM-001")
        self.assertEqual(result[0]["qty"], 2)

    def test_compare_arrays_with_new_item(self):
        """Test comparison when array1 has new items not in array2."""
        array1 = [
            {"item_code": "ITEM-001", "qty": 2, "item_name": "Biryani"},
            {"item_code": "ITEM-002", "qty": 1, "item_name": "Pizza"},
        ]
        array2 = [
            {"item_code": "ITEM-001", "qty": 2, "item_name": "Biryani"},
        ]
        result = compare_two_array(array1, array2)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["item_code"], "ITEM-002")
        self.assertEqual(result[0]["qty"], 1)

    def test_compare_arrays_with_negative_qty(self):
        """Test array comparison when quantity decreases below array2."""
        array1 = [
            {"item_code": "ITEM-001", "qty": 1, "item_name": "Biryani"},
        ]
        array2 = [
            {"item_code": "ITEM-001", "qty": 3, "item_name": "Biryani"},
        ]
        result = compare_two_array(array1, array2)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["qty"], -2)


class TestGetRemovedItems(FrappeTestCase):
    """Tests for get_removed_items function."""

    def test_get_removed_items_none(self):
        """Test when no items are removed."""
        array1 = [
            {"item_code": "ITEM-001", "qty": 2, "item_name": "Biryani"},
        ]
        array2 = [
            {"item_code": "ITEM-001", "qty": 2, "item_name": "Biryani"},
        ]
        result = get_removed_items(array1, array2)
        self.assertEqual(result, [])

    def test_get_removed_items_one_removed(self):
        """Test detecting single removed item."""
        array1 = [
            {"item_code": "ITEM-001", "qty": 2, "item_name": "Biryani"},
            {"item_code": "ITEM-002", "qty": 1, "item_name": "Pizza"},
        ]
        array2 = [
            {"item_code": "ITEM-001", "qty": 2, "item_name": "Biryani"},
        ]
        result = get_removed_items(array1, array2)
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["item_code"], "ITEM-002")

    def test_get_removed_items_multiple_removed(self):
        """Test detecting multiple removed items."""
        array1 = [
            {"item_code": "ITEM-001", "qty": 2, "item_name": "Biryani"},
            {"item_code": "ITEM-002", "qty": 1, "item_name": "Pizza"},
            {"item_code": "ITEM-003", "qty": 1, "item_name": "Samosa"},
        ]
        array2 = [
            {"item_code": "ITEM-001", "qty": 2, "item_name": "Biryani"},
        ]
        result = get_removed_items(array1, array2)
        self.assertEqual(len(result), 2)
        removed_codes = [item["item_code"] for item in result]
        self.assertIn("ITEM-002", removed_codes)
        self.assertIn("ITEM-003", removed_codes)


class TestGetAllProductionItemGroups(FrappeTestCase):
    """Tests for get_all_production_item_groups function."""

    @patch(f"{MODULE}.frappe.db.get_all")
    @patch(f"{MODULE}.frappe.get_all")
    def test_get_production_item_groups_single_unit(self, mock_get_all, mock_db_get_all):
        """Test getting item groups from a single production unit."""
        mock_db_get_all.return_value = [frappe._dict({"name": "UNIT-1"})]
        mock_get_all.return_value = [
            frappe._dict({"item_group": "Grills"}),
            frappe._dict({"item_group": "Fryer"}),
        ]

        result = get_all_production_item_groups("Branch-1")

        self.assertEqual(result, {"Grills", "Fryer"})

    @patch(f"{MODULE}.frappe.db.get_all")
    @patch(f"{MODULE}.frappe.get_all")
    def test_get_production_item_groups_multiple_units(self, mock_get_all, mock_db_get_all):
        """Test getting item groups from multiple production units."""
        mock_db_get_all.return_value = [
            frappe._dict({"name": "UNIT-1"}),
            frappe._dict({"name": "UNIT-2"}),
        ]
        
        def get_all_side_effect(doctype, filters=None, fields=None, order_by=None):
            if filters.get("parent") == "UNIT-1":
                return [frappe._dict({"item_group": "Grills"})]
            elif filters.get("parent") == "UNIT-2":
                return [
                    frappe._dict({"item_group": "Fryer"}),
                    frappe._dict({"item_group": "Grill"}),
                ]
            return []

        mock_get_all.side_effect = get_all_side_effect

        result = get_all_production_item_groups("Branch-1")

        self.assertEqual(result, {"Grills", "Fryer", "Grill"})

    @patch(f"{MODULE}.frappe.db.get_all")
    def test_get_production_item_groups_no_units(self, mock_db_get_all):
        """Test when no production units exist for branch."""
        mock_db_get_all.return_value = []

        result = get_all_production_item_groups("Branch-1")

        self.assertIsNone(result)

    @patch(f"{MODULE}.frappe.db.get_all")
    @patch(f"{MODULE}.frappe.get_all")
    def test_get_production_item_groups_empty_item_groups(self, mock_get_all, mock_db_get_all):
        """Test production unit with no item groups."""
        mock_db_get_all.return_value = [frappe._dict({"name": "UNIT-1"})]
        mock_get_all.return_value = []

        result = get_all_production_item_groups("Branch-1")

        self.assertEqual(result, set())


class TestCreateKotDoc(FrappeTestCase):
    """Tests for create_kot_doc function."""

    @patch(f"{MODULE}.frappe.get_doc")
    @patch(f"{MODULE}.frappe.db.get_value")
    @patch(f"{MODULE}.getBranch")
    def test_create_kot_doc_with_table(self, mock_get_branch, mock_db_get_value, mock_get_doc):
        """Test creating a KOT document with restaurant table."""
        mock_get_branch.return_value = "Branch-1"
        mock_db_get_value.side_effect = [
            MagicMock(custom_ury_order_number="ORD-123", custom_merged_tables="T1,T2", 
                     order_type="Dine In", custom_aggregator_id=None),  # pos_invoice
            "Room-1",  # room from table
            "Restaurant-1",  # restaurant from table
            "MENU-1",  # menu from room
            "Appetizer",  # course from menu item
        ]

        mock_kot_doc = MagicMock()
        mock_kot_doc.name = "KOT-001"
        mock_get_doc.return_value = mock_kot_doc

        items = [{"item_code": "ITEM-001", "item_name": "Biryani", "qty": 2, "comments": ""}]

        result = create_kot_doc(
            "INV-001",
            "John Doe",
            "TABLE-1",
            items,
            "New Order",
            "Table is busy",
            "POS-PROF-1",
            "KOT-",
            "UNIT-1",
        )

        self.assertEqual(result, "KOT-001")
        mock_kot_doc.append.assert_called_once()
        mock_kot_doc.insert.assert_called_once()
        mock_kot_doc.submit.assert_called_once()

    @patch(f"{MODULE}.frappe.get_doc")
    @patch(f"{MODULE}.frappe.db.get_value")
    @patch(f"{MODULE}.getBranch")
    def test_create_kot_doc_without_table(self, mock_get_branch, mock_db_get_value, mock_get_doc):
        """Test creating a KOT document without restaurant table (takeaway)."""
        mock_get_branch.return_value = "Branch-1"
        mock_db_get_value.side_effect = [
            MagicMock(custom_ury_order_number="ORD-124", custom_merged_tables=None, 
                     order_type="Takeaway", custom_aggregator_id=None),  # pos_invoice
            "MENU-1",  # active menu from branch
            "Appetizer",  # course
        ]

        mock_kot_doc = MagicMock()
        mock_kot_doc.name = "KOT-002"
        mock_get_doc.return_value = mock_kot_doc

        items = [{"item_code": "ITEM-002", "item_name": "Pizza", "qty": 1, "comments": ""}]

        result = create_kot_doc(
            "INV-002",
            "Jane Doe",
            None,
            items,
            "New Order",
            "",
            "POS-PROF-1",
            "KOT-",
            "UNIT-2",
        )

        self.assertEqual(result, "KOT-002")


class TestProcessItemsForKot(FrappeTestCase):
    """Tests for process_items_for_kot function."""

    @patch(f"{MODULE}.create_kot_doc")
    @patch(f"{MODULE}.get_all_production_item_groups")
    @patch(f"{MODULE}.frappe.db.get_value")
    @patch(f"{MODULE}.frappe.get_all")
    @patch(f"{MODULE}.frappe.db.get_all")
    @patch(f"{MODULE}.frappe.db.exists")
    @patch(f"{MODULE}.frappe.get_doc")
    def test_process_items_for_kot_success(
        self,
        mock_get_doc,
        mock_db_exists,
        mock_db_get_all,
        mock_get_all,
        mock_db_get_value,
        mock_get_production_groups,
        mock_create_kot,
    ):
        """Test successfully processing items for KOT creation."""
        mock_get_doc.return_value = frappe._dict({"branch": "Branch-1"})
        mock_db_get_all.return_value = [frappe._dict({"name": "UNIT-1"})]
        mock_get_production_groups.return_value = {"Grills"}
        mock_db_get_value.return_value = "Grills"
        mock_db_exists.return_value = False
        # Mock get_all to return item groups for the production unit
        mock_get_all.return_value = [frappe._dict({"item_group": "Grills"})]
        mock_create_kot.return_value = "KOT-001"

        items = [
            {"item_code": "ITEM-001", "qty": 2, "item_name": "Biryani", "comments": ""}
        ]

        result = process_items_for_kot(
            "INV-001",
            "John Doe",
            "TABLE-1",
            items,
            "Special request",
            "POS-PROF-1",
            "KOT-",
            "New Order",
        )

        self.assertEqual(result, ["KOT-001"])
        mock_create_kot.assert_called_once()

    @patch(f"{MODULE}.frappe.db.get_all")
    @patch(f"{MODULE}.frappe.throw")
    @patch(f"{MODULE}.frappe.get_doc")
    def test_process_items_for_kot_no_production_units(
        self, mock_get_doc, mock_throw, mock_db_get_all
    ):
        """Test when no production units exist for branch."""
        mock_get_doc.return_value = frappe._dict({"branch": "Branch-1", "name": "POS-PROF-1"})
        mock_db_get_all.return_value = []
        mock_throw.side_effect = frappe.ValidationError("Create URY Production unit")

        items = [
            {"item_code": "ITEM-001", "qty": 2, "item_name": "Biryani", "comments": ""}
        ]

        with self.assertRaises(frappe.ValidationError):
            process_items_for_kot(
                "INV-001",
                "John Doe",
                "TABLE-1",
                items,
                "",
                "POS-PROF-1",
                "KOT-",
                "New Order",
            )

    @patch(f"{MODULE}.create_kot_doc")
    @patch(f"{MODULE}.get_all_production_item_groups")
    @patch(f"{MODULE}.frappe.db.get_value")
    @patch(f"{MODULE}.frappe.get_all")
    @patch(f"{MODULE}.frappe.db.get_all")
    @patch(f"{MODULE}.frappe.db.exists")
    @patch(f"{MODULE}.frappe.get_doc")
    @patch(f"{MODULE}.frappe.msgprint")
    def test_process_items_for_kot_unmapped_item_group(
        self,
        mock_msgprint,
        mock_get_doc,
        mock_db_exists,
        mock_db_get_all,
        mock_get_all,
        mock_db_get_value,
        mock_get_production_groups,
        mock_create_kot,
    ):
        """Test handling items with unmapped item groups."""
        mock_get_doc.return_value = frappe._dict({"branch": "Branch-1"})
        mock_db_get_all.return_value = [frappe._dict({"name": "UNIT-1"})]
        mock_get_production_groups.return_value = {"Grills"}
        mock_db_get_value.side_effect = [
            "Unmapped",  # item group for ITEM-001
            "Grills",    # item group check for production
        ]
        mock_get_all.return_value = [frappe._dict({"item_group": "Grills"})]

        items = [
            {"item_code": "ITEM-001", "qty": 2, "item_name": "Biryani", "comments": ""}
        ]

        result = process_items_for_kot(
            "INV-001",
            "John Doe",
            "TABLE-1",
            items,
            "",
            "POS-PROF-1",
            "KOT-",
            "New Order",
        )

        mock_msgprint.assert_called()


class TestCreateCancelKotDoc(FrappeTestCase):
    """Tests for create_cancel_kot_doc function."""

    @patch(f"{MODULE}.frappe.get_doc")
    @patch(f"{MODULE}.frappe.db.get_value")
    @patch(f"{MODULE}.frappe.db.get_list")
    @patch(f"{MODULE}.getBranch")
    def test_create_cancel_kot_doc_success(
        self, mock_get_branch, mock_db_get_list, mock_db_get_value, mock_get_doc
    ):
        """Test successfully creating a cancel KOT document."""
        mock_get_branch.return_value = "Branch-1"
        
        # Create a mock KOT doc with items
        mock_kot_item = MagicMock()
        mock_kot_item.item = "ITEM-001"
        mock_kot = MagicMock()
        mock_kot.name = "KOT-001"
        mock_kot.kot_items = [mock_kot_item]
        mock_db_get_list.return_value = [mock_kot]
        
        mock_db_get_value.side_effect = [
            MagicMock(custom_ury_order_number="ORD-123", order_type="Dine In", 
                     custom_aggregator_id=None),  # pos_invoice
            "Room-1",  # room
            "Restaurant-1",  # restaurant
            "MENU-1",  # menu
            "Appetizer",  # course
        ]

        mock_cancel_doc = MagicMock()
        mock_cancel_doc.name = "CNCL-KOT-001"
        mock_get_doc.return_value = mock_cancel_doc

        cancel_items = [
            {"item_code": "ITEM-001", "item_name": "Biryani", "qty": -1, "comments": ""}
        ]
        invoice_items = [
            {"item_code": "ITEM-001", "qty": 2}
        ]

        result = create_cancel_kot_doc(
            "INV-001",
            "TABLE-1",
            cancel_items,
            "Partially cancelled",
            "John Doe",
            "",
            "POS-PROF-1",
            "CNCL-KOT-",
            invoice_items,
            "UNIT-1",
        )

        self.assertEqual(result, "CNCL-KOT-001")
        mock_cancel_doc.insert.assert_called_once()
        mock_cancel_doc.submit.assert_called_once()


class TestProcessItemsForCancelKot(FrappeTestCase):
    """Tests for process_items_for_cancel_kot function."""

    @patch(f"{MODULE}.create_cancel_kot_doc")
    @patch(f"{MODULE}.frappe.get_all")
    @patch(f"{MODULE}.frappe.db.get_all")
    @patch(f"{MODULE}.frappe.get_doc")
    def test_process_items_for_cancel_kot_success(
        self, mock_get_doc, mock_db_get_all, mock_get_all_api, mock_create_cancel_kot
    ):
        """Test successfully processing items for cancel KOT creation."""
        pos_profile_doc = frappe._dict({"branch": "Branch-1"})
        production_doc = frappe._dict({"name": "UNIT-1"})
        production_doc.item_groups = [frappe._dict({"item_group": "Grills"})]
        
        mock_db_get_all.return_value = [frappe._dict({"name": "UNIT-1"})]
        mock_create_cancel_kot.return_value = "CNCL-KOT-001"
        
        # Setup get_doc to return pos_profile or production doc
        def get_doc_side_effect(doctype, name=None):
            if doctype == "POS Profile":
                return pos_profile_doc
            if doctype == "URY Production Unit":
                return production_doc
            if doctype == "Item":
                return frappe._dict({"item_group": "Grills"})
            return None
        
        mock_get_doc.side_effect = get_doc_side_effect
        mock_get_all_api.return_value = []

        items = [
            {"item_code": "ITEM-001", "qty": -1, "item_name": "Biryani", "comments": ""}
        ]
        invoice_items = [
            {"item_code": "ITEM-001", "qty": 2}
        ]

        result = process_items_for_cancel_kot(
            "INV-001",
            "John Doe",
            "TABLE-1",
            items,
            "",
            "POS-PROF-1",
            "CNCL-KOT-",
            "Partially cancelled",
            invoice_items,
        )

        self.assertEqual(result, ["CNCL-KOT-001"])
        mock_create_cancel_kot.assert_called_once()

